import { BrandPatternKnowledge } from "./types.js";

export class ValidationEngine {
  /**
   * Valida código EAN/GTIN/UPC usando o algoritmo oficial GS1 Modulo 10
   */
  static validateEAN(eanRaw?: string): { isValid: boolean; normalized: string; reason?: string } {
    if (!eanRaw) return { isValid: false, normalized: "", reason: "EAN vazio" };
    const clean = eanRaw.replace(/\D/g, "").trim();

    // Comprimentos válidos padrão GS1: 8 (EAN-8), 12 (UPC-A), 13 (EAN-13), 14 (GTIN-14)
    if (![8, 12, 13, 14].includes(clean.length)) {
      return { isValid: false, normalized: clean, reason: `Comprimento inválido (${clean.length} dígitos, esperado 8, 12, 13 ou 14)` };
    }

    // Não pode ser sequência de todos dígitos iguais (ex: 0000000000000 ou 1111111111111)
    if (/^(\d)\1+$/.test(clean)) {
      return { isValid: false, normalized: clean, reason: "Sequência repetitiva inválida" };
    }

    // Cálculo oficial de Checksum Modulo 10
    const digits = clean.split("").map(Number);
    const checkDigit = digits[digits.length - 1];
    const dataDigits = digits.slice(0, digits.length - 1);

    let sum = 0;
    // Multiplicador alternado: o dígito imediatamente anterior ao dígito verificador tem peso 3, depois 1, depois 3...
    for (let i = dataDigits.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
      sum += dataDigits[i] * weight;
    }

    const calculatedCheck = (10 - (sum % 10)) % 10;
    if (calculatedCheck !== checkDigit) {
      return {
        isValid: false,
        normalized: clean,
        reason: `Dígito verificador inválido: calculado ${calculatedCheck}, obtido ${checkDigit}`,
      };
    }

    return { isValid: true, normalized: clean };
  }

  /**
   * Valida IMEI oficial usando o algoritmo de Luhn (15 dígitos)
   */
  static validateIMEI(imeiRaw?: string): { isValid: boolean; normalized: string; reason?: string } {
    if (!imeiRaw) return { isValid: false, normalized: "", reason: "IMEI vazio" };
    const clean = imeiRaw.replace(/\D/g, "").trim();

    if (clean.length !== 15) {
      return { isValid: false, normalized: clean, reason: `IMEI deve ter exatamente 15 dígitos (encontrados ${clean.length})` };
    }

    if (/^(\d)\1+$/.test(clean)) {
      return { isValid: false, normalized: clean, reason: "Sequência repetitiva inválida" };
    }

    // Algoritmo de Luhn
    let sum = 0;
    for (let i = 0; i < 15; i++) {
      let digit = parseInt(clean.charAt(i), 10);
      // Posições ímpares (0-indexed 1, 3, 5, 7, 9, 11, 13) dobram de valor
      if (i % 2 === 1) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      sum += digit;
    }

    if (sum % 10 !== 0) {
      return { isValid: false, normalized: clean, reason: "Falha na validação do checksum de Luhn do IMEI" };
    }

    return { isValid: true, normalized: clean };
  }

  /**
   * Valida se um número de série é plausível e consistente com as regras do fabricante
   */
  static validateSerial(
    serialRaw?: string,
    brandKnowledge?: BrandPatternKnowledge
  ): { isValid: boolean; normalized: string; confidence: number; reason?: string } {
    if (!serialRaw) return { isValid: false, normalized: "", confidence: 0, reason: "Serial ausente" };
    const clean = serialRaw.trim().toUpperCase();

    // Valores descartáveis conhecidos
    const invalidPlaceholders = [
      "NÃO IDENTIFICADO",
      "NAO IDENTIFICADO",
      "DESCONHECIDO",
      "SEM SERIAL",
      "UNKNOWN",
      "NONE",
      "SERIAL",
      "SERIAL NUMBER",
      "S/N",
      "SN",
      "000000",
      "123456",
      "ABC123456", // placeholder genérico
      "TESTE",
    ];

    if (invalidPlaceholders.includes(clean) || clean.length < 4) {
      return { isValid: false, normalized: clean, confidence: 0, reason: "Serial é um marcador genérico inválido" };
    }

    // Se houver conhecimento da marca, testa contra o padrão
    if (brandKnowledge) {
      if (brandKnowledge.serialMinLength && clean.length < brandKnowledge.serialMinLength) {
        return {
          isValid: false,
          normalized: clean,
          confidence: 0.3,
          reason: `Comprimento abaixo do mínimo para a marca ${brandKnowledge.brandName} (${clean.length} < ${brandKnowledge.serialMinLength})`,
        };
      }

      if (brandKnowledge.serialMaxLength && clean.length > brandKnowledge.serialMaxLength) {
        return {
          isValid: false,
          normalized: clean,
          confidence: 0.3,
          reason: `Comprimento acima do máximo para a marca ${brandKnowledge.brandName} (${clean.length} > ${brandKnowledge.serialMaxLength})`,
        };
      }

      if (brandKnowledge.serialPrefixes && brandKnowledge.serialPrefixes.length > 0) {
        const matchesPrefix = brandKnowledge.serialPrefixes.some((pre) => clean.startsWith(pre.toUpperCase()));
        if (!matchesPrefix) {
          return {
            isValid: true,
            normalized: clean,
            confidence: 0.65, // Válido, mas confiança menor por fugir do prefixo típico
            reason: `Não inicia com os prefixos típicos de ${brandKnowledge.brandName} (${brandKnowledge.serialPrefixes.join(", ")})`,
          };
        }
      }

      if (brandKnowledge.serialRegex) {
        try {
          const re = new RegExp(brandKnowledge.serialRegex, "i");
          if (!re.test(clean)) {
            return {
              isValid: true,
              normalized: clean,
              confidence: 0.7,
              reason: `Foge do regex padrão da marca ${brandKnowledge.brandName}`,
            };
          }
        } catch {
          // regex inválido, ignora
        }
      }

      return { isValid: true, normalized: clean, confidence: 0.98 };
    }

    // Validação genérica para serial
    const isAlphanumeric = /^[A-Z0-9\-_./]+$/.test(clean);
    if (!isAlphanumeric) {
      return { isValid: false, normalized: clean, confidence: 0.4, reason: "Contém caracteres não suportados para serial" };
    }

    return { isValid: true, normalized: clean, confidence: 0.85 };
  }

