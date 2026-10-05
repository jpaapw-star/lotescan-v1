import React, { useState, useRef, useEffect } from "react";
import { SystemStats, Batch, ResumoCaixa } from "../types";
import { 
  Layers, 
  RotateCw, 
  UserCheck, 
  History, 
  Image as ImageIcon,
  FileSpreadsheet,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  UserPlus,
  FileText,
  Edit3,
  Package,
  Plus,
} from "lucide-react";
import { User } from "firebase/auth";
import { SyncStatus } from "../types/sync";

interface HeaderStatsProps {
  stats: SystemStats | null;
  activeBatch: Batch | null;
  deviceId: string;
  operatorName?: string;
  recentOperators?: { id: string; name: string }[];
  onSelectOperator?: (name: string) => void;
  user: User | null;
  spreadsheetTitle: string | null;
  spreadsheetUrl: string | null;
  resumos?: ResumoCaixa[];
  batches?: Batch[];
  onSelectCaixa?: (caixa: number) => void;
  onCreateNewCaixa?: () => void;
  onSelectLot?: (loteId: string) => void;
  onOpenNewBatch: () => void;
  onOpenHistory: () => void;
  onOpenOrphans: () => void;
  onOpenDeviceSelector: () => void;
  onOpenGoogleModal: () => void;
  onOpenManifestModal?: () => void;
  hasManifestos?: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  onRenameLot?: (oldId: string, newName: string) => void;
  syncStatus?: SyncStatus;
  onTriggerSync?: () => void;
}

