import React, { useRef, useState, useEffect } from "react";
import { 
  X, 
  Camera, 
  Send, 
  Trash2, 
  RotateCcw, 
  SwitchCamera, 
  Check, 
  Layers 
} from "lucide-react";

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendPhotos: (photos: { name: string; data: string }[]) => Promise<void>;
  loteId: string;
  caixa: number;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onSendPhotos,
  loteId,
  caixa,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [snappedPhotos, setSnappedPhotos] = useState<
    { id: string; data: string; timestamp: string }[]
  >([]);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [isSending, setIsSending] = useState(false);
  const [hasPermissionError, setHasPermissionError] = useState(false);
  const [flashEffect, setFlashEffect] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setSnappedPhotos([]);
      return;
    }
    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async () => {
    try {
      setHasPermissionError(false);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Erro ao acessar câmera:", err);
      setHasPermissionError(true);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  };

  const handleSnap = () => {
    if (!videoRef.current || !canvasRef.current) return;

    // Flash visual feedback
    setFlashEffect(true);
    setTimeout(() => setFlashEffect(false), 150);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);

    const newPhoto = {
      id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      data: dataUrl,
      timestamp: new Date().toLocaleTimeString(),
    };

    setSnappedPhotos((prev) => [...prev, newPhoto]);
  };

  const handleDeleteSnap = (id: string) => {
    setSnappedPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSendAll = async () => {
    if (snappedPhotos.length === 0) return;

    try {
      setIsSending(true);
      const payload = snappedPhotos.map((p, idx) => ({
        name: `camera_lote_${loteId}_${idx + 1}.jpg`,
        data: p.data,
      }));

      await onSendPhotos(payload);
      setSnappedPhotos([]);
      onClose();
    } catch (err) {
      console.error("Erro ao enviar fotos da câmera:", err);
    } finally {
      setIsSending(false);
    }
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl text-zinc-100">
        {/* Cabeçalho */}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center space-x-2">
            <Camera className="w-4 h-4 text-zinc-300" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-white">
              Câmera Operacional — Modo Contínuo
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              LOTE: {loteId} (Caixa {caixa})
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleFacingMode}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title="Trocar Câmera"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Viewport da Câmera */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[360px] max-h-[500px]">
          {hasPermissionError ? (
            <div className="text-center p-6 font-mono text-zinc-400">
              <Camera className="w-10 h-10 mx-auto text-zinc-600 mb-2" />
              <div className="text-sm font-bold text-white mb-1">
                Não foi possível acessar a câmera
              </div>
              <div className="text-xs text-zinc-500 mb-4 max-w-xs mx-auto">
                Verifique se o navegador possui permissão de acesso à câmera ou utilize o upload de arquivos na tela principal.
              </div>
              <button
                onClick={startCamera}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs text-white rounded transition-colors"
              >
                Tentar Novamente
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Efeito de Flash na captura */}
              {flashEffect && (
                <div className="absolute inset-0 bg-white opacity-60 pointer-events-none transition-opacity duration-150" />
              )}

              {/* Mira visual para facilitar enquadramento de etiquetas/código de barras */}
              <div className="absolute inset-x-8 inset-y-12 border border-white/20 rounded-lg pointer-events-none flex flex-col justify-between p-2">
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-t-2 border-l-2 border-white/70" />
                  <div className="w-4 h-4 border-t-2 border-r-2 border-white/70" />
                </div>
                <div className="text-center">
                  <span className="text-[10px] font-mono text-white/50 bg-black/40 px-2 py-0.5 rounded">
                    Enquadre Aparelho, Etiqueta Serial ou Caixa
                  </span>
                </div>
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-b-2 border-l-2 border-white/70" />
                  <div className="w-4 h-4 border-b-2 border-r-2 border-white/70" />
                </div>
              </div>

              {/* Botão de Disparo Rápido */}
              <div className="absolute bottom-4 inset-x-0 flex items-center justify-center">
                <button
                  onClick={handleSnap}
                  className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer border-4 border-zinc-900"
                  title="Capturar Foto (Pressione repetidamente para vários ângulos)"
                >
                  <Camera className="w-6 h-6" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Fita de Fotos Capturadas (Reel) */}
        <div className="border-t border-zinc-800 bg-zinc-900/80 p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2 overflow-x-auto max-w-full py-1">
            <span className="text-xs font-mono text-zinc-400 whitespace-nowrap">
              Fotos Capturadas ({snappedPhotos.length}):
            </span>

            {snappedPhotos.length === 0 ? (
              <span className="text-[11px] font-mono text-zinc-500 italic">
                Nenhuma foto tirada ainda. Clique no botão de disparo acima.
              </span>
            ) : (
              <div className="flex items-center space-x-2">
                {snappedPhotos.map((p, idx) => (
                  <div
                    key={p.id}
                    className="relative group w-14 h-14 rounded border border-zinc-700 overflow-hidden bg-zinc-950 flex-shrink-0"
                  >
                    <img
                      src={p.data}
                      alt={`Snap ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] font-mono text-center text-zinc-300">
                      #{idx + 1}
                    </div>
                    <button
                      onClick={() => handleDeleteSnap(p.id)}
                      className="absolute top-0 right-0 p-0.5 bg-rose-600/90 hover:bg-rose-600 text-white rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0 w-full sm:w-auto justify-end">
            {snappedPhotos.length > 0 && (
              <button
                onClick={() => setSnappedPhotos([])}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded font-mono transition-colors"
              >
                Limpar
              </button>
            )}

            <button
              onClick={handleSendAll}
              disabled={snappedPhotos.length === 0 || isSending}
              className={`px-4 py-2 rounded text-xs font-mono font-bold flex items-center space-x-1.5 transition-all ${
                snappedPhotos.length > 0 && !isSending
                  ? "bg-white hover:bg-zinc-200 text-black cursor-pointer shadow active:scale-95"
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              }`}
            >
              {isSending ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>ENVIAR LOTE ({snappedPhotos.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
