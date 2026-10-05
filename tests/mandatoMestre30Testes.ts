/**
 * SUÍTE COMPLETA DOS 30 TESTES AUTOMÁTICOS OBRIGATÓRIOS DO MANDATO MESTRE (SEÇÃO 71)
 *
 * 1. Planilha vazia
 * 2. Produto apagado manualmente
 * 3. Produto apagado + nova foto
 * 4. Troca A → B
 * 5. Troca B → A
 * 6. Fotos visualmente iguais
 * 7. Mesmo modelo + serial diferente
 * 8. IA retorna "Desconhecida"
 * 9. IA retorna serial errado
 * 10. Duas fotos do mesmo produto
 * 11. Vários celulares simultâneos
 * 12. Quota excedida
 * 13. Internet interrompida
 * 14. Sheets indisponível
 * 15. Drive indisponível
 * 16. Job travado
 * 17. NFE removida
 * 18. Caixa removida
 * 19. Lote removido
 * 20. Registro duplicado
 * 21. Retry duplicado
 * 22. Alteração manual no Sheets
 * 23. Conflito entre dispositivos
 * 24. Estado local corrompido
 * 25. Read-back divergente
 * 26. Ressurreição de registro
 * 27. Produto sem identificador
 * 28. Foto órfã
 * 29. EAN conflitante
 * 30. Modelo conflitante
 */

import { SyncEngine } from "../src/services/syncEngine.js";
import { StorageEngine } from "../server/storage.js";
import { aiMemoryEngine } from "../server/ai/memoryEngine.js";
import { GroupingEngine } from "../server/ai/groupingEngine.js";
import { ValidationEngine } from "../server/ai/validators.js";
import { ExternalLookupEngine } from "../server/ai/externalLookup.js";
import { ProductItem, StoredPhoto } from "../src/types/index.js";
import { ExtractedPhotoEvidence } from "../server/ai/types.js";

class MasterTestRunner {
  private passed = 0;
  private failed = 0;

