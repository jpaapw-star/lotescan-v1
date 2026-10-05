import React, { useState } from "react";
import { UserCheck, X, Plus, Check, Smartphone, Monitor, Sparkles } from "lucide-react";
import { User } from "firebase/auth";

interface OperatorItem {
  id: string;
  name: string;
  currentCaixa?: number;
  lastActive?: string;
}

interface DeviceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDeviceId: string;
  devices: OperatorItem[];
  onSelectDevice: (deviceId: string) => void;
  onCreateDevice: (deviceId: string, name: string) => Promise<void>;
  user?: User | null;
}

export const DeviceSelectorModal: React.FC<DeviceSelectorModalProps> = ({
  isOpen,
  onClose,
  currentDeviceId,
  devices,
  onSelectDevice,
  onCreateDevice,
  user,
}) => {
  const [operatorName, setOperatorName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleSelect = (nameOrId: string) => {
    onSelectDevice(nameOrId);
    onClose();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = operatorName.trim();
    if (!clean) return;

    try {
      setIsCreating(true);
      await onCreateDevice(clean, clean);
      onSelectDevice(clean);
      setOperatorName("");
      onClose();
    } catch (err) {
      console.error("Erro ao registrar operador:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUseGoogleName = () => {
    const googleName = user?.displayName || user?.email?.split("@")[0] || "Operador Google";
    handleSelect(googleName);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl text-zinc-100 font-mono text-xs">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center space-x-2">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span className="font-bold uppercase tracking-wider text-white text-xs">
              Gestão de Operadores & Sessão Unificada
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Banner de Sincronização Multi-Dispositivo */}
          <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-1.5 font-sans">
            <div className="flex items-center space-x-2 text-xs font-bold text-white font-mono">
              <Smartphone className="w-3.5 h-3.5 text-sky-400" />
              <span>+</span>
              <Monitor className="w-3.5 h-3.5 text-emerald-400" />
              <span>SINCRONIZAÇÃO CELULAR & COMPUTADOR</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Para trabalhar no celular (captura de fotos na bancada) e no computador (conferência da planilha) simultaneamente, selecione o <strong>mesmo nome de operador</strong> em ambos os aparelhos. Os dados e a caixa ativa serão compartilhados em tempo real sem duplicar registros.
            </p>
          </div>

          {/* Atalho de Conta Google se logado */}
          {user && (
            <button
              onClick={handleUseGoogleName}
              className="w-full p-2.5 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-700/80 rounded-lg text-left flex items-center justify-between transition-colors cursor-pointer group"
            >
              <div className="flex items-center space-x-2.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="text-[10px] text-emerald-400 uppercase tracking-wider">
                    Operador Identificado via Google:
                  </div>
                  <div className="font-bold text-white text-xs">
                    {user.displayName || user.email}
                  </div>
                </div>
              </div>
              <span className="px-2 py-1 bg-emerald-600 group-hover:bg-emerald-500 text-white font-bold rounded text-[10px]">
                Usar Este
              </span>
            </button>
          )}

          {/* Lista de Operadores Registrados / Recentes */}
          <div className="space-y-2">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
              Operadores Disponíveis / Recentes:
            </div>

            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {devices.map((d) => {
                const isSelected =
                  d.name.toLowerCase() === currentDeviceId.toLowerCase() ||
                  d.id.toLowerCase() === currentDeviceId.toLowerCase();

                return (
                  <button
                    key={d.id}
                    onClick={() => handleSelect(d.name || d.id)}
                    className={`w-full p-2.5 rounded-lg border text-left flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-zinc-900 border-emerald-500/80 text-white shadow-sm"
                        : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/40"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <div className={`p-1.5 rounded-full ${isSelected ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-400"}`}>
                        <UserCheck className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold flex items-center space-x-2 text-xs">
                          <span>{d.name || d.id}</span>
                          {isSelected && (
                            <span className="text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-1.5 py-0.2 rounded font-semibold">
                              ATIVO NESTE APARELHO
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {d.lastActive ? `Última atividade: ${new Date(d.lastActive).toLocaleDateString("pt-BR")}` : "Estação de conferência"}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-zinc-500">Caixa Atual</div>
                      <div className="font-bold text-white">#{d.currentCaixa || 1}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Adicionar Novo Operador */}
          <form onSubmit={handleCreate} className="pt-3 border-t border-zinc-800 space-y-2">
            <div className="text-[10px] text-zinc-400 uppercase tracking-wider">
              Entrar como Novo Operador / Usuário:
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: João Santos, Conferência A, etc."
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400"
              />
              <button
                type="submit"
                disabled={!operatorName.trim() || isCreating}
                className="px-4 py-2 bg-white hover:bg-zinc-200 text-black font-bold rounded flex items-center space-x-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isCreating ? "Entrando..." : "Entrar"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
