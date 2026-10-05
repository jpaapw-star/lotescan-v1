import React, { useState } from "react";
import {
  X,
  AlertTriangle,
  Camera,
  Keyboard,
  CheckCircle2,
  Image as ImageIcon,
  Save,
  RotateCw,
  Barcode,
  Package,
} from "lucide-react";
import { StoredPhoto, EstadoFisico } from "../types";

interface ExceptionFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  illegiblePhotos: StoredPhoto[];
  onOpenCamera: () => void;
  onResolvePhoto: (
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
  ) => Promise<void>;
}

export const ExceptionFlowModal: React.FC<ExceptionFlowModalProps> = ({
  isOpen,
  onClose,
  illegiblePhotos,
  onOpenCamera,
  onResolvePhoto,
}) => {
  const [selectedPhoto, setSelectedPhoto] = useState<StoredPhoto | null>(
    illegiblePhotos[0] || null
  );

  // Formulário de digitação / bipagem manual
  const [modelo, setModelo] = useState("");
  const [serial, setSerial] = useState("");
  const [imei, setImei] = useState("");
  const [ean, setEan] = useState("");
  const [qtde, setQtde] = useState<number>(1);
  const [caixa, setCaixa] = useState<number>(1);
  const [categoria, setCategoria] = useState("celular");
  const [estadoFisico, setEstadoFisico] = useState<EstadoFisico>("NOVO_LACRADO");
  const [descricaoAvaria, setDescricaoAvaria] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectPhoto = (photo: StoredPhoto) => {
    setSelectedPhoto(photo);
    if (photo.caixa) setCaixa(photo.caixa);
    setFeedbackMsg(null);
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPhoto) return;
    if (!modelo.trim()) {
      alert("Por favor, digite o modelo do produto.");
      return;
    }

    try {
      setIsSubmitting(true);
      await onResolvePhoto(selectedPhoto.id, {
        modelo: modelo.trim(),
        serial: serial.trim() || undefined,
        imei: imei.trim() || undefined,
        ean: ean.trim() || undefined,
        qtde: Number(qtde) || 1,
        caixa: Number(caixa) || selectedPhoto.caixa || 1,
        estadoFisico,
        descricaoAvaria: descricaoAvaria.trim() || undefined,
        categoria,
      });

      setFeedbackMsg("✅ Produto registrado com sucesso via Digitação Manual!");
      // Limpar formulário
      setModelo("");
      setSerial("");
      setImei("");
      setEan("");
      setQtde(1);
      setDescricaoAvaria("");
    } catch (err: any) {
      console.error("Erro ao salvar produto manual:", err);
      alert(err.message || "Erro ao salvar produto");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl text-zinc-100 font-mono text-xs">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-amber-950/40">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded bg-amber-900 border border-amber-700 text-amber-300">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold uppercase tracking-wider text-amber-300 text-xs">
                Fluxo de Exceção: Fotos Ilegíveis & Bipagem Manual
              </div>
              <div className="text-[11px] text-zinc-300 font-sans">
                Contingência para imagens desfocadas ou de baixa confiança visual da IA
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mensagem de Feedback */}
        {feedbackMsg && (
          <div className="px-4 py-2 bg-emerald-950/80 border-b border-emerald-800 text-emerald-300 text-xs flex items-center justify-between">
            <span>{feedbackMsg}</span>
            <button onClick={() => setFeedbackMsg(null)} className="text-zinc-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto flex flex-col md:flex-row">
          {/* Coluna Esquerda: Lista de Fotos Ilegíveis */}
          <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-zinc-800 p-3 space-y-2 bg-zinc-900/30">
            <div className="font-bold text-zinc-300 uppercase text-[11px] flex items-center justify-between">
              <span>Fotos Ilegíveis ({illegiblePhotos.length})</span>
            </div>

            {illegiblePhotos.length === 0 ? (
              <div className="p-6 text-center text-zinc-500">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-50" />
                <span>Nenhuma foto ilegível pendente no momento! Todas as fotos foram associadas.</span>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                {illegiblePhotos.map((photo) => {
                  const isSelected = selectedPhoto?.id === photo.id;
                  return (
                    <div
                      key={photo.id}
                      onClick={() => handleSelectPhoto(photo)}
                      className={`p-2 rounded border cursor-pointer transition-colors flex items-center space-x-2 ${
                        isSelected
                          ? "bg-amber-950/60 border-amber-600 text-white"
                          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                      }`}
                    >
                      <ImageIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-zinc-200 text-[11px] font-medium font-sans">
                          {photo.originalName}
                        </div>
                        <div className="text-[10px] text-zinc-500 flex items-center space-x-1">
                          <span>Caixa {photo.caixa || "?"}</span>
                          <span>•</span>
                          <span>{photo.loteId}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Ação 1: Tirar Nova Foto */}
            <div className="pt-2 border-t border-zinc-800">
              <button
                onClick={() => {
                  onClose();
                  onOpenCamera();
                }}
                className="w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded font-bold transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-emerald-400" />
                <span>OPÇÃO 1: TIRAR NOVA FOTO</span>
              </button>
            </div>
          </div>

          {/* Coluna Direita: Opção 2 - Digitar / Bipar Manualmente */}
          <div className="w-full md:w-2/3 p-4 bg-zinc-950 space-y-4">
            <div className="flex items-center space-x-2 text-white font-bold text-xs border-b border-zinc-800 pb-2">
              <Keyboard className="w-4 h-4 text-amber-400" />
              <span>OPÇÃO 2: DIGITAR / BIPAR MANUALMENTE</span>
            </div>

            {selectedPhoto ? (
              <form onSubmit={handleSaveManual} className="space-y-3 font-sans text-xs">
                {/* Visualização da Foto Ilegível */}
                <div className="p-2.5 bg-zinc-900/60 border border-zinc-800 rounded flex items-center space-x-3">
                  <img
                    src={selectedPhoto.url}
                    alt="Evidência"
                    className="w-16 h-16 object-cover rounded border border-zinc-700 bg-black flex-shrink-0"
                  />
                  <div>
                    <div className="font-bold text-white text-xs font-mono">
                      {selectedPhoto.originalName}
                    </div>
                    <div className="text-[11px] text-amber-300 font-mono">
                      Motivo: Foto ilegível, baixa nitidez ou código não legível
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      Ao salvar, o produto será registrado com status <strong>DIGITADO_MANUALMENTE</strong>.
                    </div>
                  </div>
                </div>

                {/* Campos do Produto */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-300 font-bold block">
                    Modelo Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={modelo}
                    onChange={(e) => setModelo(e.target.value)}
                    placeholder="Ex: Fone Bluetooth JBL Tune 510BT Preto"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 font-mono"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-300 font-bold block">
                      Serial / Nº Série
                    </label>
                    <input
                      type="text"
                      value={serial}
                      onChange={(e) => setSerial(e.target.value)}
                      placeholder="Bipe ou digite o serial..."
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-300 font-bold block">
                      IMEI (se celular/tablet)
                    </label>
                    <input
                      type="text"
                      value={imei}
                      onChange={(e) => setImei(e.target.value)}
                      placeholder="15 dígitos..."
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-300 font-bold block">
                      EAN-13 (Código de Barras)
                    </label>
                    <div className="relative">
                      <Barcode className="w-3.5 h-3.5 absolute left-2 top-2 text-zinc-400" />
                      <input
                        type="text"
                        value={ean}
                        onChange={(e) => setEan(e.target.value)}
                        placeholder="789... ou 692..."
                        className="w-full bg-zinc-900 border border-zinc-700 rounded pl-7 pr-2 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-300 font-bold block">
                      Quantidade
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={qtde}
                      onChange={(e) => setQtde(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-300 font-bold block">
                      Caixa
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={caixa}
                      onChange={(e) => setCaixa(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                {/* Avaliação de Avaria / Estado Físico */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-300 font-bold block">
                      Estado da Embalagem / Produto
                    </label>
                    <select
                      value={estadoFisico}
                      onChange={(e) => setEstadoFisico(e.target.value as EstadoFisico)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                    >
                      <option value="NOVO_LACRADO">NOVO / LACRADO</option>
                      <option value="CAIXA_AMASSADA">CAIXA AMASSADA</option>
                      <option value="AVARIADO">AVARIADO / DANIFICADO</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-zinc-300 font-bold block">
                      Categoria
                    </label>
                    <select
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                    >
                      <option value="celular">Celular / Smartphone</option>
                      <option value="fone">Fone de Ouvido</option>
                      <option value="tablet">Tablet</option>
                      <option value="livro">Livro</option>
                      <option value="eletronico">Outro Eletrônico</option>
                      <option value="outro">Diversos</option>
                    </select>
                  </div>
                </div>

                {estadoFisico !== "NOVO_LACRADO" && (
                  <div className="space-y-1">
                    <label className="text-[11px] text-rose-300 font-bold block">
                      Detalhes da Avaria Detectada
                    </label>
                    <input
                      type="text"
                      value={descricaoAvaria}
                      onChange={(e) => setDescricaoAvaria(e.target.value)}
                      placeholder="Ex: Canto superior amassado, lacre violado..."
                      className="w-full bg-zinc-900 border border-rose-800 rounded px-2.5 py-1.5 text-xs text-rose-200 placeholder-zinc-500 focus:outline-none focus:border-rose-400 font-mono"
                    />
                  </div>
                )}

                <div className="pt-2 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-mono text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold font-mono text-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>SALVAR E ASSOCIAR À CAIXA {caixa}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-12 text-center text-zinc-500 font-mono text-xs">
                Selecione uma foto ilegível ao lado para preencher manualmente.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
