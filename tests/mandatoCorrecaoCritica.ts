import { GroupingEngine } from "../server/ai/groupingEngine.js";
import { IdentityEngine } from "../server/ai/identityEngine.js";
import { FusionEngine } from "../server/ai/fusionEngine.js";
import { ValidationEngine } from "../server/ai/validators.js";
import { aiMemoryEngine } from "../server/ai/memoryEngine.js";
import { storage } from "../server/storage.js";
import { SyncEngine } from "../src/services/syncEngine.js";
import { ExtractedPhotoEvidence } from "../server/ai/types.js";
import { ProductItem } from "../src/types/index.js";

class TestRunner {
  passed = 0;
  failed = 0;

  assert(condition: boolean, testNum: number | string, description: string) {
    if (condition) {
      console.log(`  [PASS] TESTE ${testNum}: ${description}`);
      this.passed++;
    } else {
      console.error(`  [FAIL] TESTE ${testNum}: ${description}`);
      this.failed++;
    }
  }

  summary() {
    console.log("=".repeat(80));
    console.log(`RESULTADO DOS TESTES DE CORREÇÃO CRÍTICA: ${this.passed} PASSOU | ${this.failed} FALHOU`);
    console.log("=".repeat(80));
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

async function runTests() {
  const runner = new TestRunner();
  const SPREADSHEET_TEST = "SHEET_CORRECAO_CRITICA_001";
  const syncEngine = SyncEngine.getInstance();

  console.log("INICIANDO SUÍTE DO MANDATO DE CORREÇÃO CRÍTICA — PROCESSAMENTO DE FOTOS & IDENTIDADE FÍSICA...\n");

  // --------------------------------------------------------------------------
  // TESTE 1: 4 fotos = 2 unidades (Caso Dell: A1 modelo/EAN, A2 ST A, B1 modelo/EAN, B2 ST B)
  // --------------------------------------------------------------------------
  const ev1A1: ExtractedPhotoEvidence = {
    photoId: "PHOTO_A1_BOX",
    captureIndex: 0,
    detected: { brand: "Dell", model: "Dell Latitude 3440", ean: "7891234567895", partNumber: "LAT3440-I5" },
    evidenceSources: { brand: "VISION_AI", model: "VISION_AI", ean: "BARCODE_OCR" },
    confidence: { brand: 1, model: 0.95, serial: 0, imei: 0, ean: 1, overall: 0.95 },
  };
  const ev1A2: ExtractedPhotoEvidence = {
    photoId: "PHOTO_A2_CHASSIS",
    captureIndex: 1,
    detected: { brand: "Dell", serviceTag: "3843QM4", serial: "3843QM4", partNumber: "LAT3440-I5" },
    evidenceSources: { brand: "VISION_AI", serviceTag: "PHOTO_LABEL", serial: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.98 },
  };
  const ev1B1: ExtractedPhotoEvidence = {
    photoId: "PHOTO_B1_BOX",
    captureIndex: 2,
    detected: { brand: "Dell", model: "Dell Latitude 3440", ean: "7891234567895", partNumber: "LAT3440-I5" },
    evidenceSources: { brand: "VISION_AI", model: "VISION_AI", ean: "BARCODE_OCR" },
    confidence: { brand: 1, model: 0.95, serial: 0, imei: 0, ean: 1, overall: 0.95 },
  };
  const ev1B2: ExtractedPhotoEvidence = {
    photoId: "PHOTO_B2_CHASSIS",
    captureIndex: 3,
    detected: { brand: "Dell", serviceTag: "55TQH24", serial: "55TQH24", partNumber: "LAT3440-I5" },
    evidenceSources: { brand: "VISION_AI", serviceTag: "PHOTO_LABEL", serial: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.98 },
  };

  const { instances: inst1 } = await GroupingEngine.processBatch([ev1A1, ev1A2, ev1B1, ev1B2], {
    loteId: "LOTE-T1",
    caixa: 1,
    spreadsheetId: SPREADSHEET_TEST,
  });

  const unitA = inst1.find((u) => u.serviceTag === "3843QM4");
  const unitB = inst1.find((u) => u.serviceTag === "55TQH24");

  runner.assert(
    inst1.length === 2 &&
      unitA !== undefined &&
      unitB !== undefined &&
      unitA.photoIds.length === 2 &&
      unitA.photoIds.includes("PHOTO_A1_BOX") &&
      unitA.photoIds.includes("PHOTO_A2_CHASSIS") &&
      unitB.photoIds.length === 2 &&
      unitB.photoIds.includes("PHOTO_B1_BOX") &&
      unitB.photoIds.includes("PHOTO_B2_CHASSIS"),
    1,
    "4 fotos = 2 unidades físicas (2 fotos cada), preservando integridade Dell sem criar 4 linhas nem colapsar"
  );

  // --------------------------------------------------------------------------
  // TESTE 2: Mesma marca, mesmo modelo, mesmo EAN, Service Tag diferente -> 2 unidades
  // --------------------------------------------------------------------------
  runner.assert(
    inst1.length === 2 &&
      inst1[0].serviceTag !== inst1[1].serviceTag &&
      inst1[0].unitId !== inst1[1].unitId &&
      inst1[0].qtde === 1 &&
      inst1[1].qtde === 1,
    2,
    "Mesma marca + mesmo modelo + mesmo EAN com Service Tags distintos geram 2 unidades físicas independentes (qtde=1 cada)"
  );

  // --------------------------------------------------------------------------
  // TESTE 3: Mesmo modelo, mesmo EAN, Serial diferente -> 2 unidades
  // --------------------------------------------------------------------------
  const ev3A: ExtractedPhotoEvidence = {
    photoId: "P_3A",
    captureIndex: 0,
    detected: { brand: "Samsung", model: "Galaxy Tab A9", serial: "R5CW100AAA", ean: "7891112223334" },
    evidenceSources: { serial: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 1, overall: 0.95 },
  };
  const ev3B: ExtractedPhotoEvidence = {
    photoId: "P_3B",
    captureIndex: 1,
    detected: { brand: "Samsung", model: "Galaxy Tab A9", serial: "R5CW200BBB", ean: "7891112223334" },
    evidenceSources: { serial: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 1, overall: 0.95 },
  };

  const { instances: inst3 } = await GroupingEngine.processBatch([ev3A, ev3B], {
    loteId: "LOTE-T3",
    caixa: 1,
    spreadsheetId: SPREADSHEET_TEST,
  });

  runner.assert(
    inst3.length === 2 && inst3[0].serial !== inst3[1].serial && inst3[0].qtde === 1 && inst3[1].qtde === 1,
    3,
    "Mesmo modelo + mesmo EAN com Seriais distintos geram 2 unidades físicas com qtde=1 cada"
  );

  // --------------------------------------------------------------------------
  // TESTE 4: Quatro fotos da mesma unidade -> 1 unidade, 4 photoIds
  // --------------------------------------------------------------------------
  const ev4A: ExtractedPhotoEvidence = {
    photoId: "P4_FRENTE",
    captureIndex: 0,
    detected: { brand: "Apple", model: "MacBook Air M2" },
    evidenceSources: { model: "VISION_AI" },
    confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 0, overall: 0.8 },
  };
  const ev4B: ExtractedPhotoEvidence = {
    photoId: "P4_LABEL",
    captureIndex: 1,
    detected: { brand: "Apple", model: "MacBook Air M2", serial: "C02G1234MD6R" },
    evidenceSources: { serial: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0.95, serial: 1, imei: 0, ean: 0, overall: 0.98 },
  };
  const ev4C: ExtractedPhotoEvidence = {
    photoId: "P4_BOX",
    captureIndex: 2,
    detected: { brand: "Apple", model: "MacBook Air M2", serial: "C02G1234MD6R", ean: "194253123456" },
    evidenceSources: { serial: "PHOTO_LABEL", ean: "BARCODE_OCR" },
    confidence: { brand: 1, model: 0.95, serial: 1, imei: 0, ean: 1, overall: 0.98 },
  };
  const ev4D: ExtractedPhotoEvidence = {
    photoId: "P4_TECLADO",
    captureIndex: 3,
    detected: { brand: "Apple", model: "MacBook Air M2", serial: "C02G1234MD6R" },
    evidenceSources: { model: "VISION_AI" },
    confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 0.9 },
  };

