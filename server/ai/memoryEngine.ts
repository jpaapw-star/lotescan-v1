import fs from "fs";
import path from "path";
import { BrandPatternKnowledge, MemoryLearningRecord } from "./types.js";

const STORAGE_DIR = path.resolve(process.cwd(), "storage");
const MEMORY_CACHE_FILE = path.resolve(STORAGE_DIR, "ai-memory-cache.json");

export class AIMemoryEngine {
  private static instance: AIMemoryEngine;

  private brandPatterns: Map<string, BrandPatternKnowledge> = new Map();
  private modelKnowledge: Map<string, { model: string; brand: string; ean?: string; category?: string; confidence: number }> = new Map();
  private learningRecords: Map<string, MemoryLearningRecord> = new Map();
  private eanToModelMap: Map<string, { model: string; brand: string; category?: string }> = new Map();

  private centralOwnerToken: string | null = null;
  private memorySpreadsheetId: string | null = null;

  private constructor() {
    this.initDefaultKnowledge();
    this.loadFromCache();
  }

  public static getInstance(): AIMemoryEngine {
    if (!AIMemoryEngine.instance) {
      AIMemoryEngine.instance = new AIMemoryEngine();
    }
    return AIMemoryEngine.instance;
  }

  public setCentralOwnerToken(token: string) {
    this.centralOwnerToken = token;
  }

  public setMemorySpreadsheetId(id: string) {
    this.memorySpreadsheetId = id;
  }

  public getMemorySpreadsheetId(): string | null {
    return this.memorySpreadsheetId;
  }

  private initDefaultKnowledge() {
    // 1. Padrões de Fabricantes Essenciais (Seção 6, 9 & 28)
    const defaults: BrandPatternKnowledge[] = [
      {
        brandId: "BRAND_APPLE",
        brandName: "Apple",
        aliases: ["APPLE", "IPHONE", "IPAD", "MACBOOK", "AIRPODS", "APPLE WATCH"],
        category: "celular/tablet/notebook/fone",
        serialPatternDescription: "Serial alfanumérico com 10 ou 12 caracteres (ex: F2LX9ABCD123). IMEI de 15 dígitos.",
        serialRegex: "^[A-Z0-9]{10}$|^[A-Z0-9]{12}$",
        serialMinLength: 10,
        serialMaxLength: 12,
        imeiRequired: true,
        exampleValidSerial: "F2LX9ABCD123",
        labelLayoutTips: "Caixa traseira com 'Serial No.' e 'IMEI/MEID'. EAN-13 UPC geralmente começa com 190, 194 ou 195.",
        confidence: 0.99,
        updatedAt: new Date().toISOString(),
      },
      {
        brandId: "BRAND_SAMSUNG",
        brandName: "Samsung",
        aliases: ["SAMSUNG", "GALAXY"],
        category: "celular/tablet/fone",
        serialPatternDescription: "Serial de 11 a 15 caracteres alfanuméricos, frequentemente iniciando com R, RF, RX ou RR.",
        serialRegex: "^[A-Z0-9]{11,15}$",
        serialMinLength: 11,
        serialMaxLength: 15,
        serialPrefixes: ["R", "RF", "RX", "RR"],
        imeiRequired: true,
        exampleValidSerial: "R5CR123ABCD",
        labelLayoutTips: "Etiqueta com código de barras Code-128 e Datamatrix. EAN-13 começa frequentemente com 789 ou 880.",
        confidence: 0.99,
        updatedAt: new Date().toISOString(),
      },
      {
        brandId: "BRAND_ASUS",
        brandName: "ASUS",
        aliases: ["ASUS", "VIVOBOOK", "ZENBOOK", "ROG"],
        category: "notebook/hardware",
        serialPatternDescription: "Serial alfanumérico de 15 caracteres (ex: M5N0CV12345678A), frequentemente iniciando com letras e números misturados.",
        serialRegex: "^[A-Z0-9]{12,18}$",
        serialMinLength: 12,
        serialMaxLength: 18,
        exampleValidSerial: "M5N0CV01234567A",
        labelLayoutTips: "Etiqueta na parte inferior do chassi ou caixa externa com 'Serial No. / Check Number'. EAN começa com 471 ou 789.",
        confidence: 0.98,
        updatedAt: new Date().toISOString(),
      },
      {
        brandId: "BRAND_JBL",
        brandName: "JBL",
        aliases: ["JBL", "HARMAN"],
        category: "fone/caixa_de_som",
        serialPatternDescription: "Inicia frequentemente com prefixo de 2 letras (GG, TL, ND, TT) seguido de números.",
        serialRegex: "^[A-Z]{2}[0-9A-Z\\-]{8,14}$",
        serialMinLength: 8,
        serialMaxLength: 16,
        serialPrefixes: ["GG", "TL", "ND", "TT", "BB"],
        exampleValidSerial: "GG0123-CD45678",
        labelLayoutTips: "Código de barras no fundo da embalagem ou etiqueta lateral. EAN-13 geralmente começa com 692528.",
        confidence: 0.97,
        updatedAt: new Date().toISOString(),
      },
      {
        brandId: "BRAND_MOTOROLA",
        brandName: "Motorola",
        aliases: ["MOTOROLA", "MOTO"],
        category: "celular",
        serialPatternDescription: "Serial geralmente com 10 caracteres ou IMEI de 15 dígitos.",
        serialRegex: "^[A-Z0-9]{8,12}$",
        serialMinLength: 8,
        serialMaxLength: 12,
        imeiRequired: true,
        exampleValidSerial: "ZY2234ABCD",
        labelLayoutTips: "Etiqueta na caixa com IMEI 1 e IMEI 2 destacados com código de barras Code 128.",
        confidence: 0.97,
        updatedAt: new Date().toISOString(),
      },
      {
        brandId: "BRAND_DELL",
        brandName: "Dell",
        aliases: ["DELL", "INSPIRON", "LATITUDE", "VOSTRO", "ALIENWARE"],
        category: "notebook/desktop/servidor",
        serialPatternDescription: "Service Tag alfanumérica de exatamente 7 caracteres (letras e números maiúsculos).",
        serialRegex: "^[A-Z0-9]{7}$",
        serialMinLength: 7,
        serialMaxLength: 7,
        exampleValidSerial: "7G2X8B1",
        labelLayoutTips: "Etiqueta de serviço com 'Service Tag (S/N)' e 'Express Service Code'.",
        confidence: 0.99,
        updatedAt: new Date().toISOString(),
      },
      {
        brandId: "BRAND_PEARSON",
        brandName: "Pearson / Livros",
        aliases: ["PEARSON", "LIVRO", "EDITORA"],
        category: "livro",
        serialPatternDescription: "Não possui número de série serializável individual. O identificador único padrão é o ISBN-13/EAN.",
        serialMinLength: 0,
        serialMaxLength: 0,
        exampleValidSerial: "EAN: 9788576082675",
        labelLayoutTips: "Código de barras no verso do livro. O EAN-13 sempre começa com prefixo 978 ou 979.",
        confidence: 0.99,
        updatedAt: new Date().toISOString(),
      },
    ];

    defaults.forEach((b) => {
      this.brandPatterns.set(b.brandName.toUpperCase(), b);
    });
  }

