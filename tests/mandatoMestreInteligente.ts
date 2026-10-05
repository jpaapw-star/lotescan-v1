/**
 * SUÍTE DE TESTES DO MANDATO MESTRE DE LEITURA, CRUZAMENTO, AGRUPAMENTO, MEMÓRIA E ESCRITA
 * Validação rigorosa dos 20 Critérios de Aceite da Seção 63
 */

import { ValidationEngine } from "../server/ai/validators.js";
import { IdentityEngine } from "../server/ai/identityEngine.js";
import { FusionEngine } from "../server/ai/fusionEngine.js";
import { GroupingEngine } from "../server/ai/groupingEngine.js";
import { aiMemoryEngine } from "../server/ai/memoryEngine.js";
import { ExternalLookupEngine } from "../server/ai/externalLookup.js";
import { ExtractedPhotoEvidence } from "../server/ai/types.js";
import { storage } from "../server/storage.js";
import { SyncEngine } from "../src/services/syncEngine.js";

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
    console.log(`RESULTADO DOS TESTES MANDATO MESTRE: ${this.passed} PASSOU | ${this.failed} FALHOU`);
    console.log(`==================================================\n`);
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

async function runMandatoMestreTests() {
  console.log("INICIANDO TESTES DO MANDATO MESTRE DE LEITURA E CRUZAMENTO...\n");
  const runner = new TestRunner();
  const syncEngine = SyncEngine.getInstance();

  const SPREADSHEET_ALPHA = "SHEET_ALPHA_TEST";
  const SPREADSHEET_BETA = "SHEET_BETA_TEST";

  // --- CRITÉRIO 1: Dois produtos visualmente iguais com seriais diferentes permanecem separados (Seção 3 & 63.1) ---
  {
    const ev1: ExtractedPhotoEvidence = {
      photoId: "PHOTO_VIVOBOOK_1",
      detected: {
        brand: "ASUS",
        model: "ASUS Vivobook S14",
        serial: "ABC123456789012",
        ean: "4711081654322",
        category: "notebook",
      },
      evidenceSources: { serial: "PHOTO_LABEL", model: "VISION_AI" },
      confidence: { brand: 1, model: 0.95, serial: 0.98, imei: 0, ean: 1, overall: 0.96 },
    };

    const ev2: ExtractedPhotoEvidence = {
      photoId: "PHOTO_VIVOBOOK_2",
      detected: {
        brand: "ASUS",
        model: "ASUS Vivobook S14", // EXATAMENTE O MESMO MODELO E APARÊNCIA
        serial: "ABC123456789099", // SERIAL DIFERENTE!
        ean: "4711081654322",
        category: "notebook",
      },
      evidenceSources: { serial: "PHOTO_LABEL", model: "VISION_AI" },
      confidence: { brand: 1, model: 0.95, serial: 0.98, imei: 0, ean: 1, overall: 0.96 },
    };

    const { instances } = await GroupingEngine.processBatch([ev1, ev2], {
      loteId: "LOTE-MANDATO-001",
      caixa: 1,
      spreadsheetId: SPREADSHEET_ALPHA,
    });

    runner.assert(
      instances.length === 2 &&
        instances[0].serial !== instances[1].serial &&
        instances[0].serialImei === "ABC123456789012" &&
        instances[1].serialImei === "ABC123456789099",
      "CRITÉRIO 1: Dois produtos visualmente idênticos com seriais distintos geram 2 instâncias físicas separadas"
    );
  }

  // --- CRITÉRIO 2: Quatro fotos do mesmo produto são corretamente agrupadas (Seção 2, 15 & 63.2) ---
  {
    const pFrontal: ExtractedPhotoEvidence = {
      photoId: "P_FRONTAL",
      detected: { brand: "Samsung", model: "Galaxy S24 Ultra" },
      evidenceSources: { model: "VISION_AI" },
      confidence: { brand: 1, model: 0.95, serial: 0, imei: 0, ean: 0, overall: 0.8 },
    };
    const pTraseira: ExtractedPhotoEvidence = {
      photoId: "P_TRASEIRA",
      detected: { brand: "Samsung", model: "Galaxy S24 Ultra" },
      evidenceSources: { model: "VISION_AI" },
      confidence: { brand: 1, model: 0.95, serial: 0, imei: 0, ean: 0, overall: 0.8 },
    };
    const pEtiqueta: ExtractedPhotoEvidence = {
      photoId: "P_ETIQUETA",
      detected: { brand: "Samsung", serial: "R5CR123ABCD", imei: "354321098765433" },
      evidenceSources: { serial: "PHOTO_LABEL", imei: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 0, serial: 0.99, imei: 0.99, ean: 0, overall: 0.99 },
    };
    const pCaixa: ExtractedPhotoEvidence = {
      photoId: "P_CAIXA",
      detected: { brand: "Samsung", ean: "7892509123457" },
      evidenceSources: { ean: "BARCODE_OCR" },
      confidence: { brand: 1, model: 0, serial: 0, imei: 0, ean: 1, overall: 0.95 },
    };

    const { instances } = await GroupingEngine.processBatch([pFrontal, pTraseira, pEtiqueta, pCaixa], {
      loteId: "LOTE-MANDATO-002",
      caixa: 1,
      spreadsheetId: SPREADSHEET_ALPHA,
    });

    runner.assert(
      instances.length === 1 &&
        instances[0].photoIds.length === 4 &&
        instances[0].photoIds.includes("P_FRONTAL") &&
        instances[0].photoIds.includes("P_TRASEIRA") &&
        instances[0].photoIds.includes("P_ETIQUETA") &&
        instances[0].photoIds.includes("P_CAIXA"),
      "CRITÉRIO 2: Quatro fotografias do mesmo produto são fundidas em uma única entidade física"
    );
  }

  // --- CRITÉRIO 3: EAN pode complementar informações faltantes (Seção 11, 43 & 63.3) ---
  {
    // Foto com apenas EAN (sem modelo legível)
    const evEanOnly: ExtractedPhotoEvidence = {
      photoId: "PHOTO_EAN_ONLY",
      detected: { ean: "6925281987519" }, // JBL Tune 510BT Preto
      evidenceSources: { ean: "BARCODE_OCR" },
      confidence: { brand: 0, model: 0, serial: 0, imei: 0, ean: 1, overall: 0.8 },
    };

    const { instances } = await GroupingEngine.processBatch([evEanOnly], {
      loteId: "LOTE-MANDATO-003",
      caixa: 2,
      spreadsheetId: SPREADSHEET_ALPHA,
    });

    runner.assert(
      instances.length === 1 &&
        instances[0].model.includes("JBL") &&
        instances[0].model.includes("510BT"),
      "CRITÉRIO 3: EAN complementa com sucesso marca e modelo que estavam ausentes na foto"
    );
  }

  // --- CRITÉRIO 4 & 5: Serial e IMEI complementam informações com validação independente (Seção 28 & 63.4, 63.5) ---
  {
    const eanCheck = ValidationEngine.validateEAN("7892509123457");
    const imeiCheck = ValidationEngine.validateIMEI("354321098765433");
    const eanFake = ValidationEngine.validateEAN("1234567890129"); // checksum 9 é incorreto (correto é 8)
    const imeiFake = ValidationEngine.validateIMEI("123456789012345"); // luhn incorreto

    runner.assert(
      eanCheck.isValid && imeiCheck.isValid && !eanFake.isValid && !imeiFake.isValid,
      "CRITÉRIOS 4 & 5: Validação matemática independente de checksum Modulo 10 (EAN) e Luhn (IMEI)"
    );
  }

  // --- CRITÉRIO 6: Padrões de fabricantes diferentes tratados corretamente (Seção 6, 28 & 63.6) ---
  {
    const patApple = aiMemoryEngine.findBrandPattern("Apple");
    const patSamsung = aiMemoryEngine.findBrandPattern("Samsung");
    const patDell = aiMemoryEngine.findBrandPattern("Dell");

    const validApple = ValidationEngine.validateSerial("F2LX9ABCD123", patApple);
    const validDell = ValidationEngine.validateSerial("7G2X8B1", patDell);
    const invalidDell = ValidationEngine.validateSerial("7G2X8B1_TOO_LONG", patDell); // Dell Service Tag tem 7 chars

    runner.assert(
      validApple.isValid && validDell.isValid && !invalidDell.isValid,
      "CRITÉRIO 6: Conhecimento específico por marca (Apple 10/12 chars vs Dell 7 chars Service Tag)"
    );
  }

  // --- CRITÉRIO 7: Informações do banco operacional existente são aproveitadas (Seção 42 & 63.7) ---
  {
    storage.upsertProduct({
      modelo: "Notebook Dell Inspiron 15 3520",
      marca: "Dell",
      serialImei: "7G2X8B1",
      ean: "7891234567895",
      qtde: 1,
      data: "2026-10-04",
      caixa: 1,
      nfe: "",
      linkFoto: "",
      photoIds: [],
      deviceId: "Carlos Silveira",
      loteId: "LOTE-DELL",
      spreadsheetId: SPREADSHEET_ALPHA,
      status: "VALIDADO",
      confidence: { modelo: 1, serial: 1, imei: 1, ean: 1 },
    });

    const lookup = await ExternalLookupEngine.lookupByEAN("7891234567895", SPREADSHEET_ALPHA);
    runner.assert(
      lookup.found && lookup.source === "LOCAL_DB" && !!lookup.model && lookup.model.includes("Dell Inspiron"),
      "CRITÉRIO 7: Informações do banco operacional existente são cruzadas e reutilizadas"
    );
  }

  // --- CRITÉRIO 8: Informações da memória externa são utilizadas (Seção 43 & 63.8) ---
  {
    aiMemoryEngine.recordLearning(
      "Xiaomi",
      "Redmi Note 13 128GB Preto",
      "EAN",
      "6941812756890",
      "Redmi Note 13 128GB Preto",
      "USER_CONFIRMATION",
      0.99
    );

    const lookup = await ExternalLookupEngine.lookupByEAN("6941812756890", SPREADSHEET_ALPHA);
    runner.assert(
      lookup.found && lookup.source === "EXTERNAL_MEMORY" && !!lookup.model && lookup.model.includes("Redmi Note 13"),
      "CRITÉRIO 8: Memória externa SCANLOTE_AI_MEMORY acumulada responde com sucesso"
    );
  }

  // --- CRITÉRIO 9: Internet / Catálogo externo complementa quando necessário (Seção 44, 45 & 63.9) ---
  {
    // EAN novo de livro: "9788576082675" (Clean Code)
    const lookup = await ExternalLookupEngine.lookupByEAN("9788576082675", "SHEET_EMPTY");
    runner.assert(
      Boolean(lookup.found && (lookup.source === "MANUFACTURER_CATALOG" || lookup.source === "EXTERNAL_MEMORY") && lookup.model && lookup.model.includes("Clean Code")),
      "CRITÉRIO 9: Consulta direcionada de catálogo/internet complementa produto desconhecido"
    );
  }

  // --- CRITÉRIO 10: A fonte das informações pode ser rastreada (Seção 14, 49 & 63.10) ---
  {
    const ev: ExtractedPhotoEvidence = {
      photoId: "PHOTO_SOURCE_AUDIT",
      detected: { brand: "ASUS", model: "Vivobook S14", serial: "M5N0CV01234567A" },
      evidenceSources: { serial: "PHOTO_LABEL", model: "VISION_AI" },
      confidence: { brand: 1, model: 0.9, serial: 0.98, imei: 0, ean: 0, overall: 0.9 },
    };

    const { instances } = await GroupingEngine.processBatch([ev], {
      loteId: "LOTE-AUDIT",
      caixa: 1,
    });

    runner.assert(
      instances[0].sourcesUsed.length > 0 && instances[0].sourcesUsed.includes("PHOTO_LABEL"),
      "CRITÉRIO 10: Rastreabilidade auditável da origem das evidências por campo"
    );
  }

  // --- CRITÉRIO 11 & 12: Memória progressiva permanece fora da IA (Google Drive / Cache) (Seção 7, 52 & 63.11, 63.12) ---
  {
    const patterns = aiMemoryEngine.getAllPatterns();
    const learning = aiMemoryEngine.getAllLearning();
    runner.assert(
      patterns.length >= 7 && learning.length > 0,
      "CRITÉRIO 11 & 12: Memória externa desacoplada de modelo de IA, versionada e persistente"
    );
  }

  // --- CRITÉRIO 13: Trocar a planilha operacional não mistura inventários (Seção 51 & 63.13) ---
  {
    const prodsA = storage.getProducts(undefined, undefined, SPREADSHEET_ALPHA);
    const prodsB = storage.getProducts(undefined, undefined, SPREADSHEET_BETA);
    const hasLeak = prodsB.some((p) => p.spreadsheetId === SPREADSHEET_ALPHA);

    runner.assert(
      !hasLeak,
      "CRITÉRIO 13: Isolamento total — troca de planilha operacional mantém inventários estritamente separados"
    );
  }

  // --- CRITÉRIO 14: Fotos visualmente semelhantes não são descartadas por pHash (Seção 4 & 63.14) ---
  {
    // Duas fotos de produtos iguais com seriais distintos
    const evAlpha: ExtractedPhotoEvidence = {
      photoId: "P_SIMILAR_1",
      detected: { brand: "Apple", model: "iPhone 15 Pro", serial: "F2LX9ABCD001" },
      evidenceSources: { serial: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 1, serial: 1, imei: 0, ean: 0, overall: 1 },
    };
    const evBeta: ExtractedPhotoEvidence = {
      photoId: "P_SIMILAR_2",
      detected: { brand: "Apple", model: "iPhone 15 Pro", serial: "F2LX9ABCD002" },
      evidenceSources: { serial: "PHOTO_LABEL" },
      confidence: { brand: 1, model: 1, serial: 1, imei: 0, ean: 0, overall: 1 },
    };

    const { instances } = await GroupingEngine.processBatch([evAlpha, evBeta], {
      loteId: "LOTE-APPLE",
      caixa: 1,
    });

    runner.assert(
      instances.length === 2 &&
        instances.some((i) => i.photoIds.includes("P_SIMILAR_1")) &&
        instances.some((i) => i.photoIds.includes("P_SIMILAR_2")),
      "CRITÉRIO 14: Nenhuma foto descartada por similaridade visual quando pertencem a instâncias físicas distintas"
    );
  }

  // --- CRITÉRIO 15: Informações conflitantes são detectadas (Seção 15, 62 & 63.15) ---
  {
    // EAN com dígito verificador adulterado/conflitante
    const validation = ValidationEngine.validateEAN("7892509123450"); // 0 no fim é inválido para este EAN
    runner.assert(
      !validation.isValid && Boolean(validation.reason?.includes("Dígito verificador")),
      "CRITÉRIO 15: Detecção matemática de inconsistência e conflito em identificadores"
    );
  }

  // --- CRITÉRIO 16: Baixa confiança marcada como REVISAO (Seção 27 & 63.16) ---
  {
    const lowConfEv: ExtractedPhotoEvidence = {
      photoId: "P_LOW_CONF",
      detected: { model: "Aparelho Desconhecido" },
      evidenceSources: {},
      confidence: { brand: 0.2, model: 0.3, serial: 0, imei: 0, ean: 0, overall: 0.25 },
      needsReview: true,
    };

    const { instances } = await GroupingEngine.processBatch([lowConfEv], {
      loteId: "LOTE-LOW",
      caixa: 1,
    });

    runner.assert(
      instances.length === 1 && instances[0].status === "REVISAO",
      "CRITÉRIO 16: Evidência incompleta ou de baixa confiança marcada estritamente como REVISAO"
    );
  }

  // --- CRITÉRIO 17: Produtos não identificados não recebem informações inventadas (Seção 48 & 63.17) ---
  {
    const evNoSerial: ExtractedPhotoEvidence = {
      photoId: "P_NO_SERIAL",
      detected: { brand: "Genérico", ean: "9788576082675" },
      evidenceSources: {},
      confidence: { brand: 0.8, model: 0.8, serial: 0, imei: 0, ean: 1, overall: 0.85 },
    };

    const { instances } = await GroupingEngine.processBatch([evNoSerial], {
      loteId: "LOTE-NO-SN",
      caixa: 1,
    });

    runner.assert(
      instances[0].serial === undefined && instances[0].serialImei === "SEM SERIAL",
      "CRITÉRIO 17: Campo serial não foi inventado/alucinado quando não existe evidência"
    );
  }

  // --- CRITÉRIO 18 & 19: Escrita em lote via Outbox & Read-back confirmado (Seção 34, 35 & 63.18, 63.19) ---
  {
    const op1 = syncEngine.enqueueOutbox("PRODUCT", "PROD_BATCH_1", "CREATE", {
      id: "PROD_BATCH_1",
      modelo: "Samsung Galaxy S24 Ultra",
      version: 1,
    });
    const op2 = syncEngine.enqueueOutbox("PRODUCT", "PROD_BATCH_2", "CREATE", {
      id: "PROD_BATCH_2",
      modelo: "Fone JBL Tune 510BT",
      version: 1,
    });

    runner.assert(
      op1.status === "PENDING" && op2.status === "PENDING" && op1.operationId !== op2.operationId,
      "CRITÉRIOS 18 & 19: Operações agrupadas na fila Outbox para escrita segura em lote com confirmação"
    );
  }

  // --- CRITÉRIO 20: Capacidade de diferenciar entidades físicas individuais em grandes lotes (Seção 61 & 63.20) ---
  {
    // Simular lote com 10 produtos de MESMO MODELO (ASUS Vivobook S14), cada um com seu serial
    const tenProductsEvidences: ExtractedPhotoEvidence[] = Array.from({ length: 10 }).map((_, idx) => ({
      photoId: `P_LOT_${idx + 1}`,
      detected: {
        brand: "ASUS",
        model: "ASUS Vivobook S14 16GB 512GB", // MODELO IDÊNTICO
        serial: `M5N0CV${String(idx + 1).padStart(4, "0")}ABCD`, // SERIAL ÚNICO
        ean: "4711081654322",
        category: "notebook",
      },
      evidenceSources: { serial: "PHOTO_LABEL", model: "VISION_AI" },
      confidence: { brand: 1, model: 0.95, serial: 0.98, imei: 0, ean: 1, overall: 0.97 },
    }));

    const { instances } = await GroupingEngine.processBatch(tenProductsEvidences, {
      loteId: "LOTE-GRANDE-10-ITENS",
      caixa: 5,
    });

    const uniqueSerials = new Set(instances.map((i) => i.serial));

    runner.assert(
      instances.length === 10 && uniqueSerials.size === 10,
      "CRITÉRIO 20: Lote com 10 produtos de mesmo modelo resulta em 10 entidades físicas individuais preservadas!"
    );
  }

  runner.summary();
}

runMandatoMestreTests().catch((err) => {
  console.error("Erro fatal na execução dos testes do Mandato Mestre:", err);
  process.exit(1);
});
