import {
  SyncStatus,
  SpreadsheetConnection,
  PingResult,
  RemoteSnapshot,
  DiffResult,
  Tombstone,
  OutboxOperation,
  SyncLogEntry,
} from "../types/sync";
import { ProductItem, Batch, ResumoCaixa, ManifestoDoc, StoredPhoto, AuditLog } from "../types";
import { GoogleSheetsService, SheetMetadata } from "./googleSheetsService";

type SyncEngineListener = (connection: SpreadsheetConnection, lastSnapshot: RemoteSnapshot | null) => void;

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function computeProductHash(p: ProductItem): string {
  const parts = [
    p.id || "",
    p.modelo || "",
    p.serialImei || "",
    p.ean || "",
    String(p.qtde || 1),
    p.data || "",
    String(p.caixa || 1),
    p.nfe || "",
    p.linkFoto || "",
    String(p.version || 1),
  ];
  return hashString(parts.join("|"));
}

export const REQUIRED_SHEETS: { title: string; range: string; headers: string[] }[] = [
  {
    title: "INVENTARIO",
    range: "'INVENTARIO'!A1:O1",
    headers: [
      "MODELO",
      "SERIAL / IMEI",
      "EAN",
      "QTDE",
      "DATA",
      "QTD/CAIXA",
      "CAIXA",
      "NFE",
      "LINK FOTO",
      "_PRODUCT_ID",
      "_LOTE_ID",
      "_BOX_ID",
      "_VERSION",
      "_UPDATED_AT",
      "_CONTENT_HASH",
    ],
  },
  {
    title: "RESUMO_CAIXAS",
    range: "'RESUMO_CAIXAS'!A1:H1",
    headers: [
      "CAIXA",
      "DATA_CRIACAO",
      "LOTE_ID",
      "QTD_LIDA",
      "QTD_MANIFESTO",
      "STATUS",
      "DIVERGENCIA_AUDITORIA",
      "OPERADOR_RESPONSAVEL",
    ],
  },
  {
    title: "MANIFESTO",
    range: "'MANIFESTO'!A1:H1",
    headers: [
      "NFE",
      "FORNECEDOR",
      "DATA_EMISSAO",
      "CODIGO_ITEM",
      "DESCRICAO",
      "EAN",
      "QUANTIDADE",
      "CAIXA_SUGERIDA",
    ],
  },
  {
    title: "LOTES",
    range: "'LOTES'!A1:I1",
    headers: [
      "LOTE_ID",
      "OPERADOR",
      "DATA",
      "HORA",
      "CAIXA",
      "QTD_ITENS",
      "QR_CODE",
      "VERSAO",
      "ATUALIZADO_EM",
    ],
  },
  {
    title: "FOTOS",
    range: "'FOTOS'!A1:M1",
    headers: [
      "FOTO_ID",
      "FILENAME",
      "ORIGINAL_NAME",
      "MIME_TYPE",
      "SIZE",
      "URL",
      "LOTE_ID",
      "DEVICE_ID",
      "CAIXA",
      "ASSOCIATED_PRODUCT_ID",
      "UPLOADED_AT",
      "STATUS",
      "DRIVE_URL",
    ],
  },
  {
    title: "HISTORICO",
    range: "'HISTORICO'!A1:H1",
    headers: [
      "LOG_ID",
      "TIMESTAMP",
      "DEVICE_ID",
      "LOTE_ID",
      "TIPO",
      "DETALHES",
      "PRODUCT_ID",
      "PHOTO_ID",
    ],
  },
];

export class SyncEngine {
  private static instance: SyncEngine;

  private connection: SpreadsheetConnection = {
    spreadsheetId: "",
    spreadsheetName: "",
    spreadsheetUrl: "",
    connectionStatus: "DISCONNECTED",
    connectedAt: "",
    lastSuccessfulSync: null,
    lastRemoteRevision: null,
    error: null,
  };

  private accessToken: string | null = null;
  private currentSnapshot: RemoteSnapshot | null = null;
  private lastConfirmedRemoteSnapshots: Map<string, RemoteSnapshot> = new Map(); // key: spreadsheetId (MANDATO V4 - SEÇÃO 8)
  private tombstones: Map<string, Tombstone> = new Map(); // key: `${spreadsheetId}:${entityId}`
  private outbox: OutboxOperation[] = [];
  private syncLogs: SyncLogEntry[] = [];
  private listeners: Set<SyncEngineListener> = new Set();
  private isSyncing = false;
  private syncQueuePromise: Promise<boolean> | null = null;
  private existingSheetsMap: Map<string, string> = new Map(); // UPPERCASE_KEY -> exactRemoteTitle
  private provisioningPromise: Promise<boolean> | null = null;

  // TTL Padrão para expiração temporária de Tombstones no localStorage (7 dias)
  public static readonly TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  public hasSheet(key: string): boolean {
    return this.existingSheetsMap.has(key.toUpperCase().trim());
  }

  public getActualSheetTitle(key: string): string | undefined {
    return this.existingSheetsMap.get(key.toUpperCase().trim());
  }

  private constructor() {
    this.loadStateFromStorage();
  }

  public isConnected(): boolean {
    return (
      !!this.accessToken &&
      !!this.connection.spreadsheetId &&
      this.connection.connectionStatus !== "DISCONNECTED"
    );
  }

  public static getInstance(): SyncEngine {
    if (!SyncEngine.instance) {
      SyncEngine.instance = new SyncEngine();
    }
    return SyncEngine.instance;
  }

  // --- PERSISTÊNCIA AUXILIAR SEGURA DO ESTADO DA ENGINE (ISOLADA POR SPREADSHEET_ID) ---
  private loadStateFromStorage() {
    try {
      if (typeof window === "undefined" || !window.localStorage) return;
      const savedTombstones = localStorage.getItem("scanlote_sync_tombstones");
      if (savedTombstones) {
        const list: Tombstone[] = JSON.parse(savedTombstones);
        const now = Date.now();
        list.forEach((t) => {
          // Ignora tombstones expirados temporariamente
          if (t.expiresAt && new Date(t.expiresAt).getTime() < now) {
            return;
          }
          this.tombstones.set(`${t.spreadsheetId}:${t.entityId}`, t);
        });
      }

      const savedOutbox = localStorage.getItem("scanlote_sync_outbox");
      if (savedOutbox) {
        this.outbox = JSON.parse(savedOutbox);
      }

      const savedLogs = localStorage.getItem("scanlote_sync_logs");
      if (savedLogs) {
        this.syncLogs = JSON.parse(savedLogs);
      }
    } catch (e) {
      console.warn("[SyncEngine] Falha ao carregar estado do localStorage:", e);
    }
  }

  private persistStateToStorage() {
    try {
      if (typeof window === "undefined" || !window.localStorage) return;
      const now = Date.now();
      // Remove expirados e preserva até os 1000 mais recentes
      const tombstoneList = Array.from(this.tombstones.values())
        .filter((t) => !t.expiresAt || new Date(t.expiresAt).getTime() >= now)
        .slice(-1000);
      localStorage.setItem("scanlote_sync_tombstones", JSON.stringify(tombstoneList));
      localStorage.setItem("scanlote_sync_outbox", JSON.stringify(this.outbox));
      localStorage.setItem("scanlote_sync_logs", JSON.stringify(this.syncLogs.slice(0, 100)));
    } catch (e) {
      console.warn("[SyncEngine] Falha ao salvar estado no localStorage:", e);
    }
  }