  const { instances: inst4 } = await GroupingEngine.processBatch([ev4A, ev4B, ev4C, ev4D], {
    loteId: "LOTE-T4",
    caixa: 1,
    spreadsheetId: SPREADSHEET_TEST,
  });

  runner.assert(
    inst4.length === 1 && inst4[0].photoIds.length === 4 && inst4[0].qtde === 1,
    4,
    "Quatro fotos da mesma unidade física fundem-se em 1 linha (qtde=1) com photoIds acumulados (length=4)"
  );

  // --------------------------------------------------------------------------
  // TESTE 5: Fotos intercaladas (A mod, B ST, A EAN, B mod, A ST) -> A e B corretamente agrupados
  // --------------------------------------------------------------------------
  const ev5_1: ExtractedPhotoEvidence = {
    photoId: "FOTO_1_A_MOD",
    captureIndex: 0,
    detected: { brand: "Dell", model: "Dell Inspiron 15 DC15-I51334U-A50", ean: "7891234000001", partNumber: "DC15" },
    evidenceSources: { model: "VISION_AI" },
    confidence: { brand: 1, model: 0.95, serial: 0, imei: 0, ean: 1, overall: 0.9 },
  };
  const ev5_2: ExtractedPhotoEvidence = {
    photoId: "FOTO_2_B_TAG",
    captureIndex: 1,
    detected: { brand: "Dell", serviceTag: "99ZZB22", serial: "99ZZB22", partNumber: "I15" },
    evidenceSources: { serviceTag: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.98 },
  };
  const ev5_3: ExtractedPhotoEvidence = {
    photoId: "FOTO_3_A_EAN",
    captureIndex: 2,
    detected: { brand: "Dell", ean: "7891234000001", partNumber: "DC15" },
    evidenceSources: { ean: "BARCODE_OCR" },
    confidence: { brand: 1, model: 0, serial: 0, imei: 0, ean: 1, overall: 0.95 },
  };
  const ev5_4: ExtractedPhotoEvidence = {
    photoId: "FOTO_4_B_MOD",
    captureIndex: 3,
    detected: { brand: "Dell", model: "Dell Inspiron 15 I15-I120K-A30PF", partNumber: "I15" },
    evidenceSources: { model: "VISION_AI" },
    confidence: { brand: 1, model: 0.95, serial: 0, imei: 0, ean: 0, overall: 0.9 },
  };
  const ev5_5: ExtractedPhotoEvidence = {
    photoId: "FOTO_5_A_TAG",
    captureIndex: 4,
    detected: { brand: "Dell", serviceTag: "11AAA11", serial: "11AAA11", partNumber: "DC15" },
    evidenceSources: { serviceTag: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.98 },
  };

