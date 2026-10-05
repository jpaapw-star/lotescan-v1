export type DeviceId = string;
export type LoteId = string;

export interface Operator {
  id: string;
  name: string;
  role?: string;
  lastActive?: string;
  currentCaixa?: number;
}

export type BatchStatus = 'ABERTO' | 'PROCESSANDO' | 'CONCLUIDO' | 'ERRO';

export interface Batch {
  id: LoteId;
  deviceId: DeviceId;
  caixa: number; // CONGELADA para o lote
  status: BatchStatus;
  createdAt: string;
  totalPhotos: number;
  processedPhotos: number;
  pendingPhotos: number;
  errorPhotos: number;
  notes?: string;
  qrCode?: string;
  spreadsheetId?: string;
  version?: number;
  updatedAt?: string;
}

export type EstadoFisico = 'NOVO_LACRADO' | 'CAIXA_AMASSADA' | 'AVARIADO';

export type ProductStatus =
  | 'RECEBIDO'
  | 'PROCESSANDO'
  | 'IDENTIFICADO'
  | 'VALIDADO'
  | 'ATUALIZADO'
  | 'REVISAO'
  | 'DIGITADO_MANUALMENTE'
  | 'ERRO'
  | 'PENDENTE'
  | 'PENDENTE_ASSOCIACAO'
  | 'PENDENTE_CONFIRMACAO';

export interface ProductItem {
  id: string; // ID único do registro
  unitId?: string; // ID permanente da Unidade Física individual (Seção 12)
  skuId?: string; // ID permanente do Produto/SKU (Seção 2)
  modelo: string; // Coluna A: MODELO completo (Marca, Família, Modelo, Capacidade)
  serialImei: string; // Coluna B: SERIAL / IMEI consolidado
  serial?: string;
  serviceTag?: string; // Service Tag (Dell ou similar)
  imei?: string;
  ean: string; // Coluna C: EAN (sem invenção)
  partNumber?: string; // P/N
  orderNumber?: string;
  custPo?: string;
  qtde: number; // Coluna D: QTDE (normalmente 1, suporta multi-item)
  data: string; // Coluna E: DATA (YYYY-MM-DD)
  qtdCaixa?: number; // Coluna F: QTD/CAIXA (contagem da caixa)
  qtdDia?: number; // Compatibilidade retroativa
  caixa?: number; // Coluna G: CAIXA (congelada do lote ou sem caixa se removida)
  nfe: string; // Coluna H: NFE (preenchimento manual ou importada)
  linkFoto: string; // Coluna I: LINK FOTO ("VER FOTO")
  photoIds: string[]; // IDs das fotos associadas ao produto
  deviceId: DeviceId;
  loteId: LoteId;
  status: ProductStatus;
  confidence: {
    modelo: number;
    serial: number;
    imei: number;
    ean: number;
    identityMatch?: number;
    overall?: number;
  };
  marca?: string;
  categoria?: string; // celular, livro, tablet, fone, etc.
  estadoFisico?: EstadoFisico; // Opcional
  descricaoAvaria?: string;
  hasPhysicalIdentifier?: boolean;
  associationAudit?: {
    resolvedAt: string;
    confidenceMatch: number;
    reasons: string[];
    criteria?: string;
  };
  caracteristicas?: string[];
  observacoes?: string[];
  digitadoManualmente?: boolean;
  criadoEm?: string;
  atualizadoEm?: string;
  updatedAt?: string;
  spreadsheetId?: string;
  version?: number;
  contentHash?: string;
}

// ----------------------------------------------------
// RESOLUÇÃO DE IDENTIDADE FÍSICA (MANDATO SCANLOTE AI)
// 1. PRODUTO/SKU: Aquilo que é comercialmente igual (Marca, Modelo, EAN, P/N)
// 2. UNIDADE FÍSICA: Objeto físico individual (unitId, Service Tag, Serial, IMEI, fotos)
// 3. FOTO/EVIDÊNCIA: Registro pontual pertencente a uma unidade física
// ----------------------------------------------------

export interface ProductSku {
  skuId: string; // ID permanente do SKU (ex: SKU_DELL_DC15-I51334U-A50_7899864956294)
  marca: string;
  modelo: string;
  ean: string;
  partNumber?: string;
  categoria?: string;
  unidadesCount: number;
}

export type PhysicalUnitStatus =
  | 'IDENTIFICADO'
  | 'VALIDADO'
  | 'PENDENTE_ASSOCIACAO'
  | 'PENDENTE_CONFIRMACAO'
  | 'SEM_IDENTIFICADOR_FISICO'
  | 'REVISAO';

