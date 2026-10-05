import React from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

interface ConfirmDestructiveModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  affectedCount?: number;
  affectedItems?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDestructiveModal: React.FC<ConfirmDestructiveModalProps> = ({
  isOpen,
  title,
  description,
  affectedCount,
  affectedItems,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  isDestructive = true,
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl text-zinc-100 font-mono text-xs">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center space-x-2">
            <AlertTriangle
              className={`w-4 h-4 ${
                isDestructive ? "text-rose-400" : "text-amber-400"
              }`}
            />
            <span className="font-bold text-white uppercase tracking-wider text-xs">
              {title}
            </span>
          </div>

          <button
            onClick={onCancel}
            disabled={isLoading}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo com descrição */}
        <div className="p-4 space-y-3 font-sans text-xs text-zinc-300">
          <p className="leading-relaxed">{description}</p>

          {typeof affectedCount === "number" && (
            <div className="p-2.5 bg-zinc-900 rounded border border-zinc-800 font-mono text-[11px] text-zinc-300">
              Total de itens afetados:{" "}
              <strong className="text-white">{affectedCount}</strong>
            </div>
          )}

          {affectedItems && affectedItems.length > 0 && (
            <div className="max-h-36 overflow-y-auto p-2 bg-zinc-900/80 rounded border border-zinc-800 font-mono text-[10px] space-y-1 text-zinc-400">
              {affectedItems.map((item, i) => (
                <div key={i} className="truncate">
                  • {item}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/40 flex items-center justify-end space-x-2">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 transition-colors font-mono cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>

          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-3 py-1.5 rounded font-mono font-bold transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 ${
              isDestructive
                ? "bg-rose-600 hover:bg-rose-500 text-white"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            {isDestructive && <Trash2 className="w-3.5 h-3.5" />}
            <span>{isLoading ? "Processando..." : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
