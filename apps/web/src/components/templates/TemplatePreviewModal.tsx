"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Download,
  ExternalLink,
  Layers,
  Sparkles,
  Zap,
  Info,
  CheckCircle2,
  AlertCircle,
  X,
  Workflow as WorkflowIcon,
  Tag,
  Share2,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TemplatePreviewCanvas } from "./TemplatePreviewCanvas";
import { templatesApi, type WorkflowTemplateDto } from "@/lib/api";

interface TemplatePreviewModalProps {
  template: WorkflowTemplateDto | null;
  open: boolean;
  onClose: () => void;
  onCloneSuccess?: (workflowId: string) => void;
}

export function TemplatePreviewModal({
  template,
  open,
  onClose,
  onCloneSuccess,
}: TemplatePreviewModalProps) {
  const router = useRouter();
  const [cloning, setCloning] = useState(false);
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!template) return null;

  const nodeCount = template.workflow.nodes.length;
  const edgeCount = template.workflow.edges.length;

  const handleClone = async () => {
    setCloning(true);
    setError(null);
    try {
      const res = await templatesApi.clone(template.id);
      if (onCloneSuccess) {
        onCloneSuccess(res.workflow.id);
      } else {
        router.push(`/workflows/${res.workflow.id}/editor`);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || "Erro ao clonar template para seu workspace.");
    } finally {
      setCloning(false);
    }
  };

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(template, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `agentflow-template-${template.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.origin + `/templates?selected=${template.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="max-w-5xl overflow-hidden !p-0 border-white/10 bg-zinc-950 text-zinc-100"
    >
      {/* Modal Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 bg-zinc-900/60 p-6 backdrop-blur-md">
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 shadow-inner"
            style={{ backgroundColor: `${template.color || "#6366f1"}20`, borderColor: `${template.color || "#6366f1"}40` }}
          >
            <Zap className="h-6 w-6" style={{ color: template.color || "#6366f1" }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-zinc-50">{template.name}</h2>
              {template.featured && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400 border border-amber-500/20">
                  <Sparkles className="h-3 w-3" /> Featured
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-zinc-400">{template.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleShare}
            className="border-white/10 hover:bg-white/5 text-zinc-300 gap-1.5"
            title="Copiar link do template"
          >
            <Share2 className="h-3.5 w-3.5" />
            {copied ? "Copiado!" : "Compartilhar"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportJson}
            className="border-white/10 hover:bg-white/5 text-zinc-300 gap-1.5"
            title="Download do JSON Sanitizado"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar JSON
          </Button>
          <Button
            size="sm"
            onClick={handleClone}
            disabled={cloning}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium shadow-lg shadow-violet-500/25 gap-1.5"
          >
            <WorkflowIcon className="h-3.5 w-3.5" />
            {cloning ? "Clonando..." : "Usar Template"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border-b border-red-500/20 px-6 py-2.5 text-xs text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Content: 2-column or preview canvas + inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        {/* Left Side: Interactive React Flow Preview */}
        <div className="lg:col-span-8 p-6 flex flex-col gap-4 border-b lg:border-b-0 lg:border-r border-white/10 bg-zinc-950">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              <span className="flex items-center gap-1 font-medium text-zinc-300">
                <Layers className="h-3.5 w-3.5 text-violet-400" /> {nodeCount} nós
              </span>
              <span>•</span>
              <span>{edgeCount} conexões</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-zinc-500" /> ~{template.estimatedSetupMinutes} min de setup
              </span>
            </div>

            <span className="text-xs text-zinc-500 bg-white/5 px-2 py-0.5 rounded border border-white/5">
              Pré-visualização Interativa (Modo Leitura)
            </span>
          </div>

          <TemplatePreviewCanvas
            nodes={template.workflow.nodes}
            edges={template.workflow.edges}
            className="relative h-[440px] w-full overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0f] shadow-inner"
          />

          {/* Quick node list below canvas */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Etapas do Workflow</h4>
            <div className="flex flex-wrap gap-2">
              {template.workflow.nodes.map((node, idx) => {
                const label = (node.data?.label || node.label || node.type) as string;
                const isSelected = selectedNodeIndex === idx;
                return (
                  <button
                    key={node.id || idx}
                    type="button"
                    onClick={() => setSelectedNodeIndex(isSelected ? null : idx)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                      isSelected
                        ? "border-violet-500 bg-violet-500/15 text-violet-200 shadow-md shadow-violet-500/10"
                        : "border-white/10 bg-zinc-900/60 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                    }`}
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[10px] font-mono">
                      {idx + 1}
                    </span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Detailed Info & Selected Node Inspector */}
        <div className="lg:col-span-4 p-6 flex flex-col justify-between bg-zinc-950/80 gap-6">
          <div className="space-y-5">
            {/* Category & Tags */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Categoria & Tags</h4>
              <div className="flex flex-wrap gap-1.5">
                <Badge status="info" className="bg-violet-500/15 text-violet-300 border-violet-500/25">
                  {template.category}
                </Badge>
                {template.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-xs text-zinc-400">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Connectors Required */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Conectores Requeridos</h4>
              <div className="flex flex-wrap gap-1.5">
                {template.connectors.map((c) => (
                  <span key={c} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    {c}
                  </span>
                ))}
              </div>
            </div>

            {/* Node Inspector Panel */}
            <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2 flex items-center justify-between">
                <span>Inspeção do Nó</span>
                {selectedNodeIndex !== null && (
                  <span className="text-[10px] text-violet-400 font-mono">Nó #{selectedNodeIndex + 1}</span>
                )}
              </h4>

              {selectedNodeIndex !== null ? (
                (() => {
                  const node = template.workflow.nodes[selectedNodeIndex];
                  const label = (node.data?.label || node.label || node.type) as string;
                  const desc = (node.data?.description || "Executa a lógica desta etapa.") as string;
                  const config = (node.data?.config || node.config || {}) as Record<string, unknown>;

                  return (
                    <div className="space-y-2.5 text-xs">
                      <div>
                        <span className="text-zinc-500">Nome:</span>
                        <p className="font-medium text-zinc-200">{label}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500">Tipo de Nó:</span>
                        <p className="font-mono text-violet-300">{node.type}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500">Descrição:</span>
                        <p className="text-zinc-400">{desc}</p>
                      </div>
                      {Object.keys(config).length > 0 && (
                        <div>
                          <span className="text-zinc-500">Configurações Padrão:</span>
                          <pre className="mt-1 max-h-32 overflow-x-auto rounded bg-zinc-950 p-2 font-mono text-[11px] text-zinc-400 border border-white/5">
                            {JSON.stringify(config, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <p className="text-xs text-zinc-500 italic">
                  Clique em um nó na lista acima para inspecionar seus parâmetros e configurações pré-definidas.
                </p>
              )}
            </div>
          </div>

          {/* Bottom Action inside inspector */}
          <div className="pt-4 border-t border-white/10 space-y-2">
            <Button
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-500/25 py-2.5 font-medium text-sm"
              onClick={handleClone}
              disabled={cloning}
            >
              <WorkflowIcon className="h-4 w-4" />
              {cloning ? "Clonando para o Workspace..." : "Clonar e Editar Workflow"}
            </Button>
            <p className="text-center text-[11px] text-zinc-500">
              Cria uma cópia isolada na sua organização.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
