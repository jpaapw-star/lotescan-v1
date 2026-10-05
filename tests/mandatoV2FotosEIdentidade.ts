/**
 * SUÍTE DE TESTES EXAUSTIVA — MANDATO V2
 * Correção Definitiva do Processamento Fotográfico e Resolução de Identidade Física
 * ScanLote AI (Seções 50 a 67 do Mandato V2)
 */

import { GroupingEngine } from "../server/ai/groupingEngine";
import { IdentityEngine } from "../server/ai/identityEngine";
import { StorageEngine } from "../server/storage";
import { SyncEngine } from "../src/services/syncEngine";
import { ExtractedPhotoEvidence } from "../server/ai/types";
import { ProductItem } from "../src/types/index";
import { Tombstone } from "../src/types/sync";

class TestRunner {
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
    console.log(`RESULTADO DOS TESTES DO MANDATO V2: ${this.passed} PASSOU | ${this.failed} FALHOU`);
    console.log(`================================================================================\n`);
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

async function runMandatoV2Tests() {
  console.log("INICIANDO SUÍTE DO MANDATO V2 — PROCESSAMENTO FOTOGRÁFICO & IDENTIDADE FÍSICA...\n");
  const runner = new TestRunner();
  const storage = new StorageEngine();
  const syncEngine = SyncEngine.getInstance();
  const SPREADSHEET_TEST = "SHEET_MANDATO_V2_001";

  // Limpar ambiente
  storage.clearAllProducts();
  storage.isolateSpreadsheetContext(SPREADSHEET_TEST);

  // ==========================================================================
  // TESTE 1 (Seção 50): CENÁRIO REAL DAS 10 FOTOS (Dell A, Dell B, Acer, Asus)
  // Entrada: 10 fotografias reais contendo evidências de 4 equipamentos distintos
  // ==========================================================================
  {
    const ev1: ExtractedPhotoEvidence = {
      photoId: "P_DELL_A1_CHASSIS",
      captureIndex: 0,
      detected: { brand: "Dell", serviceTag: "3843QM4", serial: "3843QM4" },
      evidenceSources: { serviceTag: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.95 },
    };
    const ev2: ExtractedPhotoEvidence = {
      photoId: "P_DELL_A2_BOX",
      captureIndex: 1,
      detected: { brand: "Dell", model: "DC15-I51334U-A50", ean: "7899864956294" },
      evidenceSources: { model: "VISION_AI", ean: "BARCODE_OCR" },
      confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 1, overall: 0.95 },
    };

    const ev3: ExtractedPhotoEvidence = {
      photoId: "P_DELL_B1_CHASSIS",
      captureIndex: 2,
      detected: { brand: "Dell", serviceTag: "55TQH24", serial: "55TQH24" },
      evidenceSources: { serviceTag: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.95 },
    };
    const ev4: ExtractedPhotoEvidence = {
      photoId: "P_DELL_B2_BOX",
      captureIndex: 3,
      detected: { brand: "Dell", model: "I15-I120K-A30PF", ean: "7899864948732" },
      evidenceSources: { model: "VISION_AI", ean: "BARCODE_OCR" },
      confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 1, overall: 0.95 },
    };