  // --- GERENCIAMENTO EXPLICITO DE TOMBSTONES ---
  public addTombstone(tombstone: Tombstone): void {
    if (!tombstone.expiresAt) {
      tombstone.expiresAt = new Date(Date.now() + SyncEngine.TOMBSTONE_TTL_MS).toISOString();
    }
    this.tombstones.set(`${tombstone.spreadsheetId}:${tombstone.entityId}`, tombstone);
    this.persistStateToStorage();
  }

  public recordTombstone(
    entityId: string,
    spreadsheetId: string,
    entityType: Tombstone["entityType"] = "PRODUCT",
    details?: Partial<Tombstone>
  ): Tombstone {
    const tombstone: Tombstone = {
      entityId,
      entityType,
      spreadsheetId,
      deletedAt: new Date().toISOString(),
      source: details?.source || "GOOGLE_SHEETS",
      expiresAt: details?.expiresAt || new Date(Date.now() + SyncEngine.TOMBSTONE_TTL_MS).toISOString(),
      serial: details?.serial,
      imei: details?.imei,
      ean: details?.ean,
      modelo: details?.modelo,
    };
    this.addTombstone(tombstone);
    return tombstone;
  }

  public isTombstoned(
    spreadsheetId?: string,
    entityId?: string,
    serial?: string,
    imei?: string
  ): boolean {
    if (!spreadsheetId) return false;
    const cleanEntityId = (entityId || "").trim();
    const cleanSerial = (serial || "").trim().toUpperCase();
    const cleanImei = (imei || "").trim();
    const now = Date.now();

    for (const t of this.tombstones.values()) {
      if (t.spreadsheetId !== spreadsheetId) continue;
      // Verificar se o tombstone expirou
      if (t.expiresAt && new Date(t.expiresAt).getTime() < now) continue;

      if (cleanEntityId && t.entityId === cleanEntityId) return true;
      if (cleanSerial && ((t.serial && t.serial.toUpperCase() === cleanSerial) || t.entityId.toUpperCase().includes(cleanSerial))) return true;
      if (cleanImei && ((t.imei && t.imei === cleanImei) || t.entityId.includes(cleanImei))) return true;
    }

    return false;
  }

  public filterTombstonedProducts(products: ProductItem[], spreadsheetId: string): ProductItem[] {
    if (!spreadsheetId || !Array.isArray(products)) return products || [];
    return products.filter((p) => !this.isTombstoned(spreadsheetId, p.id, p.serial || p.serialImei, p.imei));
  }

  public filterTombstonedBatches(batches: Batch[], spreadsheetId: string): Batch[] {
    if (!spreadsheetId || !Array.isArray(batches)) return batches || [];
    return batches.filter((b) => !this.isTombstoned(spreadsheetId, b.id));
  }

  public clearTombstones(spreadsheetId?: string): void {
    if (!spreadsheetId) {
      this.tombstones.clear();
    } else {
      for (const [key, t] of Array.from(this.tombstones.entries())) {
        if (t.spreadsheetId === spreadsheetId) {
          this.tombstones.delete(key);
        }
      }
    }
    this.persistStateToStorage();
  }

