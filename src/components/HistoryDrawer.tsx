import React, { useState } from "react";
import { AuditLog } from "../types";
import { 
  X, 
  History, 
  RotateCw, 
  Layers, 
  CheckCircle, 
  AlertTriangle, 
  GitMerge, 
  PlusCircle, 
  FileText 
} from "lucide-react";

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  logs: AuditLog[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  logs,
  isLoading,
  onRefresh,
}) => {
  const [filterType, setFilterType] = useState<string>("ALL");

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    if (filterType === "ALL") return true;
    return log.tipo === filterType;
  });

  const getLogIcon = (tipo: string) => {
    switch (tipo) {
      case "ENTRADA":
        return <PlusCircle className="w-3.5 h-3.5 text-zinc-300" />;
      case "DEDUPLICACAO":
        return <GitMerge className="w-3.5 h-3.5 text-cyan-400" />;
      case "PROCESSAMENTO":
        return <RotateCw className="w-3.5 h-3.5 text-amber-400" />;
      case "FALHA":
        return <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-xl bg-zinc-950 border-l border-zinc-800 h-full flex flex-col shadow-2xl text-zinc-100 font-mono text-xs">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-zinc-300" />
            <span className="font-bold uppercase tracking-wider text-white text-xs">
              Histórico Persistente & Auditoria
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title="Recarregar histórico"
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

        {/* Filtros */}
        <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/30 flex items-center space-x-1 overflow-x-auto text-[11px]">
          {["ALL", "ENTRADA", "DEDUPLICACAO", "PROCESSAMENTO", "FALHA"].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-2 py-1 rounded transition-colors whitespace-nowrap ${
                filterType === type
                  ? "bg-white text-black font-bold"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              {type === "ALL" ? "Todos os Eventos" : type}
            </button>
          ))}
        </div>

        {/* Lista de Eventos */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && logs.length === 0 ? (
            <div className="py-12 text-center text-zinc-500">
              <RotateCw className="w-5 h-5 mx-auto animate-spin mb-2" />
              <span>Carregando trilha de auditoria...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-zinc-600">
              Nenhum evento registrado nesta categoria.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="bg-zinc-900 border border-zinc-800/80 rounded p-3 space-y-1 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center justify-between text-[10px] text-zinc-400">
                  <div className="flex items-center space-x-1.5">
                    {getLogIcon(log.tipo)}
                    <span className="font-bold text-zinc-200">{log.tipo}</span>
                    <span className="text-zinc-600">•</span>
                    <span>{log.deviceId}</span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-zinc-400">{log.loteId}</span>
                  </div>
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>

                <div className="text-zinc-300 text-[11px] leading-relaxed">
                  {log.detalhes}
                </div>

                {log.productId && (
                  <div className="text-[10px] text-zinc-500">
                    ID Produto: {log.productId}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Rodapé informativo */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/60 text-[10px] text-zinc-500">
          Camada de auditoria isolada da visualização da planilha conforme Seção 14.
        </div>
      </div>
    </div>
  );
};
