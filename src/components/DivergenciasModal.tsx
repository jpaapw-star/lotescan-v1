import React, { useState } from "react";
import { ProductItem, ManifestoDoc } from "../types";
import { 
  AlertTriangle, 
  X, 
  Search, 
  CheckCircle2, 
  FileText, 
  Package, 
  Filter,
  Layers,
  Copy,
  Check
} from "lucide-react";

export interface DivergenceRecord {
  id: string;
  modeloLido: string;
  codigoIdentificado: string; // Serial / IMEI / EAN
  qtdLida: number;
  qtdFaturada: number;
  caixa: number;
  motivo:
    | "Produto não consta na NF"
    | "Quantidade lida excede o manifesto"
    | "Modelo diferente do faturado"
    | "Item faturado pendente na entrega física";
  gravidade: "ALTA" | "MEDIA" | "BAIXA";
  detalhes?: string;
}

export function calculateDivergences(products: ProductItem[], manifestos: ManifestoDoc[]): DivergenceRecord[] {
  const divergences: DivergenceRecord[] = [];
  const manifestItems = manifestos.flatMap((m) => m.itens || []);

  if (manifestItems.length === 0) {
    // Nenhuma Nota Fiscal/Manifesto importada: registrar produtos normalmente sem gerar erros de divergência
    return [];
  }

  // Group physical items by EAN or cleaned model name
  const physicalGroupMap = new Map<string, {
    products: ProductItem[];
    totalQtd: number;
    modelName: string;
    ean?: string;
    serials: string[];
    caixas: Set<number>;
  }>();

  products.forEach((p) => {
    const key = (p.ean && p.ean.trim().length > 3 ? p.ean.trim() : p.modelo.toLowerCase().trim());
    if (!physicalGroupMap.has(key)) {
      physicalGroupMap.set(key, {
        products: [p],
        totalQtd: 0,
        modelName: p.modelo,
        ean: p.ean,
        serials: [],
        caixas: new Set<number>(),
      });
    }
    const group = physicalGroupMap.get(key)!;
    group.products.push(p);
    group.totalQtd += (p.qtde || 1);
    if (p.serialImei && p.serialImei !== "NÃO IDENTIFICADO") group.serials.push(p.serialImei);
    if (p.caixa != null) group.caixas.add(p.caixa);
  });

  const matchedManifestItemIds = new Set<string>();

  physicalGroupMap.forEach((group, key) => {
    const matchedItem = manifestItems.find((mItem) => {
      if (group.ean && mItem.ean && group.ean === mItem.ean.trim()) return true;
      const cleanPhysModel = group.modelName.toLowerCase();
      const cleanManifCode = (mItem.codigoItem || "").toLowerCase();
      const cleanManifDesc = (mItem.descricao || "").toLowerCase();
      return (
        (cleanManifCode.length > 2 && cleanPhysModel.includes(cleanManifCode)) || 
        (cleanManifDesc.length > 2 && cleanManifDesc.includes(cleanPhysModel)) || 
        (cleanPhysModel.length > 2 && cleanPhysModel.includes(cleanManifDesc))
      );
    });

    if (!matchedItem) {
      divergences.push({
        id: `DIV-NOT-IN-NF-${key}`,
        modeloLido: group.modelName,
        codigoIdentificado: group.serials.join(", ") || group.ean || "Sem Código",
        qtdLida: group.totalQtd,
        qtdFaturada: 0,
        caixa: Array.from(group.caixas)[0] || 1,
        motivo: "Produto não consta na NF",
        gravidade: "ALTA",
        detalhes: `O produto '${group.modelName}' foi lido fisicamente, mas não consta na lista de itens da Nota Fiscal importada.`,
      });
    } else {
      matchedManifestItemIds.add(matchedItem.id);

      if (group.totalQtd > matchedItem.quantidade) {
        divergences.push({
          id: `DIV-EXCEED-${key}`,
          modeloLido: group.modelName,
          codigoIdentificado: group.serials.join(", ") || group.ean || matchedItem.codigoItem || "Item NF",
          qtdLida: group.totalQtd,
          qtdFaturada: matchedItem.quantidade,
          caixa: Array.from(group.caixas)[0] || 1,
          motivo: "Quantidade lida excede o manifesto",
          gravidade: "ALTA",
          detalhes: `Quantidade física lida (${group.totalQtd} un.) é superior à quantidade faturada na NF (${matchedItem.quantidade} un.).`,
        });
      }

      const cleanPhys = group.modelName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const cleanManif = matchedItem.descricao.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanPhys.length > 5 && cleanManif.length > 5 && !cleanManif.includes(cleanPhys) && !cleanPhys.includes(cleanManif)) {
        divergences.push({
          id: `DIV-MODEL-DIFF-${key}`,
          modeloLido: group.modelName,
          codigoIdentificado: group.serials.join(", ") || group.ean || matchedItem.codigoItem || "Item NF",
          qtdLida: group.totalQtd,
          qtdFaturada: matchedItem.quantidade,
          caixa: Array.from(group.caixas)[0] || 1,
          motivo: "Modelo diferente do faturado",
          gravidade: "MEDIA",
          detalhes: `Modelo lido na foto: "${group.modelName}". Descrição faturada na NF: "${matchedItem.descricao}".`,
        });
      }
    }
  });

  manifestItems.forEach((mItem) => {
    if (!matchedManifestItemIds.has(mItem.id)) {
      divergences.push({
        id: `DIV-MISSING-${mItem.id}`,
        modeloLido: mItem.descricao,
        codigoIdentificado: mItem.codigoItem || mItem.ean || "Item Faturado",
        qtdLida: 0,
        qtdFaturada: mItem.quantidade,
        caixa: mItem.caixaSugerida || 1,
        motivo: "Item faturado pendente na entrega física",
        gravidade: "ALTA",
        detalhes: `Faturado na Nota Fiscal (${mItem.quantidade} un.), porém nenhuma unidade física correspondente foi capturada nas fotos.`,
      });
    }
  });

  return divergences;
}

