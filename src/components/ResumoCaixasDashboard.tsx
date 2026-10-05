import React from "react";
import { ResumoCaixa, Batch, ProductItem, ManifestoDoc } from "../types";
import { calculateDivergences } from "./DivergenciasModal";
import {
  FileSpreadsheet,
  FileText,
  Printer,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  QrCode,
  Package,
} from "lucide-react";

interface ResumoCaixasDashboardProps {
  resumos: ResumoCaixa[];
  activeBatch: Batch | null;
  products?: ProductItem[];
  manifestos?: ManifestoDoc[];
  onOpenManifestModal: () => void;
  onOpenQrModal: (caixa: number, qrCode: string) => void;
  onOpenExceptionModal: () => void;
  onOpenReportModal: () => void;
  onOpenDivergenciasModal?: () => void;
  onSelectCaixa?: (caixa: number) => void;
  onOpenNewBatch: () => void;
}

function getBoxAuditStatus(
  boxNumber: number,
  products: ProductItem[],
  manifestos: ManifestoDoc[]
) {
  const boxProducts = products.filter((p) => p.caixa === boxNumber);
  if (boxProducts.length === 0) {
    return { status: "Vazia", isError: false, isOk: false, isNeutral: true };
  }

  const manifestItems = manifestos.flatMap((m) => m.itens || []);
  if (manifestItems.length === 0) {
    return { status: "Aguardando NF", isError: false, isOk: false, isNeutral: true };
  }

  let hasDivergence = false;
  for (const p of boxProducts) {
    const matched = manifestItems.find((mItem) => {
      if (p.ean && mItem.ean && p.ean.trim() === mItem.ean.trim()) return true;
      const cleanPhys = p.modelo.toLowerCase();
      const cleanManifCode = (mItem.codigoItem || "").toLowerCase();
      const cleanManifDesc = (mItem.descricao || "").toLowerCase();
      return (
        (cleanManifCode.length > 2 && cleanPhys.includes(cleanManifCode)) ||
        (cleanManifDesc.length > 2 && cleanManifDesc.includes(cleanPhys)) ||
        (cleanPhys.length > 2 && cleanPhys.includes(cleanManifDesc))
      );
    });

    if (!matched) {
      hasDivergence = true;
      break;
    }
  }

  if (hasDivergence) {
    return { status: "Item Fora da NF", isError: true, isOk: false, isNeutral: false };
  }

  return { status: "Ok (Na NF)", isError: false, isOk: true, isNeutral: false };
}

