import React, { useState, useEffect, useCallback, useRef } from "react";
import { HeaderStats } from "./components/HeaderStats";
import { ResumoCaixasDashboard } from "./components/ResumoCaixasDashboard";
import { DivergenciasModal } from "./components/DivergenciasModal";
import { UploadCaptureZone } from "./components/UploadCaptureZone";
import { CameraModal } from "./components/CameraModal";
import { ProductTable } from "./components/ProductTable";
import { PhotoGalleryModal } from "./components/PhotoGalleryModal";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { OrphansModal } from "./components/OrphansModal";
import { DeviceSelectorModal } from "./components/DeviceSelectorModal";
import { NewBatchModal } from "./components/NewBatchModal";
import { GoogleDriveSheetsModal } from "./components/GoogleDriveSheetsModal";
import { ManifestModal } from "./components/ManifestModal";
import { ExceptionFlowModal } from "./components/ExceptionFlowModal";
import { BoxQrCodeModal } from "./components/BoxQrCodeModal";
import { AlertsConfigModal } from "./components/AlertsConfigModal";
import { AuditReportModal } from "./components/AuditReportModal";
import { ErrorAlert } from "./components/ErrorAlert";
import { translateErrorMessage } from "./utils/errorTranslator";
import { GoogleSignInButton } from "./components/GoogleSignInButton";
import { FileSpreadsheet } from "lucide-react";
import {
  ProductItem,
  SystemStats,
  Batch,
  StoredPhoto,
  AuditLog,
  ResumoCaixa,
  ManifestoDoc,
  EstadoFisico,
} from "./types";
import { User } from "firebase/auth";
import { initAuth, googleSignIn, logout } from "./services/googleAuth";
import { GoogleSheetsService } from "./services/googleSheetsService";
import { GoogleDriveService } from "./services/googleDriveService";
import { syncEngine } from "./services/syncEngine";
import { SyncStatus } from "./types/sync";

export type ConnectionStatus = "checking" | "connected" | "disconnected" | "error";

