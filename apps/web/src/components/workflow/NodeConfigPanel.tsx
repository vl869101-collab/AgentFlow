"use client";

import { useEffect, useCallback } from "react";
import { Trash2, WandSparkles, X, Sliders, Info, Cpu, CheckCircle2, Bot, Globe, GitBranch, Webhook } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getNodeMeta, nodeKindFor, type WorkflowCanvasNode, type WorkflowNodeData } from "@/lib/workflow";
import { cn } from "@/lib/utils";

interface NodeConfigPanelProps {
  node?: WorkflowCanvasNode;
  onChange: (id: string, data: Partial<WorkflowNodeData>) => void;
  onDelete: (id: string) => void;
  onClose?: () => void;
}

export function NodeConfigPanel({ node, onChange, onDelete, onClose }: NodeConfigPanelProps) {
  const meta = node ? getNodeMeta(node.data.type) : null;
  const configEntries = node ? Object.entries(node.data.config) : [];

  // Keyboard shortcut: ESC closes or deselects node
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!node || !meta) {
    return (
      <aside
        className="flex h-full w-80 shrink-0 flex-col border-l border-white/10 bg-zinc-950/80 backdrop-blur-xl transition-all"
        role="region"
        aria-label="Painel de Configuração do Nó (Vazio)"
      >
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-zinc-500" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-zinc-200">Configuração do Nó</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Selecione um nó no canvas para editar seus parâmetros de execução.</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-zinc-900/60 text-zinc-500">
            <Sliders className="h-6 w-6" aria-hidden="true" />
          </div>
          <h3 className="text-xs font-medium text-zinc-300">Nenhum nó selecionado</h3>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
            Clique em qualquer etapa do grafo para ajustar credenciais, mapeamentos de payload e regras lógicas.
          </p>
        </div>
      </aside>
    );
  }

  const activeNode = node;

  function updateConfig(key: string, value: string) {
    onChange(activeNode.id, { config: { ...activeNode.data.config, [key]: value } });
  }

  function getKindIcon() {
    const kind = nodeKindFor(activeNode.data.type);
    switch (kind) {
      case "trigger":
        return Webhook;
      case "action":
        return Globe;
      case "logic":
        return GitBranch;
      case "advanced":
        return activeNode.data.type === "approval" ? CheckCircle2 : Bot;
      default:
        return Cpu;
    }
  }

  const KindIcon = getKindIcon();

  return (
    <aside
      className="flex h-full w-80 shrink-0 flex-col border-l border-white/10 bg-zinc-950/80 backdrop-blur-xl shadow-2xl transition-all"
      role="region"
      aria-label={`Configurações do nó ${node.data.label}`}
    >
      {/* Header */}
      <div className="border-b border-white/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", meta.styles.iconBg, meta.styles.borderColor)}>
              <KindIcon className={cn("h-4 w-4", meta.styles.iconColor)} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-zinc-100" title={node.data.label}>
                {node.data.label}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn("text-[11px] font-medium", meta.styles.iconColor)}>{meta.label}</span>
                <span className="text-[10px] text-zinc-600 font-mono">({node.data.type})</span>
              </div>
            </div>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
              aria-label="Fechar painel de configuração (Esc)"
              title="Fechar (Esc)"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Form Content */}
      <div className="flex-1 space-y-5 overflow-y-auto p-4 custom-scrollbar">
        {/* Metadados Básicos */}
        <div className="space-y-3">
          <label htmlFor="node-label-input" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Identificação
          </label>
          <Input
            id="node-label-input"
            label="Rótulo de Exibição"
            value={node.data.label}
            onChange={(event) => onChange(node.id, { label: event.target.value })}
            placeholder="Ex: Webhook de Entrada"
            className="w-full"
          />

          <div className="space-y-1.5">
            <label htmlFor="node-description" className="block text-xs font-medium text-zinc-400">
              Descrição Operacional
            </label>
            <textarea
              id="node-description"
              value={node.data.description || ""}
              onChange={(event) => onChange(node.id, { description: event.target.value })}
              rows={2}
              placeholder="Descreva a finalidade desta etapa no fluxo..."
              className="w-full resize-none rounded-lg border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1 focus:ring-offset-zinc-950 transition-all"
            />
          </div>
        </div>

        {/* Parâmetros Específicos */}
        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Parâmetros de Execução
            </span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
              {configEntries.length} {configEntries.length === 1 ? "campo" : "campos"}
            </span>
          </div>

          {configEntries.length === 0 ? (
            <div className="rounded-lg border border-white/5 bg-zinc-900/40 p-3 text-center">
              <p className="text-[11px] text-zinc-500">Este nó não possui parâmetros adicionais configuráveis.</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {configEntries.map(([key, value]) => {
                const label = key
                  .replace(/([A-Z])/g, " $1")
                  .replace(/^./, (str) => str.toUpperCase());
                return (
                  <Input
                    key={key}
                    label={label}
                    value={String(value)}
                    onChange={(event) => updateConfig(key, event.target.value)}
                    className="font-mono text-xs"
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Contexto Específico para AI Agent */}
        {node.data.type === "ai_agent" ? (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-300">
              <WandSparkles className="h-4 w-4 text-violet-400" aria-hidden="true" />
              <span>Grafo com Agente Autônomo</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
              Este agente recebe o contexto acumulado dos nós upstream e pode invocar ferramentas MCP registradas no runtime.
            </p>
          </div>
        ) : null}

        {/* Contexto Específico para Condição */}
        {node.data.type === "condition" ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <GitBranch className="h-4 w-4 text-amber-400" aria-hidden="true" />
              <span>Ramificação Condicional</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
              Porta superior (True): executada se a expressão for avaliada como verdadeira.
              <br />
              Porta inferior (False): executada como rota alternativa padrão.
            </p>
          </div>
        ) : null}

        {/* Informações de ID e Runtime */}
        <div className="rounded-lg border border-white/5 bg-zinc-900/30 p-2.5">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
            <span>ID do Nó:</span>
            <span className="text-zinc-400 select-all">{node.id}</span>
          </div>
        </div>
      </div>

      {/* Footer / Ações Destrutivas */}
      <div className="border-t border-white/10 p-4">
        <Button
          variant="danger"
          size="sm"
          className="w-full justify-center gap-2"
          onClick={() => onDelete(node.id)}
          aria-label={`Excluir nó ${node.data.label}`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Excluir Nó</span>
        </Button>
      </div>
    </aside>
  );
}