  /**
   * Normalização rigorosa de modelo e extração de identificadores embutidos (Seções 4 & 22 do Mandato)
   * Rejeita descrições genéricas como "Computador Dell" ou "Notebook Dell" e extrai Service Tag se presente.
   */
  static normalizeModel(
    rawModel?: string,
    rawBrand?: string
  ): { model: string; serviceTag?: string; isGeneric: boolean } {
    if (!rawModel) return { model: "", isGeneric: true };

    let text = rawModel.trim();
    let extractedServiceTag: string | undefined;

    // 1. Extração de Service Tag embutido na descrição do modelo
    // Ex: "Computador Dell (Service Tag 3843QM4)" ou "Dell (Service Tag: 55TQH24)"
    const stMatch =
      text.match(/\b(?:service\s*tag|s\/n|st|tag)[\s:]*([A-Z0-9]{7})\b/i) ||
      text.match(/\(([A-Z0-9]{7})\)/i);
    if (stMatch) {
      extractedServiceTag = stMatch[1].toUpperCase();
      text = text.replace(stMatch[0], "").replace(/[()]/g, "").trim();
    }

    // 2. Se a string inteira for apenas um Service Tag Dell (7 caracteres alfanuméricos)
    if (/^[A-Z0-9]{7}$/i.test(text)) {
      extractedServiceTag = text.toUpperCase();
      return { model: "", serviceTag: extractedServiceTag, isGeneric: true };
    }

    // 3. Rejeição de identificadores puros como modelo (EAN 8-14 dígitos, IMEI 15 dígitos, etc.)
    if (/^\d{8,14}$/.test(text) || /^\d{15}$/.test(text) || /^(SN|S\/N|SERIAL)[\s:]*[A-Z0-9]+$/i.test(text)) {
      return { model: "", isGeneric: true };
    }

    // 4. Rejeição de descrições genéricas que NÃO são modelos válidos (Seção 4 & 22)
    const genericPatterns = [
      /^(computador|notebook|laptop|equipamento|produto|device|computer|aparelho|celular|tablet|fone|hardware|item)(\s+(dell|apple|samsung|asus|lenovo|hp|lg|motorola|xiaomi))?$/i,
      /^(dell|apple|samsung|asus|lenovo|hp|lg|motorola|xiaomi)\s+(computador|notebook|laptop|equipamento|produto|device|computer|aparelho|celular|tablet|fone)$/i,
      /^(produto não identificado|desconhecido|desconhecida|unknown|none|n\/a|item recebido)$/i,
      /^(computador dell|notebook dell|laptop dell|produto dell|equipamento dell)$/i,
      /^(computador|notebook|laptop|equipamento|produto|device|computer)$/i,
    ];

    const isGeneric = genericPatterns.some((pattern) => pattern.test(text.replace(/[-_]/g, " ").trim()));
    if (isGeneric) {
      return { model: "", serviceTag: extractedServiceTag, isGeneric: true };
    }

    // 5. Limpeza de prefixos genéricos preservando especificações e variantes completas (Seção 23)
    let cleaned = text
      .replace(/^(Notebook|Laptop|Computador|Aparelho|Equipamento)\s+/i, "")
      .trim();

    return {
      model: cleaned || text,
      serviceTag: extractedServiceTag,
      isGeneric: false,
    };
  }
}