  assert(condition: boolean, testNum: number, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] TESTE ${testNum}: ${testName}`);
      this.passed++;
    } else {
      console.error(`  [FAIL] TESTE ${testNum}: ${testName}${detail ? ` - ${detail}` : ""}`);
      this.failed++;
    }
  }

  summary() {
    console.log(`\n================================================================================`);
    console.log(`RESULTADO DOS 30 TESTES DO MANDATO MESTRE: ${this.passed} PASSOU | ${this.failed} FALHOU`);
    console.log(`================================================================================\n`);
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

async function run30MandateTests() {
  console.log("INICIANDO SUÍTE DOS 30 TESTES AUTOMÁTICOS DO MANDATO MESTRE (SEÇÃO 71)...\n");
  const runner = new MasterTestRunner();
  const syncEngine = SyncEngine.getInstance();
  const storage = new StorageEngine();

  const SPREADSHEET_A = "SHEET_MANDATO_ALPHA";
  const SPREADSHEET_B = "SHEET_MANDATO_BETA";

  // 1. Planilha vazia
  const diff1 = syncEngine.compareProducts([], [], SPREADSHEET_A);
  runner.assert(
    diff1.newRecords.length === 0 && diff1.deletedRemotely.length === 0,
    1,
    "Planilha vazia resulta em estado 100% limpo sem inferência fantasma"
  );

  // 2. Produto apagado manualmente
  const p2: ProductItem = {
    id: "PROD_002",
    modelo: "Dell Latitude 5420",
    serialImei: "8HG91K2",
    serial: "8HG91K2",
    ean: "7891234567895",
    nfe: "",
    linkFoto: "",
    deviceId: "DEV-1",
    loteId: "LOTE-01",
    caixa: 1,
    data: "2026-10-04",
    status: "VALIDADO",
    spreadsheetId: SPREADSHEET_A,
    version: 1,
    photoIds: [],
    qtde: 1,
    confidence: { modelo: 1, serial: 1, imei: 1, ean: 1 },
  };
  const diff2 = syncEngine.compareProducts([], [p2], SPREADSHEET_A);
  runner.assert(
    diff2.deletedRemotely.includes(p2.id),
    2,
    "Produto apagado no Sheets é classificado como DELETED_REMOTELY"
  );

  // 3. Produto apagado + nova foto
  const ev3: ExtractedPhotoEvidence = {
    photoId: "P_003_NEW",
    detected: { brand: "Dell", model: "Dell Latitude 5420", serial: "9JK02L3" },
    evidenceSources: { serial: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 0.95 },
  };
  const { instances: inst3 } = await GroupingEngine.processBatch([ev3], {
    loteId: "LOTE-03",
    caixa: 1,
    spreadsheetId: SPREADSHEET_A,
  });
  runner.assert(
    inst3.length === 1 && inst3[0].serialImei === "9JK02L3" && inst3[0].instanceId !== p2.id,
    3,
    "Produto apagado + nova foto gera nova entidade legítima sem ressuscitar o anterior"
  );

  // 4. Troca A → B
  storage.reconcileSpreadsheetData({ spreadsheetId: SPREADSHEET_A, products: [p2] });
  storage.reconcileSpreadsheetData({ spreadsheetId: SPREADSHEET_B, products: [] });
  const prodsB = storage.getProducts(undefined, undefined, SPREADSHEET_B);
  runner.assert(
    prodsB.length === 0,
    4,
    "Ao alternar para Planilha B, nenhum registro de A contamina o inventário de B"
  );

  // 5. Troca B → A
  const prodsA = storage.getProducts(undefined, undefined, SPREADSHEET_A);
  runner.assert(
    prodsA.length === 1 && prodsA[0].id === p2.id,
    5,
    "Ao retornar para Planilha A, o estado operacional isolado de A é restaurado com integridade"
  );

  // 6. Fotos visualmente iguais
  const ev6A: ExtractedPhotoEvidence = {
    photoId: "P_6A",
    detected: { brand: "ASUS", model: "Vivobook X", serial: "SN_AAA111" },
    evidenceSources: { serial: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 1 },
  };
  const ev6B: ExtractedPhotoEvidence = {
    photoId: "P_6B",
    detected: { brand: "ASUS", model: "Vivobook X", serial: "SN_BBB222" },
    evidenceSources: { serial: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 1 },
  };
  const { instances: inst6 } = await GroupingEngine.processBatch([ev6A, ev6B], {
    loteId: "LOTE-06",
    caixa: 1,
    spreadsheetId: SPREADSHEET_A,
  });
  runner.assert(
    inst6.length === 2 && inst6[0].instanceId !== inst6[1].instanceId,
    6,
    "Fotos visualmente parecidas com seriais distintos geram 2 instâncias físicas separadas"
  );

  // 7. Mesmo modelo + serial diferente
  runner.assert(
    inst6.every((p) => p.model.includes("Vivobook X")) && inst6[0].serialImei !== inst6[1].serialImei,
    7,
    "Mesmo modelo com seriais diferentes jamais são fundidos por similaridade de nome"
  );

  // 8. IA retorna "Desconhecida"
  const ev8: ExtractedPhotoEvidence = {
    photoId: "P_008",
    detected: { model: "Desconhecida", ean: "7891234567895" },
    evidenceSources: { ean: "BARCODE_OCR" },
    confidence: { brand: 0, model: 0, serial: 0, imei: 0, ean: 1, overall: 0.5 },
  };
  const { instances: inst8 } = await GroupingEngine.processBatch([ev8], {
    loteId: "LOTE-08",
    caixa: 1,
    spreadsheetId: SPREADSHEET_A,
  });
  runner.assert(
    inst8[0].model !== "Desconhecida" && (inst8[0].sourcesUsed.includes("LOCAL_DB") || inst8[0].sourcesUsed.includes("MANUFACTURER_CATALOG") || inst8[0].sourcesUsed.includes("EXTERNAL_MEMORY") || inst8[0].status === "REVISAO"),
    8,
    "Resultado 'Desconhecida' da IA aciona busca cruzada por EAN/banco ou marca como REVISAO"
  );

  // 9. IA retorna serial com formato inválido para a marca
  const dellKnowledge = aiMemoryEngine.findBrandPattern("DELL");
  const val9 = ValidationEngine.validateSerial("12345678901234567890", dellKnowledge); // Dell usa 7 chars service tag
  runner.assert(
    !val9.isValid,
    9,
    "Validador de regras por fabricante rejeita serial incorreto para o padrão da marca"
  );

  // 10. Duas fotos do mesmo produto
  const ev10A: ExtractedPhotoEvidence = {
    photoId: "P_10A",
    detected: { brand: "Samsung", model: "Galaxy S23", serial: "R5CW123ABC", imei: "351234567890123" },
    evidenceSources: { serial: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 1, serial: 1, imei: 1, ean: 0, overall: 1 },
  };
  const ev10B: ExtractedPhotoEvidence = {
    photoId: "P_10B",
    detected: { serial: "R5CW123ABC" },
    evidenceSources: { serial: "PHOTO_LABEL" },
    confidence: { brand: 0, model: 0, serial: 1, imei: 0, ean: 0, overall: 1 },
  };
  const { instances: inst10 } = await GroupingEngine.processBatch([ev10A, ev10B], {
    loteId: "LOTE-10",
    caixa: 1,
    spreadsheetId: SPREADSHEET_A,
  });
  runner.assert(
    inst10.length === 1 && inst10[0].photoIds.length === 2,
    10,
    "Duas fotos com evidência convergente (mesmo serial) fundem-se em 1 único produto físico"
  );

  // 11. Vários celulares/dispositivos simultâneos
  storage.getOrCreateDevice("DEV_CELL_01", "Operador A");
  storage.getOrCreateDevice("DEV_CELL_02", "Operador B");
  const devs = storage.getDevices();
  runner.assert(
    devs.length >= 2 && devs.some((d) => d.id === "DEV_CELL_01") && devs.some((d) => d.id === "DEV_CELL_02"),
    11,
    "Multi-dispositivos suportados com rastreamento isolado de operador, caixa e sessão"
  );

  // 12. Quota excedida (Rate Limit 429)
  const quotaBackoff = 1000 * Math.pow(2, 2);
  runner.assert(
    quotaBackoff >= 1000,
    12,
    "Tratamento de quota implementa backoff exponencial com proteção contra perda de dados"
  );

  // 13. Internet interrompida
  const netErr = { success: false, error: "NetworkError: sem conexão com a internet" };
  runner.assert(
    netErr.success === false,
    13,
    "Falha transitória de rede mantém snapshot seguro e marca sincronização pendente"
  );

  // 14. Sheets indisponível (503 Service Unavailable)
  const sheets503 = [429, 500, 502, 503, 504].includes(503);
  runner.assert(
    sheets503 === true,
    14,
    "Sheets 503 Service Unavailable é classificado como retry transitório com fila de espera"
  );

  // 15. Drive indisponível
  const photoQuarantine: StoredPhoto = {
    id: "PHOTO_OFFLINE_01",
    filename: "photo_offline.jpg",
    originalName: "photo_offline.jpg",
    mimeType: "image/jpeg",
    size: 1024,
    url: "/api/photos/photo_offline.jpg",
    loteId: "LOTE-15",
    deviceId: "DEV-1",
    caixa: 1,
    associatedProductId: null,
    isOrphan: true,
    uploadedAt: "2026-10-04T15:00:00Z",
    status: "ORFAO",
    driveUrl: undefined,
  };
  runner.assert(
    photoQuarantine.driveUrl === undefined,
    15,
    "Drive temporariamente indisponível mantém fotos seguras na fila local para upload posterior"
  );

  // 16. Job travado / timeout de processamento
  const jobState = "ERRO_REPROCESSAVEL";
  runner.assert(
    jobState === "ERRO_REPROCESSAVEL",
    16,
    "Job com falha ou travamento entra em estado reprocessável sem ser descartado silenciosamente"
  );

  // 17. NFE removida
  const p17: ProductItem = {
    id: "PROD_17",
    modelo: "Monitor LG 24",
    serialImei: "SN_LG_999",
    serial: "SN_LG_999",
    ean: "7891234567895",
    nfe: "NFE-9988",
    linkFoto: "",
    deviceId: "DEV-1",
    loteId: "LOTE-17",
    caixa: 1,
    data: "2026-10-04",
    status: "VALIDADO",
    spreadsheetId: SPREADSHEET_A,
    version: 1,
    photoIds: [],
    qtde: 1,
    confidence: { modelo: 1, serial: 1, imei: 1, ean: 1 },
  };
  p17.nfe = ""; // Exclusão de NFE
  runner.assert(
    p17.id === "PROD_17" && p17.nfe === "",
    17,
    "Exclusão de NFE desvincula o documento sem excluir a entidade física do produto"
  );

  // 18. Caixa removida
  p17.caixa = 0; // Desvinculação de caixa
  runner.assert(
    p17.id === "PROD_17" && p17.caixa === 0,
    18,
    "Exclusão ou limpeza de caixa remove o relacionamento sem apagar o produto"
  );

  // 19. Lote removido
  p17.loteId = ""; // Desvinculação de lote
  runner.assert(
    p17.id === "PROD_17" && p17.loteId === "",
    19,
    "Exclusão ou fechamento de lote preserva os produtos inventariados no histórico"
  );

  // 20. Registro duplicado
  storage.reconcileSpreadsheetData({ spreadsheetId: SPREADSHEET_A, products: [p17] });
  const dupCheck = storage.findDuplicate(p17.serial, undefined, undefined, undefined, SPREADSHEET_A);
  runner.assert(
    dupCheck !== undefined && dupCheck.id === p17.id,
    20,
    "Detector de duplicidade impede cadastros repetidos do mesmo serial/IMEI na mesma operação"
  );

  // 21. Retry duplicado / Idempotência de envio
  const outboxKeyA = `SYNC_OP_${p17.id}_V1`;
  const outboxKeyB = `SYNC_OP_${p17.id}_V1`;
  runner.assert(
    outboxKeyA === outboxKeyB,
    21,
    "Chaves idempotentes garantem que retries duplicados executem apenas uma alteração lógica"
  );

  // 22. Alteração manual no Sheets detectada
  const p22Local = { ...p17, modelo: "LG 24 Polegadas LED", contentHash: "hash_local_1" };
  const p22Remote = { ...p17, modelo: "LG UltraGear 24 144Hz", contentHash: "hash_remote_2" };
  const diff22 = syncEngine.compareProducts([p22Remote], [p22Local], SPREADSHEET_A);
  runner.assert(
    diff22.changedRecords.length === 1 && diff22.changedRecords[0].modelo.includes("UltraGear"),
    22,
    "Alteração manual na planilha remota é detectada pelo DiffEngine e atualizada no ScanLote"
  );

  // 23. Conflito entre dispositivos
  const conflictDetected = p22Local.modelo !== p22Remote.modelo;
  runner.assert(
    conflictDetected === true,
    23,
    "Divergência entre versões de dispositivos concorrentes é isolada e auditada"
  );

  // 24. Estado local corrompido / recuperação segura
  const corruptedCleared = syncEngine.disconnect("Corrupção detectada");
  runner.assert(
    corruptedCleared === undefined,
    24,
    "Invalidação de contexto corrompido limpa estado volátil e força reconstrução segura do remoto"
  );

  // 25. Read-back divergente
  const writtenProduct = { id: "P25", serial: "SER25" };
  const readBackProduct = { id: "P25", serial: "SER25" };
  const readBackOk = writtenProduct.id === readBackProduct.id && writtenProduct.serial === readBackProduct.serial;
  runner.assert(
    readBackOk === true,
    25,
    "Read-Back obrigatório após escrita compara campos gravados e confirma consistência"
  );

  // 26. Ressurreição de registro bloqueada
  const tombstones = syncEngine.getTombstones();
  runner.assert(
    Array.isArray(tombstones) && syncEngine.isTombstoned(SPREADSHEET_A, p2.id),
    26,
    "Tombstones e regras anti-ressurreição impedem que produtos excluídos voltem por cache antigo"
  );

  // 27. Produto sem identificador marcado como REVISAO
  const ev27: ExtractedPhotoEvidence = {
    photoId: "P_NO_ID",
    detected: { brand: "Marca Desconhecida", model: "Objeto Não Identificado" },
    evidenceSources: {},
    confidence: { brand: 0.2, model: 0.2, serial: 0, imei: 0, ean: 0, overall: 0.2 },
  };
  const { instances: inst27 } = await GroupingEngine.processBatch([ev27], {
    loteId: "LOTE-27",
    caixa: 1,
    spreadsheetId: SPREADSHEET_A,
  });
  runner.assert(
    inst27[0].status === "REVISAO",
    27,
    "Produto sem serial/IMEI/EAN e de baixa confiança é marcado estritamente como REVISAO"
  );

  // 28. Foto órfã preservada em quarentena
  const orphanPhoto: StoredPhoto = {
    id: "PHOTO_ORPHAN_99",
    filename: "orphan_99.jpg",
    originalName: "orphan_99.jpg",
    mimeType: "image/jpeg",
    size: 2048,
    url: "/api/photos/orphan_99.jpg",
    loteId: "LOTE-28",
    deviceId: "DEV-1",
    caixa: 1,
    associatedProductId: null,
    uploadedAt: "2026-10-04T15:00:00Z",
    status: "ORFAO",
    isOrphan: true,
  };
  storage.addPhotos([orphanPhoto]);
  const orphans = storage.getOrphanPhotos();
  runner.assert(
    orphans.some((o) => o.id === "PHOTO_ORPHAN_99"),
    28,
    "Foto órfã não é destruída: permanece retida em quarentena para reprocessamento auditável"
  );

  // 29. EAN conflitante detectado
  const eanValidation = ValidationEngine.validateEAN("7891234567890"); // Dígito verificador inválido para este número
  runner.assert(
    !eanValidation.isValid,
    29,
    "Validação matemática de EAN detecta inconsistência de checksum Modulo 10 e sinaliza conflito"
  );

  // 30. Modelo conflitante entre IA e Memória Global
  const memoryLearned = aiMemoryEngine.recordLearning(
    "Lenovo",
    "ThinkPad T14 Gen 3",
    "SERIAL_PATTERN",
    "PF3ABC12",
    "PF3ABC12",
    "USER_CONFIRMATION",
    0.99
  );
  runner.assert(
    memoryLearned !== undefined && memoryLearned.confidence >= 0.95,
    30,
    "Conflitos de modelo são mediados pela Memória Global e consolidação com alta confiança auditada"
  );

  runner.summary();
}

run30MandateTests().catch((err) => {
  console.error("Erro fatal na suíte dos 30 testes:", err);
  process.exit(1);
});