    const ev5: ExtractedPhotoEvidence = {
      photoId: "P_ACER_CHASSIS",
      captureIndex: 4,
      detected: { brand: "Acer", serial: "NXJH1AL008542012BE9Z00" },
      evidenceSources: { serial: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.95 },
    };
    const ev6: ExtractedPhotoEvidence = {
      photoId: "P_ACER_BOX",
      captureIndex: 5,
      detected: { brand: "Acer", model: "Aspire Go 15 AG15-51P-50G2", ean: "4711474821331" },
      evidenceSources: { model: "VISION_AI", ean: "BARCODE_OCR" },
      confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 1, overall: 0.95 },
    };

    const ev7: ExtractedPhotoEvidence = {
      photoId: "P_ASUS_CHASSIS",
      captureIndex: 6,
      detected: { brand: "Asus", serial: "W3N0B6003058103" },
      evidenceSources: { serial: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.95 },
    };
    const ev8: ExtractedPhotoEvidence = {
      photoId: "P_ASUS_BOX",
      captureIndex: 7,
      detected: { brand: "Asus", model: "Vivobook E1504FA-NJ732", ean: "7898573299678" },
      evidenceSources: { model: "VISION_AI", ean: "BARCODE_OCR" },
      confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 1, overall: 0.95 },
    };

    const ev9: ExtractedPhotoEvidence = {
      photoId: "P_DELL_A_EXTRA",
      captureIndex: 8,
      detected: { brand: "Dell", model: "DC15-I51334U-A50", serviceTag: "3843QM4" },
      evidenceSources: { model: "VISION_AI", serviceTag: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 0.95 },
    };

    const ev10: ExtractedPhotoEvidence = {
      photoId: "P_ASUS_EXTRA",
      captureIndex: 9,
      detected: { brand: "Asus", serial: "W3N0B6003058103" },
      evidenceSources: { serial: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.95 },
    };

    const all10 = [ev1, ev2, ev3, ev4, ev5, ev6, ev7, ev8, ev9, ev10];
    const { instances } = await GroupingEngine.processBatch(all10, {
      loteId: "LOTE-V2-10FOTOS",
      caixa: 1,
      spreadsheetId: SPREADSHEET_TEST,
    });

    const dellA = instances.find((i) => i.serviceTag === "3843QM4");
    const dellB = instances.find((i) => i.serviceTag === "55TQH24");
    const acer = instances.find((i) => i.brand?.toUpperCase() === "ACER");
    const asus = instances.find((i) => i.brand?.toUpperCase() === "ASUS");

    const allAssignedPhotos = instances.flatMap((i) => i.photoIds);

    runner.assert(
      Boolean(
        instances.length === 4 &&
          dellA &&
          dellB &&
          acer &&
          asus &&
          dellA.model.includes("DC15") &&
          dellB.model.includes("I15") &&
          dellA.ean === "7899864956294" &&
          dellB.ean === "7899864948732" &&
          allAssignedPhotos.length === 10
      ),
      1,
      "Cenário Real de 10 Fotos resulta exatamente em 4 unidades físicas distintas (Asus, Dell A, Dell B, Acer), 100% das fotos contabilizadas"
    );
  }

  // ==========================================================================
  // TESTE 2 (Seção 51): MESMO SKU + SERVICE TAGS DISTINTOS
  // Mesmo modelo, mesma marca, mesmo EAN -> geram 2 unidades independentes (qtde=1 cada)
  // ==========================================================================
  {
    const evA1: ExtractedPhotoEvidence = {
      photoId: "P_SAME_A1",
      captureIndex: 0,
      detected: { brand: "Dell", model: "Dell Latitude 3440", ean: "7891234567895", serviceTag: "AAA1111", serial: "AAA1111" },
      evidenceSources: { model: "VISION_AI", serviceTag: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 1, overall: 0.95 },
    };
    const evB1: ExtractedPhotoEvidence = {
      photoId: "P_SAME_B1",
      captureIndex: 1,
      detected: { brand: "Dell", model: "Dell Latitude 3440", ean: "7891234567895", serviceTag: "BBB2222", serial: "BBB2222" },
      evidenceSources: { model: "VISION_AI", serviceTag: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 1, overall: 0.95 },
    };

    const { instances } = await GroupingEngine.processBatch([evA1, evB1], {
      loteId: "LOTE-V2-SAMESKU",
      caixa: 1,
      spreadsheetId: SPREADSHEET_TEST,
    });

    runner.assert(
      instances.length === 2 &&
        instances[0].qtde === 1 &&
        instances[1].qtde === 1 &&
        instances[0].serviceTag !== instances[1].serviceTag,
      2,
      "Mesmo modelo + mesmo EAN com Service Tags distintos geram 2 unidades físicas com qtde=1 cada (nunca colapsa em qtde=2)"
    );
  }

  // ==========================================================================
  // TESTE 3 (Seção 52): MESMA UNIDADE, VÁRIAS FOTOS
  // Modelo, EAN, Service Tag, Caixa do mesmo equipamento fundem-se em 1 unidade com photoIds acumulados
  // ==========================================================================
  {
    const f1: ExtractedPhotoEvidence = {
      photoId: "P_MULTI_1",
      captureIndex: 0,
      detected: { brand: "Dell", model: "Dell Latitude 5420" },
      evidenceSources: { model: "VISION_AI" },
      confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 0, overall: 0.8 },
    };
    const f2: ExtractedPhotoEvidence = {
      photoId: "P_MULTI_2",
      captureIndex: 1,
      detected: { brand: "Dell", serviceTag: "777TAG1", serial: "777TAG1" },
      evidenceSources: { serviceTag: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.98 },
    };
    const f3: ExtractedPhotoEvidence = {
      photoId: "P_MULTI_3",
      captureIndex: 2,
      detected: { brand: "Dell", ean: "7891234567895" },
      evidenceSources: { ean: "BARCODE_OCR" },
      confidence: { brand: 1, model: 0, serial: 0, imei: 0, ean: 1, overall: 0.95 },
    };
    const f4: ExtractedPhotoEvidence = {
      photoId: "P_MULTI_4",
      captureIndex: 3,
      detected: { brand: "Dell", serviceTag: "777TAG1" },
      evidenceSources: { serviceTag: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.98 },
    };

    const { instances } = await GroupingEngine.processBatch([f1, f2, f3, f4], {
      loteId: "LOTE-V2-MULTI",
      caixa: 1,
      spreadsheetId: SPREADSHEET_TEST,
    });

    runner.assert(
      instances.length === 1 &&
        instances[0].photoIds.length === 4 &&
        instances[0].qtde === 1 &&
        instances[0].serviceTag === "777TAG1",
      3,
      "Quatro fotos da mesma unidade física fundem-se em 1 linha (qtde=1) com photoIds acumulados (length=4)"
    );
  }

  // ==========================================================================
  // TESTE 4 (Seção 54): FOTOS INTERCALADAS
  // Entrada: A modelo, B Service Tag, A EAN, B modelo, A Service Tag
  // ==========================================================================
  {
    const fA_mod: ExtractedPhotoEvidence = {
      photoId: "INT_A_MOD",
      captureIndex: 0,
      detected: { brand: "Dell", model: "Dell Latitude 3440", partNumber: "PN_DELL_A" },
      evidenceSources: { model: "VISION_AI", partNumber: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 0, overall: 0.8 },
    };
    const fB_st: ExtractedPhotoEvidence = {
      photoId: "INT_B_ST",
      captureIndex: 1,
      detected: { brand: "Dell", serviceTag: "TAG_B99", serial: "TAG_B99", partNumber: "PN_DELL_B" },
      evidenceSources: { serviceTag: "PHOTO_LABEL", partNumber: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.95 },
    };
    const fA_ean: ExtractedPhotoEvidence = {
      photoId: "INT_A_EAN",
      captureIndex: 2,
      detected: { brand: "Dell", ean: "7891234567895", partNumber: "PN_DELL_A" },
      evidenceSources: { ean: "BARCODE_OCR", partNumber: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0, serial: 0, imei: 0, ean: 1, overall: 0.9 },
    };
    const fB_mod: ExtractedPhotoEvidence = {
      photoId: "INT_B_MOD",
      captureIndex: 3,
      detected: { brand: "Dell", model: "Dell Vostro 15", partNumber: "PN_DELL_B" },
      evidenceSources: { model: "VISION_AI", partNumber: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 0, overall: 0.8 },
    };
    const fA_st: ExtractedPhotoEvidence = {
      photoId: "INT_A_ST",
      captureIndex: 4,
      detected: { brand: "Dell", serviceTag: "TAG_A11", serial: "TAG_A11", partNumber: "PN_DELL_A" },
      evidenceSources: { serviceTag: "PHOTO_LABEL", partNumber: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.95 },
    };

    const { instances } = await GroupingEngine.processBatch([fA_mod, fB_st, fA_ean, fB_mod, fA_st], {
      loteId: "LOTE-V2-INTERCALADAS",
      caixa: 1,
      spreadsheetId: SPREADSHEET_TEST,
    });

    const unitA = instances.find((i) => i.serviceTag === "TAG_A11");
    const unitB = instances.find((i) => i.serviceTag === "TAG_B99");

    runner.assert(
      instances.length === 2 &&
        Boolean(unitA && unitB) &&
        unitA?.photoIds.length === 3 &&
        unitB?.photoIds.length === 2,
      4,
      "Fotos intercaladas (A, B, A, B, A) associadas perfeitamente por P/N e identificadores sem depender de pares fixos"
    );
  }

  // ==========================================================================
  // TESTE 5 (Seções 23 & 24): DETERMINISMO DE UNIT_ID E INSTANCE_ID
  // Reprocessamento na mesma ou em ordens diferentes produz exatamente o mesmo unitId
  // ==========================================================================
  {
    const evDet1: ExtractedPhotoEvidence = {
      photoId: "P_DET_1",
      captureIndex: 0,
      detected: { brand: "Dell", serviceTag: "999XYZ1", serial: "999XYZ1", model: "Dell Latitude 5420" },
      evidenceSources: { serviceTag: "PHOTO_LABEL", model: "VISION_AI" },
      confidence: { brand: 1, model: 0.9, serial: 1, imei: 0, ean: 0, overall: 0.95 },
    };

    const run1 = IdentityEngine.correlateEvidence([evDet1], { loteId: "LOTE-DET", caixa: 1 });
    const run2 = IdentityEngine.correlateEvidence([evDet1], { loteId: "LOTE-DET", caixa: 1 });

    runner.assert(
      run1.instances.length === 1 &&
        run1.instances[0].unitId === run2.instances[0].unitId &&
        run1.instances[0].instanceId === run2.instances[0].instanceId &&
        run1.instances[0].unitId.includes("999XYZ1"),
      5,
      "unitId e instanceId são determinísticos e estáveis sem depender de índice efêmero do array"
    );
  }

  // ==========================================================================
  // TESTE 6 (Seção 63): SERVICE TAG NÃO VIRA MODELO
  // Entrada: foto apenas com Service Tag 3843QM4 -> model != "3843QM4"
  // ==========================================================================
  {
    const evTagOnly: ExtractedPhotoEvidence = {
      photoId: "P_TAG_ONLY",
      captureIndex: 0,
      detected: { brand: "Dell", serviceTag: "3843QM4", serial: "3843QM4" },
      evidenceSources: { serviceTag: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0, serial: 1, imei: 0, ean: 0, overall: 0.95 },
    };

    const { instances } = await GroupingEngine.processBatch([evTagOnly], {
      loteId: "LOTE-V2-TAGMODEL",
      caixa: 1,
      spreadsheetId: SPREADSHEET_TEST,
    });

    runner.assert(
      instances.length === 1 &&
        instances[0].serviceTag === "3843QM4" &&
        instances[0].model !== "3843QM4" &&
        !instances[0].model.includes("3843QM4"),
      6,
      "Service Tag preservado em serviceTag/serial sem virar o modelo do produto"
    );
  }

  // ==========================================================================
  // TESTE 7 (Seção 64): NENHUM SERIAL INVENTADO PARA PRODUTO NÃO-SERIALIZÁVEL
  // Livro, cabo ou fone apenas com EAN registrado como SEM SERIAL sem fabricação SRV-...
  // ==========================================================================
  {
    const evEanOnly: ExtractedPhotoEvidence = {
      photoId: "P_EAN_ONLY",
      captureIndex: 0,
      detected: { brand: "JBL", ean: "6925281987518", model: "JBL Tune 510BT" },
      evidenceSources: { ean: "BARCODE_OCR", model: "VISION_AI" },
      confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 1, overall: 0.9 },
    };

    const { instances } = await GroupingEngine.processBatch([evEanOnly], {
      loteId: "LOTE-V2-NOSERIAL",
      caixa: 1,
      spreadsheetId: SPREADSHEET_TEST,
    });

    runner.assert(
      instances.length === 1 &&
        instances[0].serialImei === "SEM SERIAL" &&
        !instances[0].serial &&
        instances[0].hasPhysicalIdentifier === false,
      7,
      "Produto não-serializável registrado como SEM SERIAL sem fabricação de serial inventado (SRV-...)"
    );
  }

  // ==========================================================================
  // TESTE 8 (Seção 61 & 62): CONFLITO DE EAN E MARCA DETECTADO
  // Foto com Dell + EAN A vs Foto com Acer + EAN B não se fundem
  // ==========================================================================
  {
    const evDell: ExtractedPhotoEvidence = {
      photoId: "P_CONF_DELL",
      captureIndex: 0,
      detected: { brand: "Dell", model: "Inspiron 15", ean: "7899864956294" },
      evidenceSources: { model: "VISION_AI", ean: "BARCODE_OCR" },
      confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 1, overall: 0.95 },
    };
    const evAcer: ExtractedPhotoEvidence = {
      photoId: "P_CONF_ACER",
      captureIndex: 1,
      detected: { brand: "Acer", model: "Aspire 5", ean: "4711474821331" },
      evidenceSources: { model: "VISION_AI", ean: "BARCODE_OCR" },
      confidence: { brand: 1, model: 0.9, serial: 0, imei: 0, ean: 1, overall: 0.95 },
    };

    const { instances } = await GroupingEngine.processBatch([evDell, evAcer], {
      loteId: "LOTE-V2-CONFLICT",
      caixa: 1,
      spreadsheetId: SPREADSHEET_TEST,
    });

    runner.assert(
      instances.length === 2 &&
        instances[0].brand !== instances[1].brand &&
        instances[0].ean !== instances[1].ean,
      8,
      "Marcas e EANs conflitantes resultam rigorosamente em unidades separadas e não se contaminam"
    );
  }

  // ==========================================================================
  // TESTE 9 (Seção 58): EXCLUSÃO MANUAL NA PLANILHA GERA TOMBSTONE
  // Produto excluído remotamente é tombstoned e não ressuscita
  // ==========================================================================
  {
    const prodTomb: ProductItem = {
      id: "PROD_V2_TOMB",
      modelo: "Dell Latitude 3440",
      serialImei: "3843QM4",
      serial: "3843QM4",
      serviceTag: "3843QM4",
      ean: "7899864956294",
      nfe: "",
      linkFoto: "",
      deviceId: "DEV-1",
      loteId: "LOTE-V2-TOMB",
      caixa: 1,
      data: "2026-10-05",
      status: "VALIDADO",
      spreadsheetId: SPREADSHEET_TEST,
      version: 1,
      photoIds: [],
      qtde: 1,
      confidence: { modelo: 1, serial: 1, imei: 0, ean: 1 },
    };

    const diff = syncEngine.compareProducts([], [prodTomb], SPREADSHEET_TEST);
    runner.assert(
      diff.deletedRemotely.includes(prodTomb.id) &&
        syncEngine.isTombstoned(SPREADSHEET_TEST, prodTomb.id, prodTomb.serial, prodTomb.imei),
      9,
      "Exclusão manual na planilha remota detectada pelo DiffEngine e tombstoned contra ressurreição"
    );
  }

  // ==========================================================================
  // TESTE 10 (Seção 59): PRODUTO RECÉM-CRIADO PELA IA NÃO É DELETED_REMOTELY
  // ==========================================================================
  {
    const freshProd: ProductItem = {
      id: "PROD_V2_FRESH_AI",
      modelo: "Notebook Acer Aspire",
      serialImei: "NXJH1AL008542012BE9Z00",
      serial: "NXJH1AL008542012BE9Z00",
      ean: "4711474821331",
      nfe: "",
      linkFoto: "LINK",
      deviceId: "DEV-1",
      loteId: "LOTE-V2-FRESH",
      caixa: 1,
      data: "2026-10-05",
      status: "VALIDADO",
      spreadsheetId: SPREADSHEET_TEST,
      version: 1,
      photoIds: ["P_ACER_FRESH"],
      qtde: 1,
      confidence: { modelo: 1, serial: 1, imei: 0, ean: 1 },
    };

    storage.upsertProduct(freshProd);

    // Reconciliação remota vazia enquanto Google Sheets ainda não gravou
    storage.reconcileSpreadsheetData(SPREADSHEET_TEST, {
      spreadsheetId: SPREADSHEET_TEST,
      products: [],
    });

    const prods = storage.getProducts(undefined, undefined, SPREADSHEET_TEST);
    runner.assert(
      prods.some((p) => p.id === freshProd.id || p.serial === freshProd.serial),
      10,
      "Produto recém-criado pela IA localmente permanece protegido e não desaparece durante sync com Sheets vazio"
    );
  }

  runner.summary();
}

runMandatoV2Tests().catch((e) => {
  console.error("Erro fatal nos testes do Mandato V2:", e);
  process.exit(1);
});
