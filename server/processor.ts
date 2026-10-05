import fs from "fs";
import path from "path";
import { GeminiProvider, AIProvider, BatchPhotoInput, BatchAnalysisResult } from "./ai/provider.js";
import { storage } from "./storage.js";
import { Batch, StoredPhoto, ProductStatus } from "../src/types/index.js";
import { GroupingEngine } from "./ai/groupingEngine.js";
import { ExtractedPhotoEvidence } from "./ai/types.js";

interface QueueTask {
  loteId: string;
  deviceId: string;
  photoIds: string[];
}

export class BatchProcessor {
  private aiProvider: AIProvider;
  private queue: QueueTask[] = [];
  private isProcessing = false;

  constructor() {
    this.aiProvider = new GeminiProvider();
  }

  enqueue(loteId: string, deviceId: string, photoIds: string[]) {
    this.queue.push({ loteId, deviceId, photoIds });
    this.processNext();
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const task = this.queue.shift();
    if (!task) {
      this.isProcessing = false;
      return;
    }

    try {
      await this.processTask(task);
    } catch (err) {
      console.error(`Erro ao processar lote ${task.loteId}:`, err);
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) {
        setTimeout(() => this.processNext(), 100);
      }
    }
  }

  private async processTask(task: QueueTask) {
    const { loteId, deviceId, photoIds } = task;
    const batch = storage.getBatch(loteId);
    if (!batch) return;

    batch.status = "PROCESSANDO";
    storage.updateBatch(batch);

    storage.addLog({
      deviceId,
      loteId,
      tipo: "PROCESSAMENTO",
      detalhes: `Iniciando análise com IA para ${photoIds.length} foto(s) no lote ${loteId} (Caixa ${batch.caixa}).`,
    });

    const photosDir = storage.getPhotosDir();
    const photoInputs: BatchPhotoInput[] = [];
    const storedPhotos: StoredPhoto[] = [];

    for (const photoId of photoIds) {
      const p = storage.getPhoto(photoId);
      if (!p) continue;
      storedPhotos.push(p);

      const filePath = path.join(photosDir, "LOTES", loteId, p.filename);
      if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        photoInputs.push({
          id: p.id,
          buffer,
          mimeType: p.mimeType,
          filename: p.originalName,
        });
      }
    }

    if (photoInputs.length === 0) {
      batch.status = "ABERTO";
      storage.updateBatch(batch);
      return;
    }

    try {
      // 1. Processar todas as fotos divididas tecnicamente em chunks de até 4 imagens
      // Seção 6 & 13: O chunk é apenas limite de requisição da IA. CHUNK NÃO É LIMITE DE IDENTIDADE!
      const CHUNK_SIZE = 4;
      const allEvidences: ExtractedPhotoEvidence[] = [];
      const chunkErrors: { chunkIndex: number; photoIds: string[]; error: string }[] = [];

      for (let i = 0; i < photoInputs.length; i += CHUNK_SIZE) {
        const chunk = photoInputs.slice(i, i + CHUNK_SIZE);
        const chunkPhotoIds = chunk.map((p) => p.id);
        const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

        let chunkResult: BatchAnalysisResult | null = null;
        let lastErr: any = null;

        // Retry isolado por chunk (Seção 14 & 15)
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            chunkResult = await this.aiProvider.analyzePhotos(chunk, {
              loteId,
              caixa: batch.caixa,
            });
            break;
          } catch (err: any) {
            lastErr = err;
            console.warn(`[BatchProcessor] Chunk ${chunkNum} tentativa ${attempt} falhou:`, err.message || err);
            if (attempt < 2) {
              await new Promise((res) => setTimeout(res, 1000));
            }
          }
        }

        if (!chunkResult) {
          // Chunk falhou definitivamente: registra as fotos deste chunk e continua os outros (Seção 14 & 15)
          console.error(`[BatchProcessor] Chunk ${chunkNum} falhou definitivamente:`, lastErr);
          chunkErrors.push({
            chunkIndex: chunkNum,
            photoIds: chunkPhotoIds,
            error: lastErr?.message || "Falha na análise do chunk",
          });

          for (const pid of chunkPhotoIds) {
            const p = storage.getPhoto(pid);
            if (p) {
              p.status = "ERRO";
              p.error = lastErr?.message || "Falha no processamento do chunk";
              storage.updatePhoto(p);
            }
          }
          batch.errorPhotos += chunkPhotoIds.length;
          storage.updateBatch(batch);
          continue; // NÃO ABORTA O RESTANTE DO LOTE!
        }

        // 1. Converte o resultado da IA em ExtractedPhotoEvidence estruturadas para CADA FOTO do chunk
        // Mandato V2 (Seções 3, 4 & 5): TODAS as fotos enviadas DEVEM gerar uma evidência real.
        // NUNCA gerar PENDING_PHOTO falso!
        for (const pInput of chunk) {
          const pid = pInput.id;
          const captureIdx = photoInputs.findIndex((p) => p.id === pid);

          // Procura evidência específica por foto se retornada pela IA
          const perPhotoEv = (chunkResult.evidenciasPorFoto || []).find((e) => e.photoId === pid);
          // Procura produto consolidado que cita esta foto
          const matchingProd = (chunkResult.produtos || []).find(
            (prod) => Array.isArray(prod.fotosAssociadas) && prod.fotosAssociadas.includes(pid)
          );
          const isIllegible =
            perPhotoEv?.ilegivel ||
            matchingProd?.ilegivel ||
            (chunkResult.fotosIlegiveis || []).includes(pid);

          if (perPhotoEv) {
            allEvidences.push({
              photoId: pid,
              captureIndex: captureIdx >= 0 ? captureIdx : 0,
              detected: {
                brand: perPhotoEv.marca || matchingProd?.marca,
                model: perPhotoEv.modelo || matchingProd?.modelo,
                serial: perPhotoEv.serial || matchingProd?.serial,
                serviceTag: perPhotoEv.serviceTag || matchingProd?.serviceTag,
                imei: perPhotoEv.imei || matchingProd?.imei,
                ean: perPhotoEv.ean || matchingProd?.ean,
                partNumber: perPhotoEv.partNumber || matchingProd?.partNumber,
                orderNumber: perPhotoEv.orderNumber || matchingProd?.orderNumber,
                custPo: perPhotoEv.custPo || matchingProd?.custPo,
                category: perPhotoEv.categoria || matchingProd?.categoria,
                condition: perPhotoEv.estadoFisico || matchingProd?.estadoFisico,
                conditionDescription: perPhotoEv.descricaoAvaria || matchingProd?.descricaoAvaria,
                otherCodes: perPhotoEv.otherCodes || matchingProd?.otherCodes,
                labelType: perPhotoEv.labelType || matchingProd?.labelType,
                itemCountInPhoto: perPhotoEv.qtde || matchingProd?.qtde || 1,
              },
              evidenceSources: {
                brand: perPhotoEv.marca ? "VISION_AI" : undefined,
                model: perPhotoEv.modelo ? "VISION_AI" : undefined,
                serial: perPhotoEv.serial ? "PHOTO_LABEL" : undefined,
                serviceTag: perPhotoEv.serviceTag ? "PHOTO_LABEL" : undefined,
                imei: perPhotoEv.imei ? "PHOTO_LABEL" : undefined,
                ean: perPhotoEv.ean ? "BARCODE_OCR" : undefined,
                condition: "VISION_AI",
              },
              confidence: {
                brand: perPhotoEv.confianca?.modelo || 0.9,
                model: perPhotoEv.confianca?.modelo || 0.8,
                serial: perPhotoEv.confianca?.serial || 0.8,
                imei: perPhotoEv.confianca?.imei || 0.8,
                ean: perPhotoEv.confianca?.ean || 0.8,
                overall: perPhotoEv.confianca?.modelo || 0.8,
              },
              isIllegible,
              needsReview: perPhotoEv.necessitaRevisao || isIllegible || false,
            });
          } else if (matchingProd) {
            allEvidences.push({
              photoId: pid,
              captureIndex: captureIdx >= 0 ? captureIdx : 0,
              detected: {
                brand: matchingProd.marca,
                model: matchingProd.modelo,
                serial: matchingProd.serial,
                serviceTag: matchingProd.serviceTag,
                imei: matchingProd.imei,
                ean: matchingProd.ean,
                partNumber: matchingProd.partNumber,
                orderNumber: matchingProd.orderNumber,
                custPo: matchingProd.custPo,
                category: matchingProd.categoria,
                condition: matchingProd.estadoFisico,
                conditionDescription: matchingProd.descricaoAvaria,
                otherCodes: matchingProd.otherCodes,
                labelType: matchingProd.labelType,
                itemCountInPhoto: matchingProd.qtde,
              },
              evidenceSources: {
                brand: "VISION_AI",
                model: "VISION_AI",
                serial: matchingProd.serial ? "PHOTO_LABEL" : undefined,
                serviceTag: matchingProd.serviceTag ? "PHOTO_LABEL" : undefined,
                imei: matchingProd.imei ? "PHOTO_LABEL" : undefined,
                ean: matchingProd.ean ? "BARCODE_OCR" : undefined,
                condition: "VISION_AI",
              },
              confidence: {
                brand: 0.95,
                model: matchingProd.confianca?.modelo || 0.8,
                serial: matchingProd.confianca?.serial || 0.8,
                imei: matchingProd.confianca?.imei || 0.8,
                ean: matchingProd.confianca?.ean || 0.8,
                overall: ((matchingProd.confianca?.modelo || 0.8) + (matchingProd.confianca?.serial || 0.8) + (matchingProd.confianca?.ean || 0.8)) / 3,
              },
              isIllegible,
              needsReview: matchingProd.necessitaRevisao || isIllegible || false,
            });
          } else {
            // Foto não associada explicitamente pela IA: PRESERVADA COMO EVIDÊNCIA REAL (Mandato V2 - Seção 3 & 28)
            allEvidences.push({
              photoId: pid,
              captureIndex: captureIdx >= 0 ? captureIdx : 0,
              detected: {},
              evidenceSources: {},
              confidence: { brand: 0, model: 0, serial: 0, imei: 0, ean: 0, overall: 0 },
              isIllegible,
              needsReview: true,
              reviewReason: "Fotografia enviada para análise; aguardando correlação na reconciliação global.",
            });
          }
        }
      }

      // 2. RECONCILIAÇÃO GLOBAL DE IDENTIDADE (Seções 6, 29 & 30):
      // UMA ÚNICA RESOLUÇÃO GLOBAL COM TODAS AS EVIDÊNCIAS DE TODOS OS CHUNKS!
      const { instances, orphanPhotos, illegiblePhotos } = await GroupingEngine.processBatch(
        allEvidences,
        { loteId, caixa: batch.caixa, spreadsheetId: batch.spreadsheetId }
      );

      // 3. CHECKPOINT & PERSISTÊNCIA DAS UNIDADES FÍSICAS (Seção 54)
      for (const inst of instances) {
        const dateStr = new Date().toISOString().slice(0, 10);
        const { product } = storage.upsertProduct({
          modelo: inst.model,
          marca: inst.brand,
          serial: inst.serial,
          serviceTag: inst.serviceTag,
          imei: inst.imei,
          serialImei: inst.serialImei,
          ean: inst.ean,
          partNumber: inst.partNumber,
          orderNumber: inst.orderNumber,
          custPo: inst.custPo,
          unitId: inst.unitId,
          skuId: inst.skuId,
          qtde: inst.qtde,
          data: dateStr,
          caixa: inst.caixa || batch.caixa,
          nfe: "",
          linkFoto: "LINK",
          photoIds: inst.photoIds,
          deviceId,
          loteId,
          spreadsheetId: batch.spreadsheetId,
          status: inst.status,
          confidence: inst.confidence,
          estadoFisico: inst.estadoFisico || "NOVO_LACRADO",
          descricaoAvaria: inst.descricaoAvaria,
          categoria: inst.category,
          hasPhysicalIdentifier: inst.hasPhysicalIdentifier,
          associationAudit: inst.associationAudit,
        });

        // Marcar fotos como associadas pelo unitId (Seção 12 & 28)
        for (const pid of inst.photoIds) {
          const photo = storage.getPhoto(pid);
          if (photo) {
            photo.status = inst.status === "PENDENTE_ASSOCIACAO" ? "PENDENTE_ASSOCIACAO" : "ASSOCIADO";
            photo.unitId = inst.unitId;
            photo.associatedProductId = product.id;
            photo.isOrphan = false;
            photo.caixa = batch.caixa;
            photo.candidateUnitIds = inst.candidateUnitIds;
            storage.updatePhoto(photo);
          }
        }
      }

      // 4. Tratar fotos ilegíveis (FLUXO DE EXCEÇÃO)
      for (const ilegivelId of illegiblePhotos) {
        const photo = storage.getPhoto(ilegivelId);
        if (photo && (!photo.associatedProductId || photo.status !== "ASSOCIADO")) {
          photo.status = "ILEGIVEL";
          photo.isOrphan = false;
          photo.caixa = batch.caixa;
          photo.revisaoMotivo = "Foto ilegível ou sem etiqueta nítida. Exige validação manual.";
          storage.updatePhoto(photo);

          storage.addLog({
            deviceId,
            loteId,
            tipo: "FOTO_ILEGIVEL",
            detalhes: `Foto ${photo.originalName} classificada como ILEGÍVEL na Caixa ${batch.caixa}. Fluxo de exceção ativado.`,
            photoId: photo.id,
          });
        }
      }

      // 5. Tratar fotos órfãs
      for (const orphanId of orphanPhotos) {
        const photo = storage.getPhoto(orphanId);
        if (photo && !photo.associatedProductId && photo.status !== "ILEGIVEL") {
          photo.isOrphan = true;
          photo.status = "ORFAO";
          photo.caixa = batch.caixa;
          storage.updatePhoto(photo);

          storage.addLog({
            deviceId,
            loteId,
            tipo: "ASSOCIACAO_FOTO",
            detalhes: `Foto ${photo.originalName} classificada como órfã para revisão posterior.`,
            photoId: photo.id,
          });
        }
      }

      // 6. INVARIANTE OBRIGATÓRIA & AUDITORIA DE INTEGRIDADE (Mandato V2 - Seções 31, 32, 65 & 69):
      const totalSubmitted = photoInputs.length;
      let associatedCount = 0;
      let pendingCount = 0;
      let illegibleCount = 0;
      let orphanCount = 0;
      let errorCount = 0;

      for (const pInput of photoInputs) {
        const ph = storage.getPhoto(pInput.id);
        if (ph) {
          if (ph.status === "ASSOCIADO") associatedCount++;
          else if (ph.status === "PENDENTE_ASSOCIACAO") pendingCount++;
          else if (ph.status === "ILEGIVEL") illegibleCount++;
          else if (ph.status === "ORFAO") orphanCount++;
          else if (ph.status === "ERRO") errorCount++;
          else {
            ph.status = "PENDENTE_ASSOCIACAO";
            ph.isOrphan = true;
            ph.caixa = batch.caixa;
            storage.updatePhoto(ph);
            pendingCount++;
          }
        }
      }

      const totalAccounted = associatedCount + pendingCount + illegibleCount + orphanCount + errorCount;
      const unaccountedCount = Math.max(0, totalSubmitted - totalAccounted);

      // 7. Atualizar métricas do lote e contadores em tempo real
      const allBatchPhotos = storage.getPhotos(batch.id);
      const processedCount = allBatchPhotos.filter(
        (p) => p.status === "ASSOCIADO" || p.status === "PENDENTE_ASSOCIACAO" || p.status === "ILEGIVEL" || p.status === "ORFAO"
      ).length;

      batch.processedPhotos = processedCount;
      batch.pendingPhotos = Math.max(
        0,
        batch.totalPhotos - batch.processedPhotos - batch.errorPhotos
      );
      batch.status = batch.pendingPhotos === 0 ? "CONCLUIDO" : "PROCESSANDO";
      storage.updateBatch(batch);

      storage.addLog({
        deviceId,
        loteId,
        tipo: "PROCESSAMENTO",
        detalhes: `Lote ${loteId}: Auditoria de Integridade 100% (${totalSubmitted} enviadas, ${totalAccounted} contabilizadas: ${associatedCount} associadas, ${pendingCount} pendentes, ${illegibleCount} ilegíveis, ${orphanCount} órfãs, ${errorCount} erros, ${unaccountedCount} perdidas). Total de Unidades Físicas: ${instances.length}.`,
      });

      // 5. Verificar e disparar alertas se configurado
      const alertConfig = storage.getAlertConfig();
      const resumos = storage.getResumoCaixas(deviceId);
      const resumoAtual = resumos.find((r) => r.caixa === batch.caixa);

      if (resumoAtual) {
        // Alerta de avaria
        if (alertConfig.alertarEmAvaria && resumoAtual.avariasDetectadas > 0) {
          const msgAvaria = `🚨 *SCANLOTE AI - AVARIA DETECTADA*\n📦 *Caixa*: ${batch.caixa} (Lote ${batch.id})\n👤 *Operador*: ${deviceId}\n💥 *Total de Avarias*: ${resumoAtual.avariasDetectadas}\n⚠️ Por favor, confira os itens avariados no app.`;
          storage.sendAlert("AVARIA", msgAvaria).catch(console.warn);
        }

        // Alerta de divergência
        if (
          alertConfig.alertarNaDivergencia &&
          resumoAtual.qtdManifesto > 0 &&
          resumoAtual.qtdLida !== resumoAtual.qtdManifesto
        ) {
          const diffMsg = resumoAtual.divergenciaAuditoria;
          const msgDivergencia = `⚠️ *SCANLOTE AI - DIVERGÊNCIA DE AUDITORIA*\n📦 *Caixa*: ${batch.caixa} (${batch.id})\n👤 *Operador*: ${deviceId}\n📊 *Qtd Lida*: ${resumoAtual.qtdLida} un | *Qtd Manifesto*: ${resumoAtual.qtdManifesto} un\n🚨 *Situação*: ${diffMsg}\n🔍 *Revisões Manuais Pendentes*: ${resumoAtual.revisaoManual}`;
          storage.sendAlert("DIVERGENCIA", msgDivergencia).catch(console.warn);
        }
      }
    } catch (error: any) {
      console.error(`Erro no processador de IA para o lote ${loteId}:`, error);

      batch.errorPhotos += photoInputs.length;
      batch.pendingPhotos = Math.max(
        0,
        batch.totalPhotos - batch.processedPhotos - batch.errorPhotos
      );
      batch.status = "ERRO";
      storage.updateBatch(batch);

      for (const p of storedPhotos) {
        if (!p.associatedProductId) {
          p.status = "ERRO";
          p.error = error.message || "Erro durante interpretação";
          storage.updatePhoto(p);
        }
      }

      storage.addLog({
        deviceId,
        loteId,
        tipo: "FALHA",
        detalhes: `Falha ao interpretar lote: ${error.message || "Erro desconhecido"}. Lote preservado para reprocessamento.`,
      });
    }
  }

  retryFailedPhotos(loteId: string, deviceId: string) {
    const photos = storage.getPhotos(loteId, deviceId).filter((p) => p.status === "ERRO");
    if (photos.length > 0) {
      photos.forEach((p) => {
        p.status = "PROCESSANDO";
        storage.updatePhoto(p);
      });
      const batch = storage.getBatch(loteId);
      if (batch) {
        batch.errorPhotos = Math.max(0, batch.errorPhotos - photos.length);
        batch.status = "PROCESSANDO";
        storage.updateBatch(batch);
      }
      this.enqueue(loteId, deviceId, photos.map((p) => p.id));
    }
  }
}

export const processor = new BatchProcessor();
