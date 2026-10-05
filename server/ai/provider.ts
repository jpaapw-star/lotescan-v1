import { GoogleGenAI, Type } from "@google/genai";
import { EstadoFisico } from "../../src/types/index.js";
import { AIKnowledgeEngine } from "./knowledge.js";

export interface BatchPhotoInput {
  id: string;
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

export interface ExtractedPhotoEvidenceItem {
  photoId: string;
  marca?: string;
  modelo?: string;
  serial?: string;
  serviceTag?: string;
  imei?: string;
  ean?: string;
  partNumber?: string;
  orderNumber?: string;
  custPo?: string;
  otherCodes?: { type: string; value: string }[];
  labelType?: string;
  qtde?: number;
  categoria?: string;
  estadoFisico?: EstadoFisico;
  descricaoAvaria?: string;
  confianca?: {
    modelo?: number;
    serial?: number;
    imei?: number;
    ean?: number;
  };
  observacoes?: string[];
  necessitaRevisao?: boolean;
  ilegivel?: boolean;
}

export interface ExtractedProduct {
  marca: string;
  modelo: string;
  serial?: string;
  serviceTag?: string; // Service Tag específico (Dell, etc.)
  imei?: string;
  ean?: string;
  partNumber?: string; // P/N
  orderNumber?: string;
  custPo?: string;
  otherCodes?: { type: string; value: string }[];
  labelType?: string; // CHASSIS, CAIXA, ETIQUETA_BARRAS, FRONTAL
  qtde: number; // Suporte a múltiplos produtos detectados na mesma foto
  categoria?: string; // celular, fone, livro, tablet, etc.
  estadoFisico: EstadoFisico; // NOVO_LACRADO, CAIXA_AMASSADA, AVARIADO
  descricaoAvaria?: string;
  confianca: {
    modelo: number;
    serial: number;
    imei: number;
    ean: number;
  };
  fotosAssociadas: string[];
  caracteristicas?: string[];
  observacoes?: string[];
  necessitaRevisao?: boolean;
  ilegivel?: boolean;
}

export interface BatchAnalysisResult {
  evidenciasPorFoto?: ExtractedPhotoEvidenceItem[];
  produtos: ExtractedProduct[];
  fotosOrfas: string[];
  fotosIlegiveis: string[];
  erros?: string[];
  falhaTotal?: boolean;
}

export interface AIProvider {
  name: string;
  analyzePhotos(
    photos: BatchPhotoInput[],
    context: { loteId: string; caixa: number }
  ): Promise<BatchAnalysisResult>;
}

export class GeminiProvider implements AIProvider {
  name = "Gemini Flash Lite";
  private ai: GoogleGenAI | null = null;
  private primaryModel = "gemini-3.5-flash-lite";
  private fallbackModel = "gemini-3.8-flash";

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }

