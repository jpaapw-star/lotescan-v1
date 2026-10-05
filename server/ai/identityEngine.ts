import { ExtractedPhotoEvidence, PhysicalProductInstance } from "./types.js";
import { ValidationEngine } from "./validators.js";
import { aiMemoryEngine } from "./memoryEngine.js";

interface UnitCandidate {
  serialKey: string;
  evidences: ExtractedPhotoEvidence[];
  matchedProductEvidence?: ExtractedPhotoEvidence;
  isAmbiguous?: boolean;
  competingCandidates?: string[];
}

export class IdentityEngine {
  /**
   * RESOLUÇÃO DE IDENTIDADE FÍSICA E AGRUPAMENTO DE FOTOS (MANDATO SCANLOTE AI)
   * 
   * Distinção obrigatória:
   * 1. PRODUTO/SKU: Aquilo que é comercialmente/modelamente igual (Marca, Modelo completo, EAN, P/N)
   * 2. UNIDADE FÍSICA: Objeto físico individual (unitId, Service Tag, Serial, IMEI, fotos associadas)
   * 3. FOTO/EVIDÊNCIA: Registro pontual pertencente a uma unidade física
   */
  static correlateEvidence(
    evidences: ExtractedPhotoEvidence[],
    context: { loteId: string; caixa: number; spreadsheetId?: string }
  ): { instances: PhysicalProductInstance[]; unassociatedPhotoIds: string[] } {
    const unassociatedPhotoIds: string[] = [];

    // Normalização inicial das evidências com atribuição de índices sequenciais
    const normalizedEvidences: ExtractedPhotoEvidence[] = evidences.map((ev, index) => {
      const copy: ExtractedPhotoEvidence = {
        ...ev,
        captureIndex: ev.captureIndex !== undefined ? ev.captureIndex : index,
        detected: { ...ev.detected },
        evidenceSources: { ...ev.evidenceSources },
        confidence: { ...ev.confidence },
      };

      // Detecção e normalização de Service Tag Dell (7 caracteres alfanuméricos)
      const brandUpper = (copy.detected.brand || "").toUpperCase();
      const rawSerial = copy.detected.serial || copy.detected.serviceTag;
      if (rawSerial) {
        const cleanRaw = rawSerial.trim().toUpperCase();
        // APENAS para Dell: NÃO assumir qualquer código de 7 caracteres como Dell Service Tag (Seção 9)
        // Se a marca for Acer, Asus, Apple, Samsung, etc., respeita o padrão da marca!
        const isKnownNonDell = brandUpper.includes("ACER") || brandUpper.includes("ASUS") || brandUpper.includes("APPLE") || brandUpper.includes("SAMSUNG");
        if (!isKnownNonDell && /^[A-Z0-9]{7}$/.test(cleanRaw)) {
          if (copy.detected.serviceTag || brandUpper.includes("DELL") || !brandUpper) {
            copy.detected.serviceTag = cleanRaw;
            copy.detected.serial = cleanRaw;
            if (!copy.detected.brand && (brandUpper.includes("DELL") || copy.detected.serviceTag)) {
              copy.detected.brand = "Dell";
            }
          }
        }
      }

      // Limpeza de modelo genérico ou Service Tag embutido no modelo
      if (copy.detected.model) {
        let m = copy.detected.model.trim();
        if (copy.detected.serviceTag) {
          m = m.replace(new RegExp(`\\(?[Ss]ervice\\s*[Tt]ag\\s*[:\\-]?\\s*${copy.detected.serviceTag}\\)?`, "gi"), "").trim();
          m = m.replace(new RegExp(`\\(?S\\/N\\s*[:\\-]?\\s*${copy.detected.serviceTag}\\)?`, "gi"), "").trim();
          m = m.replace(new RegExp(copy.detected.serviceTag, "g"), "").trim();
        }
        if (/^(computador|notebook|laptop|produto|device|computer|desconhecida|desconhecido|produto não identificado)(\s+dell)?$/i.test(m)) {
          m = "";
        }
        copy.detected.model = m;
      }

      return copy;
    });

    // 1. Separar evidências por categorias de identidade (Seção 6 - ETAPA A)
    const withSerialEvidences: ExtractedPhotoEvidence[] = [];
    const productOnlyEvidences: ExtractedPhotoEvidence[] = [];
    const genericOrphanEvidences: ExtractedPhotoEvidence[] = [];

    for (const ev of normalizedEvidences) {
      if (ev.isIllegible) {
        genericOrphanEvidences.push(ev);
        continue;
      }

      const hasSerial = !!ev.detected.serial && ev.detected.serial.length >= 4;
      const hasServiceTag = !!ev.detected.serviceTag && ev.detected.serviceTag.length >= 4;
      const hasImei = !!ev.detected.imei && ev.detected.imei.length === 15;

      if (hasSerial || hasServiceTag || hasImei) {
        withSerialEvidences.push(ev);
      } else if (ev.detected.model || ev.detected.ean || ev.detected.brand || ev.detected.partNumber) {
        productOnlyEvidences.push(ev);
      } else {
        genericOrphanEvidences.push(ev);
      }
    }

    // 2. AGRUPAR EVIDÊNCIAS DE MESMO IDENTIFICADOR FÍSICO (Seção 1, 3 & 4)
    // Se múltiplas fotos possuem o MESMO serial/IMEI/Service Tag, pertencem à MESMA unidade!
    const serialClusters = new Map<string, ExtractedPhotoEvidence[]>();
    for (const ev of withSerialEvidences) {
      const cleanSerial = (ev.detected.serial || ev.detected.serviceTag || "")?.trim().toUpperCase();
      const cleanImei = ev.detected.imei?.trim();
      const key = cleanSerial ? `SERIAL:${cleanSerial}` : `IMEI:${cleanImei}`;

      const list = serialClusters.get(key) || [];
      list.push(ev);
      serialClusters.set(key, list);
    }

    const unitCandidates: UnitCandidate[] = [];
    for (const [key, clusterEvs] of serialClusters.entries()) {
      unitCandidates.push({
        serialKey: key,
        evidences: [...clusterEvs],
      });
    }

    const unassignedProductEvs = [...productOnlyEvidences];

    // 3. RESOLUÇÃO DE IDENTIDADE COMPLEMENTAR (CASO DELL E SIMILARES - SEÇÕES 3, 7, 8 & 9)
    // Identificar quais unidades candidatas precisam de evidência complementar de modelo/EAN
    const unitsNeedingProduct = unitCandidates.filter((u) => {
      const hasStrongModel = u.evidences.some(
        (e) =>
          e.detected.model &&
          e.detected.model !== "Produto Não Identificado" &&
          e.detected.model !== "Desconhecida" &&
          e.detected.model !== "Desconhecido" &&
          e.detected.model.length > 3
      );
      const hasEan = u.evidences.some((e) => e.detected.ean && e.detected.ean.length >= 8);
      return !hasStrongModel || !hasEan;
    });

    // Função de pontuação técnica de correlação entre uma unidade e uma foto de produto
    const computePairScore = (
      unit: UnitCandidate,
      prodEv: ExtractedPhotoEvidence
    ): { score: number; reasons: string[] } => {
      const clusterFirstIdx = unit.evidences[0]?.captureIndex ?? 0;
      const prodIdx = prodEv.captureIndex ?? 0;

      const clusterBrand = unit.evidences.find((e) => e.detected.brand)?.detected.brand?.toUpperCase();
      const prodBrand = prodEv.detected.brand?.toUpperCase();

      // Incompatibilidade estrita de marca
      if (
        clusterBrand &&
        prodBrand &&
        clusterBrand !== prodBrand &&
        !clusterBrand.includes(prodBrand) &&
        !prodBrand.includes(clusterBrand)
      ) {
        return { score: -Infinity, reasons: [] };
      }

      let score = 0;
      const reasons: string[] = [];

      if (clusterBrand && prodBrand && (clusterBrand === prodBrand || clusterBrand.includes(prodBrand))) {
        score += 20;
        reasons.push(`Marca compatível (${prodBrand})`);
      }

      // Códigos auxiliares / Part Number (P/N)
      const clusterPn = unit.evidences.find((e) => e.detected.partNumber)?.detected.partNumber?.toUpperCase();
      const prodPn = prodEv.detected.partNumber?.toUpperCase();
      if (clusterPn && prodPn) {
        if (clusterPn === prodPn) {
          score += 100;
          reasons.push(`Part Number coincidente (${prodPn})`);
        } else {
          score -= 300;
        }
      }

      // Verificação de EAN (Mandato V2 - Seções 16 & 17)
      const clusterEan = unit.evidences.find((e) => e.detected.ean && e.detected.ean.length >= 8)?.detected.ean?.trim();
      const prodEan = prodEv.detected.ean?.trim();
      if (clusterEan && prodEan) {
        if (clusterEan === prodEan) {
          score += 120;
          reasons.push(`Código EAN coincidente (${prodEan})`);
        } else {
          // EANs diferentes = produtos comerciais diferentes (impede fusão errônea de unidades)
          score -= 400;
        }
      }

      // Conflito estrito de Service Tag / Serial
      const clusterServiceTag = unit.evidences.find((e) => e.detected.serviceTag)?.detected.serviceTag?.toUpperCase();
      const prodServiceTag = prodEv.detected.serviceTag?.toUpperCase();
      if (clusterServiceTag && prodServiceTag && clusterServiceTag !== prodServiceTag) {
        return { score: -Infinity, reasons: [] };
      }

      const clusterSerial = unit.evidences.find((e) => e.detected.serial)?.detected.serial?.toUpperCase();
      const prodSerial = prodEv.detected.serial?.toUpperCase();
      if (clusterSerial && prodSerial && clusterSerial !== prodSerial) {
        return { score: -Infinity, reasons: [] };
      }

      // Order Number ou Cust PO
      const clusterOrder = unit.evidences.find((e) => e.detected.orderNumber)?.detected.orderNumber?.toUpperCase();
      const prodOrder = prodEv.detected.orderNumber?.toUpperCase();
      if (clusterOrder && prodOrder && clusterOrder === prodOrder) {
        score += 80;
        reasons.push(`Order Number coincidente (${prodOrder})`);
      }

      // Incompatibilidade estrita de modelo se ambos forem fortes e distintos (Seção 8 & 31)
      const clusterModel = unit.evidences.find((e) => e.detected.model && e.detected.model.length > 4)?.detected.model?.toUpperCase();
      const prodModel = prodEv.detected.model?.toUpperCase();
      if (clusterModel && prodModel && clusterModel !== prodModel && !clusterModel.includes(prodModel) && !prodModel.includes(clusterModel)) {
        score -= 250;
      }

      // Proximidade na sequência de captura (apenas como evidência auxiliar fraca - Seção 11 & 18)
      const dist = Math.abs(prodIdx - clusterFirstIdx);
      if (dist === 1) {
        score += 25;
        reasons.push("Fotos adjacentes em sequência de captura");
      } else if (dist === 2) {
        score += 15;
        reasons.push("Fotos próximas em sequência");
      } else if (dist <= 4) {
        score += 8;
      } else {
        score -= dist * 2;
      }

      // Bônus se pertencem ao mesmo bloco par/ímpar de captura sequencial (ex: [0, 1] e [2, 3])
      if (Math.floor(prodIdx / 2) === Math.floor(clusterFirstIdx / 2)) {
        score += 15;
      }

      return { score, reasons };
    };

    // Caso 1: Se houver apenas 1 unidade precisando e múltiplos candidatos livres:
    if (unitsNeedingProduct.length === 1 && unassignedProductEvs.length >= 1) {
      const unit = unitsNeedingProduct[0];
      const evaluated = unassignedProductEvs.map((prodEv, idx) => ({
        idx,
        prodEv,
        ...computePairScore(unit, prodEv),
      })).filter((c) => c.score > 0);

      evaluated.sort((a, b) => b.score - a.score);

      const uniqueModels = new Set(
        evaluated.map((e) => e.prodEv.detected.model).filter((m) => m && m !== "Produto Não Identificado" && m !== "Desconhecida")
      );
      const uniqueEans = new Set(
        evaluated.map((e) => e.prodEv.detected.ean).filter((ean) => Boolean(ean && ean.trim()))
      );
      const isSingleModelFamily = uniqueModels.size <= 1 && uniqueEans.size <= 1;

      // Se todas as fotos livres pertencerem à mesma família de produto (mesmo modelo e mesmo EAN) e forem compatíveis com a única unidade:
      if (isSingleModelFamily && evaluated.length > 0 && evaluated.every((e) => e.score > 0)) {
        for (const ev of evaluated) {
          unit.evidences.push(ev.prodEv);
          if (!unit.matchedProductEvidence) {
            unit.matchedProductEvidence = ev.prodEv;
          }
        }
        unassignedProductEvs.length = 0;
      } else if (
        evaluated.length >= 2 &&
        Math.abs(evaluated[0].score - evaluated[1].score) < 5
      ) {
        unit.isAmbiguous = true;
        unit.competingCandidates = [evaluated[0].prodEv.photoId, evaluated[1].prodEv.photoId];
      } else if (evaluated.length > 0 && evaluated[0].score > 15) {
        const best = evaluated[0];
        const matched = unassignedProductEvs.splice(best.idx, 1)[0];
        unit.matchedProductEvidence = matched;
        unit.evidences.push(matched);
      }
    } 
    // Caso 2: Múltiplas unidades e múltiplos produtos (ex: Caso Dell A1+A2, B1+B2)
    else if (unitsNeedingProduct.length > 1 && unassignedProductEvs.length > 0) {
      // Para cada unidade, calcular a melhor pontuação para cada produto disponível
      // e realizar atribuição ótima global que maximiza a pontuação total (e respeita blocos de captura)
      const scoredPairs: { uIdx: number; pIdx: number; score: number; reasons: string[] }[] = [];

      for (let u = 0; u < unitsNeedingProduct.length; u++) {
        for (let p = 0; p < unassignedProductEvs.length; p++) {
          const res = computePairScore(unitsNeedingProduct[u], unassignedProductEvs[p]);
          if (res.score > 0) {
            scoredPairs.push({ uIdx: u, pIdx: p, score: res.score, reasons: res.reasons });
          }
        }
      }

      // Ordenar pares por pontuação decrescente
      scoredPairs.sort((a, b) => b.score - a.score);

      const assignedUnits = new Set<number>();
      const assignedProducts = new Set<number>();

      for (const pair of scoredPairs) {
        if (!assignedProducts.has(pair.pIdx)) {
          const unit = unitsNeedingProduct[pair.uIdx];
          const matchedEv = unassignedProductEvs[pair.pIdx];

          // Verifica se não há conflito de modelo com o que já foi atribuído à unidade
          const existingModel = unit.evidences.find((e) => e.detected.model && e.detected.model.length > 4)?.detected.model;
          const newModel = matchedEv.detected.model;
          const isModelConflict = existingModel && newModel && existingModel !== newModel && !existingModel.includes(newModel) && !newModel.includes(existingModel);

          if (!isModelConflict && pair.score > 15) {
            assignedProducts.add(pair.pIdx);
            if (!unit.matchedProductEvidence) {
              unit.matchedProductEvidence = matchedEv;
            }
            unit.evidences.push(matchedEv);
          }
        }
      }

      // Remove produtos pareados de unassignedProductEvs
      const remaining: ExtractedPhotoEvidence[] = [];
      for (let p = 0; p < unassignedProductEvs.length; p++) {
        if (!assignedProducts.has(p)) {
          remaining.push(unassignedProductEvs[p]);
        }
      }
      unassignedProductEvs.length = 0;
      unassignedProductEvs.push(...remaining);
    }

    // 4. CONSTRUÇÃO DAS INSTÂNCIAS FÍSICAS INDIVIDUAIS (UNIDADES FÍSICAS)
    const instances: PhysicalProductInstance[] = [];

    for (const unit of unitCandidates) {
      const allEvs = unit.evidences;

      // Consolidar atributos da unidade
      let brand = allEvs.find((e) => e.detected.brand)?.detected.brand || "";
      let model =
        allEvs.find(
          (e) =>
            e.detected.model &&
            e.detected.model !== "Produto Não Identificado" &&
            e.detected.model !== "Desconhecida" &&
            e.detected.model !== "Desconhecido"
        )?.detected.model || "";
      const serial = allEvs.find((e) => e.detected.serial)?.detected.serial?.trim().toUpperCase();
      const serviceTag =
        allEvs.find((e) => e.detected.serviceTag)?.detected.serviceTag?.trim().toUpperCase() ||
        (serial && /^[A-Z0-9]{7}$/.test(serial) ? serial : undefined);
      const imei = allEvs.find((e) => e.detected.imei)?.detected.imei?.trim();
      const ean = allEvs.find((e) => e.detected.ean)?.detected.ean?.trim() || "";
      const partNumber = allEvs.find((e) => e.detected.partNumber)?.detected.partNumber;
      const orderNumber = allEvs.find((e) => e.detected.orderNumber)?.detected.orderNumber;
      const custPo = allEvs.find((e) => e.detected.custPo)?.detected.custPo;
      const category = allEvs.find((e) => e.detected.category)?.detected.category;
      const condition = allEvs.find((e) => e.detected.condition)?.detected.condition || "NOVO_LACRADO";
      const conditionDescription = allEvs.find((e) => e.detected.conditionDescription)?.detected.conditionDescription;

      const photoIds = Array.from(new Set(allEvs.map((e) => e.photoId)));

      const pat = brand ? aiMemoryEngine.findBrandPattern(brand) : undefined;
      const validSerial = serial
        ? ValidationEngine.validateSerial(serial, pat)
        : { isValid: true, normalized: serial || "", confidence: 0.9 };
      const validImei = imei
        ? ValidationEngine.validateIMEI(imei)
        : { isValid: true, normalized: imei || "" };

      const serialImei = validSerial.normalized || validImei.normalized || "NÃO IDENTIFICADO";
      const unitIdentifier = (
        serviceTag
          ? `ST_${serviceTag}`
          : validSerial.normalized
          ? `SN_${validSerial.normalized}`
          : validImei.normalized
          ? `IMEI_${validImei.normalized}`
          : `NOID_${photoIds.slice().sort().join("_")}`
      ).replace(/[^A-Za-z0-9_-]/g, "_");
      
      // IDs PERMANENTES E DETERMINÍSTICOS (Mandato V2 - Seções 23 & 24)
      const instanceId = `PROD_${context.loteId}_${unitIdentifier}`;
      const unitId = `UNIT_${context.loteId}_${unitIdentifier}`;
      const skuId = brand && model ? `SKU_${brand}_${model}_${ean || "NOEAN"}`.replace(/[^A-Za-z0-9_-]/g, "") : undefined;

      // Auditoria técnica de associação de identidade (Seção 11)
      const reasons: string[] = [];
      if (brand) reasons.push(`✓ Fabricante identificado (${brand})`);
      if (serviceTag) reasons.push(`✓ Service Tag individual (${serviceTag}) confirmado`);
      else if (serial) reasons.push(`✓ Serial Number individual (${serial}) confirmado`);
      if (imei) reasons.push(`✓ IMEI individual (${imei}) confirmado`);
      if (ean) reasons.push(`✓ EAN (${ean}) validado`);
      if (partNumber) reasons.push(`✓ P/N (${partNumber}) compatível`);
      if (unit.matchedProductEvidence) {
        reasons.push("✓ Modelo e identificadores correlacionados por evidência fotográfica complementar em sequência");
      }
      if (allEvs.length > 1) {
        reasons.push(`✓ ${allEvs.length} fotografias vinculadas à mesma unidade física individual`);
      }

      // Confiança de associação de identidade (Seção 10)
      let identityMatchConfidence = 1.0;
      if (unit.isAmbiguous) {
        identityMatchConfidence = 0.5;
        reasons.push("⚠️ Ambiguidade: mais de um candidato fotográfico disponível. Aguarda confirmação do operador.");
      } else if (unit.matchedProductEvidence) {
        identityMatchConfidence = 0.98;
      }

      const hasStrongModel = Boolean(
        model &&
        model !== "Produto Não Identificado" &&
        model !== "Desconhecida" &&
        model !== "Desconhecido" &&
        model.length > 3
      );

      const status = unit.isAmbiguous
        ? "PENDENTE_ASSOCIACAO"
        : !hasStrongModel && !ean
        ? "REVISAO"
        : "IDENTIFICADO";

      const maxModelConf = Math.max(...allEvs.map((e) => e.confidence.model || 0), 0);
      const maxSerialConf = Math.max(...allEvs.map((e) => e.confidence.serial || 0), 0);
      const maxImeiConf = Math.max(...allEvs.map((e) => e.confidence.imei || 0), 0);
      const maxEanConf = Math.max(...allEvs.map((e) => e.confidence.ean || 0), 0);

      const inst: PhysicalProductInstance = {
        instanceId,
        unitId,
        skuId,
        brand,
        model: model || "Produto Não Identificado",
        serial: validSerial.normalized || undefined,
        serviceTag,
        imei: validImei.normalized || undefined,
        serialImei,
        ean,
        partNumber,
        orderNumber,
        custPo,
        qtde: 1, // Cada unidade física individual representa 1 unidade (Seção 13)
        caixa: context.caixa,
        loteId: context.loteId,
        status: status as any,
        photoIds,
        fieldEvidences: {},
        confidence: {
          modelo: maxModelConf || 0.8,
          serial: maxSerialConf || validSerial.confidence || 0.9,
          imei: maxImeiConf || (imei ? 0.95 : 0),
          ean: maxEanConf || (ean ? 0.9 : 0),
          identityMatch: identityMatchConfidence,
          overall: unit.isAmbiguous ? 0.6 : 0.9,
        },
        category,
        estadoFisico: condition,
        descricaoAvaria: conditionDescription,
        needsReview: unit.isAmbiguous || status === "REVISAO",
        reviewReason: unit.isAmbiguous
          ? "Múltiplos candidatos para associação desta evidência. Exige confirmação do operador."
          : undefined,
        sourcesUsed: Array.from(
          new Set(allEvs.flatMap((e) => Object.values(e.evidenceSources).filter(Boolean) as any[]))
        ),
        isConfirmed: !unit.isAmbiguous,
        hasPhysicalIdentifier: !!(serial || serviceTag || imei),
        candidateUnitIds: unit.competingCandidates,
        associationAudit: {
          resolvedAt: new Date().toISOString(),
          confidenceMatch: identityMatchConfidence,
          reasons,
          criteria: unit.isAmbiguous
            ? "PENDENTE_CONFIRMACAO_AMBIGUIDADE"
            : unit.matchedProductEvidence
            ? "CORRELACAO_COMPLEMENTAR_SEQUENCIAL"
            : "IDENTIFICADOR_UNICO_DIRETO",
        },
      };

      instances.push(inst);
    }

    // 5. PROCESSAR PRODUTOS NÃO SERIALIZADOS OU REMANESCENTES (LIVROS, CABOS, ITENS APENAS POR EAN)
    // Seção 14: Se o produto não possuir serial, criar unidade baseada em EAN sem inventar serial!
    for (const rem of unassignedProductEvs) {
      const remBrand = (rem.detected.brand || "").trim();
      const remModel = (rem.detected.model || "").trim();
      const remEan = (rem.detected.ean || "").trim();

      if (remEan) {
        // Só vincula a uma unidade existente se:
        // 1. A unidade existente NÃO possui serial físico próprio
        // 2. O código EAN é idêntico
        // 3. A marca é compatível (NUNCA misturar Dell com Asus ou Acer - Seção 41 & 42)
        const existingEanUnit = instances.find(
          (inst) =>
            !inst.hasPhysicalIdentifier &&
            inst.ean === remEan &&
            (!inst.brand || !remBrand || inst.brand.toUpperCase() === remBrand.toUpperCase())
        );

        if (existingEanUnit) {
          if (!existingEanUnit.photoIds.includes(rem.photoId)) {
            existingEanUnit.photoIds.push(rem.photoId);
          }
          if (remModel && (!existingEanUnit.model || existingEanUnit.model === "Produto Não Identificado" || existingEanUnit.model === "Item por EAN")) {
            existingEanUnit.model = remModel;
          }
          continue;
        }

        const safeEan = remEan.replace(/[^A-Za-z0-9_-]/g, "_");
        const instanceId = `PROD_${context.loteId}_EAN_${safeEan}`;
        const unitId = `UNIT_${context.loteId}_EAN_${safeEan}`;
        const skuId = `SKU_${remBrand || "GEN"}_${remModel || "ITEM"}_${remEan}`.replace(/[^A-Za-z0-9_-]/g, "");

        instances.push({
          instanceId,
          unitId,
          skuId,
          brand: remBrand,
          model: remModel || "Item por EAN",
          serialImei: "SEM SERIAL",
          ean: remEan,
          qtde: 1,
          caixa: context.caixa,
          loteId: context.loteId,
          status: "IDENTIFICADO",
          photoIds: [rem.photoId],
          fieldEvidences: {},
          confidence: {
            modelo: rem.confidence.model || 0.7,
            serial: 0,
            imei: 0,
            ean: rem.confidence.ean || 0.95,
            identityMatch: 0.9,
            overall: 0.8,
          },
          category: rem.detected.category,
          estadoFisico: rem.detected.condition || "NOVO_LACRADO",
          needsReview: false,
          sourcesUsed: ["BARCODE_OCR"],
          isConfirmed: true,
          hasPhysicalIdentifier: false, // Seção 14: Marcado rigorosamente como sem identificador físico
          associationAudit: {
            resolvedAt: new Date().toISOString(),
            confidenceMatch: 0.9,
            reasons: ["✓ Identidade de unidade baseada em código EAN (produto não-serializável)"],
            criteria: "IDENTIDADE_SEM_IDENTIFICADOR_FISICO",
          },
        });
      } else if (remModel || rem.needsReview) {
        // Se houver uma unidade existente COM A MESMA MARCA E MODELO compatível que precisa da foto:
        const matchingUnit = instances.find(
          (inst) =>
            remBrand &&
            inst.brand &&
            inst.brand.toUpperCase() === remBrand.toUpperCase() &&
            ((remModel && inst.model && (inst.model.toUpperCase() === remModel.toUpperCase() || inst.model === "Produto Não Identificado")) ||
              (!inst.model || inst.model === "Produto Não Identificado")) &&
            !inst.photoIds.includes(rem.photoId)
        );

        if (matchingUnit) {
          matchingUnit.photoIds.push(rem.photoId);
          if (remModel && (!matchingUnit.model || matchingUnit.model === "Produto Não Identificado")) {
            matchingUnit.model = remModel;
          }
          continue;
        }

        // Se marcas/modelos forem diferentes, gera uma nova unidade física independente (Seção 1, 4 & 5)
        const safePhotoId = rem.photoId.replace(/[^A-Za-z0-9_-]/g, "_");
        const instanceId = `PROD_${context.loteId}_REV_${safePhotoId}`;
        const unitId = `UNIT_${context.loteId}_REV_${safePhotoId}`;

        instances.push({
          instanceId,
          unitId,
          brand: remBrand,
          model: remModel || "Aparelho Não Identificado",
          serialImei: "NÃO IDENTIFICADO",
          ean: "",
          qtde: 1,
          caixa: context.caixa,
          loteId: context.loteId,
          status: "REVISAO",
          photoIds: [rem.photoId],
          fieldEvidences: {},
          confidence: {
            modelo: rem.confidence.model || 0.3,
            serial: 0,
            imei: 0,
            ean: 0,
            identityMatch: 0.4,
            overall: rem.confidence.overall || 0.25,
          },
          needsReview: true,
          reviewReason: "Ausência de identificador físico único (Service Tag/Serial/IMEI) ou EAN.",
          sourcesUsed: ["VISION_AI"],
          isConfirmed: false,
          hasPhysicalIdentifier: false,
          associationAudit: {
            resolvedAt: new Date().toISOString(),
            confidenceMatch: 0.4,
            reasons: ["⚠️ Ausência de identificadores físicos para correlação segura"],
            criteria: "EVIDENCIA_INSUFICIENTE_REVISAO",
          },
        });
      } else {
        unassociatedPhotoIds.push(rem.photoId);
      }
    }

    // 6. Fotos órfãs ou ilegíveis
    for (const orf of genericOrphanEvidences) {
      unassociatedPhotoIds.push(orf.photoId);
    }

    return { instances, unassociatedPhotoIds };
  }
}