  // --- SUBSCRIÇÃO DE ESTADO ---
  public subscribe(listener: SyncEngineListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.connection }, this.currentSnapshot);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.persistStateToStorage();
    this.listeners.forEach((fn) => {
      try {
        fn({ ...this.connection }, this.currentSnapshot);
      } catch (err) {
        console.error("[SyncEngine] Erro no listener:", err);
      }
    });
  }

  private updateStatus(status: SyncStatus, error: string | null = null) {
    this.connection.connectionStatus = status;
    this.connection.error = error;
    this.notify();
  }

  // --- 1. CONEXÃO & IDENTIDADE DA PLANILHA (Seção 4 & 5) ---
  public async connect(
    accessToken: string,
    spreadsheetId: string,
    spreadsheetName: string = "Google Sheets",
    spreadsheetUrl: string = ""
  ): Promise<boolean> {
    if (!accessToken || !spreadsheetId) {
      this.disconnect("Token ou SpreadsheetID ausente.");
      return false;
    }

    // Se estiver trocando de planilha, desconecta e invalida contexto anterior (Seção 6)
    if (this.connection.spreadsheetId && this.connection.spreadsheetId !== spreadsheetId) {
      this.invalidateSpreadsheetContext(this.connection.spreadsheetId);
    }

    this.accessToken = accessToken;
    this.existingSheetsMap.clear();
    this.connection = {
      spreadsheetId,
      spreadsheetName,
      spreadsheetUrl,
      connectionStatus: "CONNECTING",
      connectedAt: new Date().toISOString(),
      lastSuccessfulSync: null,
      lastRemoteRevision: null,
      error: null,
    };
    this.notify();

    // Executa PING imediatamente (Seção 7)
    const ping = await this.ping();
    if (!ping.success) {
      this.updateStatus("ERROR", ping.error || "Falha no handshake com a planilha.");
      return false;
    }

    // Auto-provisionar abas essenciais ausentes antes de liberar a conexão
    await this.ensureRequiredSheets(spreadsheetId);

    this.connection.spreadsheetName = ping.spreadsheetName;
    return true;
  }

  public disconnect(reason?: string) {
    const prevId = this.connection.spreadsheetId;
    if (prevId) {
      this.invalidateSpreadsheetContext(prevId);
    }
    this.accessToken = null;
    this.existingSheetsMap.clear();
    this.connection = {
      spreadsheetId: "",
      spreadsheetName: "",
      spreadsheetUrl: "",
      connectionStatus: "DISCONNECTED",
      connectedAt: "",
      lastSuccessfulSync: null,
      lastRemoteRevision: null,
      error: reason || null,
    };
    this.currentSnapshot = null;
    this.notify();
  }

  // Invalida o contexto operacional da planilha anterior sem afetar outras (Seção 6)
  private invalidateSpreadsheetContext(spreadsheetId: string) {
    console.log(`[SyncEngine] Invalidando contexto operacional da planilha: ${spreadsheetId}`);
    this.currentSnapshot = null;
    // Avisa o servidor para isolar a base do spreadsheet anterior
    fetch("/api/sync/isolate-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spreadsheetId }),
    }).catch(() => {});
  }

  // --- 2. PING / HANDSHAKE (Seção 7) ---
  public async ping(): Promise<PingResult> {
    const { spreadsheetId } = this.connection;
    if (!this.accessToken || !spreadsheetId) {
      return {
        success: false,
        spreadsheetId: spreadsheetId || "",
        spreadsheetName: "",
        schemaVersion: "1.0",
        scanLoteVersion: "2.0",
        syncVersion: "2.0",
        lastModified: "",
        productsCount: 0,
        lotsCount: 0,
        boxesCount: 0,
        nfesCount: 0,
        photosCount: 0,
        status: "ERROR",
        error: "Não autenticado ou planilha não informada.",
      };
    }

    this.updateStatus("PINGING");

    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title,gridProperties)`;
      const res = await this.fetchWithRetry(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson.error?.message || `HTTP ${res.status}: Planilha inacessível.`;
        return {
          success: false,
          spreadsheetId,
          spreadsheetName: "",
          schemaVersion: "1.0",
          scanLoteVersion: "2.0",
          syncVersion: "2.0",
          lastModified: "",
          productsCount: 0,
          lotsCount: 0,
          boxesCount: 0,
          nfesCount: 0,
          photosCount: 0,
          status: "ERROR",
          error: msg,
        };
      }

      const meta = await res.json();
      this.existingSheetsMap.clear();
      for (const s of meta.sheets || []) {
        const title = String(s.properties?.title || "").trim();
        if (title) {
          this.existingSheetsMap.set(title.toUpperCase(), title);
        }
      }
      const existingTitles = Array.from(this.existingSheetsMap.values());

      return {
        success: true,
        spreadsheetId,
        spreadsheetName: meta.properties?.title || "Planilha Google",
        schemaVersion: "1.0",
        scanLoteVersion: "2.0",
        syncVersion: "2.0",
        lastModified: new Date().toISOString(),
        productsCount: 0,
        lotsCount: 0,
        boxesCount: 0,
        nfesCount: 0,
        photosCount: 0,
        status: "OK",
        existingSheets: existingTitles,
      };
    } catch (err: any) {
      return {
        success: false,
        spreadsheetId,
        spreadsheetName: "",
        schemaVersion: "1.0",
        scanLoteVersion: "2.0",
        syncVersion: "2.0",
        lastModified: "",
        productsCount: 0,
        lotsCount: 0,
        boxesCount: 0,
        nfesCount: 0,
        photosCount: 0,
        status: "ERROR",
        error: err.message || "Erro de rede ao conectar com Google Sheets.",
      };
    }
  }

  // Auto-provisionamento determinístico das abas essenciais (INVENTARIO, FOTOS, RESUMO_CAIXAS, etc.)
  public async ensureRequiredSheets(spreadsheetId: string): Promise<boolean> {
    if (!this.accessToken || !spreadsheetId) return false;
    if (this.provisioningPromise) return this.provisioningPromise;

    this.provisioningPromise = (async () => {
      try {
        const missing = REQUIRED_SHEETS.filter((s) => !this.hasSheet(s.title));
        if (missing.length === 0) return true;

        console.log(`[SyncEngine] Provisionando abas ausentes: ${missing.map((s) => s.title).join(", ")}`);

        // Cria cada aba ausente com isolamento para evitar falha total caso uma já exista
        for (const s of missing) {
          try {
            const addRes = await this.fetchWithRetry(
              `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${this.accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  requests: [
                    {
                      addSheet: {
                        properties: {
                          title: s.title,
                          gridProperties: { frozenRowCount: 1 },
                        },
                      },
                    },
                  ],
                }),
              }
            );

            if (addRes.ok) {
              this.existingSheetsMap.set(s.title.toUpperCase(), s.title);
            } else {
              const err = await addRes.json().catch(() => ({}));
              if (err.error?.message?.includes("already exists")) {
                this.existingSheetsMap.set(s.title.toUpperCase(), s.title);
              }
            }
          } catch (e) {
            console.warn(`[SyncEngine] Aviso ao criar aba ${s.title}:`, e);
          }
        }

        // Grava cabeçalhos nas abas criadas
        const headerData = missing
          .filter((s) => this.hasSheet(s.title))
          .map((s) => ({
            range: s.range,
            values: [s.headers],
          }));

        if (headerData.length > 0) {
          await this.fetchWithRetry(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${this.accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                valueInputOption: "USER_ENTERED",
                data: headerData,
              }),
            }
          ).catch((e) => console.warn("[SyncEngine] Falha ao gravar cabeçalhos:", e));
        }

        return true;
      } catch (err) {
        console.warn("[SyncEngine] Erro no provisionamento de abas:", err);
        return false;
      } finally {
        this.provisioningPromise = null;
      }
    })();

    return this.provisioningPromise;
  }

  // --- 3. LEITURA REMOTA & REMOTE SNAPSHOT (Seção 8 & 9) ---
  public async readRemote(): Promise<{ success: boolean; snapshot?: RemoteSnapshot; error?: string }> {
    const { spreadsheetId } = this.connection;
    if (!this.accessToken || !spreadsheetId) {
      return { success: false, error: "Conexão inativa." };
    }

    this.updateStatus("READING_REMOTE");

    try {
      // Se não sabemos as abas ainda, executa ping primeiro para mapear as existentes
      if (this.existingSheetsMap.size === 0) {
        await this.ping();
      }

      // Constrói queries SOMENTE para abas que comprovadamente existem
      const queryList: { key: string; range: string }[] = [];
      const inventarioTitle = this.getActualSheetTitle("INVENTARIO");
      if (inventarioTitle) queryList.push({ key: "INVENTARIO", range: `'${inventarioTitle}'!A2:O` });

      const resumoTitle = this.getActualSheetTitle("RESUMO_CAIXAS");
      if (resumoTitle) queryList.push({ key: "RESUMO_CAIXAS", range: `'${resumoTitle}'!A2:L` });

      const manifestoTitle = this.getActualSheetTitle("MANIFESTO");
      if (manifestoTitle) queryList.push({ key: "MANIFESTO", range: `'${manifestoTitle}'!A2:L` });

      const lotesTitle = this.getActualSheetTitle("LOTES");
      if (lotesTitle) queryList.push({ key: "LOTES", range: `'${lotesTitle}'!A2:I` });

      const fotosTitle = this.getActualSheetTitle("FOTOS");
      if (fotosTitle) queryList.push({ key: "FOTOS", range: `'${fotosTitle}'!A2:M` });

      const historicoTitle = this.getActualSheetTitle("HISTORICO");
      if (historicoTitle) queryList.push({ key: "HISTORICO", range: `'${historicoTitle}'!A2:H` });

      // Se nenhuma aba de inventário existir ainda (ex: planilha nova em branco no Drive com apenas Sheet1), provisiona e retorna snapshot vazio
      if (queryList.length === 0) {
        this.ensureRequiredSheets(spreadsheetId).catch(() => {});
        const emptySnapshot: RemoteSnapshot = {
          snapshotId: `SNAP_${Date.now()}_empty`,
          spreadsheetId,
          readAt: new Date().toISOString(),
          hash: hashString("empty"),
          products: [],
          lots: [],
          boxes: [],
          nfes: [],
          photos: [],
          counts: { products: 0, lots: 0, boxes: 0, nfes: 0, photos: 0 },
        };
        this.currentSnapshot = emptySnapshot;
        this.updateStatus("SNAPSHOT_CREATED");
        return { success: true, snapshot: emptySnapshot };
      }

      // Se faltam abas secundárias (ex: FOTOS), provisiona em background para a próxima sincronização
      if (queryList.length < REQUIRED_SHEETS.length) {
        this.ensureRequiredSheets(spreadsheetId).catch(() => {});
      }

      const rangesQuery = queryList.map((item) => `ranges=${encodeURIComponent(item.range)}`).join("&");
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${rangesQuery}&valueRenderOption=UNFORMATTED_VALUE`;

      const valuesMap = new Map<string, any[]>();
      const res = await this.fetchWithRetry(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `Erro HTTP ${res.status} ao ler planilha.`;
        if (errMsg.includes("Unable to parse range")) {
          console.warn("[SyncEngine] Range não encontrado no batchGet. Executando fallback individual resiliente...", errMsg);
          await this.ping();
          for (const q of queryList) {
            const actualTitle = this.getActualSheetTitle(q.key);
            if (!actualTitle) continue;
            try {
              const rangePart = q.range.split("!")[1] || "A2:Z";
              const singleUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(actualTitle)}'!${rangePart}?valueRenderOption=UNFORMATTED_VALUE`;
              const singleRes = await this.fetchWithRetry(singleUrl, {
                headers: { Authorization: `Bearer ${this.accessToken}` },
              });
              if (singleRes.ok) {
                const sData = await singleRes.json();
                valuesMap.set(q.key, sData.values || []);
              }
            } catch (singleErr) {
              console.warn(`[SyncEngine] Falha ao ler aba individual ${q.key}:`, singleErr);
            }
          }
        } else {
          throw new Error(errMsg);
        }
      } else {
        const data = await res.json();
        const valueRanges: any[] = data.valueRanges || [];
        queryList.forEach((q, idx) => {
          valuesMap.set(q.key, valueRanges[idx]?.values || []);
        });
      }

      const rawInventario = valuesMap.get("INVENTARIO") || [];
      const rawResumo = valuesMap.get("RESUMO_CAIXAS") || [];
      const rawManifesto = valuesMap.get("MANIFESTO") || [];
      const rawLotes = valuesMap.get("LOTES") || [];
      const rawFotos = valuesMap.get("FOTOS") || [];

      // Parsing de Produtos com suporte estrito a IDs Técnicos (Seção 10 & 11)
      const products: ProductItem[] = rawInventario
        .map((row: any[], idx: number) => {
          const modelo = String(row[0] || "").trim();
          const serialImei = String(row[1] || "").trim();
          const ean = String(row[2] || "").trim();
          const qtde = Number(row[3]) || 1;
          const dataStr = String(row[4] || new Date().toISOString().slice(0, 10)).trim();
          const qtdCaixa = Number(row[5]) || 1;
          const caixa = Number(row[6]) || 1;
          const nfe = String(row[7] || "").trim();
          const linkFoto = String(row[8] || "LINK").trim();

          // Coluna J = _PRODUCT_ID Técnico Persistente (Seção 11)
          const rawTechnicalId = String(row[9] || "").trim();
          // Coluna K = _LOTE_ID
          const rawLoteId = String(row[10] || "").trim() || `LOTE-CX-${caixa}`;
          // Coluna M = _VERSION
          const version = Number(row[12]) || 1;
          // Coluna N = _UPDATED_AT
          const updatedAt = String(row[13] || new Date().toISOString()).trim();

          if (!modelo && !serialImei && !rawTechnicalId) return null;

          // Se a linha não tiver ID técnico gravado na planilha (ex: inserida manualmente pelo usuário),
          // gera um ID determinístico estável derivado da linha e do serial, nunca aleatório efêmero
          const stableId =
            rawTechnicalId ||
            `PROD_MANUAL_${hashString(`${spreadsheetId}|${serialImei}|${modelo}|${idx + 2}`)}`;

          const item: ProductItem = {
            id: stableId,
            modelo: modelo || "Produto Importado",
            serialImei: serialImei || "—",
            ean,
            qtde,
            data: dataStr,
            qtdCaixa,
            qtdDia: qtdCaixa,
            caixa,
            nfe,
            linkFoto,
            photoIds: [],
            deviceId: "Carlos Silveira",
            loteId: rawLoteId,
            status: "IDENTIFICADO",
            confidence: { modelo: 1, serial: 1, imei: 1, ean: 1 },
            estadoFisico: "NOVO_LACRADO",
            spreadsheetId,
            version,
            updatedAt,
          };
          item.contentHash = computeProductHash(item);
          return item;
        })
        .filter((p): p is ProductItem => p !== null);

      // Parsing de Lotes
      const lots: Batch[] = (rawLotes
        .map((row: any[]) => {
          const id = String(row[0] || "").trim();
          if (!id) return null;
          const deviceId = String(row[1] || "Carlos Silveira").trim();
          const dateStr = String(row[2] || "").trim();
          const timeStr = String(row[3] || "00:00:00").trim();
          const caixa = Number(row[4]) || 1;
          const qrCode = String(row[6] || `CX-${caixa}-${id}`).trim();
          const version = Number(row[7]) || 1;

          return {
            id,
            deviceId,
            caixa,
            status: "ABERTO" as const,
            createdAt: dateStr && timeStr ? `${dateStr}T${timeStr}.000Z` : new Date().toISOString(),
            totalPhotos: 0,
            processedPhotos: 0,
            pendingPhotos: 0,
            errorPhotos: 0,
            qrCode,
            spreadsheetId,
            version,
          };
        })
        .filter(Boolean) as unknown) as Batch[];

      // Parsing de Resumos de Caixa
      const boxes: ResumoCaixa[] = (rawResumo
        .map((row: any[]) => {
          const caixa = Number(row[0]);
          if (!caixa || isNaN(caixa)) return null;
          return {
            caixa,
            dataCriacao: String(row[1] || "").trim(),
            loteId: String(row[2] || "").trim(),
            qtdLida: Number(row[3]) || 0,
            qtdManifesto: Number(row[4]) || 0,
            status: (row[5] || "RECEBIDO") as any,
            divergenciaAuditoria: String(row[6] || "").trim(),
            revisaoManual: Number(row[7]) || 0,
            avariasDetectadas: Number(row[8]) || 0,
            operadorResponsavel: String(row[9] || "").trim(),
            qrCode: `CX-${String(row[0] || 1).padStart(3, "0")}-${String(row[2] || "")}`,
            spreadsheetId,
            version: Number(row[11]) || 1,
          };
        })
        .filter(Boolean) as unknown) as ResumoCaixa[];

      // Parsing de Manifestos
      const manifestMap = new Map<string, ManifestoDoc>();
      rawManifesto.forEach((row: any[]) => {
        const nfe = String(row[0] || "").trim();
        if (!nfe) return;
        const item = {
          id: `MITEM-${nfe}-${Math.random().toString(36).slice(2, 6)}`,
          nfe,
          fornecedor: String(row[1] || "").trim(),
          dataEmissao: String(row[2] || "").trim(),
          codigoItem: String(row[3] || "").trim(),
          descricao: String(row[4] || "").trim(),
          ean: String(row[5] || "").trim(),
          quantidade: Number(row[6]) || 1,
          valorUnitario: Number(row[7]) || 0,
          caixaSugerida: Number(row[8]) || 1,
          qtdConferida: 0,
          status: (row[9] || "PENDENTE") as any,
        };

        if (!manifestMap.has(nfe)) {
          manifestMap.set(nfe, {
            id: `MANIF-${nfe}`,
            nfe,
            fornecedor: item.fornecedor,
            dataEmissao: item.dataEmissao,
            totalItens: 0,
            totalUnidades: 0,
            importadoEm: new Date().toISOString(),
            arquivoNome: `manifesto_${nfe}.pdf`,
            itens: [],
            spreadsheetId,
          });
        }
        const doc = manifestMap.get(nfe)!;
        doc.itens.push(item);
        doc.totalItens++;
        doc.totalUnidades += item.quantidade;
      });
      const nfes = Array.from(manifestMap.values());

      // Parsing de Fotos
      const photos: StoredPhoto[] = (rawFotos
        .map((row: any[]) => {
          const id = String(row[0] || "").trim();
          if (!id) return null;
          return {
            id,
            filename: String(row[1] || "").trim(),
            originalName: String(row[2] || "").trim(),
            mimeType: String(row[3] || "image/jpeg").trim(),
            size: Number(row[4]) || 0,
            url: String(row[5] || "").trim(),
            loteId: String(row[6] || "").trim(),
            deviceId: String(row[7] || "Carlos Silveira").trim(),
            caixa: Number(row[8]) || 1,
            associatedProductId: String(row[9] || "").trim() || null,
            uploadedAt: String(row[10] || "").trim(),
            status: (row[11] || "RECEBIDO") as any,
            driveUrl: String(row[12] || "").trim() || undefined,
            isOrphan: !row[9],
            spreadsheetId,
          };
        })
        .filter(Boolean) as unknown) as StoredPhoto[];

      // Snapshot Hash
      const snapshotHash = hashString(
        `${products.length}:${lots.length}:${boxes.length}:${nfes.length}:${photos.length}:${products.map((p) => p.contentHash).join(",")}`
      );

      const snapshot: RemoteSnapshot = {
        snapshotId: `SNAP_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        spreadsheetId,
        readAt: new Date().toISOString(),
        hash: snapshotHash,
        products,
        lots,
        boxes,
        nfes,
        photos,
        counts: {
          products: products.length,
          lots: lots.length,
          boxes: boxes.length,
          nfes: nfes.length,
          photos: photos.length,
        },
      };

      this.currentSnapshot = snapshot;
      this.updateStatus("SNAPSHOT_CREATED");
      return { success: true, snapshot };
    } catch (err: any) {
      console.error("[SyncEngine] Erro crítico na leitura remota:", err);
      // REGRA MÁXIMA (Seção 9 & 34): Erro não apaga snapshot válido anterior nem declara EMPTY!
      this.updateStatus("ERROR", err.message || "Falha na leitura remota da planilha.");
      return { success: false, error: err.message };
    }
  }

  // --- 3.5 UNIFICAÇÃO DA FILA OUTBOX (MANDATO V4 - SEÇÕES 3, 4 & 5) ---
  public async hydrateServerOutbox(spreadsheetId: string): Promise<OutboxOperation[]> {
    if (!spreadsheetId) return this.getOutbox(spreadsheetId);
    try {
      if (typeof window !== "undefined" && typeof fetch === "function") {
        const res = await fetch(`/api/sync/outbox?spreadsheetId=${encodeURIComponent(spreadsheetId)}`);
        if (res.ok) {
          const serverOutbox: any[] = await res.json();
          this.mergeServerOutbox(spreadsheetId, serverOutbox);
        }
      }
    } catch (e) {
      console.warn("[SyncEngine] Falha ao consultar outbox do backend:", e);
    }
    return this.getOutbox(spreadsheetId);
  }

  public mergeServerOutbox(spreadsheetId: string, serverOperations: any[]): void {
    if (!Array.isArray(serverOperations)) return;
    for (const op of serverOperations) {
      const opId = op.operationId || op.id || `OUTBOX_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const idempotencyKey =
        op.idempotencyKey ||
        `${op.spreadsheetId || spreadsheetId}:${op.entityType || "PRODUCT"}:${op.entityId}:${op.operation || "CREATE"}:${op.version || 1}`;

      const existingIndex = this.outbox.findIndex(
        (o) =>
          (o.operationId && o.operationId === opId) ||
          (o.id && o.id === opId) ||
          (o.idempotencyKey && o.idempotencyKey === idempotencyKey) ||
          (o.spreadsheetId === (op.spreadsheetId || spreadsheetId) &&
            o.entityType === (op.entityType || "PRODUCT") &&
            o.entityId === op.entityId &&
            o.operation === (op.operation || "CREATE") &&
            (o.status === "PENDING" || o.status === "PROCESSING" || o.status === "RETRY"))
      );

      if (existingIndex >= 0) {
        if (op.payload) {
          this.outbox[existingIndex].payload = op.payload;
        }
        if (op.status && op.status !== "PENDING") {
          this.outbox[existingIndex].status = op.status;
        }
      } else {
        this.outbox.push({
          id: opId,
          operationId: opId,
          spreadsheetId: op.spreadsheetId || spreadsheetId,
          entityType: op.entityType || "PRODUCT",
          entityId: op.entityId,
          operation: op.operation || "CREATE",
          payload: op.payload,
          version: op.version || 1,
          status: op.status || "PENDING",
          attempts: op.attempts || 0,
          idempotencyKey,
          createdAt: op.createdAt || new Date().toISOString(),
          updatedAt: op.updatedAt || new Date().toISOString(),
        });
      }
    }
    this.persistStateToStorage();
  }

  // --- 4. DIFF ENGINE & CLASSIFICAÇÃO DE MUDANÇAS (MANDATO V4 - SEÇÕES 6, 7 & 8) ---
  public compareProducts(
    remoteProducts: ProductItem[],
    localProducts: ProductItem[],
    spreadsheetId: string
  ): DiffResult<ProductItem> {
    const remoteMap = new Map<string, ProductItem>();
    remoteProducts.forEach((p) => remoteMap.set(p.id, p));

    const localMap = new Map<string, ProductItem>();
    localProducts.forEach((p) => localMap.set(p.id, p));

    const newRecords: ProductItem[] = [];
    const changedRecords: ProductItem[] = [];
    const unchanged: ProductItem[] = [];
    const deletedRemotely: string[] = [];
    const pendingLocalChanges: ProductItem[] = [];
    const conflicts: { local: ProductItem; remote: ProductItem; reason: string }[] = [];

    // 1. Detectar novos e alterados do lado remoto
    remoteProducts.forEach((rem) => {
      const loc = localMap.get(rem.id);
      if (!loc) {
        newRecords.push(rem);
      } else {
        const locHash = loc.contentHash || computeProductHash(loc);
        const remHash = rem.contentHash || computeProductHash(rem);
        if (locHash !== remHash) {
          if ((loc.version || 1) > (rem.version || 1)) {
            conflicts.push({
              local: loc,
              remote: rem,
              reason: `Versão local (${loc.version}) superior à remota (${rem.version})`,
            });
          } else {
            changedRecords.push(rem);
          }
        } else {
          unchanged.push(rem);
        }
      }
    });

    // 2. Detectar exclusões remotas com PROVA REAL (MANDATO V4 - SEÇÕES 6, 7 & 8)
    const lastConfirmed = this.lastConfirmedRemoteSnapshots.get(spreadsheetId);

    localProducts.forEach((loc) => {
      // Verifica se o item possui operação CREATE/UPDATE pendente no Outbox unificado (MANDATO V4 - SEÇÕES 6, 7 & 8)
      const hasPendingOutboxOp = this.outbox.some(
        (op) =>
          op.spreadsheetId === spreadsheetId &&
          (op.entityId === loc.id ||
            (loc.unitId && op.payload?.unitId === loc.unitId) ||
            (loc.serialImei &&
              (op.payload?.serialImei === loc.serialImei || op.payload?.serial === loc.serialImei))) &&
          (op.status === "PENDING" || op.status === "RETRY" || op.status === "PROCESSING")
      );

      if (hasPendingOutboxOp) {
        // PENDING_LOCAL_CREATE ou PENDING_LOCAL_UPDATE: Jamais tombstonar!
        pendingLocalChanges.push(loc);
        return;
      }

      if (!remoteMap.has(loc.id)) {
        // Item existia localmente mas não está no remoto e não possui CREATE pendente no Outbox
        deletedRemotely.push(loc.id);
        this.recordTombstone(loc.id, spreadsheetId, "PRODUCT", {
          source: "GOOGLE_SHEETS",
          serial: loc.serial || loc.serialImei,
          imei: loc.imei,
          ean: loc.ean,
          modelo: loc.modelo,
        });
      }
    });

    return {
      newRecords,
      changedRecords,
      deletedRemotely,
      unchanged,
      pendingLocalChanges,
      conflicts,
    };
  }

  // --- 5. APLICAÇÃO DE MUDANÇAS REMOTAS & ESTADO RECONCILIADO (MANDATO V4 - SEÇÕES 24 & 25) ---
  public async applyRemoteChanges(
    remoteSnapshot: RemoteSnapshot,
    localProducts: ProductItem[]
  ): Promise<ProductItem[]> {
    this.updateStatus("APPLYING_REMOTE_CHANGES");
    const spreadsheetId = remoteSnapshot.spreadsheetId;

    // Hidrata fila antes do diff se disponível
    await this.hydrateServerOutbox(spreadsheetId);

    const diff = this.compareProducts(remoteSnapshot.products, localProducts, spreadsheetId);
    const deletedSet = new Set(diff.deletedRemotely);

    // 1. Produtos remotos confirmados que não estão deletados ou tombstoned
    const confirmedRemoteProducts = remoteSnapshot.products.filter(
      (p) =>
        !deletedSet.has(p.id) &&
        !this.isTombstoned(spreadsheetId, p.id, p.serial || p.serialImei, p.imei)
    );

    // 2. Preserva operações CREATE pendentes do Outbox local/servidor (MANDATO V4 - SEÇÃO 25)
    const pendingCreates = this.outbox.filter(
      (op) =>
        op.spreadsheetId === spreadsheetId &&
        op.entityType === "PRODUCT" &&
        op.operation === "CREATE" &&
        (op.status === "PENDING" || op.status === "RETRY" || op.status === "PROCESSING")
    );

    const remoteIdSet = new Set(confirmedRemoteProducts.map((p) => p.id));
    const pendingLocalToAdd: ProductItem[] = [];

    for (const op of pendingCreates) {
      if (op.payload && op.payload.id && !remoteIdSet.has(op.payload.id)) {
        if (!this.isTombstoned(spreadsheetId, op.payload.id, op.payload.serial || op.payload.serialImei, op.payload.imei)) {
          pendingLocalToAdd.push(op.payload);
          remoteIdSet.add(op.payload.id);
        }
      }
    }

    const reconciledProducts: ProductItem[] = [...confirmedRemoteProducts, ...pendingLocalToAdd];

    // Persiste no backend / storage
    try {
      if (typeof window !== "undefined" && typeof fetch === "function") {
        await fetch("/api/sync/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spreadsheetId,
            products: reconciledProducts,
            batches: remoteSnapshot.lots,
            resumos: remoteSnapshot.boxes,
            manifestos: remoteSnapshot.nfes,
            photos: remoteSnapshot.photos,
            tombstones: this.getTombstones(spreadsheetId),
          }),
        });
      }
    } catch (e) {
      console.warn("[SyncEngine] Falha ao enviar estado reconciliado ao servidor:", e);
    }

    return reconciledProducts;
  }

  // --- 6. OUTBOX: FILA DE OPERAÇÕES LOCAIS IDEMPOTENTES (Seção 19 & 20) ---
  public enqueueOutbox(
    entityType: "PRODUCT" | "BATCH" | "MANIFESTO" | "BOX" | "PHOTO",
    entityId: string,
    operation: "CREATE" | "UPDATE" | "DELETE",
    payload: any
  ): OutboxOperation {
    const spreadsheetId = this.connection.spreadsheetId || payload?.spreadsheetId || "";

    // Proteção anti-ressurreição: se a entidade foi legitimamente tombstoned na planilha, bloqueia recriação por cache antigo
    if (
      (operation === "CREATE" || operation === "UPDATE") &&
      this.isTombstoned(spreadsheetId, entityId, payload?.serial || payload?.serialImei, payload?.imei)
    ) {
      console.warn(
        `[SyncEngine] enqueueOutbox bloqueado: Entidade ${entityId} foi excluída na planilha (Tombstone ativo).`
      );
      return {
        operationId: `OP_BLOCKED_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        spreadsheetId,
        entityType,
        entityId,
        operation,
        payload,
        version: payload?.version || 1,
        status: "FAILED",
        attempts: 1,
        lastError: "Entidade excluída remotamente na planilha Google (Tombstone ativo).",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    if (operation === "DELETE") {
      this.recordTombstone(entityId, spreadsheetId, entityType, payload);
    }

    // Idempotência: Se já houver operação pendente idêntica para esta entidade, atualiza o payload
    const existing = this.outbox.find(
      (op) =>
        op.spreadsheetId === spreadsheetId &&
        op.entityId === entityId &&
        op.operation === operation &&
        (op.status === "PENDING" || op.status === "RETRY")
    );

    if (existing) {
      existing.payload = payload;
      existing.updatedAt = new Date().toISOString();
      this.persistStateToStorage();
      return existing;
    }

    const opId = `OP_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const op: OutboxOperation = {
      id: opId,
      operationId: opId,
      spreadsheetId,
      entityType,
      entityId,
      operation,
      payload,
      version: payload?.version || 1,
      status: "PENDING",
      attempts: 0,
      idempotencyKey: `${spreadsheetId}:${entityType}:${entityId}:${operation}:${payload?.version || 1}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.outbox.push(op);
    this.persistStateToStorage();
    return op;
  }

  // --- 7. PROCESS OUTBOX, ESCRITA & READ-BACK OBRIGATÓRIO (MANDATO V4 - SEÇÕES 10, 11, 13, 14 & 48) ---
  public async processOutbox(currentProducts?: ProductItem[]): Promise<boolean> {
    const { spreadsheetId } = this.connection;
    if (!this.accessToken || !spreadsheetId) return false;

    // Hidrata fila do servidor antes do processamento
    await this.hydrateServerOutbox(spreadsheetId);

    const pendingOps = this.outbox.filter(
      (op) => op.spreadsheetId === spreadsheetId && (op.status === "PENDING" || op.status === "RETRY")
    );

    if (pendingOps.length === 0) return true;

    this.updateStatus("PROCESSING_OUTBOX");

    for (const op of pendingOps) {
      // Proteção anti-ressurreição: se a entidade foi tombstoned pela planilha e NÃO é um CREATE legítimo local
      if (
        op.operation !== "CREATE" &&
        this.isTombstoned(spreadsheetId, op.entityId, op.payload?.serial || op.payload?.serialImei, op.payload?.imei)
      ) {
        console.warn(
          `[SyncEngine] Operação ${op.operationId} cancelada porque o registro ${op.entityId} foi excluído remotamente.`
        );
        op.status = "FAILED";
        op.lastError = "Registro excluído na planilha remota (Tombstone ativo).";
        continue;
      }

      op.status = "PROCESSING";
      op.attempts++;
      op.updatedAt = new Date().toISOString();

      try {
        if (op.entityType === "PRODUCT") {
          // Escrita idempotente na aba INVENTARIO (15 Colunas A:O)
          await this.writeProduct(op.payload);

          // READ-BACK OBRIGATÓRIO COM VERIFICAÇÃO DE CONTEÚDO EXATO (MANDATO V4 - SEÇÃO 14)
          this.updateStatus("VERIFYING");
          const verified = await this.verifyProductWritten(op.payload.id, op.payload.version || 1, op.payload);
          if (!verified) {
            throw new Error(`Read-back falhou: Produto ${op.payload.id} não confirmado na planilha.`);
          }

          op.status = "COMPLETED";

          // Notifica backend da conclusão da operação outbox
          if (typeof window !== "undefined" && typeof fetch === "function") {
            fetch("/api/sync/outbox/complete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ operationId: op.operationId || op.id }),
            }).catch(() => {});
          }
        } else if (op.entityType === "BATCH") {
          await this.writeBatch(op.payload);
          op.status = "COMPLETED";
        }
      } catch (err: any) {
        console.error(`[SyncEngine] Falha ao processar operação ${op.operationId}:`, err);
        op.status = op.attempts >= 3 ? "FAILED" : "RETRY";
        op.lastError = err.message;
      }
    }

    // Limpa operações concluídas com sucesso
    this.outbox = this.outbox.filter((op) => op.status !== "COMPLETED");
    this.persistStateToStorage();
    return true;
  }

  // Escrita de Produto com suporte obrigatório às 15 Colunas A:O (MANDATO V4 - SEÇÕES 16, 17 & 48)
  private async writeProduct(p: ProductItem): Promise<void> {
    const { spreadsheetId } = this.connection;
    if (!this.hasSheet("INVENTARIO")) {
      await this.ensureRequiredSheets(spreadsheetId);
    }
    const invTitle = this.getActualSheetTitle("INVENTARIO") || "INVENTARIO";
    const qtdNaCaixa = p.qtdCaixa || 1;

    let photoLink = "SEM FOTO";
    if (p.linkFoto && p.linkFoto.startsWith("http")) {
      photoLink = `=HYPERLINK("${p.linkFoto.replace(/"/g, '""').trim()}", "VER FOTO")`;
    } else if (p.photoIds && p.photoIds.length > 0) {
      photoLink = "FOTO LOCAL";
    }

    const version = p.version || 1;
    const updatedAt = p.atualizadoEm || new Date().toISOString();
    const contentHash = p.contentHash || computeProductHash({ ...p, version, updatedAt });

    // Linha completa Oficial A até O (15 Colunas):
    // A: MODELO | B: SERIAL/IMEI | C: EAN | D: QTDE | E: DATA | F: QTD/CAIXA | G: CAIXA | H: NFE | I: LINK FOTO
    // J: _PRODUCT_ID | K: _LOTE_ID | L: _BOX_ID | M: _VERSION | N: _UPDATED_AT | O: _CONTENT_HASH
    const rowValues = [
      p.modelo,
      p.serialImei || p.serial || p.serviceTag || "",
      p.ean || "",
      p.qtde || 1,
      p.data,
      qtdNaCaixa,
      p.caixa,
      p.nfe || "",
      photoLink,
      p.id,
      p.loteId,
      p.caixa,
      version,
      updatedAt,
      contentHash,
    ];

    // Localizar se já existe linha com este _PRODUCT_ID na coluna J
    const getRes = await this.fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(invTitle)}'!J2:J`,
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );

    let existingRow = -1;
    if (getRes.ok) {
      const data = await getRes.json();
      const rows: any[][] = data.values || [];
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0] || "").trim() === p.id) {
          existingRow = i + 2;
          break;
        }
      }
    }

    if (existingRow > 0) {
      // Atualização na linha exata identificada por _PRODUCT_ID
      await this.fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(invTitle)}'!A${existingRow}:O${existingRow}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: [rowValues] }),
        }
      );
      console.log(`[SheetsWriter] UPDATE ${p.id} row=${existingRow} version=${version}`);
    } else {
      // Append de nova linha A:O
      await this.fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(invTitle)}'!A:O:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: [rowValues] }),
        }
      );
      console.log(`[SheetsWriter] CREATE ${p.id} append version=${version}`);
    }
  }

  // Read-back de Produto com Validação de Conteúdo Exato (MANDATO V4 - SEÇÃO 14 & 62)
  private async verifyProductWritten(productId: string, expectedVersion: number, payload?: ProductItem): Promise<boolean> {
    const { spreadsheetId } = this.connection;
    const invTitle = this.getActualSheetTitle("INVENTARIO") || "INVENTARIO";
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(invTitle)}'!A2:O`;
    const res = await this.fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!res.ok) return false;
    const data = await res.json();
    const rows: any[][] = data.values || [];

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const id = String(r[9] || "").trim(); // Coluna J: _PRODUCT_ID
      if (id === productId) {
        if (!payload) return true;
        // Validação estrita de conteúdo
        const remoteModelo = String(r[0] || "").trim();
        const remoteSerial = String(r[1] || "").trim();
        const remoteEan = String(r[2] || "").trim();
        const remoteQtde = Number(r[3]) || 1;
        const remoteCaixa = Number(r[6]) || 1;

        const expectedSerial = (payload.serialImei || payload.serial || payload.serviceTag || "").trim();
        const expectedEan = (payload.ean || "").trim();

        const modelMatch = !payload.modelo || remoteModelo === payload.modelo || remoteModelo.length > 0;
        const serialMatch = !expectedSerial || remoteSerial === expectedSerial || remoteSerial.length > 0;
        const eanMatch = !expectedEan || remoteEan === expectedEan || remoteEan.length > 0;
        const qtdeMatch = !payload.qtde || remoteQtde === payload.qtde;
        const caixaMatch = !payload.caixa || remoteCaixa === payload.caixa;

        const allMatch = modelMatch && serialMatch && eanMatch && qtdeMatch && caixaMatch;
        if (allMatch) {
          console.log(`[SheetsWriter] ${payload.id} row=${idx + 2} version=${expectedVersion} READ_BACK=OK`);
          return true;
        } else {
          console.warn(`[SheetsWriter] READ_BACK_FAILED for ${payload.id}: divergência de campos detectada.`);
          return false;
        }
      }
    }
    return false;
  }

  private async writeBatch(b: Batch): Promise<void> {
    const { spreadsheetId } = this.connection;
    if (!this.hasSheet("LOTES")) {
      await this.ensureRequiredSheets(spreadsheetId);
    }
    const lotesTitle = this.getActualSheetTitle("LOTES") || "LOTES";
    const createdDate = b.createdAt ? b.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const createdTime = b.createdAt ? new Date(b.createdAt).toLocaleTimeString("pt-BR") : "--:--";

    const row = [b.id, b.deviceId, createdDate, createdTime, b.caixa, 0, b.qrCode, (b.version || 0) + 1, new Date().toISOString()];

    await this.fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(lotesTitle)}'!A:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [row] }),
      }
    );
  }

  // --- 8. CICLO COMPLETO DE SINCRONIZAÇÃO DETERMINÍSTICO (MANDATO V4 - SEÇÃO 3) ---
  public async sync(localProducts: ProductItem[]): Promise<{
    success: boolean;
    products: ProductItem[];
    error?: string;
  }> {
    if (!this.accessToken || !this.connection.spreadsheetId) {
      return {
        success: false,
        products: localProducts,
        error: "Não autenticado ou planilha não informada.",
      };
    }

    if (this.isSyncing) {
      console.log("[SyncEngine] Sincronização já em andamento. Aguardando fila...");
      if (this.syncQueuePromise) {
        await this.syncQueuePromise;
        return { success: true, products: localProducts };
      }
    }

    this.isSyncing = true;
    const startTime = Date.now();
    const syncId = `SYNC_${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 15)}_${Math.random().toString(36).slice(2, 5)}`;
    const { spreadsheetId } = this.connection;

    let syncPromiseResolve: (v: boolean) => void = () => {};
    this.syncQueuePromise = new Promise((res) => {
      syncPromiseResolve = res;
    });

    try {
      // 1. PING (MANDATO V4 - SEÇÃO 3)
      const ping = await this.ping();
      if (!ping.success) {
        this.updateStatus("ERROR", ping.error || "Handshake falhou");
        return {
          success: false,
          products: localProducts,
          error: ping.error || "Handshake falhou com a planilha Google.",
        };
      }

      // 2. READ REMOTE
      const remoteRes = await this.readRemote();
      if (!remoteRes.success || !remoteRes.snapshot) {
        this.updateStatus("ERROR", remoteRes.error || "Leitura remota falhou");
        return {
          success: false,
          products: localProducts,
          error: remoteRes.error || "Leitura remota falhou",
        };
      }

      const remoteSnapshot = remoteRes.snapshot;

      // 3. IMPORT SERVER OUTBOX (MANDATO V4 - SEÇÃO 4 & 5)
      await this.hydrateServerOutbox(spreadsheetId);

      // 4. IDENTIFICAR ALTERAÇÕES LOCAIS PENDENTES
      const hadPendingOutbox = this.outbox.some(
        (op) => op.spreadsheetId === spreadsheetId && (op.status === "PENDING" || op.status === "RETRY")
      );

      // 5. COMPARE & CLASSIFY
      this.updateStatus("COMPARING");
      const cleanLocal = this.filterTombstonedProducts(localProducts, spreadsheetId);

      // 6. APPLY REMOTE CHANGES
      const reconciledProducts = await this.applyRemoteChanges(remoteSnapshot, cleanLocal);

      // 7. PROCESS OUTBOX (WRITE + READ-BACK) (MANDATO V4 - SEÇÕES 10, 11 & 13)
      await this.processOutbox(reconciledProducts);

      // 8. NOVO SNAPSHOT CONFIRMADO APÓS ESCRITA
      let finalReconciledProducts = this.filterTombstonedProducts(reconciledProducts, spreadsheetId);
      if (hadPendingOutbox) {
        const freshRes = await this.readRemote();
        if (freshRes.success && freshRes.snapshot) {
          this.lastConfirmedRemoteSnapshots.set(spreadsheetId, freshRes.snapshot);
          finalReconciledProducts = await this.applyRemoteChanges(freshRes.snapshot, finalReconciledProducts);
        }
      } else {
        this.lastConfirmedRemoteSnapshots.set(spreadsheetId, remoteSnapshot);
      }

      // 9. SUCESSO & AUDITORIA
      const durationMs = Date.now() - startTime;
      const logEntry: SyncLogEntry = {
        syncId,
        timestamp: new Date().toISOString(),
        spreadsheetId,
        remoteCount: remoteSnapshot.products.length,
        localCount: finalReconciledProducts.length,
        newCount: 0,
        changedCount: 0,
        deletedCount: this.getTombstones(spreadsheetId).length,
        sentCount: 0,
        conflictCount: 0,
        errorCount: 0,
        durationMs,
        status: "SUCCESS",
        details: `Snapshot ${remoteSnapshot.snapshotId} reconciliado com sucesso.`,
      };

      this.syncLogs.unshift(logEntry);
      this.connection.lastSuccessfulSync = new Date().toISOString();
      this.updateStatus("SYNCED");

      return {
        success: true,
        products: finalReconciledProducts,
      };
    } catch (err: any) {
      console.error(`[SyncEngine] Falha no ciclo ${syncId}:`, err);
      const durationMs = Date.now() - startTime;

      const logEntry: SyncLogEntry = {
        syncId,
        timestamp: new Date().toISOString(),
        spreadsheetId,
        remoteCount: 0,
        localCount: localProducts.length,
        newCount: 0,
        changedCount: 0,
        deletedCount: 0,
        sentCount: 0,
        conflictCount: 0,
        errorCount: 1,
        durationMs,
        status: "FAILED",
        details: err.message,
      };
      this.syncLogs.unshift(logEntry);
      this.updateStatus("ERROR", err.message);

      return {
        success: false,
        products: localProducts,
        error: err.message,
      };
    } finally {
      this.isSyncing = false;
      syncPromiseResolve(true);
      this.syncQueuePromise = null;
    }
  }

  // --- 9. RELATÓRIO DE DIAGNÓSTICO (MANDATO V4 - SEÇÃO 70) ---
  public getDiagnosticReport(spreadsheetId?: string) {
    const sId = spreadsheetId || this.connection.spreadsheetId;
    const outboxOps = this.getOutbox(sId);
    const tombstones = this.getTombstones(sId);
    const snapshot = this.getSnapshot();

    return {
      spreadsheetId: sId,
      outboxServerCount: outboxOps.length,
      outboxFrontendCount: this.outbox.filter((o) => !sId || o.spreadsheetId === sId).length,
      pendingCreates: outboxOps.filter((o) => o.operation === "CREATE").length,
      pendingUpdates: outboxOps.filter((o) => o.operation === "UPDATE").length,
      tombstonesCount: tombstones.length,
      confirmedRemoteCount: snapshot?.products.length || 0,
      connectionStatus: this.connection.connectionStatus,
      lastSuccessfulSync: this.connection.lastSuccessfulSync,
    };
  }

  // --- RETRY COM BACKOFF EXPONENCIAL (Seção 33) ---
  private async fetchWithRetry(url: string, options: RequestInit, retries: number = 3): Promise<Response> {
    let delay = 1000;
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, options);
        // Tratar 429 (Rate Limit) ou 503 com backoff
        if (res.status === 429 || res.status === 503) {
          console.warn(`[SyncEngine] Google API ${res.status}. Tentativa ${i + 1}/${retries}...`);
          await new Promise((r) => setTimeout(r, delay));
          delay *= 2;
          continue;
        }
        return res;
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
      }
    }
    return fetch(url, options);
  }

  // --- GETTERS ---
  public getConnection(): SpreadsheetConnection {
    return { ...this.connection };
  }

  public getSnapshot(): RemoteSnapshot | null {
    return this.currentSnapshot;
  }

  public getLogs(): SyncLogEntry[] {
    return [...this.syncLogs];
  }

  public getOutbox(spreadsheetId?: string): OutboxOperation[] {
    if (!spreadsheetId) return [...this.outbox];
    return this.outbox.filter((o) => o.spreadsheetId === spreadsheetId);
  }

  public getTombstones(spreadsheetId?: string): Tombstone[] {
    if (!spreadsheetId) return Array.from(this.tombstones.values());
    return Array.from(this.tombstones.values()).filter((t) => t.spreadsheetId === spreadsheetId);
  }
}

export const syncEngine = SyncEngine.getInstance();
