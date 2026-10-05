import fs from "fs";
import path from "path";
import { AIKnowledgeEngine } from "./ai/knowledge.js";
import {
  Batch,
  ProductItem,
  StoredPhoto,
  AuditLog,
  DeviceId,
  LoteId,
  AuditLogType,
  ResumoCaixa,
  ManifestoDoc,
  ManifestoItem,
  AlertConfig,
  EstadoFisico,
  ProductStatus,
  PhysicalUnit,
  ProductSku,
} from "../src/types/index.js";
import { Tombstone, OutboxOperation } from "../src/types/sync.js";

interface DatabaseSchema {
  devices: { id: DeviceId; name: string; lastActive: string; currentCaixa: number }[];
  batches: Batch[];
  products: ProductItem[];
  physicalUnits: PhysicalUnit[];
  photos: StoredPhoto[];
  logs: AuditLog[];
  manifestos: ManifestoDoc[];
  alertConfig: AlertConfig;
  nextCaixaNumber: number;
  aiMemorySpreadsheetId?: string;
  tombstones: Tombstone[];
  outbox: OutboxOperation[];
}

const STORAGE_DIR = path.resolve(process.cwd(), "storage");
const PHOTOS_DIR = path.resolve(STORAGE_DIR, "photos");
const DB_FILE = path.resolve(STORAGE_DIR, "db.json");

export class StorageEngine {
  private db: DatabaseSchema = {
    devices: [],
    batches: [],
    products: [],
    physicalUnits: [],
    photos: [],
    logs: [],
    manifestos: [],
    alertConfig: {
      telegramBotToken: "",
      telegramChatId: "",
      whatsappNumber: "",
      webhookUrl: "",
      alertarNaDivergencia: true,
      alertarEmAvaria: true,
      alertarAoConcluirCaixa: true,
    },
    nextCaixaNumber: 1,
    tombstones: [],
    outbox: [],
  };

  constructor() {
    this.init();
  }

