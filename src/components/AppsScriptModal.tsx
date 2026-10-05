import React, { useState } from "react";
import { X, Copy, Check, FileCode, Code2 } from "lucide-react";
import codigoGsRaw from "../../google-apps-script/Codigo.gs?raw";
import indexHtmlRaw from "../../google-apps-script/Index.html?raw";

interface AppsScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AppsScriptModal: React.FC<AppsScriptModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"codigo" | "html">("codigo");
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    const text = activeTab === "codigo" ? codigoGsRaw : indexHtmlRaw;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl text-zinc-100 font-mono text-xs">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center space-x-2">
            <FileCode className="w-4 h-4 text-emerald-400" />
            <span className="font-bold uppercase tracking-wider text-white text-xs">
              Código Pronto para Google Apps Script (Planilha Google)
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas */}
        <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/30 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab("codigo")}
              className={`px-3 py-1.5 rounded transition-colors flex items-center space-x-1.5 cursor-pointer ${
                activeTab === "codigo"
                  ? "bg-white text-black font-bold"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>1. Código.gs (Backend & IA Gemini 3.5)</span>
            </button>

            <button
              onClick={() => setActiveTab("html")}
              className={`px-3 py-1.5 rounded transition-colors flex items-center space-x-1.5 cursor-pointer ${
                activeTab === "html"
                  ? "bg-white text-black font-bold"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>2. Index.html (Interface Visual do Operador)</span>
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Copiado com Sucesso!" : "Copiar Este Código"}</span>
          </button>
        </div>

        {/* Passo a Passo */}
        <div className="px-4 py-2.5 bg-zinc-900/80 border-b border-zinc-800 text-[11px] text-zinc-300">
          {activeTab === "codigo" ? (
            <span>
              👉 <strong>Como colocar:</strong> No seu editor do Google Apps Script, apague o conteúdo de <code>Código.gs</code> e cole o código abaixo. Clique em <strong>Salvar (💾)</strong>.
            </span>
          ) : (
            <span>
              👉 <strong>Como colocar:</strong> No menu lateral esquerdo do Apps Script, clique no botão <strong>+</strong> ao lado de Arquivos, escolha <strong>HTML</strong>, digite <code>Index</code> e cole o código abaixo.
            </span>
          )}
        </div>

        {/* Bloco de Código */}
        <div className="flex-1 overflow-y-auto p-4 bg-zinc-950 font-mono text-[11px] text-zinc-300">
          <pre className="whitespace-pre-wrap leading-relaxed select-all">
            {activeTab === "codigo" ? codigoGsRaw : indexHtmlRaw}
          </pre>
        </div>
      </div>
    </div>
  );
};
