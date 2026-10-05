import React, { useRef, useState } from "react";
import { 
  Camera, 
  UploadCloud, 
  Check, 
  RotateCw, 
  Image as ImageIcon,
  Sparkles
} from "lucide-react";

interface UploadCaptureZoneProps {
  onUploadFiles: (files: File[]) => Promise<void>;
  onOpenCamera: () => void;
  loteId: string;
  caixa: number;
}

export const UploadCaptureZone: React.FC<UploadCaptureZoneProps> = ({
  onUploadFiles,
  onOpenCamera,
  loteId,
  caixa,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    "IDLE" | "UPLOADING" | "SUCCESS" | "ERROR"
  >("IDLE");
  const [statusMessage, setStatusMessage] = useState("");

  const handleFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith("image/")) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) return;

    try {
      setUploadStatus("UPLOADING");
      setStatusMessage(`Enviando ${validFiles.length} foto(s)...`);

      await onUploadFiles(validFiles);

      setUploadStatus("SUCCESS");
      setStatusMessage(`✓ ${validFiles.length} foto(s) recebida(s) no Lote ${loteId}!`);
      setTimeout(() => {
        setUploadStatus("IDLE");
        setStatusMessage("");
      }, 4000);
    } catch (err: any) {
      setUploadStatus("ERROR");
      setStatusMessage(err.message || "Falha ao enviar fotos");
      setTimeout(() => {
        setUploadStatus("IDLE");
        setStatusMessage("");
      }, 5000);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6">
      {/* Indicador de feedback rápido */}
      {statusMessage && (
        <div
          className={`mb-3 px-3 py-2 rounded text-xs font-mono flex items-center justify-between transition-all ${
            uploadStatus === "SUCCESS"
              ? "bg-emerald-950/80 border border-emerald-800 text-emerald-300"
              : uploadStatus === "UPLOADING"
              ? "bg-zinc-800 border border-zinc-700 text-zinc-200"
              : "bg-rose-950/80 border border-rose-800 text-rose-300"
          }`}
        >
          <div className="flex items-center space-x-2">
            {uploadStatus === "SUCCESS" && <Check className="w-4 h-4 text-emerald-400" />}
            {uploadStatus === "UPLOADING" && <RotateCw className="w-4 h-4 animate-spin text-zinc-300" />}
            <span>{statusMessage}</span>
          </div>
          <span className="text-[10px] opacity-75">
            Processamento em background ativado
          </span>
        </div>
      )}

      {/* Input de Arquivos com suporte nativo a seleção de fotos e galeria */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
        multiple
        accept="image/*"
        className="hidden"
      />

      <div className="flex flex-col md:flex-row gap-3 items-stretch">
        {/* Botão de Captura via Câmera do Dispositivo */}
        <button
          onClick={onOpenCamera}
          className="flex-1 flex items-center justify-center space-x-3 bg-zinc-950 hover:bg-zinc-800/80 text-white border border-zinc-700 p-4 rounded-lg transition-all group active:scale-[0.99] cursor-pointer"
        >
          <div className="p-2.5 rounded-full bg-zinc-800 group-hover:bg-white group-hover:text-black transition-colors">
            <Camera className="w-5 h-5" />
          </div>
          <div className="text-left font-mono">
            <div className="text-xs font-bold uppercase tracking-wider text-white">
              Fotografar com a Câmera
            </div>
            <div className="text-[11px] text-zinc-400">
              Modo contínuo: frente, serial, etiqueta e caixa
            </div>
          </div>
        </button>

        {/* Zona de Drop & Seleção de Múltiplos Arquivos */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex-[2] border-2 border-dashed rounded-lg p-4 flex items-center justify-center space-x-4 cursor-pointer transition-all ${
            isDragging
              ? "border-white bg-zinc-800/90 text-white"
              : "border-zinc-700 hover:border-zinc-500 bg-zinc-950/60 text-zinc-300"
          }`}
        >
          <div className="p-2.5 rounded-full bg-zinc-900 border border-zinc-800">
            <UploadCloud className="w-5 h-5 text-zinc-300" />
          </div>

          <div className="text-left font-mono">
            <div className="text-xs font-bold text-white uppercase tracking-wider">
              Arraste ou Selecione Fotografias Livres
            </div>
            <div className="text-[11px] text-zinc-400">
              Envie fotos de produtos e etiquetas de uma vez. Destino:{" "}
              <strong className="text-zinc-200">{loteId}</strong> (Caixa {caixa})
            </div>
          </div>

          <div className="hidden lg:flex items-center text-[10px] text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded">
            <Sparkles className="w-3 h-3 text-amber-400 mr-1" />
            Cruzamento Automático
          </div>
        </div>
      </div>
    </div>
  );
};