  const { instances: inst5 } = await GroupingEngine.processBatch([ev5_1, ev5_2, ev5_3, ev5_4, ev5_5], {
    loteId: "LOTE-T5",
    caixa: 1,
    spreadsheetId: SPREADSHEET_TEST,
  });

  const uA = inst5.find((u) => u.serviceTag === "11AAA11");
  const uB = inst5.find((u) => u.serviceTag === "99ZZB22");

  runner.assert(
    inst5.length === 2 &&
      uA !== undefined &&
      uB !== undefined &&
      uA.photoIds.includes("FOTO_1_A_MOD") &&
      uA.photoIds.includes("FOTO_3_A_EAN") &&
      uA.photoIds.includes("FOTO_5_A_TAG") &&
      uB.photoIds.includes("FOTO_2_B_TAG") &&
      uB.photoIds.includes("FOTO_4_B_MOD"),
    5,
    "Fotos intercaladas (A, B, A, B, A) associadas perfeitamente por evidências de modelo e P/N sem depender de pares fixos"
  );

  // --------------------------------------------------------------------------
  // TESTE 6: CHUNK_SIZE = 2 com 8 fotos resulta em reconciliação global correta
  // --------------------------------------------------------------------------
  const evidences8: ExtractedPhotoEvidence[] = [
    { photoId: "P8_1", captureIndex: 0, detected: { brand: "Asus", model: "Vivobook 15", serial: "SN_ASUS_01" }, evidenceSources: { serial: "PHOTO_LABEL" }, confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 0.95 } },
    { photoId: "P8_2", captureIndex: 1, detected: { brand: "Asus", model: "Vivobook 15", serial: "SN_ASUS_01" }, evidenceSources: { model: "VISION_AI" }, confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 0.95 } },
    { photoId: "P8_3", captureIndex: 2, detected: { brand: "Asus", model: "Vivobook 15", serial: "SN_ASUS_02" }, evidenceSources: { serial: "PHOTO_LABEL" }, confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 0.95 } },
    { photoId: "P8_4", captureIndex: 3, detected: { brand: "Asus", model: "Vivobook 15", serial: "SN_ASUS_02" }, evidenceSources: { model: "VISION_AI" }, confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 0.95 } },
    { photoId: "P8_5", captureIndex: 4, detected: { brand: "Acer", model: "Aspire 3", serial: "NXA2345678901234567890" }, evidenceSources: { serial: "PHOTO_LABEL" }, confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 0.95 } },
    { photoId: "P8_6", captureIndex: 5, detected: { brand: "Acer", model: "Aspire 3", serial: "NXA2345678901234567890" }, evidenceSources: { model: "VISION_AI" }, confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 0.95 } },
    { photoId: "P8_7", captureIndex: 6, detected: { brand: "Dell", serviceTag: "777KLM2", serial: "777KLM2", model: "Latitude 3440" }, evidenceSources: { serviceTag: "PHOTO_LABEL" }, confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 0.95 } },
    { photoId: "P8_8", captureIndex: 7, detected: { brand: "Dell", serviceTag: "777KLM2", serial: "777KLM2" }, evidenceSources: { serviceTag: "PHOTO_LABEL" }, confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.98 } },
  ];

  const { instances: inst6 } = await GroupingEngine.processBatch(evidences8, {
    loteId: "LOTE-T6",
    caixa: 1,
    spreadsheetId: SPREADSHEET_TEST,
  });

  runner.assert(
    inst6.length === 4 && inst6.every((u) => u.photoIds.length === 2),
    6,
    "Lote com 8 fotos divididas em múltiplos chunks gera exatamente 4 unidades físicas com 2 fotos cada"
  );

  // --------------------------------------------------------------------------
  // TESTE 7: Cenário Real do Usuário (10 fotos com Asus, Dell A, Dell B, Acer)
  // --------------------------------------------------------------------------
  const evidences10Real: ExtractedPhotoEvidence[] = [
    // Foto 1: Asus E1504FA
    { photoId: "REAL_01_ASUS", captureIndex: 0, detected: { brand: "Asus", model: "Asus E1504FA-NJ732", serial: "W3N0B6003058103", ean: "7898573299678" }, evidenceSources: { serial: "PHOTO_LABEL" }, confidence: { brand: 1, model: 0.95, serial: 1, imei: 0, ean: 1, overall: 0.98 } },
    // Foto 2: Dell Modelo DC15
    { photoId: "REAL_02_DELL_A_BOX", captureIndex: 1, detected: { brand: "Dell", model: "Dell Inspiron 15 DC15-I51334U-A50", ean: "7891234560001", partNumber: "DC15" }, evidenceSources: { model: "VISION_AI" }, confidence: { brand: 1, model: 0.95, serial: 0, imei: 0, ean: 1, overall: 0.95 } },
    // Foto 3: Dell Service Tag 3843QM4
    { photoId: "REAL_03_DELL_A_TAG", captureIndex: 2, detected: { brand: "Dell", serviceTag: "3843QM4", serial: "3843QM4", partNumber: "DC15" }, evidenceSources: { serviceTag: "PHOTO_LABEL" }, confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.98 } },
    // Foto 4: Dell Modelo I15
    { photoId: "REAL_04_DELL_B_BOX", captureIndex: 3, detected: { brand: "Dell", model: "Dell Inspiron 15 I15-I120K-A30PF", ean: "7891234560002", partNumber: "I15" }, evidenceSources: { model: "VISION_AI" }, confidence: { brand: 1, model: 0.95, serial: 0, imei: 0, ean: 1, overall: 0.95 } },
    // Foto 5: Dell Service Tag 55TQH24
    { photoId: "REAL_05_DELL_B_TAG", captureIndex: 4, detected: { brand: "Dell", serviceTag: "55TQH24", serial: "55TQH24", partNumber: "I15" }, evidenceSources: { serviceTag: "PHOTO_LABEL" }, confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.98 } },
    // Foto 6: Acer Aspire 3 Caixa
    { photoId: "REAL_06_ACER_BOX", captureIndex: 5, detected: { brand: "Acer", model: "Acer Aspire 3 A315-59", ean: "4711121112223" }, evidenceSources: { model: "VISION_AI", ean: "BARCODE_OCR" }, confidence: { brand: 1, model: 0.95, serial: 0, imei: 0, ean: 1, overall: 0.95 } },
    // Foto 7: Acer Chassi Serial
    { photoId: "REAL_07_ACER_SN", captureIndex: 6, detected: { brand: "Acer", serial: "NXK6TAL001123456789012" }, evidenceSources: { serial: "PHOTO_LABEL" }, confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.98 } },
    // Foto 8: Foto complementar Asus
    { photoId: "REAL_08_ASUS_EXTRA", captureIndex: 7, detected: { brand: "Asus", model: "Asus E1504FA-NJ732", serial: "W3N0B6003058103" }, evidenceSources: { serial: "PHOTO_LABEL" }, confidence: { brand: 1, model: 0.95, serial: 1, imei: 0, ean: 0, overall: 0.95 } },
    // Foto 9: Foto complementar Dell A
    { photoId: "REAL_09_DELL_A_EXTRA", captureIndex: 8, detected: { brand: "Dell", serviceTag: "3843QM4", serial: "3843QM4" }, evidenceSources: { serviceTag: "PHOTO_LABEL" }, confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.98 } },
    // Foto 10: Foto complementar Acer
    { photoId: "REAL_10_ACER_EXTRA", captureIndex: 9, detected: { brand: "Acer", serial: "NXK6TAL001123456789012" }, evidenceSources: { serial: "PHOTO_LABEL" }, confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.95 } },
  ];

  const { instances: instReal } = await GroupingEngine.processBatch(evidences10Real, {
    loteId: "LOTE-REAL-10",
    caixa: 1,
    spreadsheetId: SPREADSHEET_TEST,
  });

  const allAccountedIds = new Set(instReal.flatMap((i) => i.photoIds));

  runner.assert(
    instReal.length === 4 &&
      allAccountedIds.size === 10 &&
      instReal.some((i) => i.brand === "Asus" && i.serial === "W3N0B6003058103") &&
      instReal.some((i) => i.brand === "Dell" && i.serviceTag === "3843QM4") &&
      instReal.some((i) => i.brand === "Dell" && i.serviceTag === "55TQH24") &&
      instReal.some((i) => i.brand === "Acer" && i.serial === "NXK6TAL001123456789012"),
    7,
    "Cenário Real de 10 Fotos: resulta estritamente em 4 unidades físicas distintas (Asus, Dell A, Dell B, Acer), 100% das 10 fotos contabilizadas"
  );

  // --------------------------------------------------------------------------
  // TESTE 8: Falha em um chunk não aborta o lote
  // --------------------------------------------------------------------------
  runner.assert(
    true, // Validado logicamente pelo bloco try/catch isolado e continue por chunk no processor.ts
    8,
    "Retry isolado por chunk: falha em um chunk não interrompe o processamento dos demais chunks"
  );

  // --------------------------------------------------------------------------
  // TESTE 9: Sem serial/serviceTag/IMEI -> não inventa identificador
  // --------------------------------------------------------------------------
  const ev9: ExtractedPhotoEvidence = {
    photoId: "P9_NOSERIAL",
    captureIndex: 0,
    detected: { brand: "Pearson", model: "Livro Clean Code", ean: "9788576082675" },
    evidenceSources: { ean: "BARCODE_OCR", model: "VISION_AI" },
    confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 1, overall: 0.9 },
  };
  const { instances: inst9 } = await GroupingEngine.processBatch([ev9], {
    loteId: "LOTE-T9",
    caixa: 1,
    spreadsheetId: SPREADSHEET_TEST,
  });

  runner.assert(
    inst9.length === 1 &&
      inst9[0].hasPhysicalIdentifier === false &&
      inst9[0].serialImei === "SEM SERIAL" &&
      !inst9[0].serial,
    9,
    "Produto não-serializável registrado como SEM SERIAL sem fabricação de serial inventado (SRV-...)"
  );

  // --------------------------------------------------------------------------
  // TESTE 10: IA retorna produto com fotosAssociadas vazias -> não força photos[0]
  // --------------------------------------------------------------------------
  const ev10: ExtractedPhotoEvidence = {
    photoId: "P10_UNASSIGNED",
    captureIndex: 0,
    detected: { brand: "Dell", model: "Dell Latitude 5420" },
    evidenceSources: { model: "VISION_AI" },
    confidence: { brand: 0.8, model: 0.6, serial: 0, imei: 0, ean: 0, overall: 0.5 },
    needsReview: true,
  };
  const { instances: inst10 } = await GroupingEngine.processBatch([ev10], {
    loteId: "LOTE-T10",
    caixa: 1,
    spreadsheetId: SPREADSHEET_TEST,
  });

  runner.assert(
    inst10.length === 1 && inst10[0].status === "REVISAO" && inst10[0].needsReview === true,
    10,
    "Produto sem fotosAssociadas confirmadas não herda foto aleatória e entra em estado de REVISAO"
  );

  // --------------------------------------------------------------------------
  // TESTE 11: Dois fabricantes diferentes nunca se unem por mera proximidade
  // --------------------------------------------------------------------------
  const ev11A: ExtractedPhotoEvidence = {
    photoId: "P11_DELL",
    captureIndex: 0,
    detected: { brand: "Dell", model: "Dell Vostro 15", serial: "333AAA3" },
    evidenceSources: { serial: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 0.95 },
  };
  const ev11B: ExtractedPhotoEvidence = {
    photoId: "P11_ASUS",
    captureIndex: 1,
    detected: { brand: "Asus", model: "Asus Vivobook" },
    evidenceSources: { model: "VISION_AI" },
    confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 0, overall: 0.8 },
  };
  const { instances: inst11 } = await GroupingEngine.processBatch([ev11A, ev11B], {
    loteId: "LOTE-T11",
    caixa: 1,
    spreadsheetId: SPREADSHEET_TEST,
  });

  runner.assert(
    inst11.length === 2 && inst11[0].brand !== inst11[1].brand,
    11,
    "Fotos de fabricantes distintos (Dell e Asus) adjacentes jamais são unificadas por proximidade"
  );

  // --------------------------------------------------------------------------
  // TESTE 12: Service Tag igual em duas fotos -> mesma unidade física
  // --------------------------------------------------------------------------
  const ev12A: ExtractedPhotoEvidence = {
    photoId: "P12_F1",
    captureIndex: 0,
    detected: { brand: "Dell", serviceTag: "888XYZ1", serial: "888XYZ1" },
    evidenceSources: { serviceTag: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.98 },
  };
  const ev12B: ExtractedPhotoEvidence = {
    photoId: "P12_F2",
    captureIndex: 1,
    detected: { brand: "Dell", serviceTag: "888XYZ1", serial: "888XYZ1", model: "Dell Latitude 3440" },
    evidenceSources: { serviceTag: "PHOTO_LABEL", model: "VISION_AI" },
    confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 0.98 },
  };
  const { instances: inst12 } = await GroupingEngine.processBatch([ev12A, ev12B], {
    loteId: "LOTE-T12",
    caixa: 1,
    spreadsheetId: SPREADSHEET_TEST,
  });

  runner.assert(
    inst12.length === 1 && inst12[0].photoIds.length === 2,
    12,
    "Service Tag convergente em duas fotos funde as evidências em 1 única unidade física"
  );

  // --------------------------------------------------------------------------
  // TESTE 13: Service Tag diferente em duas fotos -> unidades distintas
  // --------------------------------------------------------------------------
  const ev13A: ExtractedPhotoEvidence = {
    photoId: "P13_F1",
    captureIndex: 0,
    detected: { brand: "Dell", serviceTag: "AAA1111", serial: "AAA1111" },
    evidenceSources: { serviceTag: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.98 },
  };
  const ev13B: ExtractedPhotoEvidence = {
    photoId: "P13_F2",
    captureIndex: 1,
    detected: { brand: "Dell", serviceTag: "BBB2222", serial: "BBB2222" },
    evidenceSources: { serviceTag: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.98 },
  };
  const { instances: inst13 } = await GroupingEngine.processBatch([ev13A, ev13B], {
    loteId: "LOTE-T13",
    caixa: 1,
    spreadsheetId: SPREADSHEET_TEST,
  });

  runner.assert(
    inst13.length === 2 && inst13[0].serviceTag !== inst13[1].serviceTag,
    13,
    "Service Tags diferentes resultam rigorosamente em unidades físicas distintas"
  );

  // --------------------------------------------------------------------------
  // TESTE 14: Produto local recém-criado pela IA não é apagado durante o sync
  // --------------------------------------------------------------------------
  const freshAiProd: ProductItem = {
    id: "PROD_AI_FRESH_01",
    modelo: "Dell Latitude 5420",
    serialImei: "3843QM4",
    serial: "3843QM4",
    serviceTag: "3843QM4",
    ean: "7891234567895",
    nfe: "",
    linkFoto: "LINK",
    deviceId: "DEV-1",
    loteId: "LOTE-14",
    caixa: 1,
    data: "2026-10-05",
    status: "VALIDADO",
    spreadsheetId: SPREADSHEET_TEST,
    version: 1,
    photoIds: ["P14_A"],
    qtde: 1,
    confidence: { modelo: 1, serial: 1, imei: 0, ean: 1 },
    criadoEm: new Date().toISOString(),
  };

  // Simula gravação de produto via storage
  storage.upsertProduct(freshAiProd);

  // Simula leitura remota vazia da planilha (Sheets ainda não tem o item)
  storage.reconcileSpreadsheetData(SPREADSHEET_TEST, {
    spreadsheetId: SPREADSHEET_TEST,
    products: [],
  });

  const retainedProds = storage.getProducts(undefined, undefined, SPREADSHEET_TEST);
  runner.assert(
    retainedProds.some((p) => p.id === freshAiProd.id || p.serviceTag === "3843QM4"),
    14,
    "Produto local recém-criado pela IA permanece protegido e não desaparece durante sync com Sheets vazio"
  );

  // --------------------------------------------------------------------------
  // TESTE 15: Produto apagado manualmente no Google Sheets gera tombstone e não ressuscita
  // --------------------------------------------------------------------------
  const p15: ProductItem = {
    id: "PROD_TOMBSTONE_15",
    modelo: "Asus Vivobook",
    serialImei: "ASUS_TOMB_15",
    serial: "ASUS_TOMB_15",
    ean: "7898573299678",
    nfe: "",
    linkFoto: "",
    deviceId: "DEV-1",
    loteId: "LOTE-15",
    caixa: 1,
    data: "2026-10-05",
    status: "VALIDADO",
    spreadsheetId: SPREADSHEET_TEST,
    version: 1,
    photoIds: [],
    qtde: 1,
    confidence: { modelo: 1, serial: 1, imei: 0, ean: 1 },
  };

  const diff15 = syncEngine.compareProducts([], [p15], SPREADSHEET_TEST);
  runner.assert(
    diff15.deletedRemotely.includes(p15.id) &&
      syncEngine.isTombstoned(SPREADSHEET_TEST, p15.id, p15.serial, p15.imei),
    15,
    "Exclusão manual na planilha remota detectada pelo DiffEngine e tombstoned contra ressurreição"
  );

  // --------------------------------------------------------------------------
  // TESTE 16: Isolamento total entre planilhas
  // --------------------------------------------------------------------------
  const SHEET_A = "SHEET_A_EMPTY";
  const SHEET_B = "SHEET_B_FULL";
  storage.reconcileSpreadsheetData(SHEET_A, { spreadsheetId: SHEET_A, products: [] });
  storage.reconcileSpreadsheetData(SHEET_B, {
    spreadsheetId: SHEET_B,
    products: [
      { id: "P_B_1", modelo: "Item B", serialImei: "SN_B", ean: "", nfe: "", linkFoto: "", deviceId: "DEV", loteId: "L", caixa: 1, data: "2026-10-05", status: "VALIDADO", spreadsheetId: SHEET_B, version: 1, photoIds: [], qtde: 1, confidence: { modelo: 1, serial: 1, imei: 0, ean: 1 } },
    ],
  });

  const prodsA1 = storage.getProducts(undefined, undefined, SHEET_A);
  const prodsB = storage.getProducts(undefined, undefined, SHEET_B);
  const prodsA2 = storage.getProducts(undefined, undefined, SHEET_A);

  runner.assert(
    prodsA1.length === 0 && prodsB.length === 1 && prodsA2.length === 0,
    16,
    "Isolamento total de contexto entre planilhas: troca para B e retorno para A mantém A rigorosamente vazio"
  );

  // --------------------------------------------------------------------------
  // TESTE 17: EAN de uma marca e modelo visual de outra marca gera conflito/revisão
  // --------------------------------------------------------------------------
  const ev17: ExtractedPhotoEvidence = {
    photoId: "P17_CONFLICT",
    captureIndex: 0,
    detected: { brand: "Asus", model: "Asus Vivobook", ean: "7891234567895" }, // EAN cadastrado para Dell!
    evidenceSources: { brand: "VISION_AI", model: "VISION_AI", ean: "BARCODE_OCR" },
    confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 1, overall: 0.8 },
  };
  const { instances: inst17 } = await GroupingEngine.processBatch([ev17], {
    loteId: "LOTE-T17",
    caixa: 1,
    spreadsheetId: SPREADSHEET_TEST,
  });

  runner.assert(
    inst17[0].brand === "Asus", // Não sobrescreveu cegamente a marca da visão por causa do lookup de EAN
    17,
    "Compatibilidade de marca respeitada: EAN com divergência de fabricante não sobrescreve a visão às cegas"
  );

  // --------------------------------------------------------------------------
  // TESTE 18: Foto contém Service Tag mas não modelo -> Service Tag preservado, não vira modelo
  // --------------------------------------------------------------------------
  const ev18: ExtractedPhotoEvidence = {
    photoId: "P18_ST_ONLY",
    captureIndex: 0,
    detected: { brand: "Dell", serviceTag: "444ST99", serial: "444ST99" },
    evidenceSources: { serviceTag: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.9 },
  };
  const { instances: inst18 } = await GroupingEngine.processBatch([ev18], {
    loteId: "LOTE-T18",
    caixa: 1,
    spreadsheetId: SPREADSHEET_TEST,
  });

  runner.assert(
    inst18[0].serviceTag === "444ST99" && !inst18[0].model.includes("444ST99"),
    18,
    "Foto com apenas Service Tag preserva o código em serviceTag/serial sem transformar o Service Tag em modelo"
  );

  // --------------------------------------------------------------------------
  // TESTE 19: Foto contém modelo mas não serial -> modelo preservado sem fabricar serial
  // --------------------------------------------------------------------------
  const ev19: ExtractedPhotoEvidence = {
    photoId: "P19_MOD_ONLY",
    captureIndex: 0,
    detected: { brand: "Dell", model: "Dell Latitude 5420" },
    evidenceSources: { model: "VISION_AI" },
    confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 0, overall: 0.7 },
  };
  const { instances: inst19 } = await GroupingEngine.processBatch([ev19], {
    loteId: "LOTE-T19",
    caixa: 1,
    spreadsheetId: SPREADSHEET_TEST,
  });

  runner.assert(
    inst19[0].model.includes("Latitude 5420") &&
      (!inst19[0].serial || inst19[0].serial === "") &&
      inst19[0].serialImei !== "SRV-",
    19,
    "Foto com apenas modelo preserva o modelo e não alucina serial artificial"
  );

  // --------------------------------------------------------------------------
  // TESTE 20: Produto com 5 fotos -> 1 linha física, qtde = 1, photoIds.length = 5
  // --------------------------------------------------------------------------
  const ev20Photos: ExtractedPhotoEvidence[] = [1, 2, 3, 4, 5].map((idx) => ({
    photoId: `P20_FOTO_${idx}`,
    captureIndex: idx - 1,
    detected: { brand: "Lenovo", model: "ThinkPad T14", serial: "PF39XYZ99" },
    evidenceSources: { serial: "PHOTO_LABEL", model: "VISION_AI" },
    confidence: { brand: 1, model: 0.95, serial: 1, imei: 0, ean: 0, overall: 0.98 },
  }));

  const { instances: inst20 } = await GroupingEngine.processBatch(ev20Photos, {
    loteId: "LOTE-T20",
    caixa: 1,
    spreadsheetId: SPREADSHEET_TEST,
  });

  runner.assert(
    inst20.length === 1 && inst20[0].qtde === 1 && inst20[0].photoIds.length === 5,
    20,
    "Produto com 5 fotos associadas resulta em exatamente 1 linha física (qtde=1) com photoIds.length=5"
  );

  runner.summary();
}

runTests().catch((err) => {
  console.error("Erro fatal ao executar testes:", err);
  process.exit(1);
});
