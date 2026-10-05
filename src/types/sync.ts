import { ProductItem, Batch, ResumoCaixa, ManifestoDoc, StoredPhoto } from "./index";

/**
 * Estados explícitos da sincronização conforme Mandato Técnico (Seção 32)
 */
export type SyncStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "PINGING"
  | "READING_REMOTE"
  | "SNAPSHOT_CREATED"
  | "COMPARING"
  | "APPLYING_REMOTE_CHANGES"
  | "PROCESSING_OUTBOX"
  | "VERIFYING"
  | "SYNCED"
  | "ERROR";

/**
 * Identidade e estado da conexão da planilha (Seção 5)
 */
export interface SpreadsheetConnection {
  spreadsheetId: string;
  spreadsheetName: string;
  spreadsheetUrl: string;
  connectionStatus: SyncStatus;
  connectedAt: string;
  lastSuccessfulSync: string | null;
  lastRemoteRevision: string | null;
  error?: string | null;
}

/**
 * Resultado do handshake/ping com a planilha (Seção 7)
 */
export interface PingResult {
  success: boolean;
  spreadsheetId: string;
  spreadsheetName: string;
  schemaVersion: string;
  scanLoteVersion: string;
  syncVersion: string;
  lastModified: string;
  productsCount: number;
  lotsCount: number;
  boxesCount: number;
  nfesCount: number;
  photosCount: number;
  status: "OK" | "EMPTY" | "ERROR";
  error?: string;
  existingSheets?: string[];
}

/**
 * Snapshot remoto confirmado da planilha em determinado instante (Seção 8)
 */
export interface RemoteSnapshot {
  snapshotId: string;
  spreadsheetId: string;
  readAt: string;
  hash: string;
  products: ProductItem[];
  lots: Batch[];
  boxes: ResumoCaixa[];
  nfes: ManifestoDoc[];
  photos: StoredPhoto[];
  counts: {
    products: number;
    lots: number;
    boxes: number;
    nfes: number;
    photos: number;
  };
}

/**
 * Resultado da comparação e classificação de alterações pelo DiffEngine (Seção 13)
 */
export interface DiffResult<T> {
  newRecords: T[];
  changedRecords: T[];
  deletedRemotely: string[]; // IDs das entidades removidas remotamente
  unchanged: T[];
  pendingLocalChanges: T[];
  conflicts: { local: T; remote: T; reason: string }[];
}

/**
 * Tombstone / Proteção anti-ressurreição para entidades deletadas remotamente (Seção 15)
 */
export interface Tombstone {
  entityId: string;
  entityType: "PRODUCT" | "BATCH" | "MANIFESTO" | "BOX" | "PHOTO";
  spreadsheetId: string;
  deletedAt: string;
  source: "GOOGLE_SHEETS" | "USER_ACTION";
  expiresAt?: string; // TTL para expiração temporária automática
  serial?: string;
  imei?: string;
  ean?: string;
  modelo?: string;
}

/**
 * Operação da fila local de escrita idempotente (Seção 19 & 20)
 */
export interface OutboxOperation {
  id?: string;
  operationId: string;
  spreadsheetId: string;
  entityType: "PRODUCT" | "BATCH" | "MANIFESTO" | "BOX" | "PHOTO";
  entityId: string;
  operation: "CREATE" | "UPDATE" | "DELETE";
  payload: any;
  version?: number;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "RETRY";
  attempts: number;
  lastError?: string;
  createdAt?: string;
  updatedAt?: string;
  timestamp?: string;
  idempotencyKey?: string;
}

/**
 * Registro de auditoria de sincronização (Seções 30 & 31)
 */
export interface SyncLogEntry {
  syncId: string;
  timestamp: string;
  spreadsheetId: string;
  remoteCount: number;
  localCount: number;
  newCount: number;
  changedCount: number;
  deletedCount: number;
  sentCount: number;
  conflictCount: number;
  errorCount: number;
  durationMs: number;
  status: "SUCCESS" | "FAILED" | "PARTIAL";
  details?: string;
}