export default function App() {
  // Estado Real de Conexão com Google Sheets (Regra Estrutural: Dados Persistidos NÃO São Conexão)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("checking");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("DISCONNECTED");

  // Gestão de Operador e Sessão Unificada (Multi-Dispositivo)
  const [operatorName, setOperatorName] = useState<string>(() => {
    return localStorage.getItem("scanlote_operator_name") || "Carlos Silveira";
  });

  const [recentOperators, setRecentOperators] = useState<{ id: string; name: string }[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("scanlote_recent_operators") || "[]");
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch {}
    return [
      { id: "Carlos Silveira", name: "Carlos Silveira" },
      { id: "Ana Paula", name: "Ana Paula" },
      { id: "Marcos Lima", name: "Marcos Lima" },
    ];
  });

  // Dados centrais
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [activeBatch, setActiveBatch] = useState<Batch | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [orphans, setOrphans] = useState<StoredPhoto[]>([]);
  const [illegiblePhotos, setIllegiblePhotos] = useState<StoredPhoto[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [devices, setDevices] = useState<{ id: string; name: string; currentCaixa?: number; lastActive?: string }[]>([]);
  const [resumos, setResumos] = useState<ResumoCaixa[]>([]);
  const [manifestos, setManifestos] = useState<ManifestoDoc[]>([]);

  // Camada de Tradução de Erros da API
  const [apiError, setApiError] = useState<string | null>(null);

  // Estados de Carregamento
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isLoadingOrphans, setIsLoadingOrphans] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Estados de Integração Google (Google Drive & Google Sheets)
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [isSyncingToSheets, setIsSyncingToSheets] = useState(false);

  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState<string | null>(() => {
    return localStorage.getItem("scanlote_spreadsheet_id");
  });
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(() => {
    return localStorage.getItem("scanlote_spreadsheet_url");
  });
  const [spreadsheetTitle, setSpreadsheetTitle] = useState<string | null>(() => {
    return localStorage.getItem("scanlote_spreadsheet_title");
  });
  const [drivePhotoMap, setDrivePhotoMap] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("scanlote_drive_photos") || "{}");
    } catch {
      return {};
    }
  });

  const lastSyncedSignature = useRef<string>("");

  // Modais e Painéis
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isNewBatchOpen, setIsNewBatchOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isOrphansOpen, setIsOrphansOpen] = useState(false);
  const [isDeviceSelectorOpen, setIsDeviceSelectorOpen] = useState(false);
  const [isManifestModalOpen, setIsManifestModalOpen] = useState(false);
  const [isDivergenciasModalOpen, setIsDivergenciasModalOpen] = useState(false);
  const [isExceptionModalOpen, setIsExceptionModalOpen] = useState(false);
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrModalData, setQrModalData] = useState<{ caixa: number; qrCode: string }>({
    caixa: 1,
    qrCode: "",
  });
  const [selectedProductForPhotos, setSelectedProductForPhotos] = useState<ProductItem | null>(null);
  // Limpa rigorosamente todo o estado operacional
  const clearOperationalData = useCallback(() => {
    setProducts([]);
    setResumos([]);
    setManifestos([]);
    setBatches([]);
    setStats(null);
    setActiveBatch(null);
    setLogs([]);
    setOrphans([]);
    setIllegiblePhotos([]);
  }, []);

  // Mecanismo estrutural de desconectar a planilha
  const handleDisconnectSpreadsheet = useCallback((reason?: string) => {
    syncEngine.disconnect(reason);
    setConnectionStatus("disconnected");
    if (reason) setConnectionError(reason);

    // Remover chaves persistidas no navegador
    localStorage.removeItem("scanlote_spreadsheet_id");
    localStorage.removeItem("scanlote_spreadsheet_url");
    localStorage.removeItem("scanlote_spreadsheet_title");
    localStorage.removeItem("scanlote_selected_lote_id");
    localStorage.removeItem("scanlote_drive_photos");

    setSelectedSpreadsheetId(null);
    setSpreadsheetUrl(null);
    setSpreadsheetTitle(null);

    // Limpar estados operacionais da aplicação
    clearOperationalData();

    // Limpa base temporária do servidor
    fetch("/api/products/clear", { method: "POST" }).catch(() => {});
  }, [clearOperationalData]);

  // Validação real de acesso à planilha do Google Sheets via SyncEngine (Seções 4, 7, 8)
  const verifySpreadsheetConnection = useCallback(
    async (token: string | null, sheetId: string | null, sheetTitle?: string, sheetUrl?: string): Promise<boolean> => {
      setConnectionStatus("checking");

      if (!sheetId) {
        setConnectionStatus("disconnected");
        setConnectionError(null);
        clearOperationalData();
        return false;
      }

      if (!token) {
        setConnectionStatus("disconnected");
        setConnectionError("Sessão do Google não autenticada.");
        clearOperationalData();
        return false;
      }

      try {
        const connected = await syncEngine.connect(token, sheetId, sheetTitle || "Google Sheets", sheetUrl || "");
        if (connected) {
          const conn = syncEngine.getConnection();
          setSelectedSpreadsheetId(conn.spreadsheetId);
          setSpreadsheetUrl(conn.spreadsheetUrl);
          setSpreadsheetTitle(conn.spreadsheetName);
          localStorage.setItem("scanlote_spreadsheet_id", conn.spreadsheetId);
          localStorage.setItem("scanlote_spreadsheet_url", conn.spreadsheetUrl);
          localStorage.setItem("scanlote_spreadsheet_title", conn.spreadsheetName);

          setConnectionStatus("connected");
          setConnectionError(null);
          return true;
        } else {
          const err = syncEngine.getConnection().error || "Acesso negado à planilha.";
          handleDisconnectSpreadsheet(err);
          return false;
        }
      } catch (err: any) {
        console.error("Erro na verificação de acesso à planilha:", err);
        handleDisconnectSpreadsheet("Erro ao acessar planilha do Google Sheets.");
        return false;
      }
    },
    [clearOperationalData, handleDisconnectSpreadsheet]
  );

  // Autenticação com o Google
  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      setApiError(null);
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setAccessToken(res.accessToken);
        if (res.user.displayName) {
          handleSelectOperator(res.user.displayName);
        }
      }
    } catch (err: any) {
      setApiError(translateErrorMessage(err));
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
    handleDisconnectSpreadsheet("Usuário encerrou a sessão Google.");
  };

  // Salvar planilha selecionada APÓS validação real de acesso via SyncEngine (Seções 4, 6 & 8)
  const handleSelectSpreadsheet = async (id: string, url: string, title: string) => {
    if (!accessToken) {
      setConnectionError("Você precisa entrar com uma conta do Google primeiro.");
      return;
    }

    // Se estiver trocando de planilha, desconecta e limpa imediatamente (Seção 6)
    if (selectedSpreadsheetId && selectedSpreadsheetId !== id) {
      clearOperationalData();
    }

    setConnectionStatus("checking");

    try {
      const connected = await syncEngine.connect(accessToken, id, title, url);
      if (!connected) {
        throw new Error(syncEngine.getConnection().error || "Acesso negado à planilha.");
      }

      setSelectedSpreadsheetId(id);
      setSpreadsheetUrl(url);
      setSpreadsheetTitle(title);
      localStorage.setItem("scanlote_spreadsheet_id", id);
      localStorage.setItem("scanlote_spreadsheet_url", url);
      localStorage.setItem("scanlote_spreadsheet_title", title);

      // Ciclo determinístico da nova planilha: PING -> READ REMOTE -> SNAPSHOT -> RECONCILE
      const syncResult = await syncEngine.sync([]);
      if (syncResult.success) {
        setProducts(syncResult.products);
        setConnectionStatus("connected");
        setConnectionError(null);
        await fetchAllData(true);
      } else {
        throw new Error(syncResult.error || "Falha na leitura inicial da planilha.");
      }
    } catch (err: any) {
      handleDisconnectSpreadsheet(translateErrorMessage(err));
    }
  };

  const handleUpdateDrivePhotoMap = (map: Record<string, string>) => {
    setDrivePhotoMap(map);
    localStorage.setItem("scanlote_drive_photos", JSON.stringify(map));
  };

  // Troca de Operador
  const handleSelectOperator = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setOperatorName(clean);
    localStorage.setItem("scanlote_operator_name", clean);
    localStorage.setItem("scanlote_device_id", clean);

    setRecentOperators((prev) => {
      const filtered = prev.filter((o) => o.name.toLowerCase() !== clean.toLowerCase());
      const updated = [{ id: clean, name: clean }, ...filtered].slice(0, 8);
      localStorage.setItem("scanlote_recent_operators", JSON.stringify(updated));
      return updated;
    });
  };

  // Carregar dados principais da API com base no Operador Ativo
  const fetchAllData = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const opQuery = encodeURIComponent(operatorName);
      const sheetQuery = selectedSpreadsheetId ? `&spreadsheetId=${encodeURIComponent(selectedSpreadsheetId)}` : "";
      const safeJson = async (url: string, fallback: any) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return fallback;
          return await r.json();
        } catch {
          return fallback;
        }
      };

      const [statsRes, batchRes, allBatchesRes, prodsRes, operatorsRes, resumosRes, manifestosRes, illegibleRes] = await Promise.all([
        safeJson(`/api/stats?operatorId=${opQuery}${sheetQuery}`, null),
        safeJson(`/api/batches/active?operatorId=${opQuery}${sheetQuery}`, null),
        safeJson(`/api/batches?operatorId=${opQuery}${sheetQuery}`, []),
        safeJson(`/api/products?operatorId=${opQuery}${sheetQuery}`, []),
        safeJson("/api/operators", []),
        safeJson(`/api/resumo-caixas?operatorId=${opQuery}${sheetQuery}`, []),
        safeJson(`/api/manifestos?${sheetQuery.slice(1)}`, []),
        safeJson(`/api/photos/illegible?operatorId=${opQuery}${sheetQuery}`, []),
      ]);

      if (statsRes) setStats(statsRes);
      
      const validBatches = Array.isArray(allBatchesRes) ? allBatchesRes : [];
      setBatches(validBatches);

      const savedLoteId = localStorage.getItem("scanlote_selected_lote_id");
      if (savedLoteId) {
        const stillExists = validBatches.some((b: any) => b.id === savedLoteId);
        if (!stillExists) {
          localStorage.removeItem("scanlote_selected_lote_id");
          setActiveBatch(batchRes);
        } else if (batchRes) {
          setActiveBatch({
            ...batchRes,
            id: savedLoteId,
          });
        }
      } else if (batchRes) {
        setActiveBatch(batchRes);
      }

      if (Array.isArray(prodsRes)) {
        setProducts(syncEngine.filterTombstonedProducts(prodsRes, selectedSpreadsheetId || ""));
      }
      if (Array.isArray(operatorsRes)) setDevices(operatorsRes);
      if (Array.isArray(resumosRes)) setResumos(resumosRes);
      if (Array.isArray(manifestosRes)) setManifestos(manifestosRes);
      if (Array.isArray(illegibleRes)) setIllegiblePhotos(illegibleRes);

      if (Array.isArray(operatorsRes) && operatorsRes.length > 0) {
        setRecentOperators((prev) => {
          const map = new Map<string, string>();
          operatorsRes.forEach((o: any) => map.set(o.name || o.id, o.name || o.id));
          prev.forEach((o) => map.set(o.name, o.name));
          return Array.from(map.entries()).map(([k, v]) => ({ id: k, name: v })).slice(0, 10);
        });
      }
    } catch (err) {
      console.error("Erro ao carregar dados do sistema:", err);
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }, [operatorName]);

  // Inicialização do Google Auth e Validação Real da Planilha (Reconstrução Completa)
  useEffect(() => {
    const unsubscribe = initAuth(
      async (u, token) => {
        setUser(u);
        setAccessToken(token);

        if (token) {
          // Registrar token de proprietário central ou operador na base de IA se necessário (Requisito 16)
          fetch("/api/auth/register-owner-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: u?.email || "jpaapw@gmail.com", token }),
          }).catch(console.warn);
        }

        const savedSheetId = localStorage.getItem("scanlote_spreadsheet_id");
        const savedSheetTitle = localStorage.getItem("scanlote_spreadsheet_title") || "Google Sheets";
        const savedSheetUrl = localStorage.getItem("scanlote_spreadsheet_url") || "";

        if (token && savedSheetId) {
          const isOk = await verifySpreadsheetConnection(token, savedSheetId, savedSheetTitle, savedSheetUrl);
          if (isOk) {
            try {
              // Sincronização determinística com reconciliação (SOT no Sheets - Seção 4 & 24)
              const syncResult = await syncEngine.sync([]);
              if (syncResult.success) {
                setProducts(syncResult.products);
                await fetchAllData(true);
              }
            } catch (e) {
              console.warn("Erro ao sincronizar inventário inicial via SyncEngine:", e);
            }
          }
        } else {
          setConnectionStatus("disconnected");
          clearOperationalData();
        }
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setConnectionStatus("disconnected");
        clearOperationalData();
      }
    );
    return () => unsubscribe();
  }, [verifySpreadsheetConnection, fetchAllData, clearOperationalData]);

  // Carregar logs
  const fetchLogs = useCallback(async () => {
    try {
      setIsLoadingLogs(true);
      const res = await fetch(`/api/history?operatorId=${encodeURIComponent(operatorName)}`);
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      console.error("Erro ao carregar logs:", err);
    } finally {
      setIsLoadingLogs(false);
    }
  }, [operatorName]);

  // Carregar fotos órfãs
  const fetchOrphans = useCallback(async () => {
    try {
      setIsLoadingOrphans(true);
      const res = await fetch(`/api/photos/orphans?operatorId=${encodeURIComponent(operatorName)}`);
      const data = await res.json();
      setOrphans(data);
    } catch (err) {
      console.error("Erro ao carregar fotos órfãs:", err);
    } finally {
      setIsLoadingOrphans(false);
    }
  }, [operatorName]);

  // Polling suave - EXECUTADO APENAS QUANDO A CONEXÃO ESTIVER CONFIRMADA
  useEffect(() => {
    if (connectionStatus !== "connected") {
      return; // INTERROMPE QUALQUER POLLING SE NÃO HOUVER CONEXÃO CONFIRMADA!
    }

    fetchAllData(false);

    const interval = setInterval(() => {
      fetchAllData(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [connectionStatus, fetchAllData]);

  // Subscrição ao SyncEngine para refletir estados determinísticos na UI (Seções 4, 30 & 32)
  useEffect(() => {
    const unsub = syncEngine.subscribe((conn) => {
      setSyncStatus(conn.connectionStatus);
      if (conn.connectionStatus === "SYNCED") {
        setConnectionStatus("connected");
        setConnectionError(null);
      } else if (conn.connectionStatus === "ERROR") {
        if (conn.error) setConnectionError(conn.error);
      }
    });
    return () => unsub();
  }, []);

  // Disparo central via SyncEngine: PING -> READ REMOTE -> SNAPSHOT -> RECONCILE -> OUTBOX -> READ-BACK
  const triggerSync = useCallback(async () => {
    if (connectionStatus !== "connected" || !accessToken || !selectedSpreadsheetId || !syncEngine.isConnected()) {
      return;
    }
    try {
      setIsSyncingToSheets(true);
      const result = await syncEngine.sync(products);
      if (result.success && result.products) {
        setProducts(result.products);
      }
      await fetchAllData(true);
      setApiError(null);
    } catch (err: any) {
      setApiError(translateErrorMessage(err));
    } finally {
      setIsSyncingToSheets(false);
    }
  }, [connectionStatus, accessToken, selectedSpreadsheetId, products, fetchAllData]);

  // Ciclo periódico suave do SyncEngine (a cada 7 segundos para detectar exclusões ou edições na planilha remota)
  useEffect(() => {
    if (connectionStatus !== "connected" || !accessToken || !selectedSpreadsheetId || !syncEngine.isConnected()) {
      return;
    }

    const interval = setInterval(() => {
      triggerSync();
    }, 7000);

    return () => clearInterval(interval);
  }, [connectionStatus, accessToken, selectedSpreadsheetId, triggerSync]);

  // Upload via arquivos multipart (com espelhamento no Drive e gravação imediata na planilha)
  const handleUploadFiles = async (files: File[]) => {
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("photos", file));
      formData.append("operatorId", operatorName);
      formData.append("deviceId", operatorName);
      if (selectedSpreadsheetId) {
        formData.append("spreadsheetId", selectedSpreadsheetId);
      }
      if (activeBatch) {
        formData.append("loteId", activeBatch.id);
      }

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro no envio" }));
        throw new Error(err.error || "Erro ao enviar fotografias");
      }

      const data = await res.json();

      // Envia fotos para o Google Drive em background
      if (accessToken && data.photoIds && data.photoIds.length > 0) {
        (async () => {
          try {
            const folder = await GoogleDriveService.findOrCreateFolder(accessToken, "SCANLOTE_INVENTARIO");
            const loteNome = activeBatch ? activeBatch.id : "LOTE-GERAL";
            const subfolder = await GoogleDriveService.findOrCreateFolder(accessToken, `LOTE_${loteNome}`, folder.id);

            const updatedMap = { ...drivePhotoMap };
            for (let i = 0; i < files.length; i++) {
              const photoId = data.photoIds[i];
              if (photoId && !updatedMap[photoId]) {
                const uploaded = await GoogleDriveService.uploadPhoto(
                  accessToken,
                  files[i],
                  `${photoId}.jpg`,
                  subfolder.id
                );
                if (uploaded.webViewLink) {
                  updatedMap[photoId] = uploaded.webViewLink;
                }
              }
            }
            handleUpdateDrivePhotoMap(updatedMap);

            // Atualiza URLs do Google Drive no servidor para associação posterior
            fetch("/api/photos/drive-urls", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ driveMap: updatedMap }),
            }).catch(console.warn);
          } catch (e) {
            console.warn("Erro ao enviar backup para Google Drive:", e);
          }
        })();
      }

      await fetchAllData(true);
    } catch (err) {
      setApiError(translateErrorMessage(err));
    }
  };

  // Upload via câmera (com espelhamento no Drive e gravação imediata na planilha)
  const handleSendCameraPhotos = async (photos: { name: string; data: string }[]) => {
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: operatorName,
          deviceId: operatorName,
          loteId: activeBatch?.id,
          spreadsheetId: selectedSpreadsheetId,
          base64Photos: photos,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro no envio" }));
        throw new Error(err.error || "Erro ao enviar fotografias da câmera");
      }

      const data = await res.json();

      if (accessToken && data.photoIds && data.photoIds.length > 0) {
        (async () => {
          try {
            const folder = await GoogleDriveService.findOrCreateFolder(accessToken, "SCANLOTE_INVENTARIO");
            const loteNome = activeBatch ? activeBatch.id : "LOTE-GERAL";
            const subfolder = await GoogleDriveService.findOrCreateFolder(accessToken, `LOTE_${loteNome}`, folder.id);

            const updatedMap = { ...drivePhotoMap };
            for (let i = 0; i < photos.length; i++) {
              const photoId = data.photoIds[i];
              if (photoId && !updatedMap[photoId]) {
                let cleanBase64 = photos[i].data;
                if (cleanBase64.includes(",")) {
                  cleanBase64 = cleanBase64.split(",")[1];
                }
                const byteCharacters = atob(cleanBase64);
                const byteNumbers = new Array(byteCharacters.length);
                for (let j = 0; j < byteCharacters.length; j++) {
                  byteNumbers[j] = byteCharacters.charCodeAt(j);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: "image/jpeg" });

                const uploaded = await GoogleDriveService.uploadPhoto(
                  accessToken,
                  blob,
                  `${photoId}.jpg`,
                  subfolder.id
                );
                if (uploaded.webViewLink) {
                  updatedMap[photoId] = uploaded.webViewLink;
                }
              }
            }
            handleUpdateDrivePhotoMap(updatedMap);

            // Atualiza URLs do Google Drive no servidor para associação posterior
            fetch("/api/photos/drive-urls", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ driveMap: updatedMap }),
            }).catch(console.warn);
          } catch (e) {
            console.warn("Erro ao enviar backup da câmera para o Drive:", e);
          }
        })();
      }

      await fetchAllData(true);
    } catch (err) {
      setApiError(translateErrorMessage(err));
    }
  };

  // Atualização manual da NFE (Coluna H)
  const handleUpdateNfe = async (productId: string, nfe: string) => {
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nfe }),
      });

      if (!res.ok) {
        throw new Error("Erro ao atualizar NFE");
      }

      const updated = await res.json();
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, nfe: updated.nfe } : p))
      );

      if (accessToken && selectedSpreadsheetId) {
        const prod = products.find((p) => p.id === productId);
        if (prod) {
          syncEngine.enqueueOutbox("PRODUCT", productId, "UPDATE", { ...prod, nfe });
          syncEngine.sync(products).catch(console.warn);
        }
      }
    } catch (err) {
      setApiError(translateErrorMessage(err));
    }
  };

  // Criação ou troca para lote/caixa
  const handleCreateBatch = async (caixa: number) => {
    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId: operatorName, deviceId: operatorName, caixa }),
      });

      if (!res.ok) {
        throw new Error("Erro ao selecionar ou criar caixa");
      }

      const newBatch = await res.json();
      setActiveBatch(newBatch);
      await fetchAllData(true);
    } catch (err) {
      setApiError(translateErrorMessage(err));
    }
  };

  // Alternar caixa diretamente pelo dropdown ou clique na tabela (MANDATO V4 - SEÇÃO 43)
  const handleSelectCaixa = async (caixa: number) => {
    await handleCreateBatch(caixa);
  };

  // Criação explícita de nova caixa sem alterar produtos das caixas anteriores (MANDATO V4 - SEÇÃO 43 & 44)
  const handleCreateNewCaixa = async () => {
    const existingNums = [
      ...resumos.map((r) => r.caixa),
      ...(products.map((p) => p.caixa).filter(Boolean)),
      activeBatch?.caixa || 1,
    ];
    const nextCaixa = Math.max(...existingNums.filter((n): n is number => typeof n === 'number'), 0) + 1;
    await handleCreateBatch(nextCaixa);
  };

  // Resolver foto ilegível via digitação/bipagem manual
  const handleResolveIllegiblePhoto = async (
    photoId: string,
    manualData: {
      modelo: string;
      serial?: string;
      imei?: string;
      ean?: string;
      qtde: number;
      caixa?: number;
      estadoFisico: EstadoFisico;
      descricaoAvaria?: string;
      categoria?: string;
    }
  ) => {
    try {
      const res = await fetch("/api/photos/illegible/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId, manualData }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao salvar produto manual");
      }

      await fetchAllData(true);
    } catch (err) {
      setApiError(translateErrorMessage(err));
    }
  };

  // Selecionar caixa através da leitura do QR Code
  const handleSelectCaixaFromQr = async (caixa: number) => {
    await handleCreateBatch(caixa);
    setIsQrModalOpen(false);
  };

  // Cadastrar novo operador
  const handleCreateOperator = async (_newId: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    try {
      const res = await fetch("/api/operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId: clean, name: clean }),
      });
      if (!res.ok) throw new Error("Erro ao criar operador");
      const created = await res.json();
      setDevices((prev) => [...prev, created]);
      handleSelectOperator(clean);
    } catch (err) {
      setApiError(translateErrorMessage(err));
    }
  };

  // Selecionar ou Criar Lote Direto
  const handleSelectLot = async (loteId: string) => {
    try {
      const clean = loteId.trim();
      if (!clean) return;
      localStorage.setItem("scanlote_selected_lote_id", clean);
      setActiveBatch((prev) => ({
        id: clean,
        caixa: prev?.caixa || 1,
        operatorId: operatorName,
        deviceId: operatorName,
        status: prev?.status || "ABERTO",
        createdAt: prev?.createdAt || new Date().toISOString(),
        totalPhotos: prev?.totalPhotos || 0,
        pendingPhotos: prev?.pendingPhotos || 0,
        processedPhotos: prev?.processedPhotos || 0,
        errorPhotos: prev?.errorPhotos || 0,
      }));

      await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId: operatorName, loteId: clean }),
      });
      await fetchAllData(true);
    } catch (err: any) {
      setApiError(translateErrorMessage(err));
    }
  };

  // Renomear Lote
  const handleRenameLot = async (oldId: string, newName: string) => {
    try {
      const clean = newName.trim();
      if (!clean) return;
      localStorage.setItem("scanlote_selected_lote_id", clean);
      const res = await fetch(`/api/lotes/${encodeURIComponent(oldId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: clean }),
      });
      if (!res.ok) throw new Error("Erro ao renomear lote");
      await fetchAllData(true);
    } catch (err: any) {
      setApiError(translateErrorMessage(err));
    }
  };

  // Associação manual de foto órfã
  const handleAssociateOrphan = async (photoId: string, productId: string) => {
    try {
      const res = await fetch("/api/photos/orphans/associate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId, productId }),
      });
      if (!res.ok) throw new Error("Erro ao vincular foto");
      await Promise.all([fetchOrphans(), fetchAllData(true)]);
    } catch (err) {
      setApiError(translateErrorMessage(err));
    }
  };

  // Limpeza segura de órfãos
  const handleSafeCleanOrphans = async (photoIds: string[]) => {
    try {
      const res = await fetch("/api/photos/orphans/clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds }),
      });
      if (!res.ok) throw new Error("Erro ao limpar fotos");
      await fetchOrphans();
    } catch (err) {
      setApiError(translateErrorMessage(err));
    }
  };

  // 1. MODO VERIFICANDO (Validando acesso real à planilha do Google Sheets)
  if (connectionStatus === "checking") {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center font-mono p-4">
        <div className="flex items-center space-x-3 mb-3">
          <span className="h-3.5 w-3.5 rounded-full bg-emerald-500 animate-ping"></span>
          <h1 className="text-xl font-bold tracking-wider">SCANLOTE AI</h1>
        </div>
        <p className="text-xs text-zinc-400 font-sans animate-pulse">
          Validando acesso real à planilha do Google Sheets...
        </p>
      </div>
    );
  }

  // 2. MODO DESCONECTADO (Interface Mínima, sem nenhum componente ou dado operacional)
  if (connectionStatus === "disconnected" || connectionStatus === "error") {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-mono text-xs overflow-x-hidden w-full">
        {/* Cabeçalho Limpo com Identidade SCANLOTE AI */}
        <header className="border-b border-zinc-800 bg-zinc-950 py-3 px-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 font-bold tracking-wider text-white">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-sm">SCANLOTE AI</span>
          </div>
        </header>

        {/* Card Central Limpo: Nenhuma planilha conectada */}
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="w-16 h-16 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center mx-auto text-emerald-400 shadow-inner">
              <FileSpreadsheet className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-base sm:text-lg font-bold text-white font-sans">
                Nenhuma planilha conectada.
              </h2>
              <p className="text-xs text-zinc-400 font-sans leading-relaxed">
                Conecte uma planilha do Google Sheets para iniciar o recebimento, conferência e inventário.
              </p>
            </div>

            {connectionError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 text-[11px] rounded font-sans text-left">
                <strong>Status de Acesso:</strong> {connectionError}
              </div>
            )}

            <div className="pt-2">
              <button
                onClick={() => setIsGoogleModalOpen(true)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-all cursor-pointer shadow-lg flex items-center justify-center space-x-2 text-xs uppercase tracking-wider"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>CONECTAR GOOGLE SHEETS</span>
              </button>
            </div>
          </div>
        </main>

        {/* Modal para Selecionar ou Criar Planilha no Google */}
        <GoogleDriveSheetsModal
          isOpen={isGoogleModalOpen}
          onClose={() => setIsGoogleModalOpen(false)}
          user={user}
          accessToken={accessToken}
          onSignIn={handleGoogleSignIn}
          onSignOut={handleGoogleSignOut}
          isSigningIn={isSigningIn}
          products={[]}
          activeBatch={null}
          selectedSpreadsheetId={selectedSpreadsheetId}
          onSelectSpreadsheet={handleSelectSpreadsheet}
          onDisconnectSpreadsheet={handleDisconnectSpreadsheet}
          autoSyncEnabled={false}
          onToggleAutoSync={() => {}}
          drivePhotoMap={drivePhotoMap}
          onUpdateDrivePhotoMap={handleUpdateDrivePhotoMap}
          authError={apiError}
          onClearAuthError={() => setApiError(null)}
        />
      </div>
    );
  }

  // 3. MODO CONECTADO (Somente exibido quando houver conexão real validada com a planilha)
  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans selection:bg-white selection:text-black overflow-x-hidden w-full max-w-full">
      {/* 1. Cabeçalho de Status, Operador e Seletor Direto de Caixa */}
      <HeaderStats
        stats={stats}
        activeBatch={activeBatch}
        deviceId={operatorName}
        operatorName={operatorName}
        recentOperators={recentOperators}
        onSelectOperator={handleSelectOperator}
        user={user}
        spreadsheetTitle={spreadsheetTitle}
        spreadsheetUrl={spreadsheetUrl}
        resumos={resumos}
        batches={batches}
        onSelectCaixa={handleSelectCaixa}
        onCreateNewCaixa={handleCreateNewCaixa}
        onSelectLot={handleSelectLot}
        onOpenNewBatch={() => setIsNewBatchOpen(true)}
        onOpenHistory={() => {
          fetchLogs();
          setIsHistoryOpen(true);
        }}
        onOpenOrphans={() => {
          fetchOrphans();
          setIsOrphansOpen(true);
        }}
        onOpenDeviceSelector={() => setIsDeviceSelectorOpen(true)}
        onOpenGoogleModal={() => setIsGoogleModalOpen(true)}
        onOpenManifestModal={() => setIsManifestModalOpen(true)}
        hasManifestos={manifestos.length > 0}
        onRefresh={() => fetchAllData(false)}
        isRefreshing={isRefreshing}
        onRenameLot={handleRenameLot}
        syncStatus={syncStatus}
        onTriggerSync={triggerSync}
      />

      {/* 2. Área Central de Trabalho */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-5 space-y-4">
        {/* Card de Erro Amigável Traduzido com 'Tentar Novamente' */}
        {apiError && (
          <ErrorAlert
            message={apiError}
            onRetry={triggerSync}
            onClose={() => setApiError(null)}
          />
        )}

        {/* Seção Dashboard / Caixas e Nota Fiscal */}
        {(resumos.length > 0 || products.length > 0 || manifestos.length > 0) && (
          <ResumoCaixasDashboard
            resumos={resumos}
            activeBatch={activeBatch}
            products={products}
            manifestos={manifestos}
            onOpenManifestModal={() => setIsManifestModalOpen(true)}
            onOpenDivergenciasModal={() => setIsDivergenciasModalOpen(true)}
            onOpenQrModal={(c, qr) => {
              setQrModalData({ caixa: c, qrCode: qr });
              setIsQrModalOpen(true);
            }}
            onOpenExceptionModal={() => setIsExceptionModalOpen(true)}
            onOpenReportModal={() => setIsReportModalOpen(true)}
            onSelectCaixa={handleSelectCaixa}
            onOpenNewBatch={() => setIsNewBatchOpen(true)}
          />
        )}



        {/* Notificação de Exceção se houver fotos ilegíveis pendentes */}
        {illegiblePhotos.length > 0 && (
          <div className="p-3 bg-amber-950/60 border border-amber-800 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center space-x-2 text-amber-300">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-ping"></span>
              <span>
                <strong>FLUXO DE EXCEÇÃO ATIVO:</strong> Há {illegiblePhotos.length} foto(s) ilegível(is) que requerem validação manual.
              </span>
            </div>
            <button
              onClick={() => setIsExceptionModalOpen(true)}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded transition-colors cursor-pointer"
            >
              Resolver Fotos Ilegíveis Agora
            </button>
          </div>
        )}

        {/* Zona de Captura e Envio de Fotos (Não-bloqueante) */}
        <UploadCaptureZone
          onUploadFiles={handleUploadFiles}
          onOpenCamera={() => setIsCameraOpen(true)}
          loteId={activeBatch?.id || stats?.loteAtual || "LOTE-001"}
          caixa={activeBatch?.caixa || stats?.caixaAtual || 1}
        />

        {/* Planilha Operacional de Produtos (Colunas A–I) */}
        <ProductTable
          products={products}
          onOpenPhotos={(p) => setSelectedProductForPhotos(p)}
          onUpdateNfe={handleUpdateNfe}
          isLoading={isLoadingProducts}
        />
      </main>

      {/* 3. Rodapé Minimalista Limpo */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-3 text-center text-xs font-mono text-zinc-500">
        ScanLote AI • Plataforma Industrial de Recebimento e Conferência • Operador Ativo: {operatorName}
      </footer>

      {/* Modais e Painéis Flutuantes */}
      <ManifestModal
        isOpen={isManifestModalOpen}
        onClose={() => setIsManifestModalOpen(false)}
        manifestos={manifestos}
        onUploadSuccess={() => fetchAllData(true)}
      />

      <ExceptionFlowModal
        isOpen={isExceptionModalOpen}
        onClose={() => setIsExceptionModalOpen(false)}
        illegiblePhotos={illegiblePhotos}
        onOpenCamera={() => setIsCameraOpen(true)}
        onResolvePhoto={handleResolveIllegiblePhoto}
      />

      <BoxQrCodeModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        caixa={qrModalData.caixa}
        qrCodeText={qrModalData.qrCode}
        loteId={activeBatch?.id || stats?.loteAtual || "LOTE-001"}
        deviceId={operatorName}
        onSelectCaixaFromQr={handleSelectCaixaFromQr}
      />

      <AlertsConfigModal
        isOpen={isAlertsModalOpen}
        onClose={() => setIsAlertsModalOpen(false)}
      />

      <AuditReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        resumos={resumos}
        products={products}
        manifestos={manifestos}
      />

      <GoogleDriveSheetsModal
        isOpen={isGoogleModalOpen}
        onClose={() => setIsGoogleModalOpen(false)}
        user={user}
        accessToken={accessToken}
        onSignIn={handleGoogleSignIn}
        onSignOut={handleGoogleSignOut}
        isSigningIn={isSigningIn}
        products={products}
        activeBatch={activeBatch}
        selectedSpreadsheetId={selectedSpreadsheetId}
        onSelectSpreadsheet={handleSelectSpreadsheet}
        onDisconnectSpreadsheet={handleDisconnectSpreadsheet}
        autoSyncEnabled={true}
        onToggleAutoSync={() => {}}
        drivePhotoMap={drivePhotoMap}
        onUpdateDrivePhotoMap={handleUpdateDrivePhotoMap}
        onTriggerSync={triggerSync}
        authError={apiError}
        onClearAuthError={() => setApiError(null)}
      />

      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onSendPhotos={handleSendCameraPhotos}
        loteId={activeBatch?.id || stats?.loteAtual || "LOTE-001"}
        caixa={activeBatch?.caixa || stats?.caixaAtual || 1}
      />

      <NewBatchModal
        isOpen={isNewBatchOpen}
        onClose={() => setIsNewBatchOpen(false)}
        deviceId={operatorName}
        suggestedCaixa={(activeBatch?.caixa || stats?.caixaAtual || 1) + 1}
        onCreateBatch={handleCreateBatch}
      />

      <PhotoGalleryModal
        product={selectedProductForPhotos}
        onClose={() => setSelectedProductForPhotos(null)}
      />

      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        logs={logs}
        isLoading={isLoadingLogs}
        onRefresh={fetchLogs}
      />

      <OrphansModal
        isOpen={isOrphansOpen}
        onClose={() => setIsOrphansOpen(false)}
        orphans={orphans}
        products={products}
        onAssociate={handleAssociateOrphan}
        onSafeClean={handleSafeCleanOrphans}
        isLoading={isLoadingOrphans}
        onRefresh={fetchOrphans}
      />

      <DeviceSelectorModal
        isOpen={isDeviceSelectorOpen}
        onClose={() => setIsDeviceSelectorOpen(false)}
        currentDeviceId={operatorName}
        devices={devices}
        onSelectDevice={handleSelectOperator}
        onCreateDevice={handleCreateOperator}
        user={user}
      />

      <DivergenciasModal
        isOpen={isDivergenciasModalOpen}
        onClose={() => setIsDivergenciasModalOpen(false)}
        products={products}
        manifestos={manifestos}
      />
    </div>
  );
}
