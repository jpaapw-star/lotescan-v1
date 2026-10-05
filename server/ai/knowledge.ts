import fs from "fs";
import path from "path";

export interface PatternRule {
  brand: string;
  category: string;
  serialPatternDescription: string;
  exampleValidSerial: string;
  labelLayoutTips: string;
}

export interface OperatorCorrection {
  timestamp: string;
  operatorId: string;
  tipo: "SERIAL" | "MODELO" | "EAN" | "AVARIA" | "GERAL";
  original: {
    modelo?: string;
    serial?: string;
    ean?: string;
  };
  corrected: {
    modelo?: string;
    serial?: string;
    ean?: string;
    estadoFisico?: string;
  };
  nota?: string;
}

export interface AIKnowledgeData {
  version: number;
  lastUpdated: string;
  totalImagesProcessed: number;
  totalCorrectionsApplied: number;
  patterns: PatternRule[];
  recentCorrections: OperatorCorrection[];
}

const STORAGE_DIR = path.resolve(process.cwd(), "storage");
const KNOWLEDGE_FILE = path.resolve(STORAGE_DIR, "ai-knowledge.json");

export class AIKnowledgeEngine {
  private static instance: AIKnowledgeEngine;
  private data: AIKnowledgeData = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    totalImagesProcessed: 0,
    totalCorrectionsApplied: 0,
    patterns: [
      {
        brand: "Apple (iPhone/iPad/Watch/AirPods)",
        category: "celular/tablet/fone",
        serialPatternDescription: "Serial alfanumérico de 10 ou 12 dígitos, sem espaços. IMEI com 15 dígitos numéricos exatos.",
        exampleValidSerial: "F2LX9ABCD123 / IMEI: 356789101234567",
        labelLayoutTips: "No iPhone/iPad, a etiqueta da caixa contém 'Serial No.' e 'IMEI/MEID'. Sempre capture ambos sem truncar.",
      },
      {
        brand: "Samsung (Galaxy / Buds / Tab)",
        category: "celular/tablet/fone",
        serialPatternDescription: "Serial alfanumérico de 11 a 15 caracteres (geralmente começa com R ou RF). IMEI com 15 dígitos.",
        exampleValidSerial: "R5CR123ABCD / IMEI: 354321098765432",
        labelLayoutTips: "Etiqueta branca com código de barras Code-128 e Datamatrix. EAN-13 começa frequentemente com 789 ou 880.",
      },
      {
        brand: "JBL (Caixas de Som / Fones)",
        category: "fone/eletronico",
        serialPatternDescription: "Geralmente começa com 2 letras (GG, TL, ND, TT) seguido de números e letras.",
        exampleValidSerial: "GG0123-CD45678",
        labelLayoutTips: "Serial impresso em código de barras na parte inferior da caixa ou etiqueta lateral.",
      },
      {
        brand: "Livros / Manuais Técnicos",
        category: "livro",
        serialPatternDescription: "Não possui número de série serializável individual. O identificador principal é o ISBN/EAN de 13 dígitos.",
        exampleValidSerial: "EAN: 9788576082675 (ISBN-13)",
        labelLayoutTips: "Código de barras no verso do livro. O EAN-13 sempre começa com 978 ou 979.",
      },
    ],
    recentCorrections: [],
  };

  private centralOwnerToken: string | null = null;
  private aiMemorySpreadsheetId: string | null = null;

  setCentralOwnerToken(token: string) {
    this.centralOwnerToken = token;
    this.syncWithGoogleSheet();
  }

  setAiMemorySpreadsheetId(id: string) {
    this.aiMemorySpreadsheetId = id;
    this.syncWithGoogleSheet();
  }

  async syncWithGoogleSheet() {
    if (!this.centralOwnerToken || !this.aiMemorySpreadsheetId) return;
    try {
      // 1. Ler padrões da aba AI_PATTERNS
      const patternsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.aiMemorySpreadsheetId}/values/AI_PATTERNS!A2:E`;
      const patRes = await fetch(patternsUrl, {
        headers: { Authorization: `Bearer ${this.centralOwnerToken}` },
      });
      if (patRes.ok) {
        const patData = await patRes.json();
        const rows = patData.values || [];
        if (rows.length > 0) {
          this.data.patterns = rows.map((r: any[]) => ({
            brand: String(r[0] || "").trim(),
            category: String(r[1] || "").trim(),
            serialPatternDescription: String(r[2] || "").trim(),
            exampleValidSerial: String(r[3] || "").trim(),
            labelLayoutTips: String(r[4] || "").trim(),
          }));
        }
      }

      // 2. Ler correções da aba AI_CORRECTIONS
      const correctionsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.aiMemorySpreadsheetId}/values/AI_CORRECTIONS!A2:G`;
      const corRes = await fetch(correctionsUrl, {
        headers: { Authorization: `Bearer ${this.centralOwnerToken}` },
      });
      if (corRes.ok) {
        const corData = await corRes.json();
        const rows = corData.values || [];
        if (rows.length > 0) {
          this.data.recentCorrections = rows.map((r: any[]) => ({
            timestamp: String(r[0] || "").trim(),
            operatorId: String(r[1] || "Operador").trim(),
            tipo: String(r[2] || "GERAL") as any,
            original: { modelo: String(r[3] || "").trim() },
            corrected: { modelo: String(r[4] || "").trim() },
            nota: String(r[5] || "").trim(),
          })).reverse().slice(0, 50); // Últimas 50
        }
      }

      this.save();
    } catch (err) {
      console.warn("Falha na sincronização da base central da IA:", err);
    }
  }

  private constructor() {
    this.load();
  }

  static getInstance(): AIKnowledgeEngine {
    if (!AIKnowledgeEngine.instance) {
      AIKnowledgeEngine.instance = new AIKnowledgeEngine();
    }
    return AIKnowledgeEngine.instance;
  }

  private load() {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    if (fs.existsSync(KNOWLEDGE_FILE)) {
      try {
        const raw = fs.readFileSync(KNOWLEDGE_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        this.data = {
          ...this.data,
          ...parsed,
          patterns: parsed.patterns || this.data.patterns,
          recentCorrections: parsed.recentCorrections || [],
        };
      } catch (e) {
        console.warn("Erro ao carregar base de conhecimento da IA:", e);
      }
    } else {
      this.save();
    }
  }

  private save() {
    try {
      this.data.lastUpdated = new Date().toISOString();
      fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (e) {
      console.warn("Erro ao salvar base de conhecimento da IA:", e);
    }
  }

  recordProcessedImages(count: number) {
    this.data.totalImagesProcessed += count;
    this.save();
  }

  async addCorrection(correction: Omit<OperatorCorrection, "timestamp">) {
    const item: OperatorCorrection = {
      ...correction,
      timestamp: new Date().toISOString(),
    };

    // Mantém as últimas 50 correções para contexto ágil
    this.data.recentCorrections.unshift(item);
    if (this.data.recentCorrections.length > 50) {
      this.data.recentCorrections.pop();
    }

    this.data.totalCorrectionsApplied += 1;
    this.save();

    // Sincronizar gravação imediata na planilha central da IA se o token estiver ativo (Requisito 28)
    if (this.centralOwnerToken && this.aiMemorySpreadsheetId) {
      try {
        const row = [
          item.timestamp,
          item.operatorId || "Operador",
          item.tipo,
          item.original.modelo || item.original.serial || item.original.ean || "",
          item.corrected.modelo || item.corrected.serial || item.corrected.ean || "",
          item.nota || "",
          "jpaapw@gmail.com" // Metadado de auditoria central
        ];
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.aiMemorySpreadsheetId}/values/AI_CORRECTIONS:append?valueInputOption=USER_ENTERED`;
        await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.centralOwnerToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: [row] }),
        });
      } catch (err) {
        console.warn("Erro ao registrar correção na planilha central de IA:", err);
      }
    }
  }

  /**
   * Constrói o bloco de prompt dinâmico injetando as diretrizes aprendidas e histórico de correções
   */
  getDynamicContextPrompt(): string {
    const patternsText = this.data.patterns
      .map(
        (p) =>
          `• [${p.brand}]: ${p.serialPatternDescription}. Exemplo: ${p.exampleValidSerial}. Dica: ${p.labelLayoutTips}`
      )
      .join("\n");

    let correctionsText = "";
    if (this.data.recentCorrections.length > 0) {
      const topCorrections = this.data.recentCorrections.slice(0, 6);
      correctionsText =
        "\nCORREÇÕES HUMANAS RECENTES (APRENDA COM ESTES CASOS E EVITE REPETIR OS MESMOS ERROS):\n" +
        topCorrections
          .map((c) => {
            const orig = `${c.original.modelo || ""} ${c.original.serial || ""} ${c.original.ean || ""}`.trim();
            const corr = `${c.corrected.modelo || ""} ${c.corrected.serial || ""} ${c.corrected.ean || ""}`.trim();
            return `  - Operador corrigiu: "${orig || "Item não lido"}" ➔ PARA: "${corr}" (Motivo/Tipo: ${c.tipo})`;
          })
          .join("\n");
    }

    return `
BASE DE CONHECIMENTO PERSISTENTE E APRENDIZADO ADAPTATIVO:
Padrões estruturais confirmados em lotes anteriores:
${patternsText}
${correctionsText}

DIRETRIZES DE CONTINUIDADE:
1. Nunca invente dígitos faltantes em códigos de barras ou etiquetas.
2. Em etiquetas com múltiplos códigos de barras (ex: IMEI1, IMEI2, SN, EAN), mapeie estritamente cada valor ao seu respectivo campo sem truncamento.
3. Se um produto for um livro ou item sem serial individual, mantenha 'serial' e 'imei' vazios e preencha o EAN-13 obrigatório.
`;
  }

  getStats() {
    return {
      totalProcessed: this.data.totalImagesProcessed,
      totalCorrections: this.data.totalCorrectionsApplied,
      learnedPatternsCount: this.data.patterns.length,
      recentCorrections: this.data.recentCorrections.slice(0, 10),
    };
  }
}
