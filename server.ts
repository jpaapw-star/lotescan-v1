import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { storage } from "./server/storage.js";
import { processor } from "./server/processor.js";
import { manifestProcessor } from "./server/ai/manifestProcessor.js";
import { AIKnowledgeEngine } from "./server/ai/knowledge.js";
import { StoredPhoto } from "./src/types/index.js";

dotenv.config();

const app = express();
const PORT = 3000;
const isProd = process.env.NODE_ENV === "production";

// Permitir uploads grandes via JSON (ex: base64 da câmera) ou Multipart
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Configuração do multer em memória para processamento rápido
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB por foto
    files: 50, // Até 50 fotos por lote de uma só vez
  },
});

// --- API ROUTES ---

// 1. Operadores e Estações (Sessão Unificada Multi-Dispositivo)
app.get(["/api/operators", "/api/devices"], (req, res) => {
  try {
    const operators = storage.getOperators();
    res.json(operators);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(["/api/operators", "/api/devices"], (req, res) => {
  try {
    const operatorId = req.body.operatorId || req.body.deviceId || req.body.name;
    const name = req.body.name || operatorId;
    if (!operatorId) return res.status(400).json({ error: "Nome ou ID do operador obrigatório" });
    const operator = storage.getOrCreateDevice(operatorId, name);
    res.json(operator);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/register-owner-token", async (req, res) => {
  try {
    const { email, token } = req.body;
    if (!token) return res.status(400).json({ error: "Token obrigatório" });

    // Registra o token central na engine de IA
    AIKnowledgeEngine.getInstance().setCentralOwnerToken(token);

    // Se o email for jpaapw@gmail.com ou se ainda não houver planilha configurada, cria se necessário
    if (email === "jpaapw@gmail.com" || !storage.getAiMemorySpreadsheetId()) {
      let sheetId = storage.getAiMemorySpreadsheetId();
      if (!sheetId) {
        try {
          const payload = {
            properties: { title: "ScanLote AI - Memória Global de Aprendizado da IA" },
            sheets: [
              { properties: { title: "AI_PATTERNS" } },
              { properties: { title: "AI_CORRECTIONS" } },
            ],
          };
          const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });
          if (createRes.ok) {
            const data = await createRes.json();
            sheetId = data.spreadsheetId;
            if (sheetId) {
              storage.setAiMemorySpreadsheetId(sheetId);
              
              // Escrever cabeçalhos nas abas criadas
              await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  valueInputOption: "USER_ENTERED",
                  data: [
                    { range: "AI_PATTERNS!A1:E1", values: [["BRAND", "CATEGORY", "SERIAL_PATTERN", "VALID_EXAMPLE", "LAYOUT_TIPS"]] },
                    { range: "AI_CORRECTIONS!A1:G1", values: [["TIMESTAMP", "OPERATOR_ID", "TYPE", "ORIGINAL_VALUE", "CORRECTED_VALUE", "NOTE", "OWNER"]] },
                  ],
                }),
              });
            }
          }
        } catch (e) {
          console.warn("Erro ao criar planilha central de IA:", e);
        }
      }

      if (sheetId) {
        AIKnowledgeEngine.getInstance().setAiMemorySpreadsheetId(sheetId);
      }
    }

    res.json({ success: true, aiMemorySpreadsheetId: storage.getAiMemorySpreadsheetId() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Lotes e Caixas Congeladas
app.get("/api/batches", (req, res) => {
  try {
    const operatorId = (req.query.operatorId || req.query.deviceId) as string | undefined;
    const spreadsheetId = req.query.spreadsheetId as string | undefined;
    const batches = storage.getBatches(operatorId, spreadsheetId);
    res.json(batches);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/batches/active", (req, res) => {
  try {
    const operatorId = (req.query.operatorId || req.query.deviceId || "Carlos Silveira") as string;
    const spreadsheetId = req.query.spreadsheetId as string | undefined;
    const batch = storage.getActiveBatch(operatorId, spreadsheetId);
    res.json(batch);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/batches", (req, res) => {
  try {
    const operatorId = (req.body.operatorId || req.body.deviceId || "Carlos Silveira") as string;
    const spreadsheetId = req.body.spreadsheetId as string | undefined;
    const { caixa, loteId } = req.body;
    const batch = storage.createNewBatch(operatorId, caixa ? Number(caixa) : undefined, loteId, spreadsheetId);
    res.json(batch);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Renomear Lote (customizável alfanumérico)
app.patch("/api/lotes/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { newName } = req.body;
    if (!newName || !newName.trim()) {
      return res.status(400).json({ error: "Novo nome do lote obrigatório" });
    }
    const clean = newName.trim();
    storage.renameLot(id, clean);
    res.json({ success: true, newId: clean });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Sincronizar produtos com a planilha (Single Source of Truth)
app.post("/api/products/sync-sheet", (req, res) => {
  try {
    const { products, spreadsheetId } = req.body;
    if (!Array.isArray(products)) {
      return res.status(400).json({ error: "Lista de produtos inválida" });
    }
    storage.syncSpreadsheetProducts(products, spreadsheetId);
    res.json({ success: true, count: products.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Sincronização geral de dados operacionais originados da planilha conectada
app.post("/api/sync/all-from-sheet", (req, res) => {
  try {
    const { products, batches, manifestos, photos, logs, resumos, spreadsheetId } = req.body;

    if (Array.isArray(products)) {
      storage.syncSpreadsheetProducts(products, spreadsheetId);
    }
    if (Array.isArray(batches)) {
      storage.syncSpreadsheetBatches(batches, spreadsheetId);
    }
    if (Array.isArray(manifestos)) {
      storage.syncSpreadsheetManifestos(manifestos, spreadsheetId);
    }
    if (Array.isArray(photos)) {
      storage.syncSpreadsheetPhotos(photos, spreadsheetId);
    }
    if (Array.isArray(logs)) {
      storage.syncSpreadsheetLogs(logs, spreadsheetId);
    }
    if (Array.isArray(resumos)) {
      storage.syncSpreadsheetResumos(resumos, spreadsheetId);
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint central de reconciliação do SyncEngine (Mandato Técnico - Seções 4, 14, 15)
app.post("/api/sync/reconcile", (req, res) => {
  try {
    const { spreadsheetId, products, batches, resumos, manifestos, photos, logs, tombstones } = req.body;
    if (!spreadsheetId) {
      return res.status(400).json({ error: "spreadsheetId obrigatório para reconciliação." });
    }
    storage.reconcileSpreadsheetData({
      spreadsheetId,
      products: products || [],
      batches: batches || [],
      resumos: resumos || [],
      manifestos: manifestos || [],
      photos: photos || [],
      logs: logs || [],
      tombstones: tombstones || [],
    });
    res.json({ success: true, count: products ? products.length : 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para isolar contexto ao trocar de planilha (Seção 6)
app.post("/api/sync/isolate-context", (req, res) => {
  try {
    const { spreadsheetId } = req.body;
    if (spreadsheetId) {
      storage.isolateSpreadsheetContext(spreadsheetId);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para consultar tombstones anti-ressurreição (Seção 15)
app.get("/api/sync/tombstones", (req, res) => {
  try {
    const spreadsheetId = req.query.spreadsheetId as string | undefined;
    const tombstones = storage.getTombstones(spreadsheetId);
    res.json(tombstones);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para consultar operações pendentes da Outbox (Mandato V2 - Seção 36)
app.get("/api/sync/outbox", (req, res) => {
  try {
    const spreadsheetId = req.query.spreadsheetId as string | undefined;
    const outbox = storage.getOutbox(spreadsheetId);
    res.json(outbox);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para marcar operação da Outbox como concluída (Mandato V2 - Seção 36)
app.post("/api/sync/outbox/complete", (req, res) => {
  try {
    const { operationId } = req.body;
    if (operationId) {
      storage.clearOutboxOperation(operationId);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Upload de Fotos (Multipart ou Base64 da Câmera) - Não-bloqueante
app.post("/api/upload", upload.array("photos"), async (req, res) => {
  try {
    const operatorId = (req.body.operatorId || req.body.deviceId || "Carlos Silveira") as string;
    const deviceId = operatorId;
    let loteId = req.body.loteId as string;

    let batch = loteId ? storage.getBatch(loteId) : storage.getActiveBatch(operatorId);
    if (!batch) {
      batch = storage.getActiveBatch(operatorId);
    }
    loteId = batch.id;

    const files = req.files as Express.Multer.File[] | undefined;
    const base64Photos = req.body.base64Photos as
      | { name?: string; data: string; mimeType?: string }[]
      | undefined;

    const createdPhotos: StoredPhoto[] = [];

    // Processar arquivos enviados via multipart
    if (files && files.length > 0) {
      for (const file of files) {
        const photoId = `FOTO-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
        const ext = path.extname(file.originalname) || ".jpg";
        const filename = `${photoId}${ext}`;

        storage.savePhotoFile(loteId, photoId, filename, file.buffer);

        const photo: StoredPhoto = {
          id: photoId,
          filename,
          originalName: file.originalname || filename,
          mimeType: file.mimetype || "image/jpeg",
          size: file.size,
          url: `/api/photos/${photoId}`,
          loteId,
          deviceId,
          associatedProductId: null,
          isOrphan: false,
          uploadedAt: new Date().toISOString(),
          status: "RECEBIDO",
        };
        createdPhotos.push(photo);
      }
    }

    // Processar fotos enviadas como base64 (câmera / web)
    if (base64Photos && base64Photos.length > 0) {
      for (const item of base64Photos) {
        const photoId = `FOTO-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
        const ext = ".jpg";
        const filename = `${photoId}${ext}`;

        let cleanBase64 = item.data;
        if (cleanBase64.includes(",")) {
          cleanBase64 = cleanBase64.split(",")[1];
        }
        const buffer = Buffer.from(cleanBase64, "base64");

        storage.savePhotoFile(loteId, photoId, filename, buffer);

        const photo: StoredPhoto = {
          id: photoId,
          filename,
          originalName: item.name || `camera_${photoId}.jpg`,
          mimeType: item.mimeType || "image/jpeg",
          size: buffer.length,
          url: `/api/photos/${photoId}`,
          loteId,
          deviceId,
          associatedProductId: null,
          isOrphan: false,
          uploadedAt: new Date().toISOString(),
          status: "RECEBIDO",
        };
        createdPhotos.push(photo);
      }
    }

    if (createdPhotos.length === 0) {
      return res.status(400).json({ error: "Nenhuma fotografia recebida." });
    }

    // Registrar no storage
    storage.addPhotos(createdPhotos);

    // Atualizar contadores do lote
    batch.totalPhotos += createdPhotos.length;
    batch.pendingPhotos += createdPhotos.length;
    storage.updateBatch(batch);

    storage.addLog({
      deviceId,
      loteId,
      tipo: "ENTRADA",
      detalhes: `Recebidas ${createdPhotos.length} fotos no lote ${loteId} (Caixa ${batch.caixa}). Enfileiradas para processamento em background.`,
    });

    // Enfileirar no processador assíncrono em segundo plano (NÃO BLOQUEIA A RESPOSTA!)
    const photoIds = createdPhotos.map((p) => p.id);
    processor.enqueue(loteId, deviceId, photoIds);

    // Resposta imediata para o operador continuar fotografando
    res.json({
      success: true,
      status: "RECEBIDO",
      message: `${createdPhotos.length} foto(s) recebida(s) com sucesso. Processamento assíncrono em andamento.`,
      uploaded: createdPhotos.length,
      loteId,
      caixa: batch.caixa,
      photoIds,
    });
  } catch (err: any) {
    console.error("Erro no upload:", err);
    res.status(500).json({ error: err.message || "Erro ao receber fotos" });
  }
});

// 4. Fotos Órfãs e Manutenção Segura
app.get("/api/photos", (req, res) => {
  try {
    const operatorId = (req.query.operatorId || req.query.deviceId) as string | undefined;
    const photos = storage.getPhotos(undefined, operatorId);
    res.json(photos);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/products/clear", (_req, res) => {
  try {
    storage.clearAllProducts();
    res.json({ success: true, message: "Inventário e fotos limpos com sucesso. Tela zerada!" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/photos/orphans", (req, res) => {
  try {
    const operatorId = (req.query.operatorId || req.query.deviceId) as string | undefined;
    const orphans = storage.getOrphanPhotos(operatorId);
    res.json(orphans);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/photos/orphans/associate", (req, res) => {
  try {
    const { photoId, productId } = req.body;
    if (!photoId || !productId) {
      return res.status(400).json({ error: "photoId e productId obrigatórios" });
    }
    const success = storage.associatePhotoToProduct(photoId, productId);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/photos/orphans/clean", (req, res) => {
  try {
    const { photoIds } = req.body;
    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return res.status(400).json({ error: "Lista photoIds obrigatória" });
    }
    const result = storage.safeCleanOrphanPhotos(photoIds);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Fluxo de Exceção: Fotos Ilegíveis & Resolução Manual
app.get("/api/photos/illegible", (req, res) => {
  try {
    const operatorId = (req.query.operatorId || req.query.deviceId) as string | undefined;
    const illegible = storage.getIllegiblePhotos(operatorId);
    res.json(illegible);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/photos/illegible/resolve", (req, res) => {
  try {
    const { photoId, manualData } = req.body;
    if (!photoId || !manualData || !manualData.modelo) {
      return res.status(400).json({ error: "photoId e manualData.modelo são obrigatórios" });
    }
    const result = storage.resolveIllegiblePhoto(photoId, manualData);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Atualização em lote de links do Google Drive para Fotos
app.post("/api/photos/drive-urls", (req, res) => {
  try {
    const { driveMap } = req.body || {};
    if (driveMap && typeof driveMap === "object") {
      storage.updatePhotoDriveUrls(driveMap);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6.1 Purge de Foto Local (Coleta de Lixo após confirmação no Drive e Sheets)
app.post("/api/photos/:id/purge", (req, res) => {
  try {
    const { id } = req.params;
    const { driveUrl } = req.body || {};
    const success = storage.purgePhotoFile(id, driveUrl);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Servir Arquivo da Foto por ID
app.get("/api/photos/:id", (req, res, next) => {
  const { id } = req.params;
  if (id === "orphans" || id === "illegible" || id === "purge") {
    return next();
  }

  try {
    const photo = storage.getPhoto(id);
    if (!photo) {
      return res.status(404).json({ error: "Foto não encontrada" });
    }

    // Se já foi purgada e tem link do Drive, redireciona diretamente
    if (photo.driveUrl) {
      return res.redirect(photo.driveUrl);
    }

    const filePath = path.join(
      storage.getPhotosDir(),
      "LOTES",
      photo.loteId,
      photo.filename
    );

    if (fs.existsSync(filePath)) {
      res.setHeader("Content-Type", photo.mimeType || "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.status(404).json({ error: "Arquivo físico expurgado ou não encontrado" });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao recuperar foto" });
  }
});

// 8. Aprendizado Adaptativo da IA
app.get("/api/ai/knowledge", (req, res) => {
  try {
    res.json(AIKnowledgeEngine.getInstance().getStats());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Planilha Principal (Colunas A-I)
app.get("/api/products", (req, res) => {
  try {
    const operatorId = (req.query.operatorId || req.query.deviceId) as string | undefined;
    const loteId = req.query.loteId as string | undefined;
    const spreadsheetId = req.query.spreadsheetId as string | undefined;
    const products = storage.getProducts(operatorId, loteId, spreadsheetId);
    res.json(products);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/products/:id", (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updated = storage.updateProductManual(id, updates);
    if (!updated) return res.status(404).json({ error: "Produto não encontrado" });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Importação de linha da planilha existente
app.post("/api/products/import-row", (req, res) => {
  try {
    const { product } = req.body;
    if (!product) return res.status(400).json({ error: "Produto obrigatório" });
    const result = storage.upsertProduct(product);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- CAMADA DE RESOLUÇÃO DE IDENTIDADE FÍSICA (MANDATO SCANLOTE AI) ---
app.get("/api/units", (req, res) => {
  try {
    const loteId = req.query.loteId as string | undefined;
    const caixa = req.query.caixa ? Number(req.query.caixa) : undefined;
    const spreadsheetId = req.query.spreadsheetId as string | undefined;
    const units = storage.getPhysicalUnits(loteId, caixa, spreadsheetId);
    res.json(units);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/units/:unitId", (req, res) => {
  try {
    const unit = storage.getPhysicalUnit(req.params.unitId);
    if (!unit) return res.status(404).json({ error: "Unidade física não encontrada" });
    res.json(unit);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/skus", (req, res) => {
  try {
    const spreadsheetId = req.query.spreadsheetId as string | undefined;
    const skus = storage.getSkuCatalog(spreadsheetId);
    res.json(skus);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/photos/associate-unit", (req, res) => {
  try {
    const { photoId, unitId } = req.body;
    if (!photoId || !unitId) {
      return res.status(400).json({ error: "photoId e unitId são obrigatórios." });
    }
    const result = storage.associatePhotoToUnit(photoId, unitId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Exportação em Excel/CSV de inventário exclusivo da caixa
app.get("/api/export/caixa/:caixa", (req, res) => {
  try {
    const caixa = Number(req.params.caixa);
    const loteId = req.query.loteId as string | undefined;
    let products = storage.getProducts();
    products = products.filter((p) => p.caixa === caixa);
    if (loteId) {
      products = products.filter((p) => p.loteId === loteId);
    }

    const headers = [
      "MODELO (A)",
      "SERIAL/IMEI (B)",
      "EAN (C)",
      "QTDE (D)",
      "DATA (E)",
      "QTD/CAIXA (F)",
      "CAIXA (G)",
      "NFE (H)",
      "LINK FOTO (I)",
      "LOTE",
      "OPERADOR",
    ];

    const rows = products.map((p) => [
      `"${(p.modelo || "").replace(/"/g, '""')}"`,
      `"${(p.serialImei || "").replace(/"/g, '""')}"`,
      `"${(p.ean || "").replace(/"/g, '""')}"`,
      p.qtde || 1,
      `"${p.data || ""}"`,
      p.qtdCaixa || p.qtdDia || 1,
      p.caixa,
      `"${p.nfe || ""}"`,
      `"${p.linkFoto || "VER FOTO"}"`,
      `"${p.loteId || ""}"`,
      `"${p.deviceId || ""}"`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="inventario_caixa_${caixa}_${loteId || "geral"}.csv"`
    );
    res.send(csvContent);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Histórico & Auditoria
app.get("/api/history", (req, res) => {
  try {
    const operatorId = (req.query.operatorId || req.query.deviceId) as string | undefined;
    const loteId = req.query.loteId as string | undefined;
    const logs = storage.getLogs(operatorId, loteId);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Reprocessamento / Retry
app.post("/api/batches/:id/retry", (req, res) => {
  try {
    const loteId = req.params.id;
    const operatorId = (req.body.operatorId || req.body.deviceId || "Carlos Silveira") as string;
    processor.retryFailedPhotos(loteId, operatorId);
    res.json({ success: true, message: "Reprocessamento enfileirado" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Status & Métricas Operacionais
app.get("/api/stats", (req, res) => {
  try {
    const operatorId = (req.query.operatorId || req.query.deviceId || "Carlos Silveira") as string;
    const spreadsheetId = req.query.spreadsheetId as string | undefined;
    const activeBatch = storage.getActiveBatch(operatorId, spreadsheetId);
    const batches = storage.getBatches(operatorId, spreadsheetId);
    const products = storage.getProducts(operatorId, undefined, spreadsheetId);
    const photos = storage.getPhotos(undefined, operatorId, spreadsheetId);
    const resumos = storage.getResumoCaixas(operatorId); // Note that getResumoCaixas will automatically filter products and batches based on getBatches()

    let fotosRecebidas = 0;
    let fotosProcessadas = 0;
    let fotosPendentes = 0;
    let fotosErros = 0;

    batches.forEach((b) => {
      fotosRecebidas += b.totalPhotos;
      fotosProcessadas += b.processedPhotos;
      fotosPendentes += b.pendingPhotos;
      fotosErros += b.errorPhotos;
    });

    const fotosIlegiveis = photos.filter((p) => p.status === "ILEGIVEL").length;
    const avariasTotal = products.filter((p) => p.estadoFisico && p.estadoFisico !== "NOVO_LACRADO").length;
    const caixasDivergentes = resumos.filter((r) => r.divergenciaAuditoria.includes("Faltam") || r.divergenciaAuditoria.includes("Sobraram")).length;

    res.json({
      loteAtual: activeBatch.id,
      caixaAtual: activeBatch.caixa,
      fotosRecebidas,
      fotosProcessadas,
      fotosPendentes,
      fotosErros,
      fotosIlegiveis,
      produtosIdentificados: products.length,
      avariasTotal,
      totalCaixas: resumos.length,
      caixasDivergentes,
      statusLote: activeBatch.status,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Dashboard Principal: RESUMO_CAIXAS
app.get("/api/resumo-caixas", (req, res) => {
  try {
    const operatorId = (req.query.operatorId || req.query.deviceId) as string | undefined;
    const spreadsheetId = req.query.spreadsheetId as string | undefined;
    const resumos = storage.getResumoCaixas(operatorId, spreadsheetId);
    res.json(resumos);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Manifestos & Importação de Nota Fiscal (PDF ou Imagem)
app.get("/api/manifestos", (req, res) => {
  try {
    const spreadsheetId = req.query.spreadsheetId as string | undefined;
    const docs = storage.getManifestos(spreadsheetId);
    res.json(docs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/manifestos/upload", upload.array("manifestos", 15), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "Nenhum arquivo de manifesto/NF enviado" });
    }

    const processedDocs = [];
    for (const file of files) {
      const doc = await manifestProcessor.parseManifestFile(
        file.buffer,
        file.mimetype,
        file.originalname
      );
      storage.addManifesto(doc);
      processedDocs.push(doc);
    }

    res.json({
      success: true,
      count: processedDocs.length,
      message: `${processedDocs.length} arquivo(s) de Nota Fiscal/Manifesto processado(s) com sucesso!`,
      manifestos: processedDocs,
      manifesto: processedDocs[0],
    });
  } catch (err: any) {
    console.error("Erro no processamento do manifesto:", err);
    res.status(500).json({ error: err.message || "Erro ao processar manifesto" });
  }
});

app.delete("/api/manifestos/:id", (req, res) => {
  try {
    const { id } = req.params;
    const removed = storage.removeManifesto(id);
    if (!removed) {
      return res.status(404).json({ error: "Manifesto/NF não encontrado" });
    }
    res.json({ success: true, message: "Manifesto/NF removido com sucesso" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Fluxo de Exceção: Fotos Ilegíveis & Resolução Manual
// 13. Conclusão de Caixa & Disparo de Alerta
app.post("/api/caixas/:caixa/complete", async (req, res) => {
  try {
    const caixa = Number(req.params.caixa);
    const operatorId = (req.body.operatorId || req.body.deviceId || "Carlos Silveira") as string;
    const batches = storage.getBatches(operatorId);
    const targetBatch = batches.find((b) => b.caixa === caixa);

    if (targetBatch) {
      targetBatch.status = "CONCLUIDO";
      storage.updateBatch(targetBatch);
    }

    const resumos = storage.getResumoCaixas(operatorId);
    const resumo = resumos.find((r) => r.caixa === caixa);

    if (resumo) {
      const alertConfig = storage.getAlertConfig();
      if (alertConfig.alertarAoConcluirCaixa || (alertConfig.alertarNaDivergencia && resumo.divergenciaAuditoria.includes("Faltam"))) {
        const msg = `📦 *SCANLOTE AI - CAIXA ${caixa} CONCLUÍDA*\n👤 *Operador*: ${operatorId}\n📊 *Qtd Lida*: ${resumo.qtdLida} | *Manifesto*: ${resumo.qtdManifesto}\n🔍 *Situação*: ${resumo.divergenciaAuditoria}\n💥 *Avarias*: ${resumo.avariasDetectadas}\n📋 *Revisões*: ${resumo.revisaoManual}`;
        storage.sendAlert("CONCLUSAO", msg).catch(console.warn);
      }
    }

    res.json({ success: true, caixa, resumo });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Alertas (Telegram / WhatsApp)
app.get("/api/alerts/config", (_req, res) => {
  try {
    const config = storage.getAlertConfig();
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/alerts/config", (req, res) => {
  try {
    const updated = storage.updateAlertConfig(req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/alerts/test", async (req, res) => {
  try {
    const { tipo = "DIVERGENCIA", mensagem } = req.body;
    const defaultMsg = `🔔 *SCANLOTE AI - TESTE DE ALERTA*\nSistema de conferência operacional.\nData: ${new Date().toLocaleString("pt-BR")}`;
    const result = await storage.sendAlert(tipo, mensagem || defaultMsg);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 15. Relatório Consolidado para PDF / Auditoria de Avarias
app.get("/api/reports/audit", (req, res) => {
  try {
    const operatorId = (req.query.operatorId || req.query.deviceId) as string | undefined;
    const resumos = storage.getResumoCaixas(operatorId);
    const products = storage.getProducts(operatorId);
    const manifestos = storage.getManifestos();

    const avariados = products.filter(
      (p) => p.estadoFisico && p.estadoFisico !== "NOVO_LACRADO"
    );

    res.json({
      geradoEm: new Date().toISOString(),
      deviceId: operatorId || "TODOS",
      operatorId: operatorId || "TODOS",
      resumoCaixas: resumos,
      totalItensLidos: products.reduce((acc, p) => acc + (p.qtde || 1), 0),
      totalAvariados: avariados.length,
      produtosAvariados: avariados,
      manifestos,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- VITE MIDDLEWARE SETUP ---
async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: "0.0.0.0",
        port: PORT,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ScanLote AI rodando em http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Falha ao inicializar servidor:", err);
  process.exit(1);
});
