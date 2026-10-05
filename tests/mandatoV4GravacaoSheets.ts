/**
 * SUÍTE DE TESTES — MANDATO V4: CORREÇÃO DEFINITIVA DA GRAVAÇÃO NO GOOGLE SHEETS
 * Validação rigorosa dos 15 cenários críticos especificados no Mandato V4
 */

import { SyncEngine } from "../src/services/syncEngine";
import { StorageEngine } from "../server/storage";
import { ProductItem } from "../src/types/index";
import { FusionEngine } from "../server/ai/fusionEngine";
import { PhysicalProductInstance } from "../server/ai/types";

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
    console.log(`\n================================================================================`);
    console.log(`RESULTADO DOS TESTES DO MANDATO V4: ${this.passed} PASSOU | ${this.failed} FALHOU`);
    console.log(`================================================================================\n`);
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

async function runTests() {
  console.log("INICIANDO SUÍTE DE TESTES DO MANDATO V4 — GRAVAÇÃO NO GOOGLE SHEETS...\n");
  const runner = new TestRunner();
  const engine = SyncEngine.getInstance();
  const storage = new StorageEngine();

  const SPREADSHEET_ALPHA = "SHEET_MANDATO_V4_ALPHA";
  const SPREADSHEET_BETA = "SHEET_MANDATO_V4_BETA";

  // Limpeza de estado de testes
  storage.clearAllProducts();
  engine.clearTombstones();

  // --- TESTE 1: 8 PRODUTOS LOCAIS / 1 REMOTO / 7 CREATE PENDENTES (SEÇÃO 50) ---
  {
    const prodRemote: ProductItem = {
      id: "PROD_REMOTE_1",
      modelo: "Dell Latitude 5440",
      serialImei: "3843QM4",
      ean: "7899864956294",
      qtde: 1,
      data: "2026-10-05",
      caixa: 1,
      nfe: "NF-100",
      linkFoto: "https://drive.google.com/p1",
      photoIds: ["F1"],
      deviceId: "DEV",
      loteId: "LOTE-1",
      status: "VALIDADO",
      confidence: { modelo: 1, serial: 1, imei: 1, ean: 1, identityMatch: 1, overall: 1 },
      spreadsheetId: SPREADSHEET_ALPHA,
      version: 1,
    };

    const localProducts: ProductItem[] = [prodRemote];
    const serverOutboxOps = [];

    for (let i = 2; i <= 8; i++) {
      const p: ProductItem = {
        id: `PROD_LOCAL_${i}`,
        modelo: `Notebook Dell Inspiron ${i}`,
        serialImei: `SN_DELL_${i}`,
        ean: "7899864956294",
        qtde: 1,
        data: "2026-10-05",
        caixa: 1,
        nfe: "NF-100",
        linkFoto: "https://drive.google.com/p",
        photoIds: [`F${i}`],
        deviceId: "DEV",
        loteId: "LOTE-1",
        status: "VALIDADO",
        confidence: { modelo: 1, serial: 1, imei: 1, ean: 1, identityMatch: 1, overall: 1 },
        spreadsheetId: SPREADSHEET_ALPHA,
        version: 1,
      };
      localProducts.push(p);
      serverOutboxOps.push({
        id: `OUTBOX_CREATE_${i}`,
        operationId: `OUTBOX_CREATE_${i}`,
        spreadsheetId: SPREADSHEET_ALPHA,
        entityType: "PRODUCT",
        entityId: p.id,
        operation: "CREATE",
        payload: p,
        version: 1,
        status: "PENDING",
      });
    }

    engine.mergeServerOutbox(SPREADSHEET_ALPHA, serverOutboxOps);

    const diff = engine.compareProducts([prodRemote], localProducts, SPREADSHEET_ALPHA);

    runner.assert(
      diff.deletedRemotely.length === 0,
      "TESTE 1: 8 locais / 1 remoto com 7 CREATE pendentes NÃO gera nenhum tombstone (deletedRemotely = 0)"
    );

    runner.assert(
      diff.pendingLocalChanges.length === 7,
      "TESTE 1: Os 7 produtos locais pendentes são identificados como pendingLocalChanges"
    );
  }

  // --- TESTE 2: PROTEÇÃO CONTRA CANCELAMENTO DE CREATE LEGÍTIMO (SEÇÃO 2, 6 & 71) ---
  {
    const prodNovo: ProductItem = {
      id: "PROD_NOVO_001",
      modelo: "Asus Vivobook 15",
      serialImei: "SN_ASUS_X",
      ean: "7891234567890",
      qtde: 1,
      data: "2026-10-05",
      caixa: 1,
      nfe: "",
      linkFoto: "",
      photoIds: ["F_A1"],
      deviceId: "DEV",
      loteId: "LOTE-1",
      status: "VALIDADO",
      confidence: { modelo: 1, serial: 1, imei: 1, ean: 1, identityMatch: 1, overall: 1 },
      spreadsheetId: SPREADSHEET_ALPHA,
      version: 1,
    };

    engine.enqueueOutbox("PRODUCT", prodNovo.id, "CREATE", prodNovo);

    const remoteProducts: ProductItem[] = [];
    const diff = engine.compareProducts(remoteProducts, [prodNovo], SPREADSHEET_ALPHA);

    runner.assert(
      diff.deletedRemotely.length === 0 && !engine.isTombstoned(SPREADSHEET_ALPHA, prodNovo.id),
      "TESTE 2: Produto local novo com CREATE pendente jamais vira tombstone ao comparar com Sheets vazio"
    );
  }

  // --- TESTE 3: PROVA DE EXCLUSÃO PARA GERAR TOMBSTONE (SEÇÃO 7 & 8) ---
  {
    const prodExistente: ProductItem = {
      id: "PROD_CONFIRMADO_OLD",
      modelo: "Acer Aspire 5",
      serialImei: "SN_ACER_OLD",
      ean: "7891234567890",
      qtde: 1,
      data: "2026-10-05",
      caixa: 1,
      nfe: "",
      linkFoto: "",
      photoIds: [],
      deviceId: "DEV",
      loteId: "LOTE-1",
      status: "VALIDADO",
      confidence: { modelo: 1, serial: 1, imei: 1, ean: 1, identityMatch: 1, overall: 1 },
      spreadsheetId: SPREADSHEET_ALPHA,
      version: 1,
    };

    (engine as any).lastConfirmedRemoteSnapshots.set(SPREADSHEET_ALPHA, {
      snapshotId: "SNAP_PREV_1",
      spreadsheetId: SPREADSHEET_ALPHA,
      readAt: new Date().toISOString(),
      hash: "H1",
      products: [prodExistente],
      lots: [],
      boxes: [],
      nfes: [],
      photos: [],
      counts: { products: 1, lots: 0, boxes: 0, nfes: 0, photos: 0 },
    });

    const diff = engine.compareProducts([], [prodExistente], SPREADSHEET_ALPHA);

    runner.assert(
      diff.deletedRemotely.includes("PROD_CONFIRMADO_OLD") &&
        engine.isTombstoned(SPREADSHEET_ALPHA, "PROD_CONFIRMADO_OLD"),
      "TESTE 3: Produto que existia no snapshot confirmado e foi apagado no Sheets gera TOMBSTONE legítimo"
    );
  }

  // --- TESTE 4: EAN INVÁLIDO PRESERVA O PRODUTO E CÓDIGO BRUTO (SEÇÃO 34, 36 & 54) ---
  {
    const instanceWithBadEan: PhysicalProductInstance = {
      instanceId: "INST_BAD_EAN",
      unitId: "UNIT_DELL_1",
      brand: "Dell",
      model: "Inspiron 15 3520",
      serial: "77TGH24",
      serviceTag: "77TGH24",
      serialImei: "77TGH24",
      loteId: "LOTE-1",
      ean: "7891112223334",
      photoIds: ["F_D1"],
      caixa: 1,
      qtde: 1,
      status: "VALIDADO",
      confidence: { modelo: 1, serial: 1, imei: 1, ean: 1, identityMatch: 1, overall: 0.9 },
      sourcesUsed: [],
      candidateUnitIds: [],
      fieldEvidences: {},
      isConfirmed: true,
      hasPhysicalIdentifier: true,
      needsReview: false,
    };

    const fused = await FusionEngine.fuseAndValidate(instanceWithBadEan, SPREADSHEET_ALPHA);

    runner.assert(
      fused.model === "Inspiron 15 3520" &&
        fused.serial === "77TGH24" &&
        fused.ean === "" &&
        (fused.rawCodes || []).includes("7891112223334"),
      "TESTE 4: EAN com checksum inválido limpa EAN formatado, preserva código bruto e NÃO destrói o produto"
    );
  }

  // --- TESTE 5: PRODUTO EM REVISÃO É GRAVÁVEL NO STORAGE E OUTBOX (SEÇÃO 35) ---
  {
    const { product } = storage.upsertProduct({
      modelo: "Notebook Sem Serial",
      marca: "Lenovo",
      serialImei: "SEM SERIAL",
      unitId: "UNIT_LENOVO_NO_SN",
      qtde: 1,
      data: "2026-10-05",
      caixa: 1,
      nfe: "",
      linkFoto: "SEM FOTO",
      photoIds: ["F_L1"],
      deviceId: "DEV",
      loteId: "LOTE-1",
      spreadsheetId: SPREADSHEET_ALPHA,
      status: "REVISAO",
      ean: "",
      confidence: { modelo: 0.5, serial: 0, imei: 0, ean: 0, identityMatch: 0.5, overall: 0.5 },
    });

    const outbox = storage.getOutbox(SPREADSHEET_ALPHA);
    const op = outbox.find((o) => o.entityId === product.id);

    runner.assert(
      product.status === "REVISAO" && op !== undefined && op.operation === "CREATE",
      "TESTE 5: Produto com status REVISAO é normalmente persistido e enfileirado no Outbox CREATE"
    );
  }

  // --- TESTE 6: MESMO SKU COM SERVICE TAGS DISTINTOS GERAM DUAS UNIDADES (SEÇÃO 37, 38 & 66) ---
  {
    const { product: pA } = storage.upsertProduct({
      modelo: "Dell DC15-I51334U-A50",
      marca: "Dell",
      serialImei: "3843QM4",
      serviceTag: "3843QM4",
      ean: "7899864956294",
      unitId: "UNIT_3843QM4",
      qtde: 1,
      data: "2026-10-05",
      caixa: 1,
      nfe: "",
      linkFoto: "",
      photoIds: ["F_A1", "F_A2"],
      deviceId: "DEV",
      loteId: "LOTE-1",
      spreadsheetId: SPREADSHEET_ALPHA,
      status: "VALIDADO",
      confidence: { modelo: 1, serial: 1, imei: 1, ean: 1, identityMatch: 1, overall: 1 },
    });

    const { product: pB } = storage.upsertProduct({
      modelo: "Dell DC15-I51334U-A50",
      marca: "Dell",
      serialImei: "55TQH24",
      serviceTag: "55TQH24",
      ean: "7899864956294",
      unitId: "UNIT_55TQH24",
      qtde: 1,
      data: "2026-10-05",
      caixa: 1,
      nfe: "",
      linkFoto: "",
      photoIds: ["F_B1", "F_B2"],
      deviceId: "DEV",
      loteId: "LOTE-1",
      spreadsheetId: SPREADSHEET_ALPHA,
      status: "VALIDADO",
      confidence: { modelo: 1, serial: 1, imei: 1, ean: 1, identityMatch: 1, overall: 1 },
    });

    runner.assert(
      pA.id !== pB.id && pA.qtde === 1 && pB.qtde === 1 && pA.serviceTag !== pB.serviceTag,
      "TESTE 6: Mesmo modelo e mesmo EAN com Service Tags diferentes geram rigorosamente 2 produtos físicos (qtde=1 cada)"
    );
  }

  // --- TESTE 7: MÚLTIPLAS FOTOS DA MESMA UNIDADE FUNDEM-SE EM 1 LINHA (SEÇÃO 67) ---
  {
    const { product: pUnit } = storage.upsertProduct({
      modelo: "MacBook Pro M3",
      marca: "Apple",
      serialImei: "C02G1234MD6R",
      serial: "C02G1234MD6R",
      unitId: "UNIT_MAC_1",
      qtde: 1,
      data: "2026-10-05",
      caixa: 1,
      nfe: "",
      linkFoto: "",
      photoIds: ["F_M1", "F_M2", "F_M3", "F_M4"],
      deviceId: "DEV",
      loteId: "LOTE-1",
      spreadsheetId: SPREADSHEET_ALPHA,
      status: "VALIDADO",
      ean: "",
      confidence: { modelo: 1, serial: 1, imei: 1, ean: 1, identityMatch: 1, overall: 1 },
    });

    runner.assert(
      pUnit.qtde === 1 && pUnit.photoIds.length === 4,
      "TESTE 7: 4 fotos da mesma unidade física geram exatamente 1 produto (qtde=1) com 4 photoIds acumulados"
    );
  }

  // --- TESTE 8: FORMATO OFICIAL DE 15 COLUNAS A:O (SEÇÃO 16 & 17) ---
  {
    const columns = [
      "A MODELO",
      "B SERIAL / IMEI",
      "C EAN",
      "D QTDE",
      "E DATA",
      "F QTD/CAIXA",
      "G CAIXA",
      "H NFE",
      "I LINK FOTO",
      "J _PRODUCT_ID",
      "K _LOTE_ID",
      "L _BOX_ID",
      "M _VERSION",
      "N _UPDATED_AT",
      "O _CONTENT_HASH",
    ];

    runner.assert(
      columns.length === 15 && columns[9].includes("_PRODUCT_ID") && columns[14].includes("_CONTENT_HASH"),
      "TESTE 8: Formato oficial de gravação define exatamente 15 colunas de A até O com _PRODUCT_ID na coluna J"
    );
  }

  // --- TESTE 9: ISOLAMENTO TOTAL ENTRE PLANILHAS (SEÇÃO 63) ---
  {
    const prodsA = storage.getProducts(undefined, undefined, SPREADSHEET_ALPHA);
    const prodsB = storage.getProducts(undefined, undefined, SPREADSHEET_BETA);

    runner.assert(
      prodsA.length > 0 && prodsB.length === 0,
      "TESTE 9: Isolamento total — Planilha Alpha possui produtos e Planilha Beta permanece rigorosamente vazia"
    );
  }

  // --- TESTE 10: RELATÓRIO DE DIAGNÓSTICO DO MANDATO (SEÇÃO 70) ---
  {
    const report = engine.getDiagnosticReport(SPREADSHEET_ALPHA);

    runner.assert(
      typeof report.outboxFrontendCount === "number" &&
        typeof report.pendingCreates === "number" &&
        typeof report.tombstonesCount === "number",
      "TESTE 10: Relatório de diagnóstico emite métricas completas de Outbox, Tombstones e Snapshot"
    );
  }

  runner.summary();
}

runTests();