interface DivergenciasModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductItem[];
  manifestos: ManifestoDoc[];
}

export const DivergenciasModal: React.FC<DivergenciasModalProps> = ({
  isOpen,
  onClose,
  products,
  manifestos,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMotivo, setFilterMotivo] = useState<string>("TODOS");
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const allDivergences = calculateDivergences(products, manifestos);

  const filteredDivergences = allDivergences.filter((d) => {
    const matchesSearch =
      d.modeloLido.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.codigoIdentificado.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.motivo.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesMotivo = filterMotivo === "TODOS" || d.motivo === filterMotivo;

    return matchesSearch && matchesMotivo;
  });

  const handleCopySummary = () => {
    const lines = filteredDivergences.map(
      (d) => `• [Caixa ${d.caixa}] ${d.modeloLido} | Cod: ${d.codigoIdentificado} | Qtd Lida: ${d.qtdLida} vs Faturada: ${d.qtdFaturada} | Motivo: ${d.motivo}`
    );
    const text = `📋 PAINEL DE DIVERGÊNCIAS - SCANLOTE AI\nTotal: ${filteredDivergences.length} divergência(s)\n\n${lines.join("\n")}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const getMotivoBadge = (motivo: DivergenceRecord["motivo"]) => {
    switch (motivo) {
      case "Produto não consta na NF":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 border border-rose-800 text-rose-300">
            🚫 Não consta na NF
          </span>
        );
      case "Quantidade lida excede o manifesto":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 border border-amber-800 text-amber-300">
            📈 Qtd Excedente
          </span>
        );
      case "Modelo diferente do faturado":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 border border-purple-800 text-purple-300">
            🔄 Modelo Divergente
          </span>
        );
      case "Item faturado pendente na entrega física":
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 border border-blue-800 text-blue-300">
            📦 Item Faltante
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300">
            {motivo}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-x-hidden w-full max-w-full">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl text-zinc-100 font-mono text-xs">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-gradient-to-r from-rose-950/80 to-zinc-900">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded bg-rose-900/50 border border-rose-700/60">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <div className="font-bold uppercase tracking-wider text-white text-xs sm:text-sm flex items-center space-x-2">
                <span>DIVERGÊNCIAS DE ITENS (NF vs LEITURA FÍSICA)</span>
              </div>
              <div className="text-[11px] text-zinc-300 font-sans">
                Detalhamento item a item das inconsistências entre o manifesto e os produtos capturados
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="p-3 bg-zinc-900/60 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar por produto, serial, EAN ou motivo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={filterMotivo}
              onChange={(e) => setFilterMotivo(e.target.value)}
              className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value="TODOS">Todos os Motivos ({allDivergences.length})</option>
              <option value="Produto não consta na NF">Não consta na NF</option>
              <option value="Quantidade lida excede o manifesto">Qtd Excedente</option>
              <option value="Modelo diferente do faturado">Modelo Divergente</option>
              <option value="Item faturado pendente na entrega física">Item Faltante</option>
            </select>

            <button
              onClick={handleCopySummary}
              className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded font-bold transition-colors cursor-pointer flex items-center space-x-1"
              title="Copiar relatório em texto de divergências"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
              <span>{copied ? "Copiado!" : "Copiar"}</span>
            </button>
          </div>
        </div>

        {/* Lista de Divergências */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredDivergences.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 font-sans space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/80 mb-2" />
              <div className="text-sm font-bold text-white">Nenhuma Divergência Encontrada!</div>
              <p className="text-xs text-zinc-400">
                Todos os produtos lidos fisicamente correspondem exatamente aos itens faturados na Nota Fiscal.
              </p>
            </div>
          ) : (
            filteredDivergences.map((div) => (
              <div
                key={div.id}
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg p-3 space-y-2 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-xs sm:text-sm font-sans">
                        {div.modeloLido}
                      </span>
                      {getMotivoBadge(div.motivo)}
                    </div>

                    <div className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-3">
                      <span>Código/Serial/EAN: <strong className="text-zinc-200">{div.codigoIdentificado}</strong></span>
                      <span>Caixa: <strong className="text-emerald-400">#{div.caixa}</strong></span>
                    </div>
                  </div>

                  <div className="bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded text-right">
                    <div className="text-[10px] text-zinc-400 uppercase">Qtd Lida vs Faturada</div>
                    <div className="text-xs font-bold">
                      <span className={div.qtdLida > div.qtdFaturada ? "text-rose-400" : "text-white"}>
                        {div.qtdLida} un.
                      </span>
                      {" "}
                      <span className="text-zinc-500">/</span>
                      {" "}
                      <span className="text-sky-300">
                        {div.qtdFaturada} un.
                      </span>
                    </div>
                  </div>
                </div>

                {div.detalhes && (
                  <div className="p-2 rounded bg-zinc-950/80 border border-zinc-800/80 text-[11px] text-zinc-300 font-sans leading-relaxed">
                    <strong>Motivo Exato:</strong> {div.detalhes}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-400">
          <div>
            Total de divergências listadas: <strong className="text-white">{filteredDivergences.length}</strong>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-zinc-200 text-black font-bold rounded transition-colors cursor-pointer"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    </div>
  );
};
