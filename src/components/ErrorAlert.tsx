import React from "react";
import { AlertCircle, RotateCcw, X } from "lucide-react";

interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
  onClose?: () => void;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({ message, onRetry, onClose }) => {
  return (
    <div className="bg-rose-950/90 border border-rose-600/90 text-rose-100 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg animate-in fade-in duration-200">
      <div className="flex items-center space-x-2.5">
        <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
        <span className="text-xs font-semibold leading-relaxed">{message}</span>
      </div>
      <div className="flex items-center space-x-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center space-x-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded transition-colors cursor-pointer shadow active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Tentar Novamente</span>
          </button>
        )}
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-rose-900/80 rounded text-rose-300 hover:text-white transition-colors cursor-pointer"
            title="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
