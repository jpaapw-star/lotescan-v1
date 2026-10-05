import React, { useState } from "react";
import { ProductItem } from "../types";
import { 
  Search, 
  Check, 
  AlertCircle, 
  RotateCw, 
  Edit3, 
  Save, 
  Layers, 
  Trash2,
  Image as ImageIcon
} from "lucide-react";

interface ProductTableProps {
  products: ProductItem[];
  onOpenPhotos: (product: ProductItem) => void;
  onUpdateNfe: (productId: string, nfe: string) => Promise<void>;
  isLoading: boolean;
}

function formatCleanBrandModel(modelo: string, marca?: string): string {
  if (!modelo) return marca || "-";

  // Clean out common photo/label observation sentences or fluff
  let text = modelo
    .replace(/Marca:\s*[^\.\n]+/gi, "")
    .replace(/Etiqueta\s+clara[^\.\n]+/gi, "")
    .replace(/contendo\s+S\/N[^\.\n]+/gi, "")
    .trim();

  // Find technical model code (e.g. S3407CA-LY115W, SM-X110, JBL510BT, A2894)
  const techCodeMatch = text.match(/\b([A-Z0-9]{3,}(?:-[A-Z0-9]+)+)\b/i) ||
                        text.match(/\b([A-Z]{1,4}\d{2,}[A-Z0-9-]*)\b/i);

  // Determine brand
  let brand = (marca || "").trim();
  if (!brand) {
    const knownBrands = ["Asus", "ASUS", "Samsung", "JBL", "Apple", "Dell", "Lenovo", "HP", "Xiaomi", "Motorola", "LG", "Sony", "Acer"];
    const found = knownBrands.find((b) => new RegExp(`\\b${b}\\b`, "i").test(text));
    if (found) brand = found;
  }

  // Casing: "Asus"
  const formattedBrand = brand ? (brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase()) : "";

  if (techCodeMatch) {
    const code = techCodeMatch[1].trim();
    if (formattedBrand) {
      if (code.toLowerCase().includes(formattedBrand.toLowerCase())) {
        return code;
      }
      return `${formattedBrand} ${code}`;
    }
    return code;
  }

  // Fallback: Remove noise words
  let cleaned = text
    .replace(/^(Notebook|Laptop|Smartphone|Celular|Tablet|Fone de Ouvido|Fone|Headset|Livro)\s+/i, "")
    .replace(/\b(Core|Ultra|Intel|AMD|Ryzen|32GB|16GB|8GB|RAM|SSD|TB|256GB|512GB|Vivobook|Preto|Branco|Grafite)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (formattedBrand && !cleaned.toLowerCase().includes(formattedBrand.toLowerCase())) {
    return `${formattedBrand} ${cleaned}`.trim();
  }

  return cleaned || text;
}

export const ProductTable: React.FC<ProductTableProps> = ({
  products,
  onOpenPhotos,
  onUpdateNfe,
  isLoading,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingNfeId, setEditingNfeId] = useState<string | null>(null);
  const [tempNfeValue, setTempNfeValue] = useState("");
  const [savingNfeId, setSavingNfeId] = useState<string | null>(null);

  // Exibir coluna NFE apenas se houver ao menos uma Nota Fiscal informada/importada
  const hasAnyNfe = products.some((p) => p.nfe && p.nfe.trim().length > 0);

  // Filtro de busca universal
  const filteredProducts = products.filter((p) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      p.modelo.toLowerCase().includes(term) ||
      p.serialImei.toLowerCase().includes(term) ||
      (p.ean && p.ean.toLowerCase().includes(term)) ||
      (p.nfe && p.nfe.toLowerCase().includes(term)) ||
      String(p.caixa).includes(term) ||
      p.loteId.toLowerCase().includes(term)
    );
  });

  const handleStartEditNfe = (p: ProductItem) => {
    setEditingNfeId(p.id);
    setTempNfeValue(p.nfe || "");
  };

  const handleSaveNfe = async (productId: string) => {
    try {
      setSavingNfeId(productId);
      await onUpdateNfe(productId, tempNfeValue.trim());
      setEditingNfeId(null);
    } catch (err) {
      console.error("Erro ao salvar NFE:", err);
    } finally {
      setSavingNfeId(null);
    }
  };

  const handleKeyDownNfe = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === "Enter") {
      handleSaveNfe(productId);
    } else if (e.key === "Escape") {
      setEditingNfeId(null);
    }
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
      {/* Barra de Ferramentas da Tabela */}
      <div className="p-3 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-zinc-900/70">
        <div className="flex items-center space-x-2">
          <span className="font-mono text-xs font-bold text-white tracking-wider">
            PLANILHA PRINCIPAL (COLUNAS A–I)
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
            {filteredProducts.length} de {products.length} itens
          </span>
        </div>

        <div className="flex items-center space-x-2 flex-1 max-w-md justify-end">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar Modelo, Serial, IMEI, EAN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-zinc-400"
            />
          </div>
        </div>
      </div>

      {/* Tabela Formatada A - I */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-zinc-800 bg-black text-white font-bold select-none">
              <th className="py-3 px-3 w-12 text-center text-zinc-400 font-normal">#</th>
              <th className="py-3 px-3 w-[26%] text-white font-bold">
                <span className="text-zinc-500 mr-1.5">A</span>MODELO
              </th>
              <th className="py-3 px-3 w-[18%] text-white font-bold">
                <span className="text-zinc-500 mr-1.5">B</span>SERIAL / IMEI
              </th>
              <th className="py-3 px-3 w-[12%] text-white font-bold">
                <span className="text-zinc-500 mr-1.5">C</span>EAN
              </th>
              <th className="py-3 px-3 w-14 text-center text-white font-bold">
                <span className="text-zinc-500 mr-1">D</span>QTDE
              </th>
              <th className="py-3 px-3 w-24 text-center text-white font-bold">
                <span className="text-zinc-500 mr-1">E</span>DATA
              </th>
              <th className="py-3 px-3 w-20 text-center text-white font-bold">
                <span className="text-zinc-500 mr-1">F</span>QTD/CAIXA
              </th>
              <th className="py-3 px-3 w-20 text-center text-white font-bold">
                <span className="text-zinc-500 mr-1">G</span>CAIXA
              </th>
              {hasAnyNfe && (
                <th className="py-3 px-3 w-[14%] text-white font-bold">
                  <span className="text-zinc-500 mr-1.5">H</span>NFE
                </th>
              )}
              <th className="py-3 px-3 w-20 text-center text-white font-bold">
                <span className="text-zinc-500 mr-1">I</span>LINK FOTO
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80 bg-zinc-950">
            {isLoading && products.length === 0 ? (
              <tr>
                <td colSpan={hasAnyNfe ? 10 : 9} className="py-12 text-center text-zinc-400">
                  <RotateCw className="w-5 h-5 mx-auto animate-spin mb-2 text-zinc-300" />
                  <span>Carregando dados da planilha...</span>
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={hasAnyNfe ? 10 : 9} className="py-12 text-center text-zinc-500">
                  {searchTerm
                    ? "Nenhum produto encontrado para o termo pesquisado."
                    : "Nenhum produto registrado ainda. Envie fotografias acima para iniciar."}
                </td>
              </tr>
            ) : (
              filteredProducts.map((p, index) => {
                const isEditingNfe = editingNfeId === p.id;
                const isSaving = savingNfeId === p.id;

                return (
                  <tr
                    key={p.id}
                    className="hover:bg-zinc-900/60 transition-colors group"
                  >
                    {/* Linha / Índice */}
                    <td className="py-2 px-3 text-center text-zinc-500 font-mono text-[11px]">
                      {index + 1}
                    </td>

                    {/* Coluna A: MODELO */}
                    <td className="py-2 px-3 text-zinc-100 font-sans">
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <span className="font-bold text-white text-xs leading-snug">
                            {formatCleanBrandModel(p.modelo, p.marca)}
                          </span>

                          {(p.status === "PENDENTE_ASSOCIACAO" || p.status === "PENDENTE") && (
                            <span
                              className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950/90 text-amber-300 border border-amber-600/80 whitespace-nowrap animate-pulse font-bold"
                              title="Evidência fotográfica pendente de confirmação humana (múltiplos candidatos)"
                            >
                              PENDENTE CONFIRMAÇÃO
                            </span>
                          )}
                          {p.status === "REVISAO" && (
                            <span
                              className="text-[9px] font-mono px-1 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 whitespace-nowrap"
                              title="Grau de certeza moderado ou campo parcialmente visível"
                            >
                              REVISAR
                            </span>
                          )}
                          {p.status === "ATUALIZADO" && (
                            <span
                              className="text-[9px] font-mono px-1 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 whitespace-nowrap"
                              title="Item reincidente atualizado com fotos adicionais"
                            >
                              ATUALIZADO
                            </span>
                          )}
                        </div>
                        {p.unitId && (
                          <div className="flex items-center space-x-1 text-[10px] text-zinc-400 font-mono">
                            <span className="text-zinc-500">UNIDADE:</span>
                            <span className="text-zinc-300">{p.unitId}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Coluna B: SERIAL / IMEI */}
                    <td className="py-2 px-3 text-zinc-200 font-mono text-xs">
                      {p.serialImei && p.serialImei !== "NÃO IDENTIFICADO" && p.serialImei !== "SEM SERIAL" ? (
                        <div className="flex flex-col">
                          <span className="font-bold text-white tracking-wide">
                            {p.serialImei}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {p.serviceTag
                              ? "SERVICE TAG (DELL)"
                              : p.serial
                              ? "SERIAL NUMBER"
                              : p.imei
                              ? "IMEI"
                              : "ID FÍSICO"}
                          </span>
                        </div>
                      ) : p.hasPhysicalIdentifier === false || p.serialImei === "SEM SERIAL" ? (
                        <div className="flex flex-col">
                          <span className="text-zinc-400 text-[11px] font-medium">SEM SERIAL</span>
                          <span className="text-[9px] text-zinc-400 italic">Identidade por EAN</span>
                        </div>
                      ) : (
                        <span className="text-zinc-400 italic">Não visível</span>
                      )}
                    </td>

                    {/* Coluna C: EAN */}
                    <td className="py-2 px-3 text-zinc-300 font-mono text-xs">
                      {p.ean ? (
                        <span className="tracking-wider">{p.ean}</span>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>

                    {/* Coluna D: QTDE */}
                    <td className="py-2 px-3 text-center text-zinc-100 font-mono font-bold">
                      {p.qtde}
                    </td>

                    {/* Coluna E: DATA */}
                    <td className="py-2 px-3 text-center text-zinc-400 font-mono text-[11px]">
                      {p.data}
                    </td>

                    {/* Coluna F: QTD/CAIXA */}
                    <td className="py-2 px-3 text-center text-zinc-200 font-mono font-bold">
                      {products.filter((item) => item.caixa === p.caixa).reduce((sum, item) => sum + (item.qtde || 1), 0)}
                    </td>

                    {/* Coluna G: CAIXA (Congelada) */}
                    <td className="py-2 px-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-200 font-mono font-bold text-xs">
                        {p.caixa ? `#${p.caixa}` : "AVULSO"}
                      </span>
                    </td>

                    {/* Coluna H: NFE (Preenchimento manual - Condicional) */}
                    {hasAnyNfe && (
                      <td className="py-2 px-3 text-zinc-200 font-mono">
                        {isEditingNfe ? (
                          <div className="flex items-center space-x-1">
                            <input
                              type="text"
                              value={tempNfeValue}
                              onChange={(e) => setTempNfeValue(e.target.value)}
                              onKeyDown={(e) => handleKeyDownNfe(e, p.id)}
                              placeholder="NFE..."
                              autoFocus
                              disabled={isSaving}
                              className="w-full bg-zinc-900 border border-zinc-600 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-white"
                            />
                            <button
                              onClick={() => handleSaveNfe(p.id)}
                              disabled={isSaving}
                              className="p-1 hover:bg-zinc-800 text-emerald-400 rounded transition-colors"
                              title="Salvar NFE"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => handleStartEditNfe(p)}
                            className="flex items-center justify-between group/nfe cursor-pointer hover:bg-zinc-900 px-1 py-0.5 rounded transition-colors"
                            title="Clique para editar NFE"
                          >
                            <span className={p.nfe ? "text-zinc-200" : "text-zinc-600 italic"}>
                              {p.nfe || "Adicionar..."}
                            </span>
                            <Edit3 className="w-3 h-3 text-zinc-500 opacity-0 group-hover/nfe:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </td>
                    )}

                    {/* Coluna I: LINK FOTO ("LINK") */}
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={() => onOpenPhotos(p)}
                        className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-white text-zinc-300 hover:text-black border border-zinc-700/80 font-mono font-bold text-[11px] transition-all flex items-center space-x-1 mx-auto cursor-pointer"
                        title={`Ver ${p.photoIds.length} fotografia(s) associada(s)`}
                      >
                        <span>LINK</span>
                        <span className="text-[10px] opacity-75">
                          ({p.photoIds.length})
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Rodapé da Tabela Limpo */}
      <div className="p-2.5 border-t border-zinc-800 bg-zinc-900/60 flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-400">
        <div>
          Total: <strong className="text-white">{filteredProducts.length}</strong> produto(s) registrado(s)
        </div>
        <div className="text-zinc-500">
          Deduplicação ativa: Serial/IMEI unificados em linha única
        </div>
      </div>
    </div>
  );
};
