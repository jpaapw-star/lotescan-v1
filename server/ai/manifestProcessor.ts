import { GoogleGenAI, Type } from "@google/genai";
import { ManifestoDoc, ManifestoItem } from "../../src/types/index.js";

export class ManifestProcessor {
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

  async parseManifestFile(
    buffer: Buffer,
    mimeType: string,
    filename: string
  ): Promise<ManifestoDoc> {
    if (!this.ai) {
      console.warn("GEMINI_API_KEY não disponível. Gerando manifesto simulado.");
      return this.generateMockManifest(filename);
    }

    const parts: any[] = [];

    parts.push({
      text: `VOCÊ É UM EXTRATOR INDUSTRIAL DE NOTAS FISCAIS ELETRÔNICAS (NF-E), DANFE E MANIFESTOS DE CARGA.
ARQUIVO RECEBIDO: ${filename} (MIME: ${mimeType})

INSTRUÇÕES DE EXTRAÇÃO:
1. Analise o documento em anexo (pode ser PDF, planilha, imagem da DANFE ou texto).
2. Extraia os dados gerais da Nota Fiscal / Manifesto:
   - 'nfe': Número da NF-e ou Manifesto (ex: "105423", "NF-9842").
   - 'fornecedor': Razão Social ou Nome Fantasia do Fornecedor / Remetente.
   - 'dataEmissao': Data de emissão no formato AAAA-MM-DD.
   - 'chaveAcesso': Chave de acesso de 44 dígitos da NF-e (se visível).
3. Extraia TODOS os produtos / itens discriminados na nota:
   - 'codigoItem': Código do produto segundo o fornecedor (ex: "JBLT510BTBLK", "LIV-0921").
   - 'descricao': Descrição completa e clara do item (ex: "Fone de Ouvido Bluetooth JBL Tune 510BT", "Livro Clean Code").
   - 'ean': Código de barras EAN-13/GTIN se presente. Se ausente, deixe vazio "".
   - 'quantidade': Quantidade de unidades faturadas (inteiro positivo).
   - 'categoria': "celular" | "tablet" | "fone" | "livro" | "eletronico" | "outro".
4. Retorne EXCLUSIVAMENTE o JSON estruturado.`
    });

    parts.push({
      inlineData: {
        mimeType: mimeType || "application/pdf",
        data: buffer.toString("base64"),
      },
    });

    let response;
    try {
      response = await this.ai.models.generateContent({
        model: this.primaryModel,
        contents: { parts },
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              nfe: { type: Type.STRING },
              fornecedor: { type: Type.STRING },
              dataEmissao: { type: Type.STRING },
              chaveAcesso: { type: Type.STRING },
              valorTotal: { type: Type.NUMBER },
              itens: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    codigoItem: { type: Type.STRING },
                    descricao: { type: Type.STRING },
                    ean: { type: Type.STRING },
                    quantidade: { type: Type.INTEGER },
                    valorUnitario: { type: Type.NUMBER },
                    categoria: { type: Type.STRING },
                  },
                  required: ["descricao", "quantidade"],
                },
              },
            },
            required: ["nfe", "fornecedor", "itens"],
          },
        },
      });
    } catch (err) {
      console.warn(`Tentativa do manifesto com ${this.primaryModel} falhou, tentando fallback com ${this.fallbackModel}...`, err);
      response = await this.ai.models.generateContent({
        model: this.fallbackModel,
        contents: { parts },
        config: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              nfe: { type: Type.STRING },
              fornecedor: { type: Type.STRING },
              dataEmissao: { type: Type.STRING },
              chaveAcesso: { type: Type.STRING },
              valorTotal: { type: Type.NUMBER },
              itens: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    codigoItem: { type: Type.STRING },
                    descricao: { type: Type.STRING },
                    ean: { type: Type.STRING },
                    quantidade: { type: Type.INTEGER },
                    valorUnitario: { type: Type.NUMBER },
                    categoria: { type: Type.STRING },
                  },
                  required: ["descricao", "quantidade"],
                },
              },
            },
            required: ["nfe", "fornecedor", "itens"],
          },
        },
      });
    }

    const text = response.text;
    if (!text) {
      throw new Error("Não foi possível extrair dados do manifesto");
    }

    const parsed = JSON.parse(text);
    const manifestoId = `MANIF-${Date.now().toString(36).toUpperCase()}`;
    const nfe = String(parsed.nfe || `NF-${Date.now().toString().slice(-5)}`).trim();
    const fornecedor = String(parsed.fornecedor || "Fornecedor Não Identificado").trim();
    const dataEmissao = parsed.dataEmissao || new Date().toISOString().slice(0, 10);

    const itens: ManifestoItem[] = (parsed.itens || []).map((item: any, idx: number) => {
      const qtd = Math.max(1, Number(item.quantidade) || 1);
      return {
        id: `MITEM-${manifestoId}-${idx + 1}`,
        nfe,
        fornecedor,
        dataEmissao,
        codigoItem: String(item.codigoItem || "").trim(),
        descricao: String(item.descricao || "Item sem descrição").trim(),
        ean: String(item.ean || "").trim(),
        quantidade: qtd,
        valorUnitario: Number(item.valorUnitario) || 0,
        categoria: String(item.categoria || "outro").toLowerCase().trim(),
        qtdConferida: 0,
        status: "PENDENTE",
      };
    });

    const totalUnidades = itens.reduce((acc, curr) => acc + curr.quantidade, 0);

    return {
      id: manifestoId,
      nfe,
      fornecedor,
      dataEmissao,
      chaveAcesso: parsed.chaveAcesso || "",
      valorTotal: Number(parsed.valorTotal) || 0,
      totalItens: itens.length,
      totalUnidades,
      importadoEm: new Date().toISOString(),
      arquivoNome: filename,
      itens,
    };
  }

  private generateMockManifest(filename: string): ManifestoDoc {
    const id = `MANIF-${Date.now().toString(36).toUpperCase()}`;
    const nfe = `NF-884${Math.floor(Math.random() * 900 + 100)}`;
    const fornecedor = "Distribuidora Tech & Livros Brasil S.A.";
    const dataEmissao = new Date().toISOString().slice(0, 10);

    const mockItens: ManifestoItem[] = [
      {
        id: `MITEM-${id}-1`,
        nfe,
        fornecedor,
        dataEmissao,
        codigoItem: "JBL510BT-BLK",
        descricao: "Fone de Ouvido Bluetooth JBL Tune 510BT Preto",
        ean: "6925281987518",
        quantidade: 5,
        valorUnitario: 249.9,
        categoria: "fone",
        qtdConferida: 0,
        status: "PENDENTE",
      },
      {
        id: `MITEM-${id}-2`,
        nfe,
        fornecedor,
        dataEmissao,
        codigoItem: "LIV-CLEAN-ARCH",
        descricao: "Livro Clean Architecture - Robert C. Martin",
        ean: "9788550804606",
        quantidade: 3,
        valorUnitario: 89.9,
        categoria: "livro",
        qtdConferida: 0,
        status: "PENDENTE",
      },
      {
        id: `MITEM-${id}-3`,
        nfe,
        fornecedor,
        dataEmissao,
        codigoItem: "SAM-TAB-A9",
        descricao: "Tablet Samsung Galaxy Tab A9 64GB Grafite",
        ean: "7892509133487",
        quantidade: 2,
        valorUnitario: 1099.0,
        categoria: "tablet",
        qtdConferida: 0,
        status: "PENDENTE",
      },
    ];

    return {
      id,
      nfe,
      fornecedor,
      dataEmissao,
      chaveAcesso: "35241033487192000192550010001054231892837461",
      valorTotal: 3717.2,
      totalItens: mockItens.length,
      totalUnidades: mockItens.reduce((acc, i) => acc + i.quantidade, 0),
      importadoEm: new Date().toISOString(),
      arquivoNome: filename,
      itens: mockItens,
    };
  }
}

export const manifestProcessor = new ManifestProcessor();
