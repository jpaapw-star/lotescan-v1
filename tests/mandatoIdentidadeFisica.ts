/**
 * SUÍTE DE TESTES ESPECÍFICA DO MANDATO DE RESOLUÇÃO DE IDENTIDADE FÍSICA E AGRUPAMENTO DE FOTOS
 * SCANLOTE AI (SEÇÕES 1 A 15)
 */

import { IdentityEngine } from "../server/ai/identityEngine.js";
import { GroupingEngine } from "../server/ai/groupingEngine.js";
import { ValidationEngine } from "../server/ai/validators.js";
import { aiMemoryEngine } from "../server/ai/memoryEngine.js";
import { StorageEngine } from "../server/storage.js";
import { ExtractedPhotoEvidence } from "../server/ai/types.js";

class PhysicalIdentityTestRunner {
  private passed = 0;
  private failed = 0;

  assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      this.passed++;
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
      this.failed++;
    }
  }

  summary() {
    console.log(`\n================================================================================`);
    console.log(`RESULTADO DOS TESTES DE IDENTIDADE FÍSICA: ${this.passed} PASSOU | ${this.failed} FALHOU`);
    console.log(`================================================================================\n`);
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

async function runPhysicalIdentityTests() {
  console.log("INICIANDO TESTES DO MANDATO — RESOLUÇÃO DE IDENTIDADE FÍSICA E AGRUPAMENTO...\n");
  const runner = new PhysicalIdentityTestRunner();
  const storage = new StorageEngine();
  const SPREADSHEET_ID = "SHEET_TEST_IDENTITY";

  // =========================================================================
  // TESTE 1: CASO REAL DELL (SEÇÃO 7 DO MANDATO)
  // 4 fotos representando DOIS notebooks:
  // NOTEBOOK A: Foto A1 (DC15-I51334U-A50, EAN 7899864956294) + Foto A2 (Service Tag 3843QM4)
  // NOTEBOOK B: Foto B1 (I15-I120K-A30PF, EAN 7899864948732) + Foto B2 (Service Tag 55TQH24)
  // =========================================================================
  {
    const photoA1: ExtractedPhotoEvidence = {
      photoId: "DELL_A1_BOX",
      captureIndex: 0,
      detected: {
        brand: "Dell",
        model: "Dell DC15-I51334U-A50",
        ean: "7899864956294",
        category: "notebook",
      },
      evidenceSources: { brand: "VISION_AI", model: "VISION_AI", ean: "BARCODE_OCR" },
      confidence: { brand: 1.0, model: 0.95, serial: 0, imei: 0, ean: 1.0, overall: 0.95 },
    };

    const photoA2: ExtractedPhotoEvidence = {
      photoId: "DELL_A2_CHASSIS",
      captureIndex: 1,
      detected: {
        brand: "Dell",
        serviceTag: "3843QM4",
        serial: "3843QM4",
        category: "notebook",
      },
      evidenceSources: { brand: "VISION_AI", serviceTag: "PHOTO_LABEL", serial: "PHOTO_LABEL" },
      confidence: { brand: 1.0, model: 0, serial: 1.0, imei: 0, ean: 0, overall: 0.98 },
    };

    const photoB1: ExtractedPhotoEvidence = {
      photoId: "DELL_B1_BOX",
      captureIndex: 2,
      detected: {
        brand: "Dell",
        model: "Dell I15-I120K-A30PF",
        ean: "7899864948732",
        category: "notebook",
      },
      evidenceSources: { brand: "VISION_AI", model: "VISION_AI", ean: "BARCODE_OCR" },
      confidence: { brand: 1.0, model: 0.95, serial: 0, imei: 0, ean: 1.0, overall: 0.95 },
    };

    const photoB2: ExtractedPhotoEvidence = {
      photoId: "DELL_B2_CHASSIS",
      captureIndex: 3,
      detected: {
        brand: "Dell",
        serviceTag: "55TQH24",
        serial: "55TQH24",
        category: "notebook",
      },
      evidenceSources: { brand: "VISION_AI", serviceTag: "PHOTO_LABEL", serial: "PHOTO_LABEL" },
      confidence: { brand: 1.0, model: 0, serial: 1.0, imei: 0, ean: 0, overall: 0.98 },
    };

    const { instances } = await GroupingEngine.processBatch(
      [photoA1, photoA2, photoB1, photoB2],
      { loteId: "LOTE-DELL-REAL", caixa: 1, spreadsheetId: SPREADSHEET_ID }
    );

    runner.assert(
      instances.length === 2,
      "SEÇÃO 7: Quatro fotografias do teste Dell resultam estritamente em DUAS unidades físicas (não 4 produtos)"
    );

    const unitA = instances.find((i) => i.serviceTag === "3843QM4" || i.serial === "3843QM4");
    const unitB = instances.find((i) => i.serviceTag === "55TQH24" || i.serial === "55TQH24");

    runner.assert(
      Boolean(
        unitA &&
        unitA.model.includes("DC15-I51334U-A50") &&
        unitA.ean === "7899864956294" &&
        unitA.photoIds.includes("DELL_A1_BOX") &&
        unitA.photoIds.includes("DELL_A2_CHASSIS")
      ),
      "SEÇÃO 7: Unidade A agrega Foto A1 (Modelo/EAN) + Foto A2 (Service Tag 3843QM4) com integridade"
    );

    runner.assert(
      Boolean(
        unitB &&
        unitB.model.includes("I15-I120K-A30PF") &&
        unitB.ean === "7899864948732" &&
        unitB.photoIds.includes("DELL_B1_BOX") &&
        unitB.photoIds.includes("DELL_B2_CHASSIS")
      ),
      "SEÇÃO 7: Unidade B agrega Foto B1 (Modelo/EAN) + Foto B2 (Service Tag 55TQH24) com integridade"
    );

    runner.assert(
      Boolean(unitA && unitB && unitA.unitId !== unitB.unitId),
      "SEÇÃO 12: Unidade A e Unidade B possuem unitId permanente e distinto"
    );
  }

  // =========================================================================
  // TESTE 2: MESMO MODELO E MESMO EAN (SEÇÃO 1 & 5 DO MANDATO)
  // Duas unidades físicas com MODELO IGUAL, MARCA IGUAL e EAN IGUAL.
  // Devem permanecer como DUAS UNIDADES FÍSICAS INDEPENDENTES.
  // =========================================================================
  {
    const evUnit1: ExtractedPhotoEvidence = {
      photoId: "P_UNIT_1",
      captureIndex: 0,
      detected: {
        brand: "Dell",
        model: "Dell DC15-I51334U-A50",
        ean: "7899864956294",
        serviceTag: "AAAAAA1",
        serial: "AAAAAA1",
      },
      evidenceSources: { serial: "PHOTO_LABEL", model: "VISION_AI", ean: "BARCODE_OCR" },
      confidence: { brand: 1, model: 1, serial: 1, imei: 0, ean: 1, overall: 1 },
    };

    const evUnit2: ExtractedPhotoEvidence = {
      photoId: "P_UNIT_2",
      captureIndex: 1,
      detected: {
        brand: "Dell",
        model: "Dell DC15-I51334U-A50", // MODELO E MARCA IDÊNTICOS
        ean: "7899864956294",           // EAN EXATAMENTE IGUAL
        serviceTag: "BBBBBB2",          // SERVICE TAG DIFERENTE!
        serial: "BBBBBB2",
      },
      evidenceSources: { serial: "PHOTO_LABEL", model: "VISION_AI", ean: "BARCODE_OCR" },
      confidence: { brand: 1, model: 1, serial: 1, imei: 0, ean: 1, overall: 1 },
    };

    const { instances } = await GroupingEngine.processBatch([evUnit1, evUnit2], {
      loteId: "LOTE-SAME-SKU",
      caixa: 1,
      spreadsheetId: SPREADSHEET_ID,
    });

    runner.assert(
      instances.length === 2 &&
      instances[0].unitId !== instances[1].unitId &&
      instances[0].serviceTag === "AAAAAA1" &&
      instances[1].serviceTag === "BBBBBB2" &&
      instances[0].qtde === 1 &&
      instances[1].qtde === 1,
      "SEÇÃO 1 & 5: Mesmo modelo + mesmo EAN geram DUAS unidades independentes com qtde=1 (nunca colapsa em qtde=2 com 1 serial)"
    );

    // Persistência no Storage: verifica se ambas viram registros independentes
    const res1 = storage.upsertProduct({
      modelo: instances[0].model,
      marca: instances[0].brand,
      serial: instances[0].serial,
      serviceTag: instances[0].serviceTag,
      serialImei: instances[0].serialImei,
      ean: instances[0].ean,
      unitId: instances[0].unitId,
      qtde: 1,
      data: "2026-10-05",
      caixa: 1,
      nfe: "",
      linkFoto: "LINK",
      photoIds: instances[0].photoIds,
      deviceId: "DEV-1",
      loteId: "LOTE-SAME-SKU",
      spreadsheetId: SPREADSHEET_ID,
      status: "IDENTIFICADO",
      confidence: instances[0].confidence,
    });

    const res2 = storage.upsertProduct({
      modelo: instances[1].model,
      marca: instances[1].brand,
      serial: instances[1].serial,
      serviceTag: instances[1].serviceTag,
      serialImei: instances[1].serialImei,
      ean: instances[1].ean,
      unitId: instances[1].unitId,
      qtde: 1,
      data: "2026-10-05",
      caixa: 1,
      nfe: "",
      linkFoto: "LINK",
      photoIds: instances[1].photoIds,
      deviceId: "DEV-1",
      loteId: "LOTE-SAME-SKU",
      spreadsheetId: SPREADSHEET_ID,
      status: "IDENTIFICADO",
      confidence: instances[1].confidence,
    });

    runner.assert(
      res1.product.id !== res2.product.id &&
      res1.product.serviceTag === "AAAAAA1" &&
      res2.product.serviceTag === "BBBBBB2",
      "SEÇÃO 13: Banco de dados preserva as duas unidades físicas distintas para o mesmo SKU/Produto"
    );
  }

  // =========================================================================
  // TESTE 3: REGRA DE NÃO-CONTAMINAÇÃO DE IDENTIFICADORES (SEÇÃO 4)
  // É proibido copiar serial/service tag de uma foto para outra
  // =========================================================================
  {
    const photoA: ExtractedPhotoEvidence = {
      photoId: "P_PROIBIDO_A",
      captureIndex: 0,
      detected: { brand: "Dell", model: "Inspiron 15", serviceTag: "123ABC1", serial: "123ABC1" },
      evidenceSources: { serial: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 1, serial: 1, imei: 0, ean: 0, overall: 1 },
    };

    const photoB: ExtractedPhotoEvidence = {
      photoId: "P_PROIBIDO_B",
      captureIndex: 1,
      detected: { brand: "Dell", model: "Inspiron 15", serviceTag: "456DEF2", serial: "456DEF2" },
      evidenceSources: { serial: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 1, serial: 1, imei: 0, ean: 0, overall: 1 },
    };

    const { instances } = await GroupingEngine.processBatch([photoA, photoB], {
      loteId: "LOTE-NAO-CONTAMINA",
      caixa: 1,
      spreadsheetId: SPREADSHEET_ID,
    });

    runner.assert(
      instances.length === 2 &&
      instances.some((i) => i.serviceTag === "123ABC1" && !i.photoIds.includes("P_PROIBIDO_B")) &&
      instances.some((i) => i.serviceTag === "456DEF2" && !i.photoIds.includes("P_PROIBIDO_A")),
      "SEÇÃO 4: Não-contaminação garantida — seriais jamais são copiados entre unidades físicas distintas"
    );
  }

  // =========================================================================
  // TESTE 4: QUANDO O MODELO NÃO APARECE NA FOTO DO SERIAL (SEÇÃO 3 & 8)
  // Foto contendo apenas Service Tag não gera produto novo se for complementar
  // =========================================================================
  {
    const evModelEan: ExtractedPhotoEvidence = {
      photoId: "P_DELL_BOX_ONLY",
      captureIndex: 0,
      detected: { brand: "Dell", model: "Dell Latitude 3440", ean: "7891234567895" },
      evidenceSources: { model: "VISION_AI", ean: "BARCODE_OCR" },
      confidence: { brand: 1, model: 0.95, serial: 0, imei: 0, ean: 1, overall: 0.9 },
    };

    const evSerialOnly: ExtractedPhotoEvidence = {
      photoId: "P_DELL_ST_ONLY",
      captureIndex: 1,
      detected: { brand: "Dell", serviceTag: "9XYZ876", serial: "9XYZ876" },
      evidenceSources: { serviceTag: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.95 },
    };

    const { instances } = await GroupingEngine.processBatch([evModelEan, evSerialOnly], {
      loteId: "LOTE-COMPLEMENTAR",
      caixa: 1,
      spreadsheetId: SPREADSHEET_ID,
    });

    runner.assert(
      instances.length === 1 &&
      instances[0].model.includes("Latitude 3440") &&
      instances[0].serviceTag === "9XYZ876" &&
      instances[0].photoIds.length === 2 &&
      instances[0].photoIds.includes("P_DELL_BOX_ONLY") &&
      instances[0].photoIds.includes("P_DELL_ST_ONLY"),
      "SEÇÃO 3 & 8: Foto com apenas Service Tag é anexada como evidência de identidade da unidade sem criar linha duplicada"
    );
  }

  // =========================================================================
  // TESTE 5: QUANDO EXISTIREM DOIS POSSÍVEIS CANDIDATOS (AMBIGUIDADE - SEÇÃO 9)
  // Não escolher aleatoriamente, não inventar: marcar PENDENTE DE ASSOCIAÇÃO
  // =========================================================================
  {
    // Foto do chassi com Service Tag
    const evChassis: ExtractedPhotoEvidence = {
      photoId: "P_AMBIGUOUS_CHASSIS",
      captureIndex: 10,
      detected: { brand: "Dell", serviceTag: "TAG8888", serial: "TAG8888" },
      evidenceSources: { serviceTag: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.95 },
    };

    // Duas fotos de caixas com pontuação idêntica e sem discriminador de sequência ou código
    const evBox1: ExtractedPhotoEvidence = {
      photoId: "P_CANDIDATE_BOX_1",
      captureIndex: 10, // Mesma distância
      detected: { brand: "Dell", model: "Dell Vostro 15", ean: "7890000000001" },
      evidenceSources: { model: "VISION_AI" },
      confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 1, overall: 0.9 },
    };

    const evBox2: ExtractedPhotoEvidence = {
      photoId: "P_CANDIDATE_BOX_2",
      captureIndex: 10, // Mesma distância
      detected: { brand: "Dell", model: "Dell Vostro 15", ean: "7890000000002" },
      evidenceSources: { model: "VISION_AI" },
      confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 1, overall: 0.9 },
    };

    const { instances } = IdentityEngine.correlateEvidence([evChassis, evBox1, evBox2], {
      loteId: "LOTE-AMBIGUIDADE",
      caixa: 1,
    });

    const chassisUnit = instances.find((i) => i.serviceTag === "TAG8888");

    runner.assert(
      Boolean(
        chassisUnit &&
        chassisUnit.status === "PENDENTE_ASSOCIACAO" &&
        chassisUnit.candidateUnitIds &&
        chassisUnit.candidateUnitIds.length >= 2
      ),
      "SEÇÃO 9: Ambiguidade entre múltiplos candidatos resulta em PENDENTE DE ASSOCIAÇÃO sem escolha aleatória"
    );
  }

  // =========================================================================
  // TESTE 6 & 7: CONFIANÇA E AUDITORIA TÉCNICA DE ASSOCIAÇÃO (SEÇÃO 10 & 11)
  // Confiança de agrupamento separada do OCR e registro detalhado de motivos
  // =========================================================================
  {
    const photo1: ExtractedPhotoEvidence = {
      photoId: "AUDIT_P1",
      captureIndex: 0,
      detected: { brand: "Dell", model: "Inspiron 15 3520", ean: "7899864956294" },
      evidenceSources: { model: "VISION_AI", ean: "BARCODE_OCR" },
      confidence: { brand: 1, model: 0.85, serial: 0, imei: 0, ean: 0.95, overall: 0.9 },
    };

    const photo2: ExtractedPhotoEvidence = {
      photoId: "AUDIT_P2",
      captureIndex: 1,
      detected: { brand: "Dell", serviceTag: "3843QM4", serial: "3843QM4" },
      evidenceSources: { serviceTag: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0, serial: 0.99, imei: 0, ean: 0, overall: 0.99 },
    };

    const { instances } = IdentityEngine.correlateEvidence([photo1, photo2], {
      loteId: "LOTE-AUDIT-TEST",
      caixa: 1,
    });

    const inst = instances[0];

    runner.assert(
      inst.confidence.identityMatch !== undefined &&
      inst.confidence.identityMatch >= 0.95 &&
      inst.confidence.modelo === 0.85 &&
      inst.confidence.serial === 0.99,
      "SEÇÃO 10: Confiança de associação (confidence_identity_match) mensurada separadamente da confiança de OCR"
    );

    runner.assert(
      Boolean(
        inst.associationAudit &&
        inst.associationAudit.reasons.length >= 3 &&
        inst.associationAudit.criteria.includes("CORRELACAO")
      ),
      "SEÇÃO 11: Auditoria técnica registra detalhadamente as evidências e critérios que levaram à resolução de identidade"
    );
  }

  // =========================================================================
  // TESTE 8: PRODUTOS SEM IDENTIFICADOR FÍSICO (SEÇÃO 14 DO MANDATO)
  // Produtos sem serial não recebem serial inventado e são marcados adequadamente
  // =========================================================================
  {
    const evLivro: ExtractedPhotoEvidence = {
      photoId: "LIVRO_CLEAN_CODE",
      captureIndex: 0,
      detected: {
        brand: "Alta Books",
        model: "Livro Clean Code: Código Limpo",
        ean: "9788576082675",
        category: "livro",
      },
      evidenceSources: { ean: "BARCODE_OCR", model: "VISION_AI" },
      confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 1.0, overall: 0.95 },
    };

    const { instances } = await GroupingEngine.processBatch([evLivro], {
      loteId: "LOTE-SEM-SERIAL",
      caixa: 3,
      spreadsheetId: SPREADSHEET_ID,
    });

    runner.assert(
      instances.length === 1 &&
      instances[0].hasPhysicalIdentifier === false &&
      instances[0].serial === undefined &&
      instances[0].serialImei === "SEM SERIAL" &&
      instances[0].associationAudit?.criteria === "IDENTIDADE_SEM_IDENTIFICADOR_FISICO",
      "SEÇÃO 14: Produto sem serial marcado como IDENTIDADE SEM IDENTIFICADOR FÍSICO sem alucinação de dados"
    );
  }

  // =========================================================================
  // TESTE 9: MEMÓRIA GLOBAL NÃO CONTAMINA UNIDADES FÍSICAS (SEÇÃO 15)
  // Memória global aprende regras de fabricante, mas não fixa Service Tag a Modelo
  // =========================================================================
  {
    const dellPattern = aiMemoryEngine.findBrandPattern("Dell");
    runner.assert(
      Boolean(
        dellPattern &&
        dellPattern.serialMaxLength === 7 &&
        dellPattern.serialPatternDescription.includes("7 caracteres")
      ),
      "SEÇÃO 15: Memória global conhece o padrão estrutural da Dell (Service Tag 7 chars)"
    );

    // Validador aceita qualquer Service Tag válida de 7 chars
    const v1 = ValidationEngine.validateSerial("3843QM4", dellPattern);
    const v2 = ValidationEngine.validateSerial("55TQH24", dellPattern);
    const vBad = ValidationEngine.validateSerial("INVALID_TOO_LONG", dellPattern);

    runner.assert(
      v1.isValid && v2.isValid && !vBad.isValid,
      "SEÇÃO 15: Validador aplica regras de formato sem restringir Service Tag específica a um único modelo"
    );
  }

  // =========================================================================
  // TESTE 10: ENDPOINT DE CATÁLOGO SKU E VÍNCULO POR UNIT_ID (SEÇÃO 2 & 12)
  // =========================================================================
  {
    const skus = storage.getSkuCatalog(SPREADSHEET_ID);
    const units = storage.getPhysicalUnits(undefined, undefined, SPREADSHEET_ID);

    runner.assert(
      Array.isArray(skus) && Array.isArray(units) && units.every((u) => Boolean(u.unitId)),
      "SEÇÃO 2 & 12: Camada de Produto/SKU e Unidades Físicas com unitId permanente acessíveis via API do Storage"
    );
  }

  runner.summary();
}

runPhysicalIdentityTests().catch((err) => {
  console.error("Erro fatal na suíte de testes de identidade física:", err);
  process.exit(1);
});
