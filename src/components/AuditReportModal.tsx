import React, { useState, useEffect } from "react";
import {
  X,
  Printer,
  ShieldAlert,
  FileCheck,
  Building,
  Calendar,
  AlertTriangle,
  RotateCw,
  Image as ImageIcon,
} from "lucide-react";
import { ResumoCaixa, ProductItem, ManifestoDoc } from "../types";

interface AuditReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  resumos: ResumoCaixa[];
  products: ProductItem[];
  manifestos: ManifestoDoc[];
}

export const AuditReportModal: React.FC<AuditReportModalProps> = ({
  isOpen,
  onClose,
  resumos,
  products,
  manifestos,
}) => {
  if (!isOpen) return null;

  const damagedProducts = products.filter(
    (p) => p.estadoFisico && p.estadoFisico !== "NOVO_LACRADO"
  );

  const totalLido = products.reduce((acc, p) => acc + (p.qtde || 1), 0);
  const totalManifesto = manifestos.reduce((acc, m) => acc + m.totalUnidades, 0);
  const totalDivergencia = totalManifesto - totalLido;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white print:static">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl text-zinc-100 font-mono text-xs print:border-none print:shadow-none print:bg-white print:text-black print:max-h-none print:overflow-visible">
        {/* Cabeçalho de Controle (Oculto na impressão) */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60 print:hidden">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <span className="font-bold text-white uppercase tracking-wider text-xs">
              Relatório de Auditoria, Divergências & Avarias (PDF / Fornecedor)
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded flex items-center space-x-1.5 transition-colors cursor-pointer shadow"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / Salvar em PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Corpo do Relatório Formatado para Impressão */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 print:p-0 print:overflow-visible font-sans text-xs">
          {/* Cabeçalho da Empresa / Dossiê */}
          <div className="border-b-2 border-zinc-800 print:border-black pb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-extrabold uppercase tracking-tight text-white print:text-black">
                Dossiê de Recebimento, Divergência e Avarias
              </h1>
              <p className="text-xs text-zinc-400 print:text-zinc-600 font-mono mt-0.5">
                ScanLote AI • Auditoria Óptica e Visão Computacional Gemini AI
              </p>
            </div>

            <div className="text-right text-[11px] font-mono text-zinc-400 print:text-zinc-600">
              <div><strong>Data de Emissão:</strong> {new Date().toLocaleString("pt-BR")}</div>
              <div><strong>NF Referência:</strong> {manifestos[0]?.nfe || "Conferência Geral"}</div>
              <div><strong>Fornecedor:</strong> {manifestos[0]?.fornecedor || "Diversos"}</div>
            </div>
          </div>

          {/* Resumo Executivo em Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
            <div className="p-3 rounded bg-zinc-900 border border-zinc-800 print:bg-zinc-100 print:border-zinc-300">
              <div className="text-[10px] text-zinc-400 print:text-zinc-600 uppercase">Qtd Esperada (NF)</div>
              <div className="text-base font-bold text-sky-400 print:text-sky-800 mt-1">
                {totalManifesto} un
              </div>
            </div>

            <div className="p-3 rounded bg-zinc-900 border border-zinc-800 print:bg-zinc-100 print:border-zinc-300">
              <div className="text-[10px] text-zinc-400 print:text-zinc-600 uppercase">Qtd Conferida</div>
              <div className="text-base font-bold text-white print:text-black mt-1">
                {totalLido} un
              </div>
            </div>

            <div className="p-3 rounded bg-zinc-900 border border-zinc-800 print:bg-zinc-100 print:border-zinc-300">
              <div className="text-[10px] text-zinc-400 print:text-zinc-600 uppercase">Divergência Total</div>
              <div className={`text-base font-bold mt-1 ${totalDivergencia === 0 ? "text-emerald-400 print:text-emerald-700" : "text-rose-400 print:text-rose-700"}`}>
                {totalDivergencia === 0 ? "🟢 0 (Batimento 100%)" : `${totalDivergencia > 0 ? "🔴 Faltam" : "🟡 Sobram"} ${Math.abs(totalDivergencia)} un`}
              </div>
            </div>

            <div className="p-3 rounded bg-zinc-900 border border-zinc-800 print:bg-zinc-100 print:border-zinc-300">
              <div className="text-[10px] text-zinc-400 print:text-zinc-600 uppercase">Avarias Identificadas</div>
              <div className="text-base font-bold text-rose-400 print:text-rose-700 mt-1">
                {damagedProducts.length} un
              </div>
            </div>
          </div>

          {/* Seção 1: Resumo Consolidado de Caixas */}
          <div className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-white print:text-black border-b border-zinc-800 print:border-zinc-300 pb-1">
              1. Situação por Caixa (Dashboard RESUMO_CAIXAS)
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[11px] font-mono">
                <thead>
                  <tr className="bg-zinc-900 print:bg-zinc-200 text-zinc-300 print:text-black border-b border-zinc-700">
                    <th className="py-2 px-2.5">Caixa</th>
                    <th className="py-2 px-2.5">Data Criação</th>
                    <th className="py-2 px-2.5">Lote</th>
                    <th className="py-2 px-2.5 text-center">Qtd Lida</th>
                    <th className="py-2 px-2.5 text-center">Qtd Manifesto</th>
                    <th className="py-2 px-2.5 text-center">Situação Auditoria</th>
                    <th className="py-2 px-2.5 text-center">Avarias</th>
                    <th className="py-2 px-2.5">Operador</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 print:divide-zinc-200">
                  {resumos.map((r) => (
                    <tr key={r.caixa}>
                      <td className="py-2 px-2.5 font-bold">Caixa {r.caixa}</td>
                      <td className="py-2 px-2.5 text-zinc-400 print:text-zinc-700">{r.dataCriacao}</td>
                      <td className="py-2 px-2.5 text-zinc-300 print:text-zinc-800">{r.loteId}</td>
                      <td className="py-2 px-2.5 text-center font-bold">{r.qtdLida}</td>
                      <td className="py-2 px-2.5 text-center">{r.qtdManifesto || "-"}</td>
                      <td className="py-2 px-2.5 text-center font-bold">
                        {r.divergenciaAuditoria}
                      </td>
                      <td className="py-2 px-2.5 text-center text-rose-400 print:text-rose-700 font-bold">
                        {r.avariasDetectadas > 0 ? `${r.avariasDetectadas} avaria(s)` : "0"}
                      </td>
                      <td className="py-2 px-2.5 text-zinc-400 print:text-zinc-700">{r.operadorResponsavel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Seção 2: Dossiê Fotográfico de Produtos e Embalagens Avariadas */}
          <div className="space-y-3 pt-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-rose-400 print:text-rose-800 border-b border-zinc-800 print:border-zinc-300 pb-1 flex items-center space-x-1.5">
              <ShieldAlert className="w-4 h-4 inline" />
              <span>2. Produtos com Embalagem ou Carcaça Avariada ({damagedProducts.length})</span>
            </h2>

            {damagedProducts.length === 0 ? (
              <div className="p-4 bg-zinc-900/40 print:bg-zinc-100 rounded text-center text-zinc-400 print:text-zinc-600 font-mono">
                ✅ Nenhuma avaria foi identificada neste lote. Todos os produtos encontram-se lacrados e intactos.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {damagedProducts.map((p) => {
                  const firstPhotoId = p.photoIds[0];
                  return (
                    <div
                      key={p.id}
                      className="p-3 bg-zinc-900 print:bg-zinc-50 border border-rose-900/60 print:border-rose-300 rounded flex space-x-3 break-inside-avoid"
                    >
                      {firstPhotoId ? (
                        <img
                          src={`/api/photos/${firstPhotoId}`}
                          alt="Evidência"
                          className="w-24 h-24 object-cover rounded border border-zinc-700 print:border-zinc-300 bg-black flex-shrink-0"
                        />
                      ) : (
                        <div className="w-24 h-24 bg-zinc-800 rounded flex items-center justify-center text-zinc-500">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                      )}

                      <div className="space-y-1 min-w-0 flex-1 font-mono text-[11px]">
                        <div className="font-bold text-white print:text-black font-sans leading-snug">
                          {p.modelo}
                        </div>
                        <div className="text-zinc-400 print:text-zinc-700">
                          <strong>Serial/IMEI:</strong> {p.serialImei || "NÃO VISÍVEL"}
                        </div>
                        <div className="text-zinc-400 print:text-zinc-700">
                          <strong>Caixa:</strong> {p.caixa} • <strong>Qtde:</strong> {p.qtde}
                        </div>
                        <div className="text-rose-400 print:text-rose-800 font-bold text-[10px]">
                          Estado: {p.estadoFisico}
                        </div>
                        {p.descricaoAvaria && (
                          <div className="text-zinc-300 print:text-zinc-900 text-[10px] bg-zinc-950 print:bg-white p-1 rounded border border-zinc-800 print:border-zinc-200">
                            {p.descricaoAvaria}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Assinaturas para Protocolo de Envio ao Fornecedor */}
          <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs font-mono print:pt-16">
            <div className="border-t border-zinc-700 print:border-black pt-2 text-zinc-400 print:text-zinc-800">
              Assinatura do Conferente / Operador
            </div>
            <div className="border-t border-zinc-700 print:border-black pt-2 text-zinc-400 print:text-zinc-800">
              Assinatura do Gerente de Logística / Fornecedor
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
