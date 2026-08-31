"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Download,
  Eye,
  Filter,
  Flame,
  Globe,
  Layers,
  LayoutGrid,
  Plus,
  Search,
  Share2,
  Sparkles,
  Tag,
  Upload,
  Workflow as WorkflowIcon,
  Zap,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TemplatePreviewModal } from "@/components/templates/TemplatePreviewModal";
import { templatesApi, type WorkflowTemplateDto } from "@/lib/api";

const CATEGORIES = [
  { id: "all", label: "Todas as Categorias" },
  { id: "IA & RAG", label: "IA & RAG", icon: Sparkles },
  { id: "Vendas & CRM", label: "Vendas & CRM", icon: Zap },
  { id: "Suporte & Atendimento", label: "Suporte ao Cliente", icon: Globe },
  { id: "DevOps & Cloud", label: "DevOps & Incidentes", icon: Code2 },
  { id: "Marketing & Growth", label: "Marketing & E-commerce", icon: Flame },
];

function TemplatesMarketplaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [templates, setTemplates] = useState<WorkflowTemplateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [previewTemplate, setPreviewTemplate] = useState<WorkflowTemplateDto | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [importName, setImportName] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [cloneLoadingId, setCloneLoadingId] = useState<string | null>(null);

  // Load templates list
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await templatesApi.list();
        const list = Array.isArray(data) ? data : (data as any)?.templates || [];
        setTemplates(list);

        // Check if selected query param is present
        const selectedId = searchParams.get("selected");
        if (selectedId && list.length > 0) {
          const found = list.find((t: WorkflowTemplateDto) => t.id === selectedId);
          if (found) setPreviewTemplate(found);
        }
      } catch (err) {
        console.error("Failed to load templates:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [searchParams]);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      // Category filter
      if (selectedCategory !== "all" && tpl.category !== selectedCategory) {
        return false;
      }
      // Difficulty filter
      if (selectedDifficulty !== "all" && tpl.difficulty !== selectedDifficulty) {
        return false;
      }
      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const searchPool = `${tpl.name} ${tpl.description} ${tpl.category} ${tpl.tags.join(" ")} ${tpl.connectors.join(" ")}`.toLowerCase();
        if (!searchPool.includes(q)) return false;
      }
      return true;
    });
  }, [templates, selectedCategory, selectedDifficulty, searchQuery]);

  // Handle Quick Clone
  const handleQuickUse = async (tpl: WorkflowTemplateDto, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      setCloneLoadingId(tpl.id);
      const res = await templatesApi.clone(tpl.id);
      if (res?.workflow?.id) {
        router.push(`/workflows/${res.workflow.id}/editor`);
      } else {
        router.push("/workflows");
      }
    } catch (err) {
      console.error("Error cloning template:", err);
      alert("Erro ao clonar template para o workspace.");
    } finally {
      setCloneLoadingId(null);
    }
  };

  // Handle JSON Import
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);
    if (!importJsonText.trim()) {
      setImportError("Insira o conteúdo JSON do template.");
      return;
    }

    try {
      setImporting(true);
      const parsed = JSON.parse(importJsonText);
      const res = await templatesApi.import({
        template: parsed,
        name: importName.trim() || undefined,
      });
      setImportModalOpen(false);
      setImportJsonText("");
      setImportName("");
      if (res?.workflow?.id) {
        router.push(`/workflows/${res.workflow.id}/editor`);
      } else {
        router.push("/workflows");
      }
    } catch (err: any) {
      setImportError(err?.message || "JSON inválido ou formato incompatível com AgentFlow.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#090a0f] text-zinc-100">
        {/* Hero Section styled like n8n marketplace */}
        <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-b from-zinc-900/80 via-zinc-950/60 to-zinc-950 px-6 py-12 lg:px-12">
          {/* Subtle glow background */}
          <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-96 w-[700px] rounded-full bg-gradient-to-tr from-violet-600/20 to-indigo-500/20 blur-[100px]" />

          <div className="relative mx-auto max-w-6xl">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  Marketplace de Automações & Templates
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
                  Acelere seus fluxos com <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">Templates Prontos</span>
                </h1>
                <p className="max-w-2xl text-sm md:text-base text-zinc-400">
                  Explore fluxos de trabalho pré-configurados para IA Generativa, RAG, CRM, Atendimento, CI/CD e E-commerce. Clone com 1 clique diretamente para seu workspace.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setImportModalOpen(true)}
                  variant="secondary"
                  className="border-white/15 bg-zinc-900/60 hover:bg-white/10 text-zinc-200 gap-2 shadow-sm"
                >
                  <Upload className="h-4 w-4" />
                  Importar JSON
                </Button>
                <Button
                  onClick={() => router.push("/workflows")}
                  className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white gap-2 shadow-lg shadow-violet-500/20 font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Criar do Zero
                </Button>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/90 p-2 shadow-2xl backdrop-blur-xl">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar por nome, conector (Drive, Slack, Stripe...), caso de uso ou tag..."
                  className="w-full rounded-xl bg-transparent py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:ring-1 focus:ring-violet-500/50"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={selectedDifficulty}
                  onChange={(e) => setSelectedDifficulty(e.target.value)}
                  className="rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-xs font-medium text-zinc-300 outline-none hover:border-white/20 focus:border-violet-500"
                >
                  <option value="all">Todas Dificuldades</option>
                  <option value="Iniciante">Iniciante</option>
                  <option value="Intermediário">Intermediário</option>
                  <option value="Avançado">Avançado</option>
                </select>

                <div className="h-6 w-[1px] bg-white/10 hidden sm:block" />

                <div className="text-xs text-zinc-400 whitespace-nowrap px-2 font-mono">
                  {filteredTemplates.length} templates
                </div>
              </div>
            </div>

            {/* Category Pills Navigation */}
            <div className="mt-6 flex flex-wrap items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition-all ${
                      isSelected
                        ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25 border border-violet-500"
                        : "bg-zinc-900/80 text-zinc-400 border border-white/10 hover:border-white/20 hover:text-zinc-200 hover:bg-zinc-800/80"
                    }`}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5" />}
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Templates Grid Content */}
        <div className="mx-auto max-w-6xl px-6 py-10 lg:px-12">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-zinc-950/50 py-16 text-center">
              <BookOpen className="h-10 w-10 text-zinc-600 mb-3" />
              <h3 className="text-base font-semibold text-zinc-300">Nenhum template encontrado</h3>
              <p className="mt-1 text-xs text-zinc-500 max-w-sm">
                Tente ajustar os filtros de busca ou importar seu próprio arquivo de workflow em JSON.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                  setSelectedDifficulty("all");
                }}
                className="mt-4 border-white/10 text-zinc-300"
              >
                Limpar Filtros
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTemplates.map((tpl) => {
                const isCloning = cloneLoadingId === tpl.id;
                const nodeCount = tpl.workflow.nodes.length;

                return (
                  <div
                    key={tpl.id}
                    onClick={() => setPreviewTemplate(tpl)}
                    className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-zinc-900/40 p-5 transition-all duration-200 hover:border-violet-500/50 hover:bg-zinc-900/80 hover:shadow-xl hover:shadow-violet-500/10 cursor-pointer backdrop-blur-sm"
                  >
                    {/* Card Top: Icon, Tag & Difficulty */}
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 transition-transform group-hover:scale-105"
                          style={{
                            backgroundColor: `${tpl.color || "#6366f1"}15`,
                            borderColor: `${tpl.color || "#6366f1"}35`,
                          }}
                        >
                          <Zap className="h-5 w-5" style={{ color: tpl.color || "#6366f1" }} />
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 justify-end">
                          {tpl.featured && (
                            <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/25">
                              <Sparkles className="h-2.5 w-2.5" /> Destaque
                            </span>
                          )}
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-400 border border-white/10">
                            {tpl.difficulty}
                          </span>
                        </div>
                      </div>

                      {/* Title & Description */}
                      <h3 className="mt-4 text-base font-bold text-zinc-100 group-hover:text-violet-300 transition-colors line-clamp-1">
                        {tpl.name}
                      </h3>
                      <p className="mt-1.5 text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                        {tpl.description}
                      </p>

                      {/* Connectors Badges */}
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {tpl.connectors.map((connector) => (
                          <span
                            key={connector}
                            className="flex items-center gap-1 rounded-md bg-zinc-950/80 px-2 py-0.5 text-[11px] font-medium text-zinc-300 border border-white/10"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            {connector}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Card Bottom: Metrics and Actions */}
                    <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 text-xs text-zinc-500 font-mono">
                        <span className="flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5 text-violet-400" /> {nodeCount} nós
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-zinc-500" /> {tpl.estimatedSetupMinutes}m
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewTemplate(tpl);
                          }}
                          className="h-8 px-2.5 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-white/10"
                          title="Visualizar Grafo do Workflow"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => handleQuickUse(tpl, e)}
                          disabled={isCloning}
                          className="h-8 px-3 text-xs bg-violet-600 hover:bg-violet-500 text-white font-medium shadow-md shadow-violet-600/20"
                        >
                          {isCloning ? "Clonando..." : "Usar"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Interactive Template Preview Modal */}
        <TemplatePreviewModal
          template={previewTemplate}
          open={Boolean(previewTemplate)}
          onClose={() => setPreviewTemplate(null)}
        />

        {/* Custom JSON Template Import Modal */}
        <Modal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          title="Importar Template JSON"
          description="Cole o JSON exportado de um template ou fluxo de trabalho compatível com AgentFlow."
          className="max-w-xl border-white/10 bg-zinc-950"
        >
          <form onSubmit={handleImportSubmit} className="space-y-4 p-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Nome do Workflow (Opcional)
              </label>
              <input
                type="text"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="Ex: Meu Fluxo Importado"
                className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Conteúdo JSON do Workflow *
              </label>
              <textarea
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                rows={10}
                placeholder='{\n  "name": "Custom Flow",\n  "workflow": {\n    "nodes": [...],\n    "edges": [...]\n  }\n}'
                className="w-full rounded-lg border border-white/10 bg-zinc-900/90 font-mono text-xs text-zinc-200 p-3 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                required
              />
            </div>

            {importError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
                {importError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setImportModalOpen(false)}
                className="border-white/10 text-zinc-400 hover:text-zinc-200"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={importing}
                className="bg-violet-600 hover:bg-violet-500 text-white font-medium"
              >
                {importing ? "Importando..." : "Importar para Workspace"}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </AppLayout>
  );
}

export default function TemplatesMarketplacePage() {
  return (
    <Suspense
      fallback={
        <AppLayout>
          <div className="flex h-96 items-center justify-center bg-[#090a0f]">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        </AppLayout>
      }
    >
      <TemplatesMarketplaceContent />
    </Suspense>
  );
}