  async analyzePhotos(
    photos: BatchPhotoInput[],
    context: { loteId: string; caixa: number }
  ): Promise<BatchAnalysisResult> {
    if (!photos || photos.length === 0) {
      return { produtos: [], fotosOrfas: [], fotosIlegiveis: [] };
    }

    if (!this.ai) {
      console.warn("GEMINI_API_KEY não configurada. Executando processador de contingência.");
      return this.emergencyFallback(photos);
    }

    // Tentar com retry e backoff exponencial
    const maxRetries = 3;
    let delay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeAnalysis(photos, context, this.primaryModel);
      } catch (err: any) {
        console.warn(`Tentativa ${attempt} falhou com ${this.primaryModel}:`, err.message || err);
        if (attempt === maxRetries) {
          try {
            console.log(`Tentando fallback com ${this.fallbackModel}...`);
            return await this.executeAnalysis(photos, context, this.fallbackModel);
          } catch (fallbackErr: any) {
            console.error("Fallback também falhou:", fallbackErr.message || fallbackErr);
            throw fallbackErr;
          }
        }
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2;
      }
    }

    throw new Error("Falha no processamento após múltiplas tentativas.");
  }

  private async executeAnalysis(
    photos: BatchPhotoInput[],
    context: { loteId: string; caixa: number },
    modelName: string
  ): Promise<BatchAnalysisResult> {
    if (!this.ai) throw new Error("Instância do Gemini não inicializada");

    const parts: any[] = [];
    const dynamicKnowledge = AIKnowledgeEngine.getInstance().getDynamicContextPrompt();

    parts.push({
      text: `VOCÊ É UM MOTOR INDUSTRIAL DE OCR, VISÃO COMPUTACIONAL E LEITURA DE ETIQUETAS DE PRODUTOS.
LOTE ATUAL: ${context.loteId} | CAIXA: ${context.caixa}
TOTAL DE FOTOS NESTE LOTE: ${photos.length}

${dynamicKnowledge}

INSTRUÇÕES RIGOROSAS DE LEITURA E IDENTIFICAÇÃO FÍSICA:
1. EXTRAÇÃO DE DADOS DE ETIQUETAS E IDENTIFICADORES:
   - 'marca': Fabricante real da foto (Dell, Asus, Acer, Apple, Samsung, JBL, etc.).
     ATENÇÃO: NUNCA confunda fabricantes! Se a foto for de etiqueta Dell, a marca é 'Dell'. Se for Acer, é 'Acer'. Se for Asus, é 'Asus'.
   - 'modelo': Nome do modelo exato do produto (ex: "Dell Latitude 3440", "Dell Inspiron 15 DC15-I51334U-A50", "Asus Vivobook E1504FA-NJ732", "Acer Aspire 3").
     PROIBIÇÃO DE MODELOS GENÉRICOS: NUNCA use termos genéricos como modelo final ("Computador", "Computador Dell", "Notebook Dell", "Laptop", "Produto", "Device", "Computer", "Desconhecida", "Desconhecido", "Produto Não Identificado").
     PROIBIÇÃO DE SERVICE TAG COMO MODELO: NUNCA coloque Service Tag, Serial, IMEI ou EAN no campo 'modelo' (ex: JAMAIS retorne "Dell 3843QM4" ou "Computador Dell (Service Tag 3843QM4)").
   - 'serviceTag': Código alfanumérico de 7 caracteres para equipamentos Dell (ex: "3843QM4", "55TQH24") ou equivalente.
   - 'serial': Serial Number (S/N) se visível na etiqueta/chassi.
   - 'imei': IMEI se visível (15 dígitos).
   - 'ean': Código de barras EAN-13/UPC/GTIN legível. REGRA: NÃO INVENTE EAN! Deixe vazio "" se não estiver nítido.
   - 'partNumber': P/N, DP/N ou Part Number visível na etiqueta.
   - 'orderNumber': Order Number se visível.
   - 'custPo': Cust PO se visível.
   - 'labelType': "CHASSIS" | "CAIXA" | "ETIQUETA_BARRAS" | "FRONTAL" | "OUTRO".
   - 'qtde': Quantidade física de itens identificados (mínimo 1).
   - 'categoria': "celular" | "tablet" | "fone" | "livro" | "notebook" | "eletronico" | "outro".

2. MULTI-ITEM & ÂNGULOS MÚLTIPLOS:
   - Se uma foto contiver múltiplos produtos diferentes, retorne UM OBJETO para cada produto físico.
   - Fotos de ângulos diferentes do mesmo item devem ser agrupadas com seus FOTO_IDs em 'fotosAssociadas'.
   - Se não tiver certeza de qual foto o produto pertence, deixe 'fotosAssociadas': []. NUNCA force a primeira foto!

3. FOTOS ILEGÍVEIS (FLUXO DE EXCEÇÃO):
   - Se uma foto estiver completamente desfocada, escura ou sem etiqueta legível, marque o FOTO_ID em 'fotosIlegiveis'.

4. RETORNE EXCLUSIVAMENTE UM JSON VÁLIDO CONFORME O SCHEMA.`
    });

    for (const photo of photos) {
      parts.push({
        text: `--- FOTO_ID: ${photo.id} (Nome: ${photo.filename}) ---`
      });
      parts.push({
        inlineData: {
          mimeType: photo.mimeType || "image/jpeg",
          data: photo.buffer.toString("base64"),
        },
      });
    }

    const response = await this.ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            evidenciasPorFoto: {
              type: Type.ARRAY,
              description: "Evidências e leituras extraídas individualmente de cada fotografia.",
              items: {
                type: Type.OBJECT,
                properties: {
                  photoId: { type: Type.STRING },
                  marca: { type: Type.STRING },
                  modelo: { type: Type.STRING },
                  serial: { type: Type.STRING },
                  serviceTag: { type: Type.STRING },
                  imei: { type: Type.STRING },
                  ean: { type: Type.STRING },
                  partNumber: { type: Type.STRING },
                  orderNumber: { type: Type.STRING },
                  custPo: { type: Type.STRING },
                  labelType: { type: Type.STRING },
                  qtde: { type: Type.INTEGER },
                  categoria: { type: Type.STRING },
                  estadoFisico: { type: Type.STRING },
                  descricaoAvaria: { type: Type.STRING },
                  confianca: {
                    type: Type.OBJECT,
                    properties: {
                      modelo: { type: Type.NUMBER },
                      serial: { type: Type.NUMBER },
                      imei: { type: Type.NUMBER },
                      ean: { type: Type.NUMBER },
                    },
                  },
                  necessitaRevisao: { type: Type.BOOLEAN },
                  ilegivel: { type: Type.BOOLEAN },
                },
                required: ["photoId"],
              },
            },
            produtos: {
              type: Type.ARRAY,
              description: "Lista de produtos identificados nas fotografias (suporta múltiplos itens por foto).",
              items: {
                type: Type.OBJECT,
                properties: {
                  marca: { type: Type.STRING },
                  modelo: { type: Type.STRING },
                  serial: { type: Type.STRING },
                  serviceTag: { type: Type.STRING, description: "Service Tag Dell (7 chars) ou equivalente" },
                  imei: { type: Type.STRING },
                  ean: { type: Type.STRING },
                  partNumber: { type: Type.STRING, description: "Part Number / P/N" },
                  orderNumber: { type: Type.STRING },
                  custPo: { type: Type.STRING },
                  labelType: { type: Type.STRING },
                  qtde: { type: Type.INTEGER, description: "Quantidade detectada na foto (mínimo 1)" },
                  categoria: { type: Type.STRING },
                  estadoFisico: {
                    type: Type.STRING,
                    description: "NOVO_LACRADO, CAIXA_AMASSADA, ou AVARIADO"
                  },
                  descricaoAvaria: { type: Type.STRING },
                  caracteristicas: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  fotosAssociadas: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  confianca: {
                    type: Type.OBJECT,
                    properties: {
                      modelo: { type: Type.NUMBER },
                      serial: { type: Type.NUMBER },
                      imei: { type: Type.NUMBER },
                      ean: { type: Type.NUMBER },
                    },
                    required: ["modelo", "serial", "imei", "ean"],
                  },
                  observacoes: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  necessitaRevisao: { type: Type.BOOLEAN },
                  ilegivel: { type: Type.BOOLEAN },
                },
                required: ["marca", "modelo", "fotosAssociadas", "confianca", "estadoFisico"],
              },
            },
            fotosOrfas: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "FOTO_IDs não associados a nenhum produto.",
            },
            fotosIlegiveis: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "FOTO_IDs com qualidade insuficiente, borradas ou ilegíveis.",
            },
          },
          required: ["produtos", "fotosOrfas", "fotosIlegiveis"],
        },
      },
    });

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("Resposta da IA vazia");
    }

    const parsed = JSON.parse(textOutput) as BatchAnalysisResult;
    AIKnowledgeEngine.getInstance().recordProcessedImages(photos.length);

    const photoIdSet = new Set(photos.map((p) => p.id));
    const assignedPhotoIds = new Set<string>();
    const fotosIlegiveisSet = new Set<string>(parsed.fotosIlegiveis || []);

    const cleanProdutos: ExtractedProduct[] = (parsed.produtos || []).map((p) => {
      const validPhotoIds = (p.fotosAssociadas || []).filter((id) => photoIdSet.has(id));
      validPhotoIds.forEach((id) => assignedPhotoIds.add(id));

      const rawEstado = String(p.estadoFisico || "").toUpperCase();
      let estadoFisico: EstadoFisico = "NOVO_LACRADO";
      if (rawEstado.includes("AVARIADO") || rawEstado.includes("DANIFICADO") || rawEstado.includes("QUEBRADO")) {
        estadoFisico = "AVARIADO";
      } else if (rawEstado.includes("AMASSADA") || rawEstado.includes("AMASSADO")) {
        estadoFisico = "CAIXA_AMASSADA";
      }

      // Avaliação por campo individual (Seção 17: FIELD_CONFIDENCE)
      // Se qualquer campo essencial tiver baixa confiança, necessita revisão
      const hasLowFieldConfidence =
        (p.confianca?.modelo !== undefined && p.confianca.modelo < 0.6) ||
        (p.confianca?.serial !== undefined && p.serial && p.confianca.serial < 0.6) ||
        (p.confianca?.ean !== undefined && p.ean && p.confianca.ean < 0.6);

      if (p.ilegivel) {
        validPhotoIds.forEach((id) => fotosIlegiveisSet.add(id));
      }

      // Normalizar marca e modelo
      let brand = (p.marca || "").trim();
      let model = (p.modelo || "").trim();
      let serial = (p.serial || "").trim();
      let serviceTag = (p.serviceTag || "").trim().toUpperCase();

      // Caso Dell: se o serial for de 7 caracteres e marca for Dell ou indefinida
      if (!serviceTag && serial && /^[A-Z0-9]{7}$/.test(serial.toUpperCase()) && (!brand || brand.toLowerCase().includes("dell"))) {
        serviceTag = serial.toUpperCase();
        if (!brand) brand = "Dell";
      }

      // Limpeza de Service Tag indevidamente incluído no modelo (Seção 18)
      if (serviceTag && model.includes(serviceTag)) {
        model = model.replace(new RegExp(`\\(?[Ss]ervice\\s*[Tt]ag\\s*[:\\-]?\\s*${serviceTag}\\)?`, "gi"), "").trim();
        model = model.replace(new RegExp(`\\(?S\\/N\\s*[:\\-]?\\s*${serviceTag}\\)?`, "gi"), "").trim();
        model = model.replace(new RegExp(serviceTag, "g"), "").trim();
      }

      // Se o modelo for genérico ou ficou vazio, marcar como pendente de confirmação
      const isGenericModel =
        !model ||
        /^(computador|notebook|laptop|produto|device|computer|desconhecida|desconhecido|produto não identificado)(\s+dell)?$/i.test(model);

      if (isGenericModel) {
        model = "PENDENTE_DE_CONFIRMACAO";
      }

      return {
        marca: brand,
        modelo: model,
        serial: serial,
        serviceTag: serviceTag || undefined,
        imei: (p.imei || "").trim(),
        ean: (p.ean || "").trim(),
        partNumber: p.partNumber ? String(p.partNumber).trim() : undefined,
        orderNumber: p.orderNumber ? String(p.orderNumber).trim() : undefined,
        custPo: p.custPo ? String(p.custPo).trim() : undefined,
        labelType: p.labelType ? String(p.labelType).trim() : undefined,
        qtde: Math.max(1, Number(p.qtde) || 1),
        categoria: (p.categoria || "outro").toLowerCase().trim(),
        estadoFisico,
        descricaoAvaria: p.descricaoAvaria || (estadoFisico === "NOVO_LACRADO" ? "Sem avarias visíveis" : "Avaria detectada"),
        confianca: {
          modelo: Math.min(1, Math.max(0, p.confianca?.modelo ?? 0.8)),
          serial: Math.min(1, Math.max(0, p.confianca?.serial ?? 0.8)),
          imei: Math.min(1, Math.max(0, p.confianca?.imei ?? 0.8)),
          ean: Math.min(1, Math.max(0, p.confianca?.ean ?? 0.8)),
        },
        // Seção 5: NUNCA usar photos[0].id como fallback! Se vazio, fica [] e vira PENDENTE_ASSOCIACAO
        fotosAssociadas: validPhotoIds,
        caracteristicas: p.caracteristicas || [],
        observacoes: p.observacoes || [],
        necessitaRevisao: p.necessitaRevisao || hasLowFieldConfidence || validPhotoIds.length === 0 || isGenericModel || false,
        ilegivel: p.ilegivel || false,
      };
    });

    // Detectar verdadeiros órfãos
    const orphans = photos
      .map((p) => p.id)
      .filter((id) => !assignedPhotoIds.has(id) && !fotosIlegiveisSet.has(id));

    return {
      evidenciasPorFoto: parsed.evidenciasPorFoto || [],
      produtos: cleanProdutos,
      fotosOrfas: Array.from(new Set([...(parsed.fotosOrfas || []), ...orphans])),
      fotosIlegiveis: Array.from(fotosIlegiveisSet),
    };
  }

  private emergencyFallback(photos: BatchPhotoInput[]): BatchAnalysisResult {
    // Mandato V2 (Seção 11): NÃO criar produto consolidado fictício se a IA estiver indisponível!
    // Preservar todas as fotos em fotosOrfas com status de contingência.
    const evidenciasPorFoto: ExtractedPhotoEvidenceItem[] = photos.map((p) => ({
      photoId: p.id,
      marca: "",
      modelo: "",
      confianca: { modelo: 0, serial: 0, imei: 0, ean: 0 },
      necessitaRevisao: true,
      observacoes: ["Aguardando análise da IA. Foto retida para reprocessamento."],
    }));

    return {
      evidenciasPorFoto,
      produtos: [],
      fotosOrfas: photos.map((p) => p.id),
      fotosIlegiveis: [],
      falhaTotal: true,
    };
  }
}