  private loadFromCache() {
    try {
      if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
      }
      if (fs.existsSync(MEMORY_CACHE_FILE)) {
        const raw = fs.readFileSync(MEMORY_CACHE_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.patterns)) {
          parsed.patterns.forEach((p: BrandPatternKnowledge) => {
            this.brandPatterns.set(p.brandName.toUpperCase(), p);
          });
        }
        if (Array.isArray(parsed.learning)) {
          parsed.learning.forEach((l: MemoryLearningRecord) => {
            this.learningRecords.set(l.learningId, l);
            if (l.field === "EAN" && l.observedValue) {
              this.eanToModelMap.set(l.observedValue, {
                model: l.model,
                brand: l.brand,
              });
            }
          });
        }
      }
    } catch (e) {
      console.warn("[AIMemoryEngine] Falha ao carregar cache de memória local:", e);
    }
  }

  public saveToCache() {
    try {
      if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
      }
      const dump = {
        version: 1,
        savedAt: new Date().toISOString(),
        patterns: Array.from(this.brandPatterns.values()),
        learning: Array.from(this.learningRecords.values()),
      };
      fs.writeFileSync(MEMORY_CACHE_FILE, JSON.stringify(dump, null, 2), "utf-8");
    } catch (e) {
      console.warn("[AIMemoryEngine] Falha ao salvar cache de memória:", e);
    }
  }

  /**
   * Localiza padrão de marca por nome ou alias
   */
  public findBrandPattern(brandOrModelCandidate: string): BrandPatternKnowledge | undefined {
    if (!brandOrModelCandidate) return undefined;
    const clean = brandOrModelCandidate.trim().toUpperCase();

    // 1. Busca direta por nome
    for (const [key, pat] of this.brandPatterns.entries()) {
      if (clean.includes(key)) return pat;
      if (pat.aliases.some((al) => clean.includes(al.toUpperCase()))) return pat;
    }

    return undefined;
  }

  /**
   * Consulta produto por EAN na memória acumulada
   */
  public findByEAN(ean: string): { model: string; brand: string; category?: string } | undefined {
    if (!ean) return undefined;
    const clean = ean.replace(/\D/g, "");
    return this.eanToModelMap.get(clean);
  }

  /**
   * Registra aprendizado progressivo (Seção 29, 30 & 31)
   */
  public recordLearning(
    brand: string,
    model: string,
    field: string,
    observedValue: string,
    validatedValue: string,
    source: any,
    confidence: number = 0.95
  ) {
    if (!observedValue || !model) return;
    const id = `LEARN_${brand.toUpperCase()}_${field}_${observedValue.trim()}`;

    const existing = this.learningRecords.get(id);
    if (existing) {
      existing.occurrences++;
      existing.confidence = Math.min(1.0, existing.confidence + 0.02);
      existing.version++;
      existing.lastSeen = new Date().toISOString();
      if (validatedValue) existing.validatedValue = validatedValue;
    } else {
      const record: MemoryLearningRecord = {
        learningId: id,
        brand: brand || "GENÉRICO",
        model,
        field,
        observedValue,
        validatedValue: validatedValue || observedValue,
        source,
        confidence,
        occurrences: 1,
        version: 1,
        lastSeen: new Date().toISOString(),
      };
      this.learningRecords.set(id, record);
    }

    if (field === "EAN") {
      this.eanToModelMap.set(observedValue.replace(/\D/g, ""), {
        model,
        brand,
      });
    }

    this.saveToCache();
    return existing || this.learningRecords.get(id);
  }

  public getAllPatterns(): BrandPatternKnowledge[] {
    return Array.from(this.brandPatterns.values());
  }

  public getAllLearning(): MemoryLearningRecord[] {
    return Array.from(this.learningRecords.values());
  }
}

export const aiMemoryEngine = AIMemoryEngine.getInstance();
