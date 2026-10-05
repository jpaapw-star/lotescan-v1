import React, { useState } from "react";
import { X, QrCode, Printer, Camera, Check, ArrowRight, Download } from "lucide-react";

interface BoxQrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  caixa: number;
  qrCodeText: string;
  loteId: string;
  deviceId: string;
  onSelectCaixaFromQr: (caixa: number) => void;
}

export const BoxQrCodeModal: React.FC<BoxQrCodeModalProps> = ({
  isOpen,
  onClose,
  caixa,
  qrCodeText,
  loteId,
  deviceId,
  onSelectCaixaFromQr,
}) => {
  const [activeTab, setActiveTab] = useState<"etiqueta" | "escanear">("etiqueta");
  const [scanInput, setScanInput] = useState("");
  const [scannedFeedback, setScannedFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleSimulateScan = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = scanInput.trim();
    if (!raw) return;

    // Extrair número da caixa (ex: CX-002-LOTE... ou número direto)
    let detectedCaixa = 1;
    const match = raw.match(/CX-(\d+)/i) || raw.match(/CAIXA-(\d+)/i) || raw.match(/^(\d+)$/);
    if (match) {
      detectedCaixa = parseInt(match[1], 10);
    }

    onSelectCaixaFromQr(detectedCaixa);
    setScannedFeedback(`✅ QR Code reconhecido com sucesso! Caixa ativa alterada para CAIXA ${detectedCaixa}.`);
    setScanInput("");
  };

  // Gerador de SVG de QR Code simples e nítido apontando para a exportação/leitura da caixa
  const boxExportUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/export/caixa/${caixa}?loteId=${encodeURIComponent(loteId)}`
    : `CX-${caixa}-${loteId}`;

  const qrSvgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    boxExportUrl
  )}&margin=10`;

  const handleDownloadExcel = () => {
    window.open(`/api/export/caixa/${caixa}?loteId=${encodeURIComponent(loteId)}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl text-zinc-100 font-mono text-xs print:border-none print:shadow-none print:bg-white print:text-black">
        {/* Cabeçalho (Oculto na impressão) */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60 print:hidden">
          <div className="flex items-center space-x-2">
            <QrCode className="w-5 h-5 text-sky-400" />
            <span className="font-bold text-white uppercase tracking-wider text-xs">
              Etiqueta de Caixa & Exportação QR Code
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas: Etiqueta Imprimível vs Escanear QR Code */}
        <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/30 flex items-center space-x-2 print:hidden">
          <button
            onClick={() => setActiveTab("etiqueta")}
            className={`px-3 py-1 rounded transition-colors cursor-pointer ${
              activeTab === "etiqueta"
                ? "bg-white text-black font-bold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Ver & Imprimir Etiqueta
          </button>

          <button
            onClick={() => setActiveTab("escanear")}
            className={`px-3 py-1 rounded transition-colors cursor-pointer ${
              activeTab === "escanear"
                ? "bg-white text-black font-bold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Escanear / Bipar QR Code da Caixa
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6">
          {activeTab === "etiqueta" ? (
            <div className="flex flex-col items-center justify-center space-y-4">
              {/* Cartão de Etiqueta Física */}
              <div className="p-6 bg-white text-black rounded-xl border-2 border-dashed border-zinc-300 shadow-md w-full max-w-sm flex flex-col items-center text-center space-y-3 print:border-black print:shadow-none">
                <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">
                  SCANLOTE AI • ETIQUETA DA CAIXA
                </div>

                <div className="text-3xl font-extrabold tracking-tight">
                  CAIXA {caixa}
                </div>

                <div className="p-2 bg-white rounded border border-zinc-200">
                  <img
                    src={qrSvgUrl}
                    alt={`QR Code Caixa ${caixa}`}
                    className="w-44 h-44 object-contain"
                  />
                </div>

                <div className="space-y-0.5 text-[11px] font-mono text-zinc-700">
                  <div><strong>Lote:</strong> {loteId}</div>
                  <div><strong>Operador:</strong> {deviceId}</div>
                  <div><strong>Data:</strong> {new Date().toLocaleDateString("pt-BR")}</div>
                </div>

                <div className="text-[10px] text-zinc-500 pt-1 font-sans">
                  Aponte a câmera para exportar e baixar a planilha em Excel exclusivamente desta caixa.
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2 print:hidden">
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-black rounded font-bold transition-colors flex items-center space-x-1.5 cursor-pointer shadow"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Etiqueta</span>
                </button>

                <button
                  onClick={handleDownloadExcel}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold transition-colors flex items-center space-x-1.5 cursor-pointer shadow"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Excel da Caixa</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-zinc-900 rounded border border-zinc-800 text-zinc-300 font-sans leading-relaxed">
                Bipe o QR Code impresso colado na caixa usando seu leitor de código de barras ou digite o identificador abaixo para vincular instantaneamente todas as próximas fotos a essa caixa.
              </div>

              {scannedFeedback && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded text-emerald-300 text-xs">
                  {scannedFeedback}
                </div>
              )}

              <form onSubmit={handleSimulateScan} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-300 font-bold block">
                    Código Lido pelo Leitor / Scanner:
                  </label>
                  <input
                    type="text"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder="Ex: CX-002-LOTE-2026-10-03-001 ou número da caixa..."
                    autoFocus
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-400 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>Vincular Caixa Ativa</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
