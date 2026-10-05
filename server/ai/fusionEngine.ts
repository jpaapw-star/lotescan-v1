import { PhysicalProductInstance } from "./types.js";
import { ValidationEngine } from "./validators.js";
import { ExternalLookupEngine } from "./externalLookup.js";
import { aiMemoryEngine } from "./memoryEngine.js";

export class FusionEngine {
  /**
   * Executa a fusão e enriquecimento de dados da instância física:
   * 1. Fusão de evidências fotográficas
   * 2. Complementação via Memória Externa e Catálogos
   * 3. Validação rigorosa independente de EAN, IMEI e Serial
   * 4. Ajuste fino de scores de confiança
   */
  static async fuseAndValidate(
    instance: PhysicalProductInstance,
    spreadsheetId?: string
  ): Promise<PhysicalProductInstance> {
    const fused = { ...instance };

    // 1. Validação independente de EAN (MANDATO V4 - SEÇÕES 34 & 36)
    if (fused.ean) {
      const originalRawEan = fused.ean;
      const eanValidation = ValidationEngine.validateEAN(fused.ean);
      if (!eanValidation.isValid) {
        console.warn(`[FusionEngine] EAN ${fused.ean} inválido no produto ${fused.instanceId}: ${eanValidation.reason}`);
        // Preserva o código bruto em rawCodes / otherCodes sem contaminar o campo EAN formatado
        fused.rawCodes = fused.rawCodes || [];
        if (!fused.rawCodes.includes(originalRawEan)) {
          fused.rawCodes.push(originalRawEan);
        }
        fused.otherCodes = fused.otherCodes
          ? `${fused.otherCodes}, EAN_RAW:${originalRawEan}`
          : `EAN_RAW:${originalRawEan}`;
        fused.ean = ""; // Limpa EAN formatado para não quebrar validação matemática da planilha
        fused.confidence.ean = 0.2;
        fused.needsReview = true;
        fused.reviewReason = `Código de barras suspeito (${originalRawEan}): ${eanValidation.reason}`;
      } else {
        fused.ean = eanValidation.normalized;
        fused.confidence.ean = 1.0;

        // Se o modelo estiver vago, 'Desconhecida' ou não identificado, complementa com o EAN via Memória / Catálogo (Seção 10)
        if (
          !fused.model ||
          fused.model.toLowerCase() === "desconhecida" ||
          fused.model.toLowerCase() === "desconhecido" ||
          fused.model === "Produto Não Identificado" ||
          fused.model === "Item por EAN" ||
          fused.model.startsWith("Item ") ||
          fused.model.length < 5
        ) {
          const lookup = await ExternalLookupEngine.lookupByEAN(fused.ean, spreadsheetId);
          if (lookup.found && lookup.model) {
            fused.model = lookup.model;
            if (lookup.brand && !fused.brand) fused.brand = lookup.brand;
            if (lookup.category && !fused.category) fused.category = lookup.category;
            fused.confidence.modelo = lookup.confidence;
            if (lookup.source) fused.sourcesUsed.push(lookup.source);
          } else {
            fused.status = "REVISAO";
            fused.needsReview = true;
            fused.reviewReason = "Modelo não identificado por IA nem encontrado por cruzamento de EAN.";
          }
        }
      }
    }

    // 2. Validação independente de IMEI
    if (fused.imei) {
      const imeiValidation = ValidationEngine.validateIMEI(fused.imei);
      if (!imeiValidation.isValid) {
        console.warn(`[FusionEngine] IMEI ${fused.imei} inválido no produto ${fused.instanceId}: ${imeiValidation.reason}`);
        fused.confidence.imei = 0.3;
        fused.needsReview = true;
        fused.reviewReason = (fused.reviewReason ? `${fused.reviewReason} | ` : "") + `IMEI inválido: ${imeiValidation.reason}`;
      } else {
        fused.imei = imeiValidation.normalized;
        fused.confidence.imei = 0.99;
      }
    }

    // 3. Validação independente de Serial com base no padrão da marca
    const brandPattern = fused.brand ? aiMemoryEngine.findBrandPattern(fused.brand) : undefined;
    if (fused.serial) {
      const serialValidation = ValidationEngine.validateSerial(fused.serial, brandPattern);
      if (!serialValidation.isValid) {
        fused.confidence.serial = serialValidation.confidence;
        fused.needsReview = true;
        fused.reviewReason = (fused.reviewReason ? `${fused.reviewReason} | ` : "") + `Serial suspeito: ${serialValidation.reason}`;
      } else {
        fused.serial = serialValidation.normalized;
        fused.confidence.serial = serialValidation.confidence;
      }
    }

    // 4. Cálculo final de Confiança Geral e Status
    const scores = [fused.confidence.modelo];
    if (fused.serial) scores.push(fused.confidence.serial);
    if (fused.imei) scores.push(fused.confidence.imei);
    if (fused.ean) scores.push(fused.confidence.ean);

    const avgConfidence = scores.reduce((a, b) => a + b, 0) / scores.length;
    fused.confidence.overall = Math.round(avgConfidence * 100) / 100;

    // Regra da Seção 27: Alta confiança (>0.80) -> IDENTIFICADO. Abaixo ou revisão necessária -> REVISAO
    if (fused.needsReview || fused.confidence.overall < 0.70 || (!fused.serial && !fused.imei && !fused.ean)) {
      fused.status = "REVISAO";
    } else {
      fused.status = "VALIDADO";
    }

    // 5. Se o item estiver validado e tiver Marca + Modelo + EAN, alimenta a memória progressiva externa! (Seção 29)
    if (fused.status === "VALIDADO" && fused.brand && fused.model && fused.ean && fused.confidence.overall >= 0.85) {
      aiMemoryEngine.recordLearning(
        fused.brand,
        fused.model,
        "EAN",
        fused.ean,
        fused.model,
        "USER_CONFIRMATION",
        fused.confidence.overall
      );
    }

    return fused;
  }
}