export interface PhysicalUnit {
  unitId: string; // ID permanente da Unidade Física individual (Seção 12)
  skuId?: string; // ID permanente do Produto/SKU (Seção 2)
  productId?: string; // Vínculo ao ID da linha de produto
  brand: string;
  model: string;
  serial?: string;
  serviceTag?: string; // Service Tag Dell ou equivalente (Seção 3 & 7)
  imei?: string;
  serialImei: string;
  ean: string;
  partNumber?: string;
  orderNumber?: string;
  custPo?: string;
  photoIds: string[];
  qtde: number;
  caixa?: number;
  loteId: string;
  status: PhysicalUnitStatus;
  hasPhysicalIdentifier: boolean; // Seção 14: true se possui identificador físico forte
  confidence: {
    modelo: number;
    serial: number;
    imei: number;
    ean: number;
    identityMatch: number; // Confiança de associação entre fotos e unidade
    overall: number;
  };
  associationAudit?: {
    resolvedAt: string;
    confidenceMatch: number;
    reasons: string[];
    criteria?: string;
  };
  candidateUnitIds?: string[]; // Quando há mais de um candidato concorrente (Seção 9)
  category?: string;
  estadoFisico?: EstadoFisico;
  descricaoAvaria?: string;
  needsReview?: boolean;
  reviewReason?: string;
  spreadsheetId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StoredPhoto {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  loteId: LoteId;
  deviceId: DeviceId;
  caixa?: number;
  unitId?: string | null; // Relacionamento primário por unitId (Seção 12)
  associatedProductId: string | null;
  isOrphan: boolean;
  uploadedAt: string;
  status: 'RECEBIDO' | 'PROCESSANDO' | 'ASSOCIADO' | 'PENDENTE_ASSOCIACAO' | 'PENDENTE_CONFIRMACAO' | 'ORFAO' | 'ILEGIVEL' | 'ERRO';
  evidenceType?: 'APARELHO' | 'ETIQUETA' | 'CAIXA' | 'EAN' | 'MULTI_PRODUTOS' | 'CHASSIS' | 'OUTRO';
  detectedText?: string;
  detectedItemsCount?: number;
  candidateUnitIds?: string[]; // IDs de unidades candidatas em caso de ambiguidade (Seção 9)
  error?: string;
  revisaoMotivo?: string;
  driveUrl?: string;
  isPurged?: boolean;
  spreadsheetId?: string;
}

export type AuditLogType =
  | 'ENTRADA'
  | 'PROCESSAMENTO'
  | 'ATUALIZACAO'
  | 'ASSOCIACAO_FOTO'
  | 'FALHA'
  | 'REPROCESSAMENTO'
  | 'CORRECAO'
  | 'CAIXA_ASSOCIADA'
  | 'DEDUPLICACAO'
  | 'LOTE_INICIADO'
  | 'MANIFESTO_IMPORTADO'
  | 'FOTO_ILEGIVEL'
  | 'DIGITACAO_MANUAL'
  | 'ALERTA_DISPARADO'
  | 'QR_CODE_ESCANNEADO';

export interface AuditLog {
  id: string;
  timestamp: string;
  deviceId: DeviceId;
  loteId: LoteId;
  tipo: AuditLogType;
  detalhes: string;
  productId?: string;
  photoId?: string;
  spreadsheetId?: string;
}

export interface SystemStats {
  loteAtual: string;
  caixaAtual: number;
  fotosRecebidas: number;
  fotosProcessadas: number;
  fotosPendentes: number;
  fotosErros: number;
  fotosIlegiveis: number;
  produtosIdentificados: number;
  avariasTotal: number;
  totalCaixas: number;
  caixasDivergentes: number;
}

// 1. DASHBOARD PRINCIPAL "RESUMO_CAIXAS"
// [A: CAIXA] | [B: DATA_CRIACAO] | [C: LOTE_ID] | [D: QTD_LIDA] | [E: QTD_MANIFESTO] | [F: STATUS] | [G: DIVERGENCIA_AUDITORIA] | [H: REVISAO_MANUAL] | [I: AVARIAS_DETECTADAS] | [J: OPERADOR_RESPONSAVEL]
export interface ResumoCaixa {
  caixa: number; // Col A: CAIXA
  dataCriacao: string; // Col B: DATA_CRIACAO (dd/mm/aaaa)
  loteId: string; // Col C: LOTE_ID
  qtdLida: number; // Col D: QTD_LIDA
  qtdManifesto: number; // Col E: QTD_MANIFESTO
  status: 'RECEBIDO' | 'EM PROCESSAMENTO' | 'CONCLUÍDO'; // Col F: STATUS
  divergenciaAuditoria: string; // Col G: DIVERGENCIA_AUDITORIA ("🟢 Bateu!" ou "🔴 Faltam X itens" ou "🟡 Sobraram X itens")
  revisaoManual: number; // Col H: REVISAO_MANUAL (quantas fotos ficaram ilegíveis ou exigem validação)
  avariasDetectadas: number; // Col I: AVARIAS_DETECTADAS
  operadorResponsavel: string; // Col J: OPERADOR_RESPONSAVEL
  qrCode: string;
  itensConferidos?: number;
  itensFaltantes?: number;
  itensSobrando?: number;
  spreadsheetId?: string;
  version?: number;
  updatedAt?: string;
}

// 2. MANIFESTO / NOTA FISCAL (IMPORTAÇÃO VIA PDF)
export interface ManifestoItem {
  id: string;
  nfe: string;
  fornecedor: string;
  dataEmissao: string;
  codigoItem?: string;
  descricao: string;
  ean: string;
  quantidade: number;
  valorUnitario?: number;
  categoria?: string;
  caixaSugerida?: number;
  qtdConferida: number;
  status: 'PENDENTE' | 'PARCIAL' | 'CONFERIDO' | 'DIVERGENTE';
}

export interface ManifestoDoc {
  id: string;
  nfe: string;
  fornecedor: string;
  dataEmissao: string;
  chaveAcesso?: string;
  valorTotal?: number;
  totalItens: number;
  totalUnidades: number;
  importadoEm: string;
  arquivoNome: string;
  itens: ManifestoItem[];
  spreadsheetId?: string;
  version?: number;
  updatedAt?: string;
}

// 3. CONFIGURAÇÕES DE ALERTAS (TELEGRAM / WHATSAPP)
export interface AlertConfig {
  telegramBotToken: string;
  telegramChatId: string;
  whatsappNumber: string;
  webhookUrl: string;
  alertarNaDivergencia: boolean;
  alertarEmAvaria: boolean;
  alertarAoConcluirCaixa: boolean;
}