export const HeaderStats: React.FC<HeaderStatsProps> = ({
  stats,
  activeBatch,
  deviceId,
  operatorName,
  recentOperators = [],
  onSelectOperator,
  spreadsheetTitle,
  spreadsheetUrl,
  resumos = [],
  batches = [],
  onSelectCaixa,
  onCreateNewCaixa,
  onSelectLot,
  onOpenHistory,
  onOpenOrphans,
  onOpenDeviceSelector,
  onOpenGoogleModal,
  onOpenManifestModal,
  onRefresh,
  isRefreshing,
  syncStatus = "DISCONNECTED",
  onTriggerSync,
}) => {
  const currentOperator = operatorName || deviceId || "Carlos Silveira";
  const currentCaixa = activeBatch ? activeBatch.caixa : stats?.caixaAtual || 1;
  const currentLotId = activeBatch ? activeBatch.id : stats?.loteAtual || "LOTE-001";

  // Painel retrátil (toggle/accordion) contendo Lote/Caixa e ferramentas adicionais
  const [isBatchPanelOpen, setIsBatchPanelOpen] = useState(() => {
    const saved = localStorage.getItem("scanlote_batch_panel_open");
    return saved !== null ? saved === "true" : true; // Aberto por padrão
  });

  const toggleBatchPanel = () => {
    const next = !isBatchPanelOpen;
    setIsBatchPanelOpen(next);
    localStorage.setItem("scanlote_batch_panel_open", String(next));
  };

  // Dropdown states
  const [isOperatorDropdownOpen, setIsOperatorDropdownOpen] = useState(false);
  const [isCaixaDropdownOpen, setIsCaixaDropdownOpen] = useState(false);
  const [isLotDropdownOpen, setIsLotDropdownOpen] = useState(false);

  const operatorDropdownRef = useRef<HTMLDivElement>(null);
  const caixaDropdownRef = useRef<HTMLDivElement>(null);
  const lotDropdownRef = useRef<HTMLDivElement>(null);

  // Lista de caixas e lotes
  const existingCaixas = Array.from(
    new Set([
      currentCaixa,
      ...resumos.filter((r) => r.qtdLida > 0).map((r) => r.caixa),
    ])
  ).sort((a, b) => a - b);

  const existingLots = Array.from(
    new Set([
      currentLotId,
      ...batches.map((b) => b.id),
      ...resumos.map((r) => r.loteId).filter(Boolean),
    ])
  );

  const [customLotInput, setCustomLotInput] = useState("");

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        operatorDropdownRef.current &&
        !operatorDropdownRef.current.contains(event.target as Node)
      ) {
        setIsOperatorDropdownOpen(false);
      }
      if (
        caixaDropdownRef.current &&
        !caixaDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCaixaDropdownOpen(false);
      }
      if (
        lotDropdownRef.current &&
        !lotDropdownRef.current.contains(event.target as Node)
      ) {
        setIsLotDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="border-b border-zinc-800 bg-zinc-950 text-zinc-100 sticky top-0 z-40 w-full max-w-full">
      {/* 1. BARRA FIXA SUPERIOR: Logo, Operador, BOTÃO GOOGLE PLANILHAS PERMANENTE e Painel Retrátil */}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 flex items-center justify-between border-b border-zinc-800/60 text-xs font-mono gap-1.5 sm:gap-3 w-full max-w-full">
        <div className="flex items-center space-x-1.5 sm:space-x-3 min-w-0 flex-shrink">
          {/* Logo e Nome do Sistema */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 font-bold tracking-wider text-white whitespace-nowrap flex-shrink-0">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs sm:text-sm">SCANLOTE AI</span>
          </div>

          <span className="text-zinc-700 hidden sm:inline">|</span>

          {/* Gestão do Operador com Dropdown */}
          <div className="relative min-w-0" ref={operatorDropdownRef}>
            <div className="flex items-center rounded bg-zinc-900 border border-zinc-700/80 hover:border-zinc-500 transition-colors h-9 sm:h-10 px-1.5 sm:px-2 space-x-1 sm:space-x-2 whitespace-nowrap">
              <button
                onClick={onOpenDeviceSelector}
                className="flex items-center space-x-1 sm:space-x-1.5 text-zinc-300 hover:text-white cursor-pointer h-full text-[11px] sm:text-xs min-w-0"
                title="Trocar operador"
              >
                <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 flex-shrink-0" />
                <span className="truncate max-w-[80px] sm:max-w-[140px]">OP: <strong className="text-white">{currentOperator}</strong></span>
              </button>

              <button
                onClick={() => setIsOperatorDropdownOpen((prev) => !prev)}
                className="pl-1 sm:pl-2 border-l border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer h-full flex items-center justify-center"
                title="Troca rápida de operador"
              >
                <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
            </div>

            {isOperatorDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-64 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 z-50 text-xs">
                <div className="px-3 py-1.5 text-[10px] text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                  Troca Rápida de Operador
                </div>

                <div className="max-h-48 overflow-y-auto py-1">
                  {recentOperators.map((op) => {
                    const isCur = op.name.toLowerCase() === currentOperator.toLowerCase();
                    return (
                      <button
                        key={op.id}
                        onClick={() => {
                          if (onSelectOperator) onSelectOperator(op.name);
                          setIsOperatorDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-zinc-800 transition-colors cursor-pointer ${
                          isCur ? "text-emerald-400 font-bold bg-zinc-800/50" : "text-zinc-200"
                        }`}
                      >
                        <span className="truncate">{op.name}</span>
                        {isCur && <span className="text-emerald-400">✓</span>}
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-zinc-800 p-2">
                  <button
                    onClick={() => {
                      setIsOperatorDropdownOpen(false);
                      onOpenDeviceSelector();
                    }}
                    className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded font-bold transition-colors cursor-pointer text-center flex items-center justify-center space-x-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Adicionar / Gerenciar Operadores</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* LADO DIREITO FIXO: Botão Conectar Google Planilhas PERMANENTE e Painel Retrátil */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
          {/* BOTÃO FIXO PERMANENTE DO GOOGLE PLANILHAS */}
          <button
            onClick={onOpenGoogleModal}
            className={`flex items-center space-x-1.5 px-2.5 sm:px-3 h-9 sm:h-10 rounded font-bold transition-all cursor-pointer text-[11px] sm:text-xs whitespace-nowrap shadow-sm ${
              spreadsheetTitle
                ? "bg-emerald-950/90 border border-emerald-600 text-emerald-300 hover:bg-emerald-900"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
            title="Conectar Conta Google e Planilha de Inventário no Google Sheets"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-200 flex-shrink-0" />
            <span className="truncate max-w-[110px] sm:max-w-[180px]">
              {spreadsheetTitle ? spreadsheetTitle : "Google Sheets"}
            </span>
          </button>

          {/* Indicador Determinístico de Estado do SyncEngine (Seção 32) */}
          {spreadsheetTitle && (
            <button
              onClick={onTriggerSync}
              className={`flex items-center space-x-1 px-2 h-9 sm:h-10 rounded border font-bold text-[10px] sm:text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                syncStatus === "SYNCED"
                  ? "bg-emerald-950/80 border-emerald-700 text-emerald-300 hover:bg-emerald-900"
                  : syncStatus === "ERROR"
                  ? "bg-rose-950/80 border-rose-700 text-rose-300 hover:bg-rose-900"
                  : "bg-amber-950/80 border-amber-700 text-amber-300 hover:bg-amber-900"
              }`}
              title="Clique para forçar sincronização manual via SyncEngine"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  syncStatus === "SYNCED"
                    ? "bg-emerald-400"
                    : syncStatus === "ERROR"
                    ? "bg-rose-400 animate-ping"
                    : "bg-amber-400 animate-pulse"
                }`}
              ></span>
              <span className="hidden md:inline">
                {syncStatus === "SYNCED"
                  ? "Sincronizado"
                  : syncStatus === "READING_REMOTE"
                  ? "Lendo..."
                  : syncStatus === "PROCESSING_OUTBOX"
                  ? "Gravando..."
                  : syncStatus === "VERIFYING"
                  ? "Validando..."
                  : syncStatus === "APPLYING_REMOTE_CHANGES"
                  ? "Reconciliando..."
                  : syncStatus === "ERROR"
                  ? "Erro Sync"
                  : "Conectando..."}
              </span>
            </button>
          )}

          {/* Link direto para a Planilha no Google */}
          {spreadsheetUrl && (
            <a
              href={spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1 px-2 h-9 sm:h-10 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-emerald-500 rounded text-emerald-400 hover:text-white transition-colors cursor-pointer font-bold text-[11px] sm:text-xs"
              title="Abrir planilha selecionada no Google Sheets"
            >
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
            </a>
          )}

          {/* Botão de Controle do Painel Retrátil */}
          <button
            onClick={toggleBatchPanel}
            className="flex items-center space-x-1 sm:space-x-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-700/80 hover:border-zinc-500 text-zinc-200 rounded h-9 sm:h-10 px-2 sm:px-3 transition-colors cursor-pointer font-bold shadow-sm whitespace-nowrap text-[11px] sm:text-xs"
            title={isBatchPanelOpen ? "Recolher painel de Lote/Caixa" : "Expandir painel de Lote/Caixa"}
          >
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 flex-shrink-0" />
            <span className="hidden sm:inline">{isBatchPanelOpen ? "Recolher" : "Lote / Caixa"}</span>
            {isBatchPanelOpen ? <ChevronUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-400" /> : <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-400" />}
          </button>
        </div>
      </div>

      {/* 2. PAINEL RETRÁTIL (Lote Atual, Caixa Ativa, Ferramentas) */}
      {isBatchPanelOpen && (
        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3 space-y-3 bg-zinc-950/95 border-b border-zinc-800 transition-all font-mono w-full max-w-full relative z-40">
          {/* Linha 1: Lote Atual, Caixa Ativa e Botão Nota Fiscal */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 w-full">
            <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto">
              {/* Dropdown de Lote Atual */}
              <div className="relative font-mono flex-1 sm:flex-initial" ref={lotDropdownRef}>
                <button
                  onClick={() => setIsLotDropdownOpen((prev) => !prev)}
                  className="w-full sm:w-auto bg-zinc-900 hover:bg-zinc-850 border border-zinc-700 hover:border-zinc-500 px-2.5 sm:px-3 py-1.5 rounded flex items-center justify-between sm:justify-start space-x-2 transition-colors cursor-pointer text-left"
                  title="Clique para alternar entre os lotes da planilha ou criar novo"
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    <Layers className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[9px] sm:text-[10px] text-zinc-400 uppercase tracking-wider flex items-center space-x-1">
                        <span>Lote Atual</span>
                        <Edit3 className="w-2.5 h-2.5 text-zinc-500" />
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-white flex items-center space-x-1">
                        <span className="truncate max-w-[120px] sm:max-w-none">{currentLotId}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                      </div>
                    </div>
                  </div>
                </button>

                {isLotDropdownOpen && (
                  <div className="absolute left-0 mt-1.5 w-64 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 z-50 text-xs font-mono">
                    <div className="px-3 py-1.5 text-[10px] text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                      Lotes na Planilha
                    </div>

                    <div className="max-h-52 overflow-y-auto py-1">
                      {existingLots.map((lote) => {
                        const isCur = lote === currentLotId;
                        return (
                          <button
                            key={lote}
                            onClick={() => {
                              if (onSelectLot) onSelectLot(lote);
                              setIsLotDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-zinc-800 transition-colors cursor-pointer ${
                              isCur ? "text-emerald-400 font-bold bg-zinc-800/50" : "text-zinc-200"
                            }`}
                          >
                            <div className="flex items-center space-x-2 truncate">
                              <Layers className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                              <span className="truncate">{lote}</span>
                            </div>
                            {isCur && <span className="text-emerald-400 font-bold ml-1">✓</span>}
                          </button>
                        );
                      })}
                    </div>

                    <div className="border-t border-zinc-800 p-2">
                      <div className="text-[10px] text-zinc-400 mb-1">Criar ou Mudar para Lote (ex: JAIME 23):</div>
                      <div className="flex items-center space-x-1">
                        <input
                          type="text"
                          placeholder="Nome do Lote..."
                          value={customLotInput}
                          onChange={(e) => setCustomLotInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && customLotInput.trim()) {
                              if (onSelectLot) onSelectLot(customLotInput.trim());
                              setCustomLotInput("");
                              setIsLotDropdownOpen(false);
                            }
                          }}
                          className="bg-zinc-950 border border-zinc-600 rounded px-2 py-1 text-xs text-white flex-1 focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            if (customLotInput.trim()) {
                              if (onSelectLot) onSelectLot(customLotInput.trim());
                              setCustomLotInput("");
                              setIsLotDropdownOpen(false);
                            }
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-zinc-200 text-black font-bold rounded cursor-pointer"
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Dropdown Direto de Seleção de Caixa */}
              <div className="relative font-mono flex-1 sm:flex-initial" ref={caixaDropdownRef}>
                <button
                  onClick={() => setIsCaixaDropdownOpen((prev) => !prev)}
                  className="w-full sm:w-auto bg-zinc-900 hover:bg-zinc-850 border border-zinc-700 hover:border-zinc-500 px-2.5 sm:px-3 py-1.5 rounded flex items-center justify-between sm:justify-start space-x-2 transition-colors cursor-pointer text-left"
                  title="Clique para alternar diretamente entre as caixas existentes"
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    <Package className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <div>
                      <div className="text-[9px] sm:text-[10px] text-zinc-400 uppercase tracking-wider">Caixa Ativa</div>
                      <div className="text-xs sm:text-sm font-bold text-white flex items-center space-x-1">
                        <span>CAIXA {currentCaixa}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                      </div>
                    </div>
                  </div>
                </button>

                {isCaixaDropdownOpen && (
                  <div className="absolute left-0 mt-1.5 w-56 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 z-50 text-xs font-mono">
                    <div className="px-3 py-1.5 text-[10px] text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                      Caixas na Planilha
                    </div>

                    <div className="max-h-52 overflow-y-auto py-1">
                      {existingCaixas.map((c) => {
                        const isCur = c === currentCaixa;
                        const r = resumos.find((item) => item.caixa === c);
                        return (
                          <button
                            key={c}
                            onClick={() => {
                              if (onSelectCaixa) onSelectCaixa(c);
                              setIsCaixaDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-zinc-800 transition-colors cursor-pointer ${
                              isCur ? "text-emerald-400 font-bold bg-zinc-800/50" : "text-zinc-200"
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <Package className="w-3.5 h-3.5 text-zinc-400" />
                              <span>Caixa {c}</span>
                            </div>
                            <div className="text-[10px] text-zinc-400 font-normal">
                              {r ? `${r.qtdLida} itens` : ""}
                              {isCur && <span className="ml-1 text-emerald-400 font-bold">✓</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Botão + CRIAR NOVA CAIXA (MANDATO V4 - SEÇÃO 44) */}
                    <div className="p-1 border-t border-zinc-800 bg-zinc-950/60">
                      <button
                        onClick={() => {
                          setIsCaixaDropdownOpen(false);
                          if (onCreateNewCaixa) {
                            onCreateNewCaixa();
                          } else if (onSelectCaixa) {
                            const nextCaixa = Math.max(...existingCaixas, 0) + 1;
                            onSelectCaixa(nextCaixa);
                          }
                        }}
                        className="w-full px-2.5 py-1.5 bg-emerald-700/30 hover:bg-emerald-600/40 text-emerald-400 hover:text-emerald-300 rounded flex items-center justify-center space-x-1.5 font-bold transition-colors cursor-pointer text-[11px]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ CRIAR NOVA CAIXA</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Botão Nota Fiscal */}
              {onOpenManifestModal && (
                <button
                  onClick={onOpenManifestModal}
                  className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded transition-colors cursor-pointer text-[11px] sm:text-xs"
                  title="Gerenciar e anexar Notas Fiscais e conferir caixas"
                >
                  <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Nota Fiscal (PDF/NF)</span>
                </button>
              )}
            </div>

            {/* Ações Secundárias */}
            <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto">
              <button
                onClick={onOpenOrphans}
                className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-300 transition-colors cursor-pointer text-[11px] sm:text-xs"
                title="Ver fotos pendentes ou sem associação"
              >
                <ImageIcon className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                <span>Fotos Órfãs</span>
              </button>

              <button
                onClick={onOpenHistory}
                className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-300 transition-colors cursor-pointer text-[11px] sm:text-xs"
                title="Ver histórico de auditoria e deduplicações"
              >
                <History className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                <span>Histórico</span>
              </button>

              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="p-1.5 sm:p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Atualizar dados operacionais"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-white" : ""}`} />
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