  private init() {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    if (!fs.existsSync(PHOTOS_DIR)) {
      fs.mkdirSync(PHOTOS_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const loaded = JSON.parse(raw);
        this.db = {
          ...this.db,
          ...loaded,
          manifestos: (loaded.manifestos || []).filter((m: any) => m.id !== "MANIF-INICIAL" && m.nfe !== "NF-105423"),
          alertConfig: loaded.alertConfig || this.db.alertConfig,
          physicalUnits: loaded.physicalUnits || [],
          tombstones: loaded.tombstones || [],
          outbox: loaded.outbox || [],
        };
      } catch (err) {
        console.error("Erro ao carregar banco de dados local:", err);
      }
    } else {
      // Seed inicial de estação e lote de demonstração
      const defaultDevice = "DEV-A1";
      const dateStr = new Date().toISOString().slice(0, 10);
      const initialLote = `LOTE-${dateStr}-001`;
      const initialCaixa = 1;

      this.db.devices.push({
        id: defaultDevice,
        name: "Estação Principal A1",
        lastActive: new Date().toISOString(),
        currentCaixa: initialCaixa,
      });
      this.db.nextCaixaNumber = 2;

      const batch: Batch = {
        id: initialLote,
        deviceId: defaultDevice,
        caixa: initialCaixa,
        status: "ABERTO",
        createdAt: new Date().toISOString(),
        totalPhotos: 2,
        processedPhotos: 2,
        pendingPhotos: 0,
        errorPhotos: 0,
        qrCode: `CX-001-${initialLote}`,
      };
      this.db.batches.push(batch);

      const loteFolder = path.join(PHOTOS_DIR, "LOTES", initialLote);
      if (!fs.existsSync(loteFolder)) {
        fs.mkdirSync(loteFolder, { recursive: true });
      }

      const photo1Id = `FOTO-DEMO-01`;
      const p1File = `${photo1Id}.svg`;
      const createSvgImg = (title: string, sub: string, color: string) => {
        return Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
            <rect width="800" height="600" fill="#18181b"/>
            <rect x="40" y="40" width="720" height="520" rx="16" fill="#09090b" stroke="#3f3f46" stroke-width="4"/>
            <circle cx="400" cy="220" r="80" fill="${color}" opacity="0.15"/>
            <text x="400" y="230" font-family="monospace" font-size="28" fill="${color}" font-weight="bold" text-anchor="middle">${title}</text>
            <text x="400" y="320" font-family="monospace" font-size="18" fill="#a1a1aa" text-anchor="middle">${sub}</text>
            <text x="400" y="370" font-family="monospace" font-size="14" fill="#71717a" text-anchor="middle">LOTE ${initialLote} | CAIXA ${initialCaixa}</text>
          </svg>`
        );
      };
      fs.writeFileSync(path.join(loteFolder, p1File), createSvgImg("FONE JBL TUNE 510BT", "EVIDÊNCIA MULTI-ITEM (NOVO/LACRADO)", "#10b981"));

      this.db.photos.push({
        id: photo1Id,
        filename: p1File,
        originalName: "fone_jbl_lote.jpg",
        mimeType: "image/svg+xml",
        size: 1024,
        url: `/api/photos/${photo1Id}`,
        loteId: initialLote,
        deviceId: defaultDevice,
        caixa: initialCaixa,
        associatedProductId: "PROD-DEMO-01",
        isOrphan: false,
        uploadedAt: new Date().toISOString(),
        status: "ASSOCIADO",
      });

      this.db.products.push({
        id: "PROD-DEMO-01",
        modelo: "Fone Bluetooth JBL Tune 510BT Preto",
        marca: "JBL",
        serialImei: "JBL510BT98214",
        serial: "JBL510BT98214",
        ean: "6925281987518",
        qtde: 5, // Exemplo de detecção de múltiplos itens
        data: dateStr,
        qtdDia: 5,
        caixa: initialCaixa,
        nfe: "",
        linkFoto: "LINK",
        photoIds: [photo1Id],
        deviceId: defaultDevice,
        loteId: initialLote,
        status: "VALIDADO",
        confidence: { modelo: 0.99, serial: 0.95, imei: 0.9, ean: 0.98 },
        estadoFisico: "NOVO_LACRADO",
        categoria: "fone",
        descricaoAvaria: "Lacrado de fábrica",
        caracteristicas: ["Bluetooth 5.0", "Bateria 40h", "Pure Bass"],
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      });

      this.db.logs.push({
        id: "LOG-INIT-1",
        timestamp: new Date().toISOString(),
        deviceId: defaultDevice,
        loteId: initialLote,
        tipo: "LOTE_INICIADO",
        detalhes: `Sistema inicializado. Caixa 1 vinculada ao lote ${initialLote}.`,
      });

      this.save();
    }
  }

  private save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.db, null, 2), "utf-8");
    } catch (err) {
      console.error("Erro ao salvar banco de dados:", err);
    }
  }

  // --- Devices & Operadores Unificados ---
  getDevices() {
    if (this.db.devices.length === 0) {
      this.getOrCreateDevice("Carlos Silveira", "Carlos Silveira (Operador Principal)");
    }
    return this.db.devices;
  }

  getOperators() {
    return this.getDevices();
  }

  getOrCreateDevice(deviceId: DeviceId, name?: string) {
    const clean = (deviceId || "Carlos Silveira").trim();
    let device = this.db.devices.find(
      (d) =>
        d.id.toLowerCase() === clean.toLowerCase() ||
        d.name.toLowerCase() === clean.toLowerCase()
    );
    if (!device) {
      device = {
        id: clean,
        name: name || clean,
        lastActive: new Date().toISOString(),
        currentCaixa: this.db.nextCaixaNumber++,
      };
      this.db.devices.push(device);
      this.save();
    } else {
      if (name && device.name !== name && !device.name.includes(name)) {
        device.name = name;
      }
      device.lastActive = new Date().toISOString();
      this.save();
    }
    return device;
  }

  // --- Batches (Lotes) & Caixas Congeladas ---
  getBatches(deviceId?: DeviceId, spreadsheetId?: string): Batch[] {
    let list = this.db.batches;
    if (spreadsheetId) {
      list = list.filter((b) => b.spreadsheetId === spreadsheetId);
    }
    if (deviceId) {
      const clean = deviceId.trim().toLowerCase();
      list = list.filter(
        (b) => b.deviceId.toLowerCase() === clean || b.deviceId === deviceId
      );
    }
    return list;
  }

  clearAllProducts() {
    this.db.products = [];
    this.db.photos = [];
    this.save();
    return true;
  }

  getBatch(loteId: LoteId): Batch | undefined {
    return this.db.batches.find((b) => b.id === loteId);
  }

  getActiveBatch(deviceId: DeviceId, spreadsheetId?: string): Batch {
    const clean = (deviceId || "Carlos Silveira").trim();
    const device = this.getOrCreateDevice(clean);
    const targetId = device.id;

    // Busca lote aberto para este operador e planilha
    const openBatch = this.db.batches.find(
      (b) =>
        (!spreadsheetId || b.spreadsheetId === spreadsheetId) &&
        (b.deviceId === targetId ||
          b.deviceId.toLowerCase() === clean.toLowerCase() ||
          b.deviceId.toLowerCase() === targetId.toLowerCase()) &&
        b.status !== "CONCLUIDO"
    );
    if (openBatch) return openBatch;
    return this.createNewBatch(targetId, undefined, undefined, spreadsheetId);
  }

  createNewBatch(deviceId: DeviceId, forcedCaixa?: number, customLoteId?: string, spreadsheetId?: string): Batch {
    const device = this.getOrCreateDevice(deviceId);
    const dateStr = new Date().toISOString().slice(0, 10);
    const deviceBatchesToday = this.db.batches.filter(
      (b) => b.deviceId === deviceId && b.id.includes(dateStr) && (!spreadsheetId || b.spreadsheetId === spreadsheetId)
    );
    const batchSeq = String(deviceBatchesToday.length + 1).padStart(3, "0");
    const loteId = customLoteId && customLoteId.trim() ? customLoteId.trim() : `LOTE-${dateStr}-${batchSeq}`;

    let caixa = forcedCaixa ?? device.currentCaixa;
    if (!caixa || isNaN(caixa)) {
      caixa = this.db.nextCaixaNumber++;
      device.currentCaixa = caixa;
    }

    const qrCode = `CX-${String(caixa).padStart(3, "0")}-${loteId}`;

    const newBatch: Batch = {
      id: loteId,
      deviceId,
      caixa,
      status: "ABERTO",
      createdAt: new Date().toISOString(),
      totalPhotos: 0,
      processedPhotos: 0,
      pendingPhotos: 0,
      errorPhotos: 0,
      qrCode,
      spreadsheetId,
    };

    this.db.batches.unshift(newBatch);

    this.addLog({
      deviceId,
      loteId,
      tipo: "LOTE_INICIADO",
      detalhes: `Novo lote ${loteId} iniciado com Caixa ${caixa} congelada. QR Code: ${qrCode}`,
    });

    this.save();
    return newBatch;
  }

  updateBatch(batch: Batch) {
    const idx = this.db.batches.findIndex((b) => b.id === batch.id);
    if (idx !== -1) {
      this.db.batches[idx] = { ...batch };
      this.save();
    }
  }

  // --- Photos Storage ---
  getPhotosDir(): string {
    return PHOTOS_DIR;
  }

  savePhotoFile(
    loteId: string,
    photoId: string,
    filename: string,
    buffer: Buffer
  ): string {
    const loteFolder = path.join(PHOTOS_DIR, "LOTES", loteId);
    if (!fs.existsSync(loteFolder)) {
      fs.mkdirSync(loteFolder, { recursive: true });
    }
    const ext = path.extname(filename) || ".jpg";
    const finalFilename = `${photoId}${ext}`;
    const filePath = path.join(loteFolder, finalFilename);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  getPhotos(loteId?: LoteId, deviceId?: DeviceId, spreadsheetId?: string): StoredPhoto[] {
    let list = this.db.photos;
    if (spreadsheetId) {
      list = list.filter((p) => p.spreadsheetId === spreadsheetId);
    }
    if (deviceId) {
      const clean = deviceId.trim().toLowerCase();
      list = list.filter((p) => p.deviceId.toLowerCase() === clean || p.deviceId === deviceId);
    }
    if (loteId) {
      list = list.filter((p) => p.loteId === loteId);
    }
    return list;
  }

  getPhoto(id: string): StoredPhoto | undefined {
    return this.db.photos.find((p) => p.id === id);
  }

  addPhotos(photos: StoredPhoto[]) {
    this.db.photos.push(...photos);
    this.save();
  }

  updatePhoto(photo: StoredPhoto) {
    const idx = this.db.photos.findIndex((p) => p.id === photo.id);
    if (idx !== -1) {
      this.db.photos[idx] = { ...photo };
      this.save();
    }
  }

  // --- Batches & Lots ---
  syncSpreadsheetProducts(products: ProductItem[], spreadsheetId?: string) {
    if (spreadsheetId) {
      // Isolar e limpar somente os dados deste spreadsheetId para evitar contaminação (Requisito 4)
      this.db.products = this.db.products.filter(p => p.spreadsheetId !== spreadsheetId);
      products.forEach(p => {
        p.spreadsheetId = spreadsheetId;
      });
      this.db.products.push(...products);
    } else {
      this.db.products = products;
    }

    if (products.length === 0 && !spreadsheetId) {
      this.db.batches = [];
      this.db.logs = [];
    } else {
      const lotesSet = new Set(products.map((p) => p.loteId).filter(Boolean));
      lotesSet.forEach((loteId) => {
        if (!this.db.batches.some((b) => b.id === loteId && b.spreadsheetId === spreadsheetId)) {
          this.db.batches.push({
            id: loteId,
            deviceId: "Carlos Silveira",
            caixa: 1,
            status: "ABERTO",
            createdAt: new Date().toISOString(),
            totalPhotos: 0,
            processedPhotos: products.filter((p) => p.loteId === loteId).length,
            pendingPhotos: 0,
            errorPhotos: 0,
            qrCode: `CX-001-${loteId}`,
            spreadsheetId,
          });
        }
      });
    }
    this.save();
  }

  syncSpreadsheetBatches(batches: Batch[], spreadsheetId?: string) {
    if (!batches) batches = [];

    if (spreadsheetId) {
      // Identificar os lotes removidos para ESTE spreadsheetId para reconciliação completa (Requisito 14)
      const activeBatchIds = new Set(batches.map(b => b.id));
      const deletedBatchIds: string[] = [];

      this.db.batches.forEach(b => {
        if (b.spreadsheetId === spreadsheetId && !activeBatchIds.has(b.id)) {
          deletedBatchIds.push(b.id);
        }
      });

      if (deletedBatchIds.length > 0) {
        // Remover lotes
        this.db.batches = this.db.batches.filter(b => b.spreadsheetId !== spreadsheetId || !deletedBatchIds.includes(b.id));
        // Desvincular produtos sem deletar (Requisito 12)
        this.db.products.forEach(p => {
          if (p.spreadsheetId === spreadsheetId && p.loteId && deletedBatchIds.includes(p.loteId)) {
            p.loteId = "";
          }
        });
      }

      // Adicionar/Atualizar
      batches.forEach((b) => {
        b.spreadsheetId = spreadsheetId;
        const idx = this.db.batches.findIndex((existing) => existing.id === b.id && existing.spreadsheetId === spreadsheetId);
        if (idx !== -1) {
          this.db.batches[idx] = { ...this.db.batches[idx], ...b };
        } else {
          this.db.batches.push(b);
        }
      });
    } else {
      this.db.batches = batches;
    }
    this.save();
  }

  syncSpreadsheetManifestos(manifestos: ManifestoDoc[], spreadsheetId?: string) {
    if (!manifestos) manifestos = [];

    if (spreadsheetId) {
      // Identificar as Notas Fiscais removidas para ESTE spreadsheetId para reconciliação completa
      const activeNfes = new Set(manifestos.map(m => m.nfe));
      const deletedNfes: string[] = [];

      this.db.manifestos.forEach(m => {
        if (m.spreadsheetId === spreadsheetId && !activeNfes.has(m.nfe)) {
          deletedNfes.push(m.nfe);
        }
      });

      if (deletedNfes.length > 0) {
        // Remover Notas Fiscais
        this.db.manifestos = this.db.manifestos.filter(m => m.spreadsheetId !== spreadsheetId || !deletedNfes.includes(m.nfe));
        // Desvincular produtos sem deletar (Requisito 12)
        this.db.products.forEach(p => {
          if (p.spreadsheetId === spreadsheetId && p.nfe && deletedNfes.includes(p.nfe)) {
            p.nfe = "";
          }
        });
      }

      manifestos.forEach((m) => {
        m.spreadsheetId = spreadsheetId;
        const idx = this.db.manifestos.findIndex((existing) => (existing.id === m.id || existing.nfe === m.nfe) && existing.spreadsheetId === spreadsheetId);
        if (idx !== -1) {
          this.db.manifestos[idx] = { ...this.db.manifestos[idx], ...m };
        } else {
          this.db.manifestos.push(m);
        }
      });
    } else {
      this.db.manifestos = manifestos;
    }
    this.save();
  }

  syncSpreadsheetPhotos(photos: StoredPhoto[], spreadsheetId?: string) {
    if (!photos) photos = [];
    if (spreadsheetId) {
      this.db.photos = this.db.photos.filter(p => p.spreadsheetId !== spreadsheetId);
      photos.forEach(p => {
        p.spreadsheetId = spreadsheetId;
      });
      this.db.photos.push(...photos);
    } else {
      this.db.photos = photos;
    }
    this.save();
  }

  syncSpreadsheetLogs(logs: AuditLog[], spreadsheetId?: string) {
    if (!logs) logs = [];
    if (spreadsheetId) {
      this.db.logs = this.db.logs.filter(l => l.spreadsheetId !== spreadsheetId);
      logs.forEach(l => {
        l.spreadsheetId = spreadsheetId;
      });
      this.db.logs.push(...logs);
    } else {
      this.db.logs = logs;
    }
    this.save();
  }

  syncSpreadsheetResumos(resumos: ResumoCaixa[], spreadsheetId?: string) {
    if (!resumos) return;
    if (spreadsheetId) {
      const activeCaixas = new Set(resumos.map(r => r.caixa));
      const deletedCaixas: number[] = [];

      const existingCaixas = new Set([
        ...this.db.batches.filter(b => b.spreadsheetId === spreadsheetId).map(b => b.caixa),
        ...this.db.products.filter(p => p.spreadsheetId === spreadsheetId).map(p => p.caixa).filter(Boolean) as number[]
      ]);

      existingCaixas.forEach(c => {
        if (!activeCaixas.has(c)) {
          deletedCaixas.push(c);
        }
      });

      if (deletedCaixas.length > 0) {
        // Remover batches correspondentes às caixas deletadas
        this.db.batches = this.db.batches.filter(b => b.spreadsheetId !== spreadsheetId || !deletedCaixas.includes(b.caixa));
        // Desvincular produtos sem deletar (Requisito 12)
        this.db.products.forEach(p => {
          if (p.spreadsheetId === spreadsheetId && p.caixa && deletedCaixas.includes(p.caixa)) {
            p.caixa = undefined;
          }
        });
      }
    }
    this.save();
  }

  // --- RECONCILIAÇÃO CENTRAL DO SYNC ENGINE (MANDATO TÉCNICO - SEÇÕES 4, 6, 14 & 15) ---
  reconcileSpreadsheetData(
    spreadsheetIdOrPayload:
      | string
      | {
          spreadsheetId: string;
          products?: ProductItem[];
          batches?: Batch[];
          resumos?: ResumoCaixa[];
          manifestos?: ManifestoDoc[];
          photos?: StoredPhoto[];
          logs?: AuditLog[];
          tombstones?: Tombstone[];
        },
    maybePayload?: {
      spreadsheetId?: string;
      products?: ProductItem[];
      batches?: Batch[];
      resumos?: ResumoCaixa[];
      manifestos?: ManifestoDoc[];
      photos?: StoredPhoto[];
      logs?: AuditLog[];
      tombstones?: Tombstone[];
    }
  ) {
    const payload: {
      spreadsheetId: string;
      products?: ProductItem[];
      batches?: Batch[];
      resumos?: ResumoCaixa[];
      manifestos?: ManifestoDoc[];
      photos?: StoredPhoto[];
      logs?: AuditLog[];
      tombstones?: Tombstone[];
    } =
      typeof spreadsheetIdOrPayload === "string"
        ? { ...(maybePayload || {}), spreadsheetId: spreadsheetIdOrPayload }
        : spreadsheetIdOrPayload;

    const { spreadsheetId } = payload;
    if (!spreadsheetId) return;

    // 1. Tombstones anti-ressurreição (Seção 15)
    if (Array.isArray(payload.tombstones)) {
      this.db.tombstones = [
        ...(this.db.tombstones || []).filter((t) => t.spreadsheetId !== spreadsheetId),
        ...payload.tombstones,
      ];
    }

    // 2. Substituição 100% determinística de produtos desta planilha
    // Preserva produtos locais legítimos pendentes de envio no Outbox (Seções 33, 34 & 35)
    if (Array.isArray(payload.products)) {
      const pendingLocalProducts = this.db.products.filter((p) => {
        if (p.spreadsheetId !== spreadsheetId) return false;
        return (this.db.outbox || []).some(
          (op) => op.spreadsheetId === spreadsheetId && op.entityId === p.id && op.status === "PENDING"
        );
      });

      this.db.products = this.db.products.filter((p) => p.spreadsheetId !== spreadsheetId);

      payload.products.forEach((p) => {
        // Se houver tombstones ativos para esta planilha e o produto estiver na lista de tombstones, bloqueia
        if (this.isTombstoned(spreadsheetId, p.serial || p.serialImei, p.imei, p.id)) {
          if (!Array.isArray(payload.tombstones)) {
            // Se foi reinserido diretamente sem tombstones ativos no payload, remove tombstone obsoleto
            this.db.tombstones = (this.db.tombstones || []).filter(
              (t) =>
                !(
                  t.spreadsheetId === spreadsheetId &&
                  (t.entityId === p.id ||
                    (p.serial && t.serial === p.serial) ||
                    (p.imei && t.imei === p.imei) ||
                    (p.serialImei && t.serial === p.serialImei))
                )
            );
          } else {
            return;
          }
        }
        p.spreadsheetId = spreadsheetId;
        this.db.products.push(p);
      });

      // Preservar alterações locais legítimas ainda não gravadas no remoto (Seção 35)
      for (const pending of pendingLocalProducts) {
        if (!this.db.products.some((p) => p.id === pending.id)) {
          this.db.products.push(pending);
        }
      }
    }

    // 3. Lotes
    if (Array.isArray(payload.batches)) {
      this.db.batches = this.db.batches.filter((b) => b.spreadsheetId !== spreadsheetId);
      payload.batches.forEach((b) => {
        b.spreadsheetId = spreadsheetId;
        this.db.batches.push(b);
      });
    }

    // 4. Manifestos
    if (Array.isArray(payload.manifestos)) {
      this.db.manifestos = this.db.manifestos.filter((m) => m.spreadsheetId !== spreadsheetId);
      payload.manifestos.forEach((m) => {
        m.spreadsheetId = spreadsheetId;
        this.db.manifestos.push(m);
      });
    }

    // 5. Fotos
    if (Array.isArray(payload.photos)) {
      this.db.photos = this.db.photos.filter((ph) => ph.spreadsheetId !== spreadsheetId);
      payload.photos.forEach((ph) => {
        ph.spreadsheetId = spreadsheetId;
        this.db.photos.push(ph);
      });
    }

    this.save();
  }

  // Isolar contexto ao trocar de planilha (Seção 6)
  isolateSpreadsheetContext(spreadsheetId: string) {
    if (!spreadsheetId) return;
    this.save();
  }

  // Verifica se um serial ou IMEI foi tombstoned para esta planilha
  isTombstoned(spreadsheetId?: string, serial?: string, imei?: string, entityId?: string): boolean {
    if (!spreadsheetId || !this.db.tombstones) return false;
    const cleanSerial = (serial || "").trim().toUpperCase();
    const cleanImei = (imei || "").trim();
    const cleanEntityId = (entityId || "").trim();

    return this.db.tombstones.some((t) => {
      if (t.spreadsheetId !== spreadsheetId) return false;
      if (cleanEntityId && t.entityId === cleanEntityId) return true;
      if (cleanSerial && ((t.serial && t.serial.toUpperCase() === cleanSerial) || t.entityId.toUpperCase().includes(cleanSerial))) return true;
      if (cleanImei && ((t.imei && t.imei === cleanImei) || t.entityId.includes(cleanImei))) return true;
      return false;
    });
  }

  getTombstones(spreadsheetId?: string): Tombstone[] {
    if (!spreadsheetId) return this.db.tombstones || [];
    return (this.db.tombstones || []).filter((t) => t.spreadsheetId === spreadsheetId);
  }

  // --- MÉTODOS DE FILA OUTBOX (SEÇÃO 35 & 36) ---
  enqueueOutbox(
    spreadsheetId: string,
    entityType: "PRODUCT" | "BATCH" | "MANIFESTO" | "BOX" | "PHOTO",
    entityId: string,
    operation: "CREATE" | "UPDATE" | "DELETE",
    payload: any
  ) {
    if (!spreadsheetId) return;
    this.db.outbox = this.db.outbox || [];
    const existingIdx = this.db.outbox.findIndex(
      (op) => op.spreadsheetId === spreadsheetId && op.entityId === entityId && op.status === "PENDING"
    );
    const opId = `OUTBOX_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const op: OutboxOperation = {
      id: opId,
      operationId: opId,
      spreadsheetId,
      entityType,
      entityId,
      operation,
      payload,
      version: payload?.version || 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      attempts: 0,
      status: "PENDING",
      idempotencyKey: `${spreadsheetId}:${entityType}:${entityId}:${operation}:${payload?.version || 1}`,
    };
    if (existingIdx >= 0) {
      this.db.outbox[existingIdx] = op;
    } else {
      this.db.outbox.push(op);
    }
    this.save();
  }

  getOutbox(spreadsheetId?: string): OutboxOperation[] {
    if (!spreadsheetId) return this.db.outbox || [];
    return (this.db.outbox || []).filter((op) => op.spreadsheetId === spreadsheetId);
  }

  clearOutboxOperation(operationId: string) {
    this.db.outbox = (this.db.outbox || []).filter((op) => op.id !== operationId && op.operationId !== operationId);
    this.save();
  }

  renameLot(oldId: string, newId: string) {
    this.db.batches.forEach((b) => {
      if (b.id === oldId) {
        b.id = newId;
      }
    });
    this.db.products.forEach((p) => {
      if (p.loteId === oldId) {
        p.loteId = newId;
      }
    });
    this.db.logs.forEach((l) => {
      if (l.loteId === oldId) {
        l.loteId = newId;
      }
    });
    this.save();
  }

  getProducts(deviceId?: DeviceId, loteId?: LoteId, spreadsheetId?: string): ProductItem[] {
    let list = this.db.products;
    if (spreadsheetId) {
      list = list.filter((p) => p.spreadsheetId === spreadsheetId);
    }
    if (deviceId) {
      const clean = deviceId.trim().toLowerCase();
      list = list.filter((p) => p.deviceId.toLowerCase() === clean || p.deviceId === deviceId);
    }
    if (loteId) {
      list = list.filter((p) => p.loteId === loteId);
    }
    return list;
  }

  getProduct(id: string): ProductItem | undefined {
    return this.db.products.find((p) => p.id === id);
  }

  findDuplicate(
    serial?: string,
    imei?: string,
    ean?: string,
    modelo?: string,
    spreadsheetId?: string,
    unitId?: string
  ): ProductItem | undefined {
    if (this.isTombstoned(spreadsheetId, serial, imei, unitId)) {
      return undefined;
    }

    const scopedProducts = spreadsheetId
      ? this.db.products.filter((p) => p.spreadsheetId === spreadsheetId)
      : this.db.products;

    // 1. Vínculo por ID permanente da Unidade Física (Seção 12 & 13)
    if (unitId && unitId.trim().length > 0) {
      const match = scopedProducts.find((p) => p.unitId === unitId.trim());
      if (match) return match;
    }

    // 2. Vínculo por Serial / Service Tag individual (Seção 3 & 4)
    if (serial && serial.trim().length > 3) {
      const cleanSerial = serial.trim().toUpperCase();
      const match = scopedProducts.find(
        (p) =>
          (p.serial && p.serial.toUpperCase() === cleanSerial) ||
          (p.serviceTag && p.serviceTag.toUpperCase() === cleanSerial) ||
          (p.serialImei && p.serialImei.toUpperCase() === cleanSerial)
      );
      if (match) return match;
    }

    // 3. Vínculo por IMEI
    if (imei && imei.trim().length > 5) {
      const cleanImei = imei.trim();
      const match = scopedProducts.find(
        (p) =>
          (p.imei && p.imei === cleanImei) ||
          (p.serialImei && p.serialImei.includes(cleanImei))
      );
      if (match) return match;
    }

    // Seção 1, 4 & 5: REGRAS FUNDAMENTAIS:
    // Modelo igual NÃO significa unidade igual! EAN igual NÃO significa unidade igual!
    // Se o produto possui unitId explícito ou identificador físico, NUNCA mesclar por mero Modelo + EAN!
    if (
      !unitId &&
      !serial &&
      !imei &&
      ean &&
      ean.trim().length > 6 &&
      modelo &&
      modelo.trim().length > 5
    ) {
      const match = scopedProducts.find(
        (p) =>
          !p.serial &&
          !p.imei &&
          !p.serviceTag &&
          p.ean === ean.trim() &&
          p.modelo.toLowerCase().trim() === modelo.toLowerCase().trim()
      );
      if (match) return match;
    }

    return undefined;
  }

  upsertProduct(
    productData: Omit<ProductItem, "id" | "qtdDia" | "criadoEm" | "atualizadoEm"> & {
      id?: string;
    }
  ): { product: ProductItem; isUpdate: boolean } {
    const existing = productData.id
      ? this.getProduct(productData.id)
      : this.findDuplicate(
          productData.serial || productData.serviceTag,
          productData.imei,
          productData.ean,
          productData.modelo,
          productData.spreadsheetId,
          productData.unitId
        );

    const now = new Date().toISOString();
    const dateStr = productData.data || now.slice(0, 10);

    if (existing) {
      const mergedPhotos = Array.from(
        new Set([...existing.photoIds, ...(productData.photoIds || [])])
      );

      existing.modelo = productData.modelo || existing.modelo;
      existing.serial = productData.serial || existing.serial;
      existing.serviceTag = productData.serviceTag || existing.serviceTag || (existing.serial && /^[A-Z0-9]{7}$/.test(existing.serial) ? existing.serial : undefined);
      existing.imei = productData.imei || existing.imei;
      existing.serialImei =
        existing.serial || existing.serviceTag || existing.imei || productData.serialImei || existing.serialImei;
      if (productData.ean && !existing.ean) {
        existing.ean = productData.ean;
      }
      if (productData.partNumber && !existing.partNumber) {
        existing.partNumber = productData.partNumber;
      }
      if (productData.orderNumber && !existing.orderNumber) {
        existing.orderNumber = productData.orderNumber;
      }
      if (productData.custPo && !existing.custPo) {
        existing.custPo = productData.custPo;
      }
      if (productData.unitId && !existing.unitId) {
        existing.unitId = productData.unitId;
      }
      if (productData.skuId && !existing.skuId) {
        existing.skuId = productData.skuId;
      }
      if (productData.associationAudit) {
        existing.associationAudit = productData.associationAudit;
      }
      if (productData.confidence) {
        existing.confidence = { ...existing.confidence, ...productData.confidence };
      }
      if (productData.hasPhysicalIdentifier !== undefined) {
        existing.hasPhysicalIdentifier = productData.hasPhysicalIdentifier;
      }

      existing.photoIds = mergedPhotos;
      existing.status = "ATUALIZADO";
      existing.atualizadoEm = now;
      existing.version = (existing.version || 1) + 1;
      if (productData.spreadsheetId && !existing.spreadsheetId) {
        existing.spreadsheetId = productData.spreadsheetId;
      }
      if (productData.nfe && !existing.nfe) {
        existing.nfe = productData.nfe;
      }
      if (productData.estadoFisico && productData.estadoFisico !== "NOVO_LACRADO") {
        existing.estadoFisico = productData.estadoFisico;
        existing.descricaoAvaria = productData.descricaoAvaria || existing.descricaoAvaria;
      }

      // Sincronizar unidade física
      if (existing.unitId) {
        this.upsertPhysicalUnit({
          unitId: existing.unitId,
          skuId: existing.skuId,
          productId: existing.id,
          brand: existing.marca || "",
          model: existing.modelo,
          serial: existing.serial,
          serviceTag: existing.serviceTag,
          imei: existing.imei,
          serialImei: existing.serialImei,
          ean: existing.ean,
          partNumber: existing.partNumber,
          orderNumber: existing.orderNumber,
          custPo: existing.custPo,
          photoIds: existing.photoIds,
          qtde: 1,
          caixa: existing.caixa,
          loteId: existing.loteId,
          status: "IDENTIFICADO",
          hasPhysicalIdentifier: !!(existing.serial || existing.serviceTag || existing.imei),
          confidence: {
            modelo: existing.confidence?.modelo ?? 0.8,
            serial: existing.confidence?.serial ?? 0.8,
            imei: existing.confidence?.imei ?? 0.8,
            ean: existing.confidence?.ean ?? 0.8,
            identityMatch: existing.confidence?.identityMatch ?? 1.0,
            overall: existing.confidence?.overall ?? 0.85,
          },
          associationAudit: existing.associationAudit,
          spreadsheetId: existing.spreadsheetId,
        });
      }

      this.addLog({
        deviceId: productData.deviceId,
        loteId: productData.loteId,
        tipo: "DEDUPLICACAO",
        detalhes: `Produto existente atualizado com novas evidências (Serial/IMEI: ${existing.serialImei}, Unidade: ${existing.unitId || "N/A"}). Linha única preservada.`,
        productId: existing.id,
      });

      // Enfileirar no Outbox para escrita segura no Google Sheets (Seção 36)
      if (existing.spreadsheetId) {
        this.enqueueOutbox(existing.spreadsheetId, "PRODUCT", existing.id, "UPDATE", existing);
      }

      this.save();
      return { product: existing, isUpdate: true };
    }

    // NOVO REGISTRO
    const id = `PROD-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    
    const dailyCount =
      this.db.products.filter(
        (p) => (!productData.spreadsheetId || p.spreadsheetId === productData.spreadsheetId) && p.caixa === productData.caixa
      ).length + 1;

    const unitId =
      productData.unitId ||
      (productData.serviceTag ? `UNIT_${productData.serviceTag}` : productData.serial ? `UNIT_${productData.serial}` : `UNIT_${id}`);

    const skuId =
      productData.skuId ||
      (productData.marca && productData.modelo
        ? `SKU_${productData.marca}_${productData.modelo}_${productData.ean || "NOEAN"}`.replace(/[^A-Za-z0-9_-]/g, "")
        : undefined);

    const hasPhysicalIdentifier =
      productData.hasPhysicalIdentifier !== undefined
        ? productData.hasPhysicalIdentifier
        : !!(productData.serial || productData.serviceTag || productData.imei);

    const newProduct: ProductItem = {
      ...productData,
      id,
      unitId,
      skuId,
      hasPhysicalIdentifier,
      serviceTag: productData.serviceTag || (productData.serial && /^[A-Z0-9]{7}$/.test(productData.serial) ? productData.serial : undefined),
      spreadsheetId: productData.spreadsheetId,
      version: 1,
      qtdCaixa: dailyCount,
      qtdDia: dailyCount,
      qtde: Math.max(1, productData.qtde || 1),
      estadoFisico: productData.estadoFisico || "NOVO_LACRADO",
      descricaoAvaria: productData.descricaoAvaria || "",
      categoria: productData.categoria || "outro",
      digitadoManualmente: productData.digitadoManualmente || false,
      criadoEm: now,
      atualizadoEm: now,
    };

    this.db.products.unshift(newProduct);

    // Persistir como Unidade Física individual (Seção 2, 12 & 13)
    this.upsertPhysicalUnit({
      unitId,
      skuId,
      productId: id,
      brand: newProduct.marca || "",
      model: newProduct.modelo,
      serial: newProduct.serial,
      serviceTag: newProduct.serviceTag,
      imei: newProduct.imei,
      serialImei: newProduct.serialImei,
      ean: newProduct.ean,
      partNumber: newProduct.partNumber,
      orderNumber: newProduct.orderNumber,
      custPo: newProduct.custPo,
      photoIds: newProduct.photoIds || [],
      qtde: 1, // Cada unidade física individual representa 1
      caixa: newProduct.caixa,
      loteId: newProduct.loteId,
      status: "IDENTIFICADO",
      hasPhysicalIdentifier,
      confidence: {
        modelo: newProduct.confidence?.modelo ?? 0.8,
        serial: newProduct.confidence?.serial ?? 0.8,
        imei: newProduct.confidence?.imei ?? 0.8,
        ean: newProduct.confidence?.ean ?? 0.8,
        identityMatch: newProduct.confidence?.identityMatch ?? 1.0,
        overall: newProduct.confidence?.overall ?? 0.85,
      },
      associationAudit: newProduct.associationAudit,
      spreadsheetId: newProduct.spreadsheetId,
    });

    this.addLog({
      deviceId: productData.deviceId,
      loteId: productData.loteId,
      tipo: "ENTRADA",
      detalhes: `Novo produto registrado: ${newProduct.modelo} | Unidade: ${unitId} | Qtde: ${newProduct.qtde} | Caixa: ${newProduct.caixa} | Estado: ${newProduct.estadoFisico}`,
      productId: id,
    });

    // Enfileirar no Outbox para envio seguro ao Google Sheets (Seção 36)
    if (newProduct.spreadsheetId) {
      this.enqueueOutbox(newProduct.spreadsheetId, "PRODUCT", newProduct.id, "CREATE", newProduct);
    }

    this.save();
    return { product: newProduct, isUpdate: false };
  }

  // --- CONSULTAS E OPERAÇÕES DE UNIDADES FÍSICAS (SEÇÃO 2, 12 & 13) ---
  getPhysicalUnits(loteId?: string, caixa?: number, spreadsheetId?: string): PhysicalUnit[] {
    return (this.db.physicalUnits || []).filter((u) => {
      if (spreadsheetId && u.spreadsheetId && u.spreadsheetId !== spreadsheetId) return false;
      if (loteId && u.loteId !== loteId) return false;
      if (caixa !== undefined && u.caixa !== caixa) return false;
      return true;
    });
  }

  getPhysicalUnit(unitId: string): PhysicalUnit | undefined {
    return (this.db.physicalUnits || []).find((u) => u.unitId === unitId);
  }

  upsertPhysicalUnit(unit: PhysicalUnit): PhysicalUnit {
    if (!this.db.physicalUnits) this.db.physicalUnits = [];
    const idx = this.db.physicalUnits.findIndex((u) => u.unitId === unit.unitId);
    if (idx >= 0) {
      this.db.physicalUnits[idx] = {
        ...this.db.physicalUnits[idx],
        ...unit,
        updatedAt: new Date().toISOString(),
      };
      this.save();
      return this.db.physicalUnits[idx];
    } else {
      const created = {
        ...unit,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.db.physicalUnits.push(created);
      this.save();
      return created;
    }
  }

  getSkuCatalog(spreadsheetId?: string): ProductSku[] {
    const products = this.getProducts(undefined, undefined, spreadsheetId);
    const map = new Map<string, ProductSku>();

    for (const p of products) {
      const skuKey = p.skuId || `SKU_${p.marca || "GEN"}_${p.modelo}_${p.ean || "NOEAN"}`;
      const existing = map.get(skuKey);
      if (existing) {
        existing.unidadesCount += p.qtde || 1;
      } else {
        map.set(skuKey, {
          skuId: skuKey,
          marca: p.marca || "",
          modelo: p.modelo,
          ean: p.ean || "",
          partNumber: p.partNumber,
          categoria: p.categoria,
          unidadesCount: p.qtde || 1,
        });
      }
    }

    return Array.from(map.values());
  }

  associatePhotoToUnit(
    photoId: string,
    unitId: string
  ): { success: boolean; photo: StoredPhoto; unit?: PhysicalUnit; product?: ProductItem } {
    const photo = this.getPhoto(photoId);
    if (!photo) throw new Error("Foto não encontrada");

    let unit = this.getPhysicalUnit(unitId);
    let product = this.db.products.find((p) => p.unitId === unitId || p.id === unitId);

    if (product) {
      if (!product.photoIds.includes(photoId)) {
        product.photoIds.push(photoId);
      }
      product.status = "ATUALIZADO";
      product.associationAudit = {
        resolvedAt: new Date().toISOString(),
        confidenceMatch: 1.0,
        reasons: ["✓ Foto associada manualmente pelo operador na interface"],
        criteria: "ASSOCIACAO_MANUAL_OPERADOR",
      };
      this.updateProductManual(product.id, product);
    }

    if (!unit && product) {
      unit = {
        unitId: product.unitId || `UNIT_${product.id}`,
        skuId: product.skuId,
        productId: product.id,
        brand: product.marca || "",
        model: product.modelo,
        serial: product.serial,
        serviceTag: product.serviceTag,
        imei: product.imei,
        serialImei: product.serialImei,
        ean: product.ean,
        photoIds: product.photoIds,
        qtde: 1,
        caixa: product.caixa,
        loteId: product.loteId,
        status: "VALIDADO",
        hasPhysicalIdentifier: !!product.hasPhysicalIdentifier,
        confidence: {
          modelo: 1,
          serial: 1,
          imei: 1,
          ean: 1,
          identityMatch: 1,
          overall: 1,
        },
        associationAudit: product.associationAudit,
      };
      this.upsertPhysicalUnit(unit);
    } else if (unit) {
      if (!unit.photoIds.includes(photoId)) {
        unit.photoIds.push(photoId);
      }
      unit.status = "VALIDADO";
      this.upsertPhysicalUnit(unit);
    }

    photo.status = "ASSOCIADO";
    photo.unitId = unitId;
    photo.associatedProductId = product ? product.id : null;
    photo.isOrphan = false;
    this.updatePhoto(photo);

    this.save();
    return { success: true, photo, unit, product };
  }

  updateProductManual(id: string, updates: Partial<ProductItem>): ProductItem | null {
    const product = this.getProduct(id);
    if (!product) return null;

    const origModelo = product.modelo;
    const origSerial = product.serial;
    const origEan = product.ean;

    Object.assign(product, updates);
    product.atualizadoEm = new Date().toISOString();

    // Aprendizado contínuo da IA a partir de correções manuais do operador
    if (updates.modelo || updates.serial || updates.ean) {
      AIKnowledgeEngine.getInstance().addCorrection({
        operatorId: product.deviceId || "Operador",
        tipo: updates.serial ? "SERIAL" : updates.ean ? "EAN" : "MODELO",
        original: { modelo: origModelo, serial: origSerial, ean: origEan },
        corrected: { modelo: product.modelo, serial: product.serial, ean: product.ean },
      });
    }

    this.addLog({
      deviceId: product.deviceId,
      loteId: product.loteId,
      tipo: "CORRECAO",
      detalhes: `Registro corrigido manualmente: ${Object.keys(updates).join(", ")}`,
      productId: id,
    });

    this.save();
    return product;
  }

  updatePhotoDriveUrls(map: Record<string, string>) {
    Object.entries(map).forEach(([photoId, driveUrl]) => {
      const photo = this.getPhoto(photoId);
      if (photo && driveUrl) {
        photo.driveUrl = driveUrl;
      }
    });
    this.save();
  }

  // Coleta de Lixo / Purge de fotos locais confirmadas no Google Drive (Seção 39)
  purgePhotoFile(photoId: string, driveUrl?: string): boolean {
    const photo = this.getPhoto(photoId);
    if (!photo) return false;

    if (driveUrl) {
      photo.driveUrl = driveUrl;
    }

    // Seção 39: Nunca expurgar foto antes da consolidação e associação
    if (!photo.driveUrl || (photo.status !== "ASSOCIADO" && photo.status !== "ILEGIVEL")) {
      this.save();
      return false;
    }

    photo.isPurged = true;

    try {
      const filePath = path.join(
        PHOTOS_DIR,
        "LOTES",
        photo.loteId,
        photo.filename
      );
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      this.save();
      return true;
    } catch (e) {
      console.warn(`Erro ao expurgar foto ${photoId}:`, e);
      return false;
    }
  }

  // --- Safe Orphan & Illegible Photos ---
  getOrphanPhotos(deviceId?: DeviceId): StoredPhoto[] {
    return this.db.photos.filter((p) => {
      const matchDevice = deviceId ? p.deviceId === deviceId : true;
      return matchDevice && (p.isOrphan || !p.associatedProductId) && p.status !== "ILEGIVEL";
    });
  }

  getIllegiblePhotos(deviceId?: DeviceId): StoredPhoto[] {
    return this.db.photos.filter((p) => {
      const matchDevice = deviceId ? p.deviceId === deviceId : true;
      return matchDevice && p.status === "ILEGIVEL";
    });
  }

  resolveIllegiblePhoto(
    photoId: string,
    manualData: {
      modelo: string;
      serial?: string;
      imei?: string;
      ean?: string;
      qtde?: number;
      caixa?: number;
      estadoFisico?: EstadoFisico;
      descricaoAvaria?: string;
      categoria?: string;
    }
  ): { product: ProductItem; photo: StoredPhoto } {
    const photo = this.getPhoto(photoId);
    if (!photo) throw new Error("Foto não encontrada");

    const batch = photo.loteId ? this.getBatch(photo.loteId) : undefined;
    const caixa = manualData.caixa || photo.caixa || batch?.caixa || 1;
    const serialImei = manualData.serial || manualData.imei || "MANUAL-" + Date.now().toString().slice(-6);

    const { product } = this.upsertProduct({
      modelo: manualData.modelo,
      marca: "Manual",
      serial: manualData.serial,
      imei: manualData.imei,
      serialImei,
      ean: manualData.ean || "",
      qtde: manualData.qtde || 1,
      data: new Date().toISOString().slice(0, 10),
      caixa,
      nfe: "",
      linkFoto: "LINK",
      photoIds: [photoId],
      deviceId: photo.deviceId,
      loteId: photo.loteId,
      status: "DIGITADO_MANUALMENTE",
      confidence: { modelo: 1.0, serial: 1.0, imei: 1.0, ean: 1.0 },
      estadoFisico: manualData.estadoFisico || "NOVO_LACRADO",
      descricaoAvaria: manualData.descricaoAvaria || "Validação manual",
      categoria: manualData.categoria || "outro",
      digitadoManualmente: true,
    });

    photo.status = "ASSOCIADO";
    photo.associatedProductId = product.id;
    this.updatePhoto(photo);

    // Registra aprendizado na base de conhecimento da IA
    AIKnowledgeEngine.getInstance().addCorrection({
      operatorId: photo.deviceId || "Operador",
      tipo: "GERAL",
      original: { modelo: "Foto Ilegível / Não Identificado Automaticamente" },
      corrected: {
        modelo: manualData.modelo,
        serial: manualData.serial,
        ean: manualData.ean,
        estadoFisico: manualData.estadoFisico,
      },
      nota: `Resolução manual da foto ${photoId}`,
    });

    this.addLog({
      deviceId: photo.deviceId,
      loteId: photo.loteId,
      tipo: "DIGITACAO_MANUAL",
      detalhes: `Foto ilegível resolvida manualmente: ${product.modelo} cadastrado para a Caixa ${caixa}`,
      productId: product.id,
      photoId,
    });

    return { product, photo };
  }

  associatePhotoToProduct(photoId: string, productId: string) {
    const photo = this.getPhoto(photoId);
    const product = this.getProduct(productId);
    if (!photo || !product) return false;

    photo.associatedProductId = productId;
    photo.isOrphan = false;
    photo.status = "ASSOCIADO";

    if (!product.photoIds.includes(photoId)) {
      product.photoIds.push(photoId);
    }

    this.addLog({
      deviceId: photo.deviceId,
      loteId: photo.loteId,
      tipo: "ASSOCIACAO_FOTO",
      detalhes: `Foto ${photo.originalName} associada manualmente ao produto ${product.modelo}`,
      productId,
      photoId,
    });

    this.save();
    return true;
  }

  safeCleanOrphanPhotos(photoIds: string[]): { removedCount: number } {
    let count = 0;
    const idsSet = new Set(photoIds);

    this.db.photos = this.db.photos.filter((photo) => {
      if (idsSet.has(photo.id) && (photo.isOrphan || !photo.associatedProductId)) {
        try {
          const filePath = path.join(
            PHOTOS_DIR,
            "LOTES",
            photo.loteId,
            photo.filename
          );
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          console.warn("Erro ao remover arquivo físico:", e);
        }
        count++;
        return false;
      }
      return true;
    });

    this.save();
    return { removedCount: count };
  }

  // --- Manifesto & Notas Fiscais ---
  getManifestos(spreadsheetId?: string): ManifestoDoc[] {
    let list = this.db.manifestos;
    if (spreadsheetId) {
      list = list.filter((m) => m.spreadsheetId === spreadsheetId);
    }
    return list;
  }

  getAiMemorySpreadsheetId(): string | undefined {
    return this.db.aiMemorySpreadsheetId;
  }

  setAiMemorySpreadsheetId(id: string) {
    this.db.aiMemorySpreadsheetId = id;
    this.save();
  }

  addManifesto(doc: ManifestoDoc) {
    this.db.manifestos.unshift(doc);
    this.addLog({
      deviceId: "SISTEMA",
      loteId: "GERAL",
      tipo: "MANIFESTO_IMPORTADO",
      detalhes: `Manifesto/NF-e ${doc.nfe} importado (${doc.totalUnidades} unidades esperadas de ${doc.fornecedor}).`,
    });
    this.save();
  }

  removeManifesto(id: string): boolean {
    const idx = this.db.manifestos.findIndex((m) => m.id === id || m.nfe === id);
    if (idx !== -1) {
      const removed = this.db.manifestos.splice(idx, 1)[0];
      this.addLog({
        deviceId: "SISTEMA",
        loteId: "GERAL",
        tipo: "CORRECAO",
        detalhes: `Manifesto/NF-e ${removed.nfe} (${removed.fornecedor}) removido do sistema.`,
      });
      this.save();
      return true;
    }
    return false;
  }

  // --- 1. Dashboard Principal: RESUMO_CAIXAS ---
  // [A: CAIXA] | [B: DATA_CRIACAO] | [C: LOTE_ID] | [D: QTD_LIDA] | [E: QTD_MANIFESTO] | [F: STATUS] | [G: DIVERGENCIA_AUDITORIA] | [H: REVISAO_MANUAL] | [I: AVARIAS_DETECTADAS] | [J: OPERADOR_RESPONSAVEL]
  getResumoCaixas(deviceId?: DeviceId, spreadsheetId?: string): ResumoCaixa[] {
    const batches = this.getBatches(deviceId, spreadsheetId);
    const products = this.getProducts(deviceId, undefined, spreadsheetId);
    const photos = this.getPhotos(undefined, deviceId, spreadsheetId);
    const manifestos = this.getManifestos(spreadsheetId);

    // Obter todas as caixas únicas geradas no sistema
    const caixasMap = new Map<number, { batch?: Batch; prods: ProductItem[]; photos: StoredPhoto[] }>();

    batches.forEach((b) => {
      if (!caixasMap.has(b.caixa)) {
        caixasMap.set(b.caixa, { batch: b, prods: [], photos: [] });
      } else {
        caixasMap.get(b.caixa)!.batch = b;
      }
    });

    products.forEach((p) => {
      if (p.caixa != null) {
        if (!caixasMap.has(p.caixa)) {
          caixasMap.set(p.caixa, { prods: [p], photos: [] });
        } else {
          caixasMap.get(p.caixa)!.prods.push(p);
        }
      }
    });

    photos.forEach((ph) => {
      const c = ph.caixa || (ph.loteId ? this.getBatch(ph.loteId)?.caixa : undefined);
      if (c && caixasMap.has(c)) {
        caixasMap.get(c)!.photos.push(ph);
      }
    });

    // Calcular itens esperados pelo Manifesto
    // Se o manifesto tiver caixaSugerida atribuída, usa essa; senão, calcula proporcional ou total
    const manifestoTotal = manifestos.reduce((acc, m) => acc + m.totalUnidades, 0);

    const resumos: ResumoCaixa[] = [];

    const sortedCaixas = Array.from(caixasMap.keys()).sort((a, b) => a - b);

    sortedCaixas.forEach((caixaNum) => {
      const data = caixasMap.get(caixaNum)!;
      const batch = data.batch;
      const loteId = batch ? batch.id : (data.prods[0]?.loteId || `LOTE-CX-${caixaNum}`);
      const rawDate = batch ? batch.createdAt : (data.prods[0]?.criadoEm || new Date().toISOString());

      // Formatação dd/mm/aaaa
      const dateObj = new Date(rawDate);
      const dataCriacao = `${String(dateObj.getDate()).padStart(2, "0")}/${String(
        dateObj.getMonth() + 1
      ).padStart(2, "0")}/${dateObj.getFullYear()}`;

      // QTD_LIDA: Conta total de itens identificados via IA/Manual
      const qtdLida = data.prods.reduce((sum, p) => sum + (p.qtde || 1), 0);

      // Lazy Creation: Caixas sem produtos (0 itens) NÃO devem ser criadas ou exibidas no painel
      if (qtdLida === 0 && data.prods.length === 0) {
        return;
      }

      // QTD_MANIFESTO: Busca quantidade esperada
      let qtdManifesto = 0;
      manifestos.forEach((m) => {
        m.itens.forEach((item) => {
          if (item.caixaSugerida === caixaNum) {
            qtdManifesto += item.quantidade;
          }
        });
      });

      // Se nenhuma caixa específica tiver sido atribuída no manifesto, usar manifestoTotal / total de caixas ou o manifesto da primeira caixa
      if (qtdManifesto === 0 && manifestoTotal > 0) {
        if (sortedCaixas.length === 1) {
          qtdManifesto = manifestoTotal;
        } else {
          // Divisão aproximada ou meta sugerida
          const prodsNaCaixa = data.prods.length;
          qtdManifesto = prodsNaCaixa > 0 ? prodsNaCaixa : 5;
        }
      }

      // STATUS da caixa
      let status: 'RECEBIDO' | 'EM PROCESSAMENTO' | 'CONCLUÍDO' = 'RECEBIDO';
      if (batch?.status === 'CONCLUIDO') {
        status = 'CONCLUÍDO';
      } else if (batch?.status === 'PROCESSANDO' || (batch?.pendingPhotos ?? 0) > 0) {
        status = 'EM PROCESSAMENTO';
      } else if (qtdLida > 0) {
        status = 'CONCLUÍDO';
      }

      // DIVERGENCIA_AUDITORIA
      let divergenciaAuditoria = '🟢 Bateu!';
      if (qtdManifesto === 0 && qtdLida === 0) {
        divergenciaAuditoria = '⏳ Aguardando leitura';
      } else if (qtdManifesto === 0) {
        divergenciaAuditoria = '🟢 Bateu! (Sem Manifesto)';
      } else if (qtdLida === qtdManifesto) {
        divergenciaAuditoria = '🟢 Bateu!';
      } else if (qtdLida < qtdManifesto) {
        const diff = qtdManifesto - qtdLida;
        divergenciaAuditoria = `🔴 Faltam ${diff} item${diff > 1 ? "s" : ""}`;
      } else {
        const diff = qtdLida - qtdManifesto;
        divergenciaAuditoria = `🟡 Sobraram ${diff} item${diff > 1 ? "s" : ""}`;
      }

      // REVISAO_MANUAL: Fotos ilegíveis ou produtos digitados manualmente
      const fotosIlegiveis = data.photos.filter((p) => p.status === 'ILEGIVEL').length;
      const digitadosManuais = data.prods.filter((p) => p.digitadoManualmente || p.status === 'DIGITADO_MANUALMENTE').length;
      const revisaoManual = fotosIlegiveis + digitadosManuais;

      // AVARIAS_DETECTADAS
      const avariasDetectadas = data.prods.filter(
        (p) => p.estadoFisico && p.estadoFisico !== 'NOVO_LACRADO'
      ).length;

      // OPERADOR_RESPONSAVEL (Nome do Operador)
      const operadorResponsavel = batch?.deviceId || data.prods[0]?.deviceId || deviceId || "Carlos Silveira";

      const qrCode = batch?.qrCode || `CX-${String(caixaNum).padStart(3, "0")}-${loteId}`;

      resumos.push({
        caixa: caixaNum,
        dataCriacao,
        loteId,
        qtdLida,
        qtdManifesto,
        status,
        divergenciaAuditoria,
        revisaoManual,
        avariasDetectadas,
        operadorResponsavel,
        qrCode,
        itensConferidos: Math.min(qtdLida, qtdManifesto),
        itensFaltantes: Math.max(0, qtdManifesto - qtdLida),
        itensSobrando: Math.max(0, qtdLida - qtdManifesto),
      });
    });

    return resumos;
  }

  // --- Alertas (Telegram / WhatsApp) ---
  getAlertConfig(): AlertConfig {
    return this.db.alertConfig;
  }

  updateAlertConfig(config: Partial<AlertConfig>): AlertConfig {
    this.db.alertConfig = {
      ...this.db.alertConfig,
      ...config,
    };
    this.save();
    return this.db.alertConfig;
  }

  async sendAlert(
    tipo: 'DIVERGENCIA' | 'AVARIA' | 'CONCLUSAO',
    mensagem: string
  ): Promise<{ success: boolean; details: string }> {
    const config = this.db.alertConfig;
    let sentToTelegram = false;
    let sentToWebhook = false;

    // Disparo Telegram
    if (config.telegramBotToken && config.telegramChatId) {
      try {
        const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: config.telegramChatId,
            text: mensagem,
            parse_mode: "Markdown",
          }),
        });
        if (res.ok) sentToTelegram = true;
      } catch (err) {
        console.warn("Erro ao disparar alerta no Telegram:", err);
      }
    }

    // Disparo Webhook / WhatsApp API
    if (config.webhookUrl) {
      try {
        const res = await fetch(config.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            evento: tipo,
            mensagem,
            timestamp: new Date().toISOString(),
          }),
        });
        if (res.ok) sentToWebhook = true;
      } catch (err) {
        console.warn("Erro ao disparar webhook:", err);
      }
    }

    this.addLog({
      deviceId: "SISTEMA",
      loteId: "ALERTA",
      tipo: "ALERTA_DISPARADO",
      detalhes: `Alerta (${tipo}) disparado. Telegram: ${sentToTelegram ? "Enviado" : "N/D"}, Webhook: ${sentToWebhook ? "Enviado" : "N/D"}.`,
    });

    return {
      success: sentToTelegram || sentToWebhook,
      details: `Telegram: ${sentToTelegram ? "OK" : "Não configurado ou falhou"} | Webhook: ${sentToWebhook ? "OK" : "Não configurado ou falhou"}`,
    };
  }

  // --- Audit Logs ---
  addLog(logData: Omit<AuditLog, "id" | "timestamp">) {
    const log: AuditLog = {
      id: `LOG-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`,
      timestamp: new Date().toISOString(),
      ...logData,
    };
    this.db.logs.unshift(log);
    if (this.db.logs.length > 2000) {
      this.db.logs.pop();
    }
    this.save();
  }

  getLogs(deviceId?: DeviceId, loteId?: LoteId): AuditLog[] {
    let list = this.db.logs;
    if (deviceId) {
      list = list.filter((l) => l.deviceId === deviceId);
    }
    if (loteId) {
      list = list.filter((l) => l.loteId === loteId);
    }
    return list;
  }
}

export const storage = new StorageEngine();
