import React, { useState } from "react";
import { Layers, Package, Lock, X, PlusCircle } from "lucide-react";

interface NewBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  suggestedCaixa: number;
  onCreateBatch: (caixa: number) => Promise<void>;
}

export const NewBatchModal: React.FC<NewBatchModalProps> = ({
  isOpen,
  onClose,
  deviceId,
  suggestedCaixa,
  onCreateBatch,
}) => {
  const [caixaNumber, setCaixaNumber] = useState<number>(suggestedCaixa);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caixaNumber || caixaNumber <= 0) return;

    try {
      setIsSubmitting(true);
      await onCreateBatch(caixaNumber);
      onClose();
    } catch (err) {
      console.error("Erro ao criar novo lote:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl text-zinc-100 font-mono text-xs">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-zinc-300" />
            <span className="font-bold uppercase tracking-wider text-white text-xs">
              Iniciar Novo Lote de Recebimento
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="bg-zinc-900/60 border border-zinc-800 p-3 rounded space-y-2">
            <div className="flex items-center space-x-1.5 text-emerald-400 font-bold">
              <Lock className="w-3.5 h-3.5" />
              <span>Regra de Caixa Congelada (Seção 6):</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              A caixa definida agora ficará <strong className="text-white">CONGELADA</strong> para todos os produtos deste lote.
              Alterações futuras de caixa não alterarão registros deste lote retroativamente.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-400 uppercase tracking-wider block">
              Número da Caixa para este Lote:
            </label>
            <div className="flex items-center space-x-2">
              <Package className="w-4 h-4 text-zinc-400" />
              <input
                type="number"
                min={1}
                value={caixaNumber}
                onChange={(e) => setCaixaNumber(parseInt(e.target.value) || 1)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-zinc-400 font-mono"
              />
            </div>
            <span className="text-[10px] text-zinc-500">
              Estação de Trabalho: <strong>{deviceId}</strong>
            </span>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-white hover:bg-zinc-200 text-black font-bold rounded flex items-center space-x-1.5 transition-colors cursor-pointer shadow"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{isSubmitting ? "Criando Lote..." : "Iniciar e Congelar Caixa"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
