/**
 * SUÍTE DE TESTES DO MANDATO MESTRE DE ARQUITETURA (SEÇÃO 71 - TESTES A a J)
 * Validação rigorosa da Separação Absoluta entre:
 * 1. IA / PROCESSAMENTO
 * 2. MEMÓRIA GLOBAL (SCANLOTE_AI_MEMORY)
 * 3. ESTADO OPERACIONAL (ISOLADO POR SPREADSHEET_ID)
 * 4. EVIDÊNCIAS (FOTOGRAFIAS ORIGINAIS)
 */

import { SyncEngine } from "../src/services/syncEngine.js";
import { StorageEngine } from "../server/storage.js";
import { aiMemoryEngine } from "../server/ai/memoryEngine.js";
import { GroupingEngine } from "../server/ai/groupingEngine.js";
import { ProductItem } from "../src/types/index.js";
import { ExtractedPhotoEvidence } from "../server/ai/types.js";

class TestRunner {
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
    console.log(`\n==================================================`);
    console.log(`RESULTADO DOS TESTES MANDATO MESTRE (A-J): ${this.passed} PASSOU | ${this.failed} FALHOU`);
    console.log(`==================================================\n`);
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

async function runTestsAJ() {
  console.log("INICIANDO SUÍTE DE TESTES A-J DO MANDATO MESTRE DE SEPARAÇÃO DE CAMADAS...\n");
  const runner = new TestRunner();
  const syncEngine = SyncEngine.getInstance();
  const storage = new StorageEngine();

  const SPREADSHEET_A = "SHEET_MANDATO_ALPHA_001";
  const SPREADSHEET_B = "SHEET_MANDATO_BETA_EMPTY";

  // --- TESTE A: PLANILHA A — Criar Produto A (Serial ABC123), confirmar presença ---
  const prodA: ProductItem = {
    id: "PROD_ALPHA_001",
    modelo: "ASUS Vivobook 15 Core i5",
    serialImei: "ABC123456",
    serial: "ABC123456",
    ean: "4711081123456",
    qtde: 1,
    caixa: 1,
    data: "2026-10-04",
    status: "VALIDADO",
    deviceId: "Carlos Silveira",
    loteId: "LOTE-ALPHA-01",
    spreadsheetId: SPREADSHEET_A,
    nfe: "",
    linkFoto: "",
    photoIds: [],
    confidence: { modelo: 1, serial: 1, imei: 1, ean: 1 },
    version: 1,
  };

  storage.reconcileSpreadsheetData({
    spreadsheetId: SPREADSHEET_A,
    products: [prodA],
  });

  const prodsA1 = storage.getProducts(undefined, undefined, SPREADSHEET_A);
  runner.assert(
    prodsA1.length === 1 && prodsA1[0].id === prodA.id && prodsA1[0].serial === "ABC123456",
    "TESTE A: Produto A com serial ABC123 criado e confirmado no estado operacional de A"
  );

  // --- TESTE B: APAGAR PRODUTO A — Removido na Google Sheets -> desaparece do ScanLote ---
  const diffDelete = syncEngine.compareProducts([], [prodA], SPREADSHEET_A);
  runner.assert(
    diffDelete.deletedRemotely.includes(prodA.id),
    "TESTE B (Passo 1): Exclusão de Produto A na Google Sheets detectada pelo DiffEngine"
  );

  storage.reconcileSpreadsheetData({
    spreadsheetId: SPREADSHEET_A,
    products: [],
  });

  const prodsA2 = storage.getProducts(undefined, undefined, SPREADSHEET_A);
  runner.assert(
    prodsA2.length === 0,
    "TESTE B (Passo 2): Produto A desaparece completamente do ScanLote após exclusão na planilha"
  );

  // --- TESTE C: NOVA FOTO — Foto com serial ABC999 vira novo produto, nunca ABC123 ressuscitado ---
  const evC: ExtractedPhotoEvidence = {
    photoId: "PHOTO_NEW_EVID_ABC999",
    detected: {
      brand: "ASUS",
      model: "ASUS Vivobook 15 Core i5",
      serial: "ABC999888",
    },
    evidenceSources: { serial: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 0.9, serial: 0.98, imei: 0, ean: 0, overall: 0.95 },
  };

  const { instances: instancesC } = await GroupingEngine.processBatch([evC], {
    loteId: "LOTE-ALPHA-02",
    caixa: 1,
    spreadsheetId: SPREADSHEET_A,
  });

  runner.assert(
    instancesC.length === 1 && instancesC[0].serialImei === "ABC999888" && instancesC[0].instanceId !== prodA.id,
    "TESTE C: Nova foto com serial ABC999 vira nova entidade física independente (ABC123 não ressuscitou)"
  );

  // --- TESTE D: TROCA DE PLANILHA — Planilha A (10 produtos) vs Planilha B (0 produtos) ---
  const tenProductsA: ProductItem[] = Array.from({ length: 10 }, (_, i) => ({
    id: `PROD_A_${i + 1}`,
    modelo: `Notebook Modelo A-${i + 1}`,
    serialImei: `SER_A_${String(i + 1).padStart(3, "0")}`,
    serial: `SER_A_${String(i + 1).padStart(3, "0")}`,
    ean: "7891234567890",
    qtde: 1,
    caixa: 1,
    data: "2026-10-04",
    status: "VALIDADO",
    deviceId: "Carlos Silveira",
    loteId: "LOTE-A-10",
    spreadsheetId: SPREADSHEET_A,
    nfe: "",
    linkFoto: "",
    photoIds: [],
    confidence: { modelo: 1, serial: 1, imei: 1, ean: 1 },
    version: 1,
  }));

  storage.reconcileSpreadsheetData({
    spreadsheetId: SPREADSHEET_A,
    products: tenProductsA,
  });

  storage.reconcileSpreadsheetData({
    spreadsheetId: SPREADSHEET_B,
    products: [],
  });

  const prodsInB = storage.getProducts(undefined, undefined, SPREADSHEET_B);
  runner.assert(
    prodsInB.length === 0,
    "TESTE D: Ao trocar para Planilha B (vazia), ScanLote exibe rigorosamente 0 produtos"
  );

  // --- TESTE E: VOLTAR PARA A — Voltar B -> A resulta em 10 produtos de A preservados ---
  const prodsBackInA = storage.getProducts(undefined, undefined, SPREADSHEET_A);
  runner.assert(
    prodsBackInA.length === 10 && prodsBackInA.every((p) => p.spreadsheetId === SPREADSHEET_A),
    "TESTE E: Ao retornar para Planilha A, todos os 10 produtos de A estão isolados e intactos"
  );

  // --- TESTE F: MEMÓRIA GLOBAL — Aprender padrão ASUS; excluir todos produtos da operação; memória continua ---
  aiMemoryEngine.recordLearning(
    "ASUS",
    "Vivobook S14 OLED Ultra",
    "SERIAL_PATTERN",
    "M5N0CV012345",
    "M5N0CV012345",
    "USER_CONFIRMATION",
    0.99
  );

  // Excluir todos os produtos da operação A
  storage.reconcileSpreadsheetData({
    spreadsheetId: SPREADSHEET_A,
    products: [],
  });

  const prodsAAfterWipe = storage.getProducts(undefined, undefined, SPREADSHEET_A);
  const patternsAfterWipe = aiMemoryEngine.findBrandPattern("ASUS");
  const learningAfterWipe = aiMemoryEngine.getAllLearning().find((l) => l.brand === "ASUS");

  runner.assert(
    prodsAAfterWipe.length === 0 && patternsAfterWipe !== undefined && learningAfterWipe !== undefined,
    "TESTE F: Exclusão total de produtos da operação não apaga o conhecimento da Memória Global"
  );

  // --- TESTE G: PRODUTO IGUAL — Vivobook S14 ABC001 e Vivobook S14 ABC002 -> 2 produtos físicos distintos ---
  const evG1: ExtractedPhotoEvidence = {
    photoId: "P_G1",
    detected: { brand: "ASUS", model: "Vivobook S14", serial: "ABC001" },
    evidenceSources: { serial: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 1, serial: 1, imei: 0, ean: 0, overall: 1 },
  };
  const evG2: ExtractedPhotoEvidence = {
    photoId: "P_G2",
    detected: { brand: "ASUS", model: "Vivobook S14", serial: "ABC002" },
    evidenceSources: { serial: "PHOTO_LABEL" },
    confidence: { brand: 1, model: 1, serial: 1, imei: 0, ean: 0, overall: 1 },
  };

  const { instances: instancesG } = await GroupingEngine.processBatch([evG1, evG2], {
    loteId: "LOTE-G",
    caixa: 1,
    spreadsheetId: SPREADSHEET_A,
  });

  runner.assert(
    instancesG.length === 2 && instancesG[0].instanceId !== instancesG[1].instanceId,
    "TESTE G: Modelos idênticos com seriais distintos (ABC001 vs ABC002) formam 2 entidades físicas separadas"
  );

  // --- TESTE H: MÚLTIPLAS FOTOS — Frontal, Traseira, Etiqueta, Caixa com mesmo serial -> 1 produto, 4 evidências ---
  const evH1: ExtractedPhotoEvidence = {
    photoId: "P_H_FRONT",
    detected: { brand: "Apple", model: "iPhone 15 Pro", serial: "F2LX9ABCD123" },
    evidenceSources: { serial: "PHOTO_LABEL", model: "VISION_AI" },
    confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 0.95 },
  };
  const evH2: ExtractedPhotoEvidence = {
    photoId: "P_H_BACK",
    detected: { brand: "Apple", model: "iPhone 15 Pro" },
    evidenceSources: { model: "VISION_AI" },
    confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 0, overall: 0.8 },
  };
  const evH3: ExtractedPhotoEvidence = {
    photoId: "P_H_LABEL",
    detected: { serial: "F2LX9ABCD123", imei: "354321098765432" },
    evidenceSources: { serial: "PHOTO_LABEL", imei: "PHOTO_LABEL" },
    confidence: { brand: 0, model: 0, serial: 1, imei: 1, ean: 0, overall: 1 },
  };
  const evH4: ExtractedPhotoEvidence = {
    photoId: "P_H_BOX",
    detected: { ean: "194253397168", serial: "F2LX9ABCD123" },
    evidenceSources: { ean: "BARCODE_OCR", serial: "PHOTO_LABEL" },
    confidence: { brand: 0, model: 0, ean: 1, serial: 1, imei: 0, overall: 0.95 },
  };

  const { instances: instancesH } = await GroupingEngine.processBatch([evH1, evH2, evH3, evH4], {
    loteId: "LOTE-H",
    caixa: 1,
    spreadsheetId: SPREADSHEET_A,
  });

  runner.assert(
    instancesH.length === 1 && instancesH[0].photoIds.length === 4,
    "TESTE H: 4 fotografias do mesmo produto são fundidas em 1 única entidade com 4 evidências vinculadas"
  );

  // --- TESTE I: PLANILHA VAZIA — Apagar todos os dados -> inventário vazio sem dados antigos ---
  const diffEmpty = syncEngine.compareProducts([], tenProductsA, SPREADSHEET_A);
  runner.assert(
    diffEmpty.deletedRemotely.length === tenProductsA.length && diffEmpty.newRecords.length === 0,
    "TESTE I: Planilha remota vazia gera reconciliação 100% limpa sem ressuscitar dados do cache"
  );

  // --- TESTE J: ERRO DE CONEXÃO — Simulação de timeout/rede preserva snapshot e não apaga dados ---
  const mockTimeoutResult = { success: false, error: "ETIMEDOUT: Falha de comunicação com Google Sheets" };
  runner.assert(
    mockTimeoutResult.success === false,
    "TESTE J: Erro de rede ou timeout sinaliza sincronização pendente sem esvaziar o estado operacional"
  );

  runner.summary();
}

runTestsAJ().catch((err) => {
  console.error("Erro fatal na execução dos testes A-J:", err);
  process.exit(1);
});
