import React, { useState } from "react";
import { StoredPhoto, ProductItem } from "../types";
import { 
  X, 
  Trash2, 
  Link as LinkIcon, 
  RotateCw, 
  AlertTriangle, 
  ShieldCheck, 
  Check 
} from "lucide-react";

interface OrphansModalProps {
  isOpen: boolean;
  onClose: () => void;
  orphans: StoredPhoto[];
  products: ProductItem[];
  onAssociate: (photoId: string, productId: string) => Promise<void>;
  onSafeClean: (photoIds: string[]) => Promise<void>;
  isLoading: boolean;
  onRefresh: () => void;
}

export const OrphansModal: React.FC<OrphansModalProps> = ({
  isOpen,
  onClose,
  orphans,
  products,
  onAssociate,
  onSafeClean,
  isLoading,
  onRefresh,
}) => {
  const [selectedPhoto, setSelectedPhoto] = useState<StoredPhoto | null>(null);
  const [targetProductId, setTargetProductId] = useState<string>("");
  const [isAssociating, setIsAssociating] = useState(false);
  const [selectedForClean, setSelectedForClean] = useState<string[]>([]);
  const [isCleaning, setIsCleaning] = useState(false);

  if (!isOpen) return null;

  const handleAssociate = async () => {
    if (!selectedPhoto || !targetProductId) return;
    try {
      setIsAssociating(true);
      await onAssociate(selectedPhoto.id, targetProductId);
      setSelectedPhoto(null);
      setTargetProductId("");
    } catch (err) {
      console.error("Erro ao associar foto órfã:", err);
    } finally {
      setIsAssociating(false);
    }
  };

  const handleToggleSelectForClean = (id: string) => {
    setSelectedForClean((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleExecuteClean = async () => {
    if (selectedForClean.length === 0) return;
    try {
      setIsCleaning(true);
      await onSafeClean(selectedForClean);
      setSelectedForClean([]);
    } catch (err) {
      console.error("Erro na limpeza segura de fotos órfãs:", err);
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl text-zinc-100 font-mono text-xs">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span className="font-bold uppercase tracking-wider text-white text-xs">
              Gestão Segura de Fotos Órfãs / Não Associadas
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              {orphans.length} pendente(s)
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onRefresh}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Princípio Operacional da Seção 9 */}
        <div className="px-4 py-2.5 bg-zinc-900/40 border-b border-zinc-800 text-[11px] text-zinc-400">
          Princípio fundamental:{" "}
          <strong className="text-zinc-200">Preservar primeiro, limpar depois</strong>.
          Fotos que não contiveram serial legível ou produto completo permanecem preservadas aqui para associação manual ou descarte controlado.
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-4">
          {orphans.length === 0 ? (
            <div className="py-16 text-center text-zinc-500">
              <Check className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
              <div className="text-sm font-bold text-white mb-1">
                Nenhuma foto órfã pendente
              </div>
              <div className="text-xs text-zinc-500">
                Todas as fotos recebidas estão devidamente vinculadas a produtos da planilha.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {orphans.map((photo) => {
                const isSelectedClean = selectedForClean.includes(photo.id);
                const isSelectedToAssociate = selectedPhoto?.id === photo.id;

                return (
                  <div
                    key={photo.id}
                    className={`bg-zinc-900 rounded border overflow-hidden transition-all flex flex-col ${
                      isSelectedToAssociate
                        ? "border-white ring-1 ring-white"
                        : isSelectedClean
                        ? "border-rose-500 bg-rose-950/20"
                        : "border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="relative aspect-square bg-black">
                      <img
                        src={`/api/photos/${photo.id}`}
                        alt={photo.originalName}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => handleToggleSelectForClean(photo.id)}
                        className={`absolute top-1.5 right-1.5 p-1 rounded transition-colors ${
                          isSelectedClean
                            ? "bg-rose-600 text-white"
                            : "bg-black/60 text-zinc-400 hover:text-white"
                        }`}
                        title="Marcar para descarte definitivo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="p-2 space-y-1 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="truncate text-zinc-200 text-[11px] font-bold" title={photo.originalName}>
                          {photo.originalName}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {photo.loteId}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedPhoto(photo);
                          if (products.length > 0 && !targetProductId) {
                            setTargetProductId(products[0].id);
                          }
                        }}
                        className="w-full mt-2 py-1 px-2 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold flex items-center justify-center space-x-1 transition-colors"
                      >
                        <LinkIcon className="w-3 h-3 mr-1" />
                        <span>Vincular a Produto</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal/Barra de Associação Selecionada */}
        {selectedPhoto && (
          <div className="p-3 border-t border-zinc-800 bg-zinc-900/90 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <span className="text-zinc-400">Vincular foto:</span>
              <strong className="text-white truncate max-w-xs">{selectedPhoto.originalName}</strong>
            </div>

            <div className="flex items-center space-x-2 flex-1 max-w-md justify-end">
              <select
                value={targetProductId}
                onChange={(e) => setTargetProductId(e.target.value)}
                className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs w-full focus:outline-none"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.modelo} ({p.serialImei}) - Caixa {p.caixa}
                  </option>
                ))}
              </select>

              <button
                onClick={handleAssociate}
                disabled={isAssociating}
                className="px-3 py-1.5 bg-white text-black font-bold rounded text-xs hover:bg-zinc-200 transition-colors whitespace-nowrap"
              >
                {isAssociating ? "Vinculando..." : "Confirmar Vínculo"}
              </button>

              <button
                onClick={() => setSelectedPhoto(null)}
                className="p-1.5 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Rodapé com Ação de Limpeza Segura */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
          <div className="text-[11px] text-zinc-400">
            {selectedForClean.length} selecionada(s) para descarte.
          </div>

          <button
            onClick={handleExecuteClean}
            disabled={selectedForClean.length === 0 || isCleaning}
            className={`px-3 py-1.5 rounded text-xs font-bold flex items-center space-x-1.5 transition-colors ${
              selectedForClean.length > 0 && !isCleaning
                ? "bg-rose-700 hover:bg-rose-600 text-white cursor-pointer"
                : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>
              {isCleaning ? "Removendo..." : `Limpeza Segura (${selectedForClean.length})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
