import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  FileSpreadsheet,
  HardDrive,
  ExternalLink,
  RefreshCw,
  Plus,
  Check,
  AlertCircle,
  Trash2,
  UploadCloud,
  LogOut,
  FolderOpen,
  Image as ImageIcon,
  CheckCircle2,
} from "lucide-react";
import { User } from "firebase/auth";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { ConfirmDestructiveModal } from "./ConfirmDestructiveModal";
import { GoogleDriveService, DriveFileItem } from "../services/googleDriveService";
import { GoogleSheetsService, SheetMetadata } from "../services/googleSheetsService";
import { translateErrorMessage } from "../utils/errorTranslator";
import { ProductItem, Batch, StoredPhoto } from "../types";
import { syncEngine } from "../services/syncEngine";

interface GoogleDriveSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  accessToken: string | null;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  isSigningIn: boolean;
  products: ProductItem[];
  activeBatch: Batch | null;
  selectedSpreadsheetId: string | null;
  onSelectSpreadsheet: (id: string, url: string, title: string) => void;
  onDisconnectSpreadsheet?: () => void;
  autoSyncEnabled: boolean;
  onToggleAutoSync: (enabled: boolean) => void;
  drivePhotoMap: Record<string, string>;
  onUpdateDrivePhotoMap: (map: Record<string, string>) => void;
  onTriggerSync?: () => Promise<void>;
  authError?: string | null;
  onClearAuthError?: () => void;
}

