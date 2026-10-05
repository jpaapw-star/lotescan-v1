import React, { useState, useEffect } from "react";
import { X, Send, Bell, CheckCircle2, AlertCircle, RotateCw, ExternalLink } from "lucide-react";
import { AlertConfig } from "../types";

interface AlertsConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AlertsConfigModal: React.FC<AlertsConfigModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [config, setConfig] = useState<AlertConfig>({
    telegramBotToken: "",
    telegramChatId: "",
    whatsappNumber: "",
    webhookUrl: "",
    alertarNaDivergencia: true,
    alertarEmAvaria: true,
    alertarAoConcluirCaixa: true,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetch("/api/alerts/config")
        .then((r) => r.json())
        .then((data) => setConfig(data))
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setFeedback(null);
      const res = await fetch("/api/alerts/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Erro ao salvar configurações");
      setFeedback({ type: "success", text: "Configurações de alerta salvas com sucesso!" });
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Erro ao salvar" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAlert = async () => {
    try {
      setIsTesting(true);
      setFeedback(null);
      const res = await fetch("/api/alerts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "DIVERGENCIA",
          mensagem: `🔔 *SCANLOTE AI - TESTE DE ALERTA*\n✅ Canal de comunicação validado com sucesso!\n📦 Gestão de Caixas e Divergências ativa.`,
        }),
      });
      const data = await res.json();
      setFeedback({
        type: "success",
        text: `Disparo de teste concluído! ${data.details || ""}`,
      });
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Falha no disparo do teste" });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-xl overflow-hidden shadow-2xl text-zinc-100 font-mono text-xs">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center space-x-2">
            <Send className="w-5 h-5 text-sky-400" />
            <span className="font-bold text-white uppercase tracking-wider text-xs">
              Alertas Automáticos (Telegram / WhatsApp)
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback */}
        {feedback && (
          <div
            className={`px-4 py-2 border-b text-xs flex items-center justify-between ${
              feedback.type === "success"
                ? "bg-emerald-950/80 border-emerald-800 text-emerald-300"
                : "bg-rose-950/80 border-rose-800 text-rose-300"
            }`}
          >
            <div className="flex items-center space-x-2">
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400" />
              )}
              <span>{feedback.text}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-zinc-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSave} className="p-5 space-y-4 font-sans text-xs">
          <div className="space-y-3">
            <div className="font-bold text-white text-xs uppercase font-mono flex items-center space-x-1.5 border-b border-zinc-800 pb-1.5">
              <Bell className="w-4 h-4 text-sky-400" />
              <span>1. Configuração do Bot Telegram</span>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-300 block font-bold">
                Telegram Bot Token:
              </label>
              <input
                type="text"
                value={config.telegramBotToken}
                onChange={(e) => setConfig({ ...config, telegramBotToken: e.target.value })}
                placeholder="Ex: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-sky-400"
              />
              <div className="text-[10px] text-zinc-500">
                Obtido gratuitamente conversando com o @BotFather no Telegram.
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-300 block font-bold">
                Telegram Chat ID do Gestor / Grupo:
              </label>
              <input
                type="text"
                value={config.telegramChatId}
                onChange={(e) => setConfig({ ...config, telegramChatId: e.target.value })}
                placeholder="Ex: 987654321 ou -100123456789"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-sky-400"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="font-bold text-white text-xs uppercase font-mono flex items-center space-x-1.5 border-b border-zinc-800 pb-1.5">
              <span>2. WhatsApp / Webhook de Integração</span>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-300 block font-bold">
                Webhook URL (Evolution API / Z-API / Zapier / N8N):
              </label>
              <input
                type="url"
                value={config.webhookUrl}
                onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
                placeholder="https://seu-servidor-whatsapp/webhook/alertas"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-sky-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-300 block font-bold">
                Número WhatsApp do Gestor (com DDI e DDD):
              </label>
              <input
                type="text"
                value={config.whatsappNumber}
                onChange={(e) => setConfig({ ...config, whatsappNumber: e.target.value })}
                placeholder="Ex: 5511999998888"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-sky-400"
              />
            </div>
          </div>

          {/* Regras de Disparo */}
          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <div className="font-bold text-white text-[11px] uppercase font-mono">
              Gatilhos de Notificação Automática:
            </div>

            <label className="flex items-center space-x-2 text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.alertarNaDivergencia}
                onChange={(e) => setConfig({ ...config, alertarNaDivergencia: e.target.checked })}
                className="rounded border-zinc-700 bg-zinc-900 text-sky-500 cursor-pointer"
              />
              <span>Disparar alerta sempre que houver divergência entre Qtd Lida e Manifesto</span>
            </label>

            <label className="flex items-center space-x-2 text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.alertarEmAvaria}
                onChange={(e) => setConfig({ ...config, alertarEmAvaria: e.target.checked })}
                className="rounded border-zinc-700 bg-zinc-900 text-sky-500 cursor-pointer"
              />
              <span>Disparar alerta imediato quando for identificada avaria física em produto/embalagem</span>
            </label>

            <label className="flex items-center space-x-2 text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.alertarAoConcluirCaixa}
                onChange={(e) => setConfig({ ...config, alertarAoConcluirCaixa: e.target.checked })}
                className="rounded border-zinc-700 bg-zinc-900 text-sky-500 cursor-pointer"
              />
              <span>Enviar resumo consolidado sempre que o operador fechar/concluir uma caixa</span>
            </label>
          </div>

          {/* Ações */}
          <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleTestAlert}
              disabled={isTesting}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded text-zinc-200 transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className={`w-3.5 h-3.5 ${isTesting ? "animate-spin" : ""}`} />
              <span>{isTesting ? "Enviando Teste..." : "Testar Alerta Agora"}</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Salvar Configuração</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
