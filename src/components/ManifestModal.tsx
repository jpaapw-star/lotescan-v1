import React, { useState, useRef } from "react";
import {
  X,
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Calendar,
  Building,
  DollarSign,
  Package,
  Layers,
  ChevronDown,
  ChevronUp,
  Trash2,
  FileSpreadsheet,
  FileCode,
  Plus,
} from "lucide-react";
import { ManifestoDoc } from "../types";

interface ManifestModalProps {
  isOpen: boolean;
  onClose: () => void;
  manifestos: ManifestoDoc[];
  onUploadSuccess: () => Promise<void>;
  onSyncSheets?: () => Promise<void>;
}

export const ManifestModal: React.FC<ManifestModalProps> = ({
  isOpen,
  onClose,
  manifestos,
  onUploadSuccess,
  onSyncSheets,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(
    manifestos[0]?.id || null
  );
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("manifestos", files[i]);
      }

      const res = await fetch("/api/manifestos/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Falha ao processar arquivo(s) de Manifesto/Nota Fiscal");
      }

      const data = await res.json();
      setSuccessMsg(data.message || `${files.length} arquivo(s) importado(s) com sucesso!`);
      await onUploadSuccess();
      if (onSyncSheets) {
        onSyncSheets().catch(console.warn);
      }
      if (data.manifesto?.id) {
        setExpandedDocId(data.manifesto.id);
      }
    } catch (err: any) {
      console.error("Erro no upload do manifesto:", err);
      setErrorMsg(err.message || "Erro ao processar arquivo com Gemini AI");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleDeleteManifesto = async (id: string, nfe: string) => {
    try {
      setIsDeletingId(id);
      setErrorMsg(null);
      const res = await fetch(`/api/manifestos/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Erro ao excluir arquivo de manifesto");
      }
      setSuccessMsg(`Manifesto/NF ${nfe} removido com sucesso.`);
      await onUploadSuccess();
      if (onSyncSheets) {
        onSyncSheets().catch(console.warn);
      }
      if (expandedDocId === id) {
        setExpandedDocId(null);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao excluir manifesto");
    } finally {
      setIsDeletingId(null);
    }
  };

  const totalGeralUnidades = manifestos.reduce((acc, m) => acc + m.totalUnidades, 0);
  const totalGeralValor = manifestos.reduce((acc, m) => acc + (m.valorTotal || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl text-zinc-100 font-mono text-xs">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded bg-sky-950 border border-sky-700">
              <FileText className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <div className="font-bold uppercase tracking-wider text-white text-xs flex items-center space-x-2">
                <span>Central de Manifestos & Notas Fiscais</span>
                <span className="text-[10px] bg-sky-950 border border-sky-600 text-sky-200 px-2 py-0.5 rounded font-normal">
                  PDF / PLANILHAS / XML
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 font-sans">
                Gerencie todos os arquivos de compra anexados para conferência cega e batimento de estoque
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

        {/* Mensagens de Feedback */}
        {successMsg && (
          <div className="px-4 py-2 bg-emerald-950/80 border-b border-emerald-800 text-emerald-300 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-zinc-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="px-4 py-2 bg-rose-950/80 border-b border-rose-800 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-zinc-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Resumo Consolidado de Documentos */}
        <div className="grid grid-cols-2 gap-3 p-3.5 bg-zinc-900/40 border-b border-zinc-800/80 text-xs">
          <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded">
            <div className="text-[10px] text-zinc-400 uppercase">Arquivos Anexados</div>
            <div className="text-base font-bold text-white mt-0.5">{manifestos.length} documento(s)</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded">
            <div className="text-[10px] text-sky-400 uppercase">Total Unidades Esperadas</div>
            <div className="text-base font-bold text-sky-300 mt-0.5">{totalGeralUnidades} unidades</div>
          </div>
        </div>

        {/* Zona de Upload Inteligente (1 por 1 ou Vários de uma vez) */}
        <div className="p-4 bg-zinc-900/20 border-b border-zinc-800">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            accept=".pdf,.xlsx,.xls,.csv,image/png,image/jpeg,image/webp,.txt,.xml"
            className="hidden"
          />

          <div
            onClick={() => !isUploading && fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-sky-400 bg-sky-950/40 scale-[1.01]"
                : isUploading
                ? "border-sky-500 bg-sky-950/20 cursor-wait"
                : "border-zinc-700 hover:border-sky-500 hover:bg-zinc-900/60 bg-zinc-950/50"
            }`}
          >
            {isUploading ? (
              <div className="flex flex-col items-center justify-center space-y-2 py-2">
                <RotateCw className="w-7 h-7 text-sky-400 animate-spin" />
                <div className="font-bold text-white text-xs">
                  IA processando arquivo(s) de Nota Fiscal/Manifesto...
                </div>
                <div className="text-[11px] text-zinc-400 font-sans">
                  Extraindo produtos, EANs, quantidades e preços unitários com alta precisão
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-2 py-1">
                <div className="p-2.5 rounded-full bg-sky-950 border border-sky-800 text-sky-400">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-white text-xs flex items-center justify-center space-x-1">
                    <span>Adicionar Arquivo(s) de Manifesto ou NF</span>
                    <span className="text-sky-400 font-normal">(Individual ou Múltiplos)</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-sans mt-0.5">
                    Arraste ou clique para selecionar <strong>PDF, Excel (.xlsx/.xls), CSV, Imagem ou DANFE</strong>
                  </div>
                </div>
                <div className="flex items-center space-x-2 mt-1 text-[10px] text-zinc-500 font-mono">
                  <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">Suporte a múltiplos arquivos simultâneos</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lista e Painel de Gerenciamento de Anexos */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold uppercase tracking-wider text-zinc-300">
              Anexos e Documentos Importados ({manifestos.length})
            </span>
            {manifestos.length > 0 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-1 text-sky-400 hover:text-sky-300 text-xs font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Anexar Mais</span>
              </button>
            )}
          </div>

          {manifestos.length === 0 ? (
            <div className="text-center py-12 border border-zinc-800 rounded-lg bg-zinc-900/20 text-zinc-500 space-y-2">
              <FileText className="w-8 h-8 mx-auto text-zinc-600" />
              <div>Nenhum arquivo de manifesto ou Nota Fiscal anexado até o momento.</div>
              <div className="text-[11px] text-zinc-600 font-sans">
                Faça o upload do PDF, planilha ou imagem para comparar automaticamente as quantidades lidas pelo operador.
              </div>
            </div>
          ) : (
            manifestos.map((doc) => {
              const isExpanded = expandedDocId === doc.id;
              const fileName = doc.arquivoNome || `Manifesto-${doc.nfe}.pdf`;
              const isPdf = fileName.toLowerCase().endsWith(".pdf");
              const isExcel = fileName.toLowerCase().includes(".xls") || fileName.toLowerCase().includes(".csv");

              return (
                <div
                  key={doc.id}
                  className={`border rounded-lg overflow-hidden transition-colors ${
                    isExpanded
                      ? "border-sky-700 bg-zinc-900/60"
                      : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"
                  }`}
                >
                  {/* Cabeçalho do Documento Anexado */}
                  <div className="p-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2.5 flex-1 min-w-[200px]">
                      <div className="p-1.5 rounded bg-zinc-800 border border-zinc-700">
                        {isPdf ? (
                          <FileText className="w-4 h-4 text-rose-400" />
                        ) : isExcel ? (
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <FileCode className="w-4 h-4 text-sky-400" />
                        )}
                      </div>

                      <div>
                        <div className="font-bold text-white flex items-center space-x-2">
                          <span>NF-e Nº {doc.nfe}</span>
                          <span className="text-[10px] text-sky-300 font-normal px-1.5 py-0.2 bg-sky-950 border border-sky-800 rounded">
                            {doc.fornecedor}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 flex items-center space-x-3 mt-0.5">
                          <span className="flex items-center space-x-1">
                            <Calendar className="w-3 h-3 text-zinc-500" />
                            <span>Emissão: {doc.dataEmissao}</span>
                          </span>
                          <span>•</span>
                          <span>Arquivo: <strong className="text-zinc-300">{fileName}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <div className="font-bold text-white text-xs">
                          {doc.totalUnidades} itens ({doc.itens.length} modelos)
                        </div>
                        <div className="text-[10px] text-sky-400 font-mono">
                          Conferência Ativa
                        </div>
                      </div>

                      {/* Botão de Excluir Anexo */}
                      <button
                        onClick={() => handleDeleteManifesto(doc.id, doc.nfe)}
                        disabled={isDeletingId === doc.id}
                        className="p-1.5 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 rounded border border-zinc-800 hover:border-rose-800 transition-colors cursor-pointer"
                        title="Remover este arquivo de manifesto"
                      >
                        {isDeletingId === doc.id ? (
                          <RotateCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Botão de Expandir/Recolher Itens */}
                      <button
                        onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}
                        className="p-1.5 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-800 transition-colors cursor-pointer flex items-center space-x-1"
                        title={isExpanded ? "Recolher itens" : "Expandir itens da NF"}
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Tabela de Itens Expandida */}
                  {isExpanded && (
                    <div className="border-t border-zinc-800 bg-zinc-950/70 p-3 overflow-x-auto">
                      <table className="w-full text-left border-collapse text-[11px] font-mono">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-400">
                            <th className="py-1.5 px-2 w-10 text-center">#</th>
                            <th className="py-1.5 px-2 w-28">CÓDIGO</th>
                            <th className="py-1.5 px-2">DESCRIÇÃO DO PRODUTO</th>
                            <th className="py-1.5 px-2 w-36">EAN-13</th>
                            <th className="py-1.5 px-2 w-20 text-center">QUANTIDADE</th>
                            <th className="py-1.5 px-2 w-24 text-center">CAIXA</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-850">
                          {doc.itens.map((item, idx) => (
                            <tr key={item.id || idx} className="hover:bg-zinc-900/40">
                              <td className="py-1.5 px-2 text-center text-zinc-500">{idx + 1}</td>
                              <td className="py-1.5 px-2 text-zinc-400">{item.codigoItem || "—"}</td>
                              <td className="py-1.5 px-2 font-semibold text-white">{item.descricao}</td>
                              <td className="py-1.5 px-2 text-zinc-300">{item.ean || "—"}</td>
                              <td className="py-1.5 px-2 text-center font-bold text-sky-300">{item.quantidade}</td>
                              <td className="py-1.5 px-2 text-center text-zinc-400">
                                Caixa {item.caixaSugerida || 1}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs">
          <div className="text-zinc-400 text-[11px]">
            {manifestos.length > 0
              ? `${manifestos.length} documento(s) ativo(s) sincronizados com o painel de conferência.`
              : "Nenhum documento carregado."}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
