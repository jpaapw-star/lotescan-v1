import { EstadoFisico, ProductStatus } from "../../src/types/index.js";

export type EvidenceSource =
  | "PHOTO_LABEL"
  | "PHOTO_DEVICE"
  | "PHOTO_BOX"
  | "BARCODE_OCR"
  | "OCR_TEXT"
  | "VISION_AI"
  | "LOCAL_DB"
  | "EXTERNAL_MEMORY"
  | "MANUFACTURER_CATALOG"
  | "EXTERNAL_WEB"
  | "USER_CONFIRMATION"
  | "CROSS_PHOTO";

export interface FieldEvidence<T = any> {
  field: string;
  value: T;
  source: EvidenceSource;
  confidence: number; // 0.0 a 1.0
  rawDetection?: string;
  verified?: boolean;
}

export interface PhotoInputData {
  id: string;
  buffer: Buffer;
  mimeType: string;
  filename: string;
  caixa?: number;
  loteId?: string;
}

export interface ExtractedPhotoEvidence {
  photoId: string;
  captureIndex?: number;
  detected: {
    brand?: string;
    model?: string;
    serial?: string;
    serviceTag?: string; // Service Tag específico (Dell ou equivalente)
    imei?: string;
    ean?: string;
    partNumber?: string; // P/N
    orderNumber?: string;
    custPo?: string;
    category?: string;
    condition?: EstadoFisico;
    conditionDescription?: string;
    otherCodes?: { type: string; value: string }[];
    itemCountInPhoto?: number;
    labelType?: string; // CHASSIS, CAIXA, ETIQUETA_BARRAS, FRONTAL
  };
  evidenceSources: {
    brand?: EvidenceSource;
    model?: EvidenceSource;
    serial?: EvidenceSource;
    serviceTag?: EvidenceSource;
    imei?: EvidenceSource;
    ean?: EvidenceSource;
    partNumber?: EvidenceSource;
    orderNumber?: EvidenceSource;
    custPo?: EvidenceSource;
    condition?: EvidenceSource;
  };
  confidence: {
    brand: number;
    model: number;
    serial: number;
    imei: number;
    ean: number;
    identityMatch?: number; // Confiança de correlação/agrupamento de identidade
    overall: number;
  };
  isIllegible?: boolean;
  needsReview?: boolean;
  reviewReason?: string;
}

export interface BrandPatternKnowledge {
  brandId: string;
  brandName: string;
  aliases: string[];
  category: string;
  serialPatternDescription: string;
  serialRegex?: string;
  serialMinLength?: number;
  serialMaxLength?: number;
  serialPrefixes?: string[];
  imeiRequired?: boolean;
  eanPrefixes?: string[];
  exampleValidSerial: string;
  labelLayoutTips: string;
  confidence: number;
  updatedAt: string;
}

export interface MemoryLearningRecord {
  learningId: string;
  brand: string;
  model: string;
  field: string;
  observedValue: string;
  validatedValue: string;
  source: EvidenceSource;
  confidence: number;
  occurrences: number;
  version: number;
  lastSeen: string;
}

export interface PhysicalProductInstance {
  instanceId: string;
  unitId: string; // ID permanente da Unidade Física individual (Seção 12 & 13)
  skuId?: string; // ID do Produto/SKU (Seção 2)
  brand: string;
  model: string;
  serial?: string;
  serviceTag?: string; // Service Tag (Dell ou similar)
  imei?: string;
  serialImei: string;
  ean: string;
  rawCodes?: string[];
  otherCodes?: string;
  partNumber?: string;
  orderNumber?: string;
  custPo?: string;
  qtde: number;
  caixa?: number;
  loteId: string;
  status: ProductStatus;
  photoIds: string[];
  fieldEvidences: Record<string, FieldEvidence>;
  confidence: {
    modelo: number;
    serial: number;
    imei: number;
    ean: number;
    identityMatch: number; // Confiança da resolução de identidade/agrupamento
    overall: number;
  };
  category?: string;
  estadoFisico?: EstadoFisico;
  descricaoAvaria?: string;
  needsReview: boolean;
  reviewReason?: string;
  sourcesUsed: EvidenceSource[];
  isConfirmed: boolean;
  hasPhysicalIdentifier: boolean; // Se possui serial/service tag/IMEI físico ou se é sem serial
  candidateUnitIds?: string[]; // Candidatos em caso de ambiguidade (Seção 9)
  associationAudit?: {
    resolvedAt: string;
    confidenceMatch: number;
    reasons: string[];
    criteria: string;
  };
}

export interface AIProvider {
  name: string;
  analyzeImage(
    photo: PhotoInputData,
    context?: { loteId: string; caixa: number }
  ): Promise<ExtractedPhotoEvidence>;
  extractCodes(
    photo: PhotoInputData
  ): Promise<{ serial?: string; imei?: string; ean?: string; otherCodes?: string[] }>;
  identifyModel(
    photo: PhotoInputData,
    knownCodes?: { serial?: string; ean?: string }
  ): Promise<{ brand?: string; model?: string; confidence: number }>;
}