export const GoogleDriveSheetsModal: React.FC<GoogleDriveSheetsModalProps> = ({
  isOpen,
  onClose,
  user,
  accessToken,
  onSignIn,
  onSignOut,
  isSigningIn,
  products,
  activeBatch,
  selectedSpreadsheetId,
  onSelectSpreadsheet,
  onDisconnectSpreadsheet,
  autoSyncEnabled,
  onToggleAutoSync,
  drivePhotoMap,
  onUpdateDrivePhotoMap,
  onTriggerSync,
  authError,
  onClearAuthError,
}) => {
  const [activeTab, setActiveTab] = useState<"sheets" | "drive">("sheets");

  // Google Sheets state
  const [spreadsheets, setSpreadsheets] = useState<DriveFileItem[]>([]);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [currentSheetMeta, setCurrentSheetMeta] = useState<SheetMetadata | null>(null);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Google Drive state
  const [rootFolder, setRootFolder] = useState<{ id: string; name: string; webViewLink?: string } | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);

  // Destructive operations modal state
  const [destructiveModal, setDestructiveModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    count?: number;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: "",
    description: "",
    action: async () => {},
  });

  // Carregar planilhas do usuário
  const fetchSpreadsheets = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoadingSheets(true);
      const list = await GoogleDriveService.listSpreadsheets(accessToken);
      setSpreadsheets(list);
    } catch (err: any) {
      console.error("Erro ao listar planilhas:", err);
    } finally {
      setIsLoadingSheets(false);
    }
  }, [accessToken]);

  // Carregar pasta raiz do Drive e arquivos
  const fetchDriveInfo = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoadingDriveFiles(true);
      const folder = await GoogleDriveService.findOrCreateFolder(accessToken, "SCANLOTE_INVENTARIO");
      setRootFolder(folder);
      const files = await GoogleDriveService.listFilesInFolder(accessToken, folder.id);
      setDriveFiles(files);
    } catch (err: any) {
      console.error("Erro ao carregar pasta do Drive:", err);
    } finally {
      setIsLoadingDriveFiles(false);
    }
  }, [accessToken]);

  // Obter metadados da planilha ativa
  const fetchCurrentSheetMeta = useCallback(async () => {
    if (!accessToken || !selectedSpreadsheetId) return;
    try {
      const meta = await GoogleSheetsService.getSpreadsheetInfo(accessToken, selectedSpreadsheetId);
      setCurrentSheetMeta(meta);
    } catch (err: any) {
      console.error("Erro ao carregar metadados da planilha:", err);
    }
  }, [accessToken, selectedSpreadsheetId]);

  useEffect(() => {
    if (isOpen && accessToken) {
      fetchSpreadsheets();
      fetchDriveInfo();
      if (selectedSpreadsheetId) {
        fetchCurrentSheetMeta();
      }
    }
  }, [isOpen, accessToken, fetchSpreadsheets, fetchDriveInfo, fetchCurrentSheetMeta, selectedSpreadsheetId]);

  if (!isOpen) return null;

  // Criar nova planilha formatada
  const handleCreateNewSpreadsheet = async () => {
    if (!accessToken) return;
    try {
      setIsCreatingSheet(true);
      setSyncStatusMsg(null);

      // Limpar inventário para que a nova planilha venha 100% ZERADA/LIMPA
      await fetch("/api/products/clear", { method: "POST" }).catch(console.warn);

      const folder = rootFolder || (await GoogleDriveService.findOrCreateFolder(accessToken, "SCANLOTE_INVENTARIO"));
      setRootFolder(folder);

      const title = `ScanLote AI - Inventário ${new Date().toLocaleDateString("pt-BR")}`;
      const newSheet = await GoogleSheetsService.createInventorySpreadsheet(accessToken, title, folder.id);

      setCurrentSheetMeta(newSheet);
      onSelectSpreadsheet(newSheet.id, newSheet.spreadsheetUrl, newSheet.title);
      await fetchSpreadsheets();

      setSyncStatusMsg({
        type: "success",
        text: "Nova planilha criada 100% limpa com cabeçalhos e formatação nas colunas A–I!",
      });
    } catch (err: any) {
      setSyncStatusMsg({
        type: "error",
        text: translateErrorMessage(err),
      });
    } finally {
      setIsCreatingSheet(false);
    }
  };

  // Sincronizar produtos com a planilha ativa via SyncEngine (Seções 3 & 4)
  const handleSyncToSheets = async () => {
    if (!accessToken || !selectedSpreadsheetId) {
      setSyncStatusMsg({
        type: "error",
        text: "Selecione ou crie uma planilha no Google Sheets primeiro.",
      });
      return;
    }

    try {
      setIsSyncing(true);
      setSyncStatusMsg(null);
      if (onTriggerSync) {
        await onTriggerSync();
      } else {
        await syncEngine.sync(products);
      }
      setSyncStatusMsg({
        type: "success",
        text: "Sincronização determinística concluída com sucesso via SyncEngine!",
      });
    } catch (err: any) {
      setSyncStatusMsg({
        type: "error",
        text: translateErrorMessage(err),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Confirmar limpeza de planilha (Operação destrutiva com confirmação)
  const handleRequestClearSheet = () => {
    if (!selectedSpreadsheetId) return;
    setDestructiveModal({
      isOpen: true,
      title: "Limpar Linhas da Planilha Google?",
      description:
        "Esta ação limpará todas as linhas de dados (A2:I) da aba 'INVENTARIO' na sua planilha conectada. Os cabeçalhos e a estrutura serão mantidos. Deseja prosseguir?",
      count: products.length,
      action: async () => {
        if (!accessToken || !selectedSpreadsheetId) return;
        await GoogleSheetsService.clearInventoryData(accessToken, selectedSpreadsheetId);
        setSyncStatusMsg({
          type: "success",
          text: "Dados da aba INVENTARIO limpos na planilha Google.",
        });
      },
    });
  };

  // Upload em lote de fotos do lote atual para o Google Drive
  const handleUploadBatchPhotosToDrive = async () => {
    if (!accessToken) return;
    try {
      setIsUploadingToDrive(true);
      setSyncStatusMsg(null);

      const folder = rootFolder || (await GoogleDriveService.findOrCreateFolder(accessToken, "SCANLOTE_INVENTARIO"));
      setRootFolder(folder);

      // Criar subpasta para o lote
      const loteNome = activeBatch ? activeBatch.id : "LOTE-GERAL";
      const subfolder = await GoogleDriveService.findOrCreateFolder(accessToken, `LOTE_${loteNome}`, folder.id);

      // Buscar fotos locais dos produtos atuais
      const newMap: Record<string, string> = { ...drivePhotoMap };
      let uploadedCount = 0;

      for (const p of products) {
        for (const photoId of p.photoIds) {
          if (!newMap[photoId]) {
            try {
              // Buscar blob da foto servida pela rota local /api/photos/:id
              const resp = await fetch(`/api/photos/${photoId}`);
              if (resp.ok) {
                const blob = await resp.blob();
                const uploadedFile = await GoogleDriveService.uploadPhoto(
                  accessToken,
                  blob,
                  `${photoId}.jpg`,
                  subfolder.id
                );
                if (uploadedFile.webViewLink) {
                  newMap[photoId] = uploadedFile.webViewLink;
                  uploadedCount++;
                }
              }
            } catch (e) {
              console.warn(`Erro no upload da foto ${photoId} para o Drive:`, e);
            }
          }
        }
      }

      onUpdateDrivePhotoMap(newMap);
      await fetchDriveInfo();

      setSyncStatusMsg({
        type: "success",
        text: `Backup concluído: ${uploadedCount} foto(s) enviada(s) para a pasta '${subfolder.name}' no Google Drive.`,
      });

      // Se tiver planilha ativa, ressincroniza para injetar os novos links do Drive na Coluna I
      if (selectedSpreadsheetId && uploadedCount > 0) {
        await GoogleSheetsService.syncProducts(accessToken, selectedSpreadsheetId, products, newMap);
      }
    } catch (err: any) {
      setSyncStatusMsg({
        type: "error",
        text: err.message || "Erro ao enviar fotos para o Google Drive",
      });
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  // Excluir arquivo do Drive com confirmação
  const handleRequestTrashDriveFile = (file: DriveFileItem) => {
    setDestructiveModal({
      isOpen: true,
      title: "Mover Foto para a Lixeira do Drive?",
      description: `Tem certeza que deseja mover o arquivo '${file.name}' para a lixeira do seu Google Drive?`,
      count: 1,
      action: async () => {
        if (!accessToken) return;
        await GoogleDriveService.trashFile(accessToken, file.id);
        setDriveFiles((prev) => prev.filter((f) => f.id !== file.id));
        setSyncStatusMsg({
          type: "success",
          text: `Arquivo '${file.name}' movido para a lixeira do Google Drive.`,
        });
      },
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl text-zinc-100 font-mono text-xs">
          {/* Cabeçalho */}
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="font-bold uppercase tracking-wider text-white text-xs">
                  Integração Google Sheets
                </div>
                <div className="text-[10px] text-zinc-400 font-sans">
                  Sincronização direta de inventário (Colunas A–I)
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {user && (
                <div className="flex items-center space-x-2 px-2.5 py-1 bg-zinc-900 border border-zinc-700 rounded text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                  <span className="text-zinc-300 truncate max-w-[150px] sm:max-w-[200px]">
                    {user.email}
                  </span>
                  <button
                    onClick={onSignOut}
                    className="ml-1 p-0.5 hover:text-rose-400 text-zinc-400 transition-colors"
                    title="Desconectar conta Google"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Se o usuário NÃO estiver autenticado: Apresenta login oficial do Google */}
          {!user ? (
            <div className="p-8 text-center flex flex-col items-center justify-center space-y-4 my-auto">
              <div className="p-4 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
                <FileSpreadsheet className="w-10 h-10 text-emerald-400" />
              </div>
              <div className="max-w-md space-y-2">
                <h3 className="text-base font-bold text-white font-sans">
                  Conecte sua Conta do Google
                </h3>
                <p className="text-xs text-zinc-400 font-sans leading-relaxed">
                  Para utilizar o Google Sheets no ScanLote AI, inicie sessão com sua conta Google.
                  Você poderá criar ou selecionar uma planilha e manter suas colunas A–I sincronizadas em tempo real.
                </p>
              </div>

              <div className="pt-2">
                <GoogleSignInButton
                  onClick={onSignIn}
                  isLoading={isSigningIn}
                  label="Conectar com o Google"
                />
              </div>

              {authError && (
                <div className="mt-4 p-3.5 bg-rose-950/70 border border-rose-800 text-rose-300 text-xs rounded-lg max-w-md text-left flex items-start space-x-2.5 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-bold text-white mb-0.5">Falha na Autenticação</div>
                    <div className="text-[11px] leading-relaxed text-rose-200">{authError}</div>
                    {authError.toLowerCase().includes("bloqueada") || authError.toLowerCase().includes("pop-up") ? (
                      <div className="mt-2 p-2 bg-black/40 rounded border border-rose-900/60 text-[10px] text-rose-200/90 font-sans leading-normal">
                        <strong>💡 Como desbloquear:</strong> Clique no ícone de pop-up bloqueado na barra de endereços do seu navegador (ao lado da URL) e selecione <em>"Sempre permitir pop-ups e redirecionamentos deste site"</em>, depois clique novamente no botão de login.
                      </div>
                    ) : null}
                  </div>
                  {onClearAuthError && (
                    <button
                      onClick={onClearAuthError}
                      className="text-rose-400 hover:text-white p-0.5 cursor-pointer transition-colors"
                      title="Fechar alerta"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Barra de Controle de Sincronização */}
              <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/30 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Planilhas do Google Sheets</span>
                  </span>
                </div>

                {/* Sincronização Automática (Fixa e Sempre Ativa) */}
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1.5 text-emerald-400 text-[11px] font-bold">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Sincronização Automática Ativa</span>
                  </div>
                </div>
              </div>

              {/* Mensagem de Feedback de Sincronização */}
              {syncStatusMsg && (
                <div
                  className={`px-4 py-2 text-xs flex items-center justify-between border-b ${
                    syncStatusMsg.type === "success"
                      ? "bg-emerald-950/60 border-emerald-800/80 text-emerald-300"
                      : "bg-rose-950/60 border-rose-800/80 text-rose-300"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {syncStatusMsg.type === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    )}
                    <span>{syncStatusMsg.text}</span>
                  </div>
                  <button
                    onClick={() => setSyncStatusMsg(null)}
                    className="text-zinc-400 hover:text-white ml-2"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Conteúdo Principal */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="space-y-4">
                  {/* Seletor de Planilha Ativa & Criar Nova */}
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold text-white uppercase text-xs flex items-center space-x-1.5">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                        <span>Planilha Conectada</span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={fetchSpreadsheets}
                          disabled={isLoadingSheets}
                          className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                          title="Recarregar lista de planilhas do Google Sheets"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSheets ? "animate-spin" : ""}`} />
                        </button>

                        <button
                          onClick={handleCreateNewSpreadsheet}
                          disabled={isCreatingSheet}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold transition-colors flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isCreatingSheet ? "Criando..." : "Criar Nova Planilha"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Dropdown de Seleção */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <select
                        value={selectedSpreadsheetId || ""}
                        onChange={(e) => {
                          const found = spreadsheets.find((s) => s.id === e.target.value);
                          if (found) {
                            onSelectSpreadsheet(found.id, found.webViewLink || "", found.name);
                          }
                        }}
                        className="bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 flex-1 font-mono cursor-pointer"
                      >
                        <option value="">-- Selecione uma Planilha do Google --</option>
                        {spreadsheets.map((sheet) => (
                          <option key={sheet.id} value={sheet.id}>
                            {sheet.name} {sheet.modifiedTime ? `(modificado: ${sheet.modifiedTime.slice(0, 10)})` : ""}
                          </option>
                        ))}
                      </select>

                      {selectedSpreadsheetId && (
                        <button
                          onClick={handleSyncToSheets}
                          disabled={isSyncing}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 rounded font-bold transition-colors flex items-center justify-center space-x-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                          title="Forçar sincronização manual imediata do inventário com o Google Sheets"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                          <span>{isSyncing ? "Sincronizando..." : "Sincronizar Planilha Agora"}</span>
                        </button>
                      )}

                      {selectedSpreadsheetId && onDisconnectSpreadsheet && (
                        <button
                          onClick={() => {
                            onDisconnectSpreadsheet();
                            onClose();
                          }}
                          className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded font-bold transition-colors flex items-center justify-center space-x-1 whitespace-nowrap cursor-pointer"
                          title="Desconectar e desvincular a planilha atual"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Desconectar Planilha</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal de Confirmação para Operações Destrutivas */}
      <ConfirmDestructiveModal
        isOpen={destructiveModal.isOpen}
        title={destructiveModal.title}
        description={destructiveModal.description}
        affectedCount={destructiveModal.count}
        onConfirm={async () => {
          try {
            await destructiveModal.action();
          } catch (e: any) {
            console.error("Erro na operação destrutiva:", e);
          } finally {
            setDestructiveModal((prev) => ({ ...prev, isOpen: false }));
          }
        }}
        onCancel={() => setDestructiveModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </>
  );
};
