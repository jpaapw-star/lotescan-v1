import React, { useState } from "react";
import { ProductItem } from "../types";
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Layers, 
  Package, 
  CheckCircle, 
  ExternalLink,
  ShieldCheck
} from "lucide-react";

interface PhotoGalleryModalProps {
  product: ProductItem | null;
  onClose: () => void;
}

export const PhotoGalleryModal: React.FC<PhotoGalleryModalProps> = ({
  product,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!product) return null;

  const photoIds = product.photoIds || [];
  const currentPhotoId = photoIds[currentIndex];
  const photoUrl = currentPhotoId ? `/api/photos/${currentPhotoId}` : "";

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photoIds.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < photoIds.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl text-zinc-100">
        {/* Cabeçalho */}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-white">
              Evidências Fotográficas do Produto
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              {currentIndex + 1} de {photoIds.length} foto(s)
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {photoUrl && (
              <a
                href={photoUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                title="Abrir imagem em tamanho real"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Corpo Principal: Visualizador + Painel de Metadados */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[420px]">
          {/* Visualizador de Imagem */}
          <div className="relative flex-[2] bg-black flex items-center justify-center p-2 overflow-hidden select-none">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={`Evidência ${currentIndex + 1}`}
                className="max-h-[65vh] w-auto max-w-full object-contain rounded"
              />
            ) : (
              <div className="text-zinc-600 font-mono text-xs">
                Nenhuma fotografia disponível para este produto.
              </div>
            )}

            {/* Controles de Navegação */}
            {photoIds.length > 1 && (
              <>
                <button
                  onClick={handlePrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-white border border-zinc-700/80 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <button
                  onClick={handleNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-white border border-zinc-700/80 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>

          {/* Painel Lateral de Informações Extraídas e Cruzamento */}
          <div className="flex-1 border-t md:border-t-0 md:border-l border-zinc-800 bg-zinc-950 p-4 overflow-y-auto font-mono text-xs space-y-4">
            <div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">
                Modelo Identificado (Coluna A)
              </div>
              <div className="text-sm font-bold text-white font-sans">
                {product.modelo}
              </div>
            </div>

            {/* Hierarquia de Identidade (Seção 2 & 12) */}
            <div className="bg-zinc-900/90 p-3 rounded-lg border border-zinc-800 space-y-2">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold text-zinc-300">
                Hierarquia de Identidade Física
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">PRODUTO / SKU:</span>
                  <span className="text-zinc-300 font-bold">{product.skuId || "SKU-PADRÃO"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">UNIDADE FÍSICA:</span>
                  <span className="text-emerald-400 font-bold">{product.unitId || `UNIT-${product.id}`}</span>
                </div>
                {product.serviceTag && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">SERVICE TAG (DELL):</span>
                    <span className="text-white font-bold tracking-wider px-1.5 py-0.2 rounded bg-zinc-800">{product.serviceTag}</span>
                  </div>
                )}
                {product.hasPhysicalIdentifier === false && (
                  <div className="text-[10px] text-amber-400 bg-amber-950/40 border border-amber-800/60 p-1.5 rounded mt-1">
                    ⚠️ IDENTIDADE SEM IDENTIFICADOR FÍSICO (Baseado em EAN/Contexto)
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-zinc-900/80 p-2.5 rounded border border-zinc-800">
                <div className="text-[10px] text-zinc-400 uppercase mb-0.5">
                  Serial / IMEI (B)
                </div>
                <div className="font-bold text-white tracking-wide">
                  {product.serialImei || "-"}
                </div>
              </div>

              <div className="bg-zinc-900/80 p-2.5 rounded border border-zinc-800">
                <div className="text-[10px] text-zinc-400 uppercase mb-0.5">
                  EAN (C)
                </div>
                <div className="font-bold text-white tracking-wide">
                  {product.ean || "-"}
                </div>
              </div>

              <div className="bg-zinc-900/80 p-2.5 rounded border border-zinc-800">
                <div className="text-[10px] text-zinc-400 uppercase mb-0.5">
                  Caixa Congelada (G)
                </div>
                <div className="font-bold text-white">
                  Caixa {product.caixa}
                </div>
              </div>

              <div className="bg-zinc-900/80 p-2.5 rounded border border-zinc-800">
                <div className="text-[10px] text-zinc-400 uppercase mb-0.5">
                  Lote / Data (E)
                </div>
                <div className="font-bold text-white text-[11px]">
                  {product.data}
                </div>
              </div>
            </div>

            {/* Confiança dos Identificadores Extraídos */}
            <div className="bg-zinc-900/50 p-3 rounded border border-zinc-800 space-y-2">
              <div className="flex items-center space-x-1.5 text-zinc-300 font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Índice de Confiança OCR & Resolução:</span>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Modelo OCR:</span>
                  <span className="text-zinc-200">
                    {Math.round((product.confidence?.modelo ?? 0.8) * 100)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Serial OCR:</span>
                  <span className="text-zinc-200">
                    {product.serial ? `${Math.round((product.confidence?.serial ?? 0.8) * 100)}%` : "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">IMEI OCR:</span>
                  <span className="text-zinc-200">
                    {product.imei ? `${Math.round((product.confidence?.imei ?? 0.8) * 100)}%` : "-"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">EAN OCR:</span>
                  <span className="text-zinc-200">
                    {product.ean ? `${Math.round((product.confidence?.ean ?? 0.8) * 100)}%` : "-"}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-zinc-800">
                  <span className="text-emerald-400 font-bold">Associação de Identidade:</span>
                  <span className="text-emerald-300 font-bold">
                    {Math.round((product.confidence?.identityMatch ?? 1.0) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Auditoria Técnica de Associação (Seção 11) */}
            {product.associationAudit && (
              <div className="bg-zinc-900/70 p-3 rounded border border-zinc-800 space-y-2">
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">
                  Auditoria Técnica da Resolução
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">
                  Critério: {product.associationAudit.criteria}
                </div>
                <div className="space-y-1 mt-1 text-[11px] text-zinc-300">
                  {product.associationAudit.reasons.map((r, i) => (
                    <div key={i} className="flex items-start space-x-1.5">
                      <span className="text-emerald-400">✓</span>
                      <span>{r.replace(/^✓\s*/, "")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Miniaturas de todas as fotos cruzadas */}
            <div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">
                Fotos Cruzadas para este Registro ({photoIds.length}):
              </div>
              <div className="grid grid-cols-4 gap-2">
                {photoIds.map((pid, idx) => (
                  <button
                    key={pid}
                    onClick={() => setCurrentIndex(idx)}
                    className={`relative rounded overflow-hidden aspect-square border transition-all ${
                      idx === currentIndex
                        ? "border-white ring-1 ring-white"
                        : "border-zinc-800 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={`/api/photos/${pid}`}
                      alt={`Thumb ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-center font-mono">
                      #{idx + 1}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé com botão de fechar */}
        <div className="px-4 py-2.5 border-t border-zinc-800 bg-zinc-900/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono font-bold text-white rounded transition-colors"
          >
            Fechar Visualizador
          </button>
        </div>
      </div>
    </div>
  );
};