export const ResumoCaixasDashboard: React.FC<ResumoCaixasDashboardProps> = ({
  resumos,
  activeBatch,
  products = [],
  manifestos = [],
  onOpenManifestModal,
  onOpenQrModal,
  onOpenReportModal,
  onOpenDivergenciasModal,
  onSelectCaixa,
}) => {
  const currentCaixa = activeBatch?.caixa || 1;

  // QTD MANIFESTO (NF): soma estrita das quantidades faturadas na Nota Fiscal importada
  const totalManifestoFromDocs = manifestos.reduce(
    (acc, m) => acc + (m.itens || []).reduce((sum, i) => sum + i.quantidade, 0),
    0
  );
  const totalManifesto = totalManifestoFromDocs > 0 
    ? totalManifestoFromDocs 
    : resumos.reduce((acc, r) => acc + r.qtdManifesto, 0);

  // QTD LIDA (FÍSICA): soma estrita da quantidade de produtos lidos por foto/leitura
  const totalLidoFromProducts = products.reduce((acc, p) => acc + (p.qtde || 1), 0);
  const totalLido = totalLidoFromProducts > 0 
    ? totalLidoFromProducts 
    : resumos.reduce((acc, r) => acc + r.qtdLida, 0);

  // Validação Cruzada: cálculo de divergências item a item
  const divergenciasList = calculateDivergences(products, manifestos);
  const totalDivergencias = divergenciasList.length;

  const isTotalBatido = totalDivergencias === 0 && totalLido === totalManifesto && totalManifesto > 0;

  return (
    <div className="space-y-4 w-full max-w-full font-mono text-xs">
      {/* 1. PAINEL SUPERIOR: GERENCIAMENTO DA NOTA FISCAL (Visível APENAS quando houver Nota Fiscal anexada) */}
      {manifestos.length > 0 && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl flex flex-col w-full max-w-full">
          {/* Barra de Título do Painel Superior */}
          <div className="p-3.5 bg-gradient-to-r from-[#1F4E79]/90 via-zinc-900 to-zinc-950 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-white w-full">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded bg-white/10 backdrop-blur-sm border border-white/20">
                <FileSpreadsheet className="w-5 h-5 text-sky-300" />
              </div>
              <div>
                <div className="font-bold text-xs sm:text-sm uppercase tracking-wider flex items-center space-x-2 text-white">
                  <span>GERENCIAMENTO DA NOTA FISCAL (ENTRADA GERAL DO LOTE)</span>
                </div>
                <div className="text-[11px] text-zinc-300 font-sans">
                  Consolidação fiscal das quantidades faturadas no manifesto versus contagem física total
                </div>
              </div>
            </div>

            {/* Botões de Gestão da NF */}
            <div className="flex items-center flex-wrap gap-2">
              <button
                onClick={onOpenManifestModal}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded font-bold transition-colors cursor-pointer shadow text-xs"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>GERENCIAR NOTA FISCAL (PDF/NF)</span>
              </button>

              <button
                onClick={onOpenReportModal}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 rounded font-bold transition-colors cursor-pointer text-xs"
                title="Gerar e exportar relatório de conferência em PDF"
              >
                <Printer className="w-3.5 h-3.5 text-zinc-400" />
                <span>RELATÓRIO PDF</span>
              </button>
            </div>
          </div>

          {/* Cards Globais de Métricas da Nota Fiscal */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 p-3.5 bg-zinc-900/40">
            {/* Card 1: QTD LIDA (FÍSICA) */}
            <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-sans">Qtd Lida (Física)</div>
                <div className="text-xl font-bold text-white mt-0.5">{totalLido}</div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-1.5 py-0.5 rounded font-bold">
                  Leituras
                </span>
              </div>
            </div>

            {/* Card 2: QTD MANIFESTO (NF) */}
            <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-sans">Qtd Manifesto (NF)</div>
                <div className="text-xl font-bold text-sky-300 mt-0.5">{totalManifesto}</div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-sky-400 bg-sky-950/80 border border-sky-800/80 px-1.5 py-0.5 rounded font-bold">
                  Faturado
                </span>
              </div>
            </div>

            {/* Card 3: CARTÃO INTERATIVO "DIVERGÊNCIAS DE ITENS" */}
            <button
              onClick={onOpenDivergenciasModal}
              className={`p-2.5 rounded-lg border flex items-center justify-between transition-all cursor-pointer text-left ${
                totalDivergencias > 0
                  ? "bg-rose-950/30 border-rose-800/80 hover:bg-rose-900/40"
                  : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
              }`}
              title="Clique para abrir o detalhamento completo de divergências"
            >
              <div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-sans flex items-center space-x-1">
                  <span>Divergências de Itens</span>
                  <AlertTriangle className={`w-3 h-3 ${totalDivergencias > 0 ? "text-rose-400" : "text-zinc-500"}`} />
                </div>
                <div className={`text-xl font-bold mt-0.5 ${totalDivergencias > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                  {totalDivergencias}
                </div>
              </div>
              <div className="text-right flex items-center space-x-1">
                {totalDivergencias > 0 ? (
                  <span className="text-[10px] text-rose-300 bg-rose-950 border border-rose-800 px-1.5 py-0.5 rounded font-bold flex items-center space-x-1">
                    <span>Ver Detalhes</span>
                    <ChevronRight className="w-3 h-3" />
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-400 bg-emerald-950 border border-emerald-800 px-1.5 py-0.5 rounded font-bold">
                    0 Divergências ✓
                  </span>
                )}
              </div>
            </button>

            {/* Card 4: SITUAÇÃO DA CONFERÊNCIA */}
            <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg flex items-center justify-between">
              <div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-sans">Situação Conferência</div>
                <div className={`text-sm font-bold mt-1 ${isTotalBatido ? "text-emerald-400" : totalManifesto === 0 ? "text-zinc-400" : "text-amber-400"}`}>
                  {isTotalBatido
                    ? "100% CONFERIDO"
                    : totalManifesto === 0
                    ? "AGUARDANDO NF"
                    : "DIVERGÊNCIAS"}
                </div>
              </div>
              <div className="text-right">
                {isTotalBatido ? (
                  <span className="text-[10px] text-emerald-300 bg-emerald-950 border border-emerald-800 px-1.5 py-0.5 rounded font-bold flex items-center space-x-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Batido ✓</span>
                  </span>
                ) : totalManifesto === 0 ? (
                  <span className="text-[10px] text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded">
                    Sem NF
                  </span>
                ) : (
                  <span className="text-[10px] text-amber-300 bg-amber-950 border border-amber-800 px-1.5 py-0.5 rounded font-bold">
                    Requer Atenção
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. TABELA INFERIOR: GERENCIAMENTO DE CAIXAS DO LOTE */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl flex flex-col w-full max-w-full">
        {/* Barra de Título do Painel Inferior de Caixas */}
        <div className="p-3 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between text-white">
          <div className="flex items-center space-x-2">
            <Package className="w-4 h-4 text-emerald-400" />
            <div>
              <span className="font-bold text-xs uppercase tracking-wider">
                GERENCIAMENTO DE CAIXAS DO LOTE ({resumos.length} CAIXA/S)
              </span>
              <span className="text-[10px] text-zinc-400 block font-sans">
                Subdivisão física do lote e auditoria de presença em Nota Fiscal por caixa
              </span>
            </div>
          </div>
        </div>

        {/* Tabela de Caixas Operacionais: Colunas A, B, C, D, G, J e QR Code */}
        <div className="overflow-x-auto w-full max-w-full">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#1F4E79] text-white border-b border-sky-800 text-[11px] font-bold select-none uppercase">
                <th className="py-2.5 px-3 text-center w-20 border-r border-sky-800/60">
                  A: CAIXA
                </th>
                <th className="py-2.5 px-3 text-center w-32 border-r border-sky-800/60">
                  B: DATA_CRIACAO
                </th>
                <th className="py-2.5 px-3 text-center w-40 border-r border-sky-800/60">
                  C: LOTE_ID
                </th>
                <th className="py-2.5 px-3 text-center w-28 border-r border-sky-800/60">
                  D: QTD_LIDA
                </th>
                <th className="py-2.5 px-3 text-center w-48 border-r border-sky-800/60">
                  G: DIVERGENCIA_AUDITORIA
                </th>
                <th className="py-2.5 px-3 text-center w-40 border-r border-sky-800/60">
                  J: OPERADOR_RESPONSAVEL
                </th>
                <th className="py-2.5 px-3 text-center w-20">
                  QR CODE
                </th>
              </tr>
            </thead>
            <tbody>
              {resumos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-zinc-500 font-mono text-xs">
                    Nenhuma caixa registrada para este lote ainda. Envie fotografias ou inicie uma nova caixa.
                  </td>
                </tr>
              ) : (
                resumos.map((row) => {
                  const isActive = row.caixa === currentCaixa;
                  const audit = getBoxAuditStatus(row.caixa, products, manifestos);

                  return (
                    <tr
                      key={row.caixa}
                      className={`border-b border-zinc-800/80 transition-colors ${
                        isActive ? "bg-zinc-900/90 font-medium" : "hover:bg-zinc-900/40"
                      }`}
                    >
                      {/* Col A: CAIXA */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => onSelectCaixa && onSelectCaixa(row.caixa)}
                          className={`px-2.5 py-1 rounded font-bold transition-all cursor-pointer ${
                            isActive
                              ? "bg-emerald-600 text-white shadow"
                              : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-700"
                          }`}
                          title={isActive ? "Caixa ativa no momento" : "Clique para ativar esta caixa"}
                        >
                          #{row.caixa}
                          {isActive && <span className="ml-1 text-[9px] text-emerald-200">★</span>}
                        </button>
                      </td>

                      {/* Col B: DATA_CRIACAO */}
                      <td className="py-3 px-3 text-center text-zinc-300 font-sans">
                        {row.dataCriacao}
                      </td>

                      {/* Col C: LOTE_ID */}
                      <td className="py-3 px-3 text-center font-bold text-zinc-200">
                        {row.loteId}
                      </td>

                      {/* Col D: QTD_LIDA */}
                      <td className="py-3 px-3 text-center">
                        <span className="text-white font-bold bg-zinc-900 px-2.5 py-1 rounded border border-zinc-800">
                          {row.qtdLida} un.
                        </span>
                      </td>

                      {/* Col G: DIVERGENCIA_AUDITORIA */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2.5 py-1 rounded text-xs font-bold border whitespace-nowrap inline-flex items-center space-x-1 ${
                            audit.isOk
                              ? "bg-emerald-950/80 text-emerald-300 border-emerald-800"
                              : audit.isError
                              ? "bg-rose-950/80 text-rose-300 border-rose-800"
                              : "bg-zinc-900 text-zinc-400 border-zinc-700"
                          }`}
                        >
                          {audit.status}
                        </span>
                      </td>

                      {/* Col J: OPERADOR_RESPONSAVEL */}
                      <td className="py-3 px-3 text-center text-zinc-300 font-mono text-xs">
                        {row.operadorResponsavel}
                      </td>

                      {/* AÇÕES: QR CODE */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => onOpenQrModal(row.caixa, row.qrCode)}
                          className="p-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 rounded transition-colors cursor-pointer"
                          title="Ver QR Code de etiquetagem desta caixa"
                        >
                          <QrCode className="w-3.5 h-3.5 mx-auto" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
