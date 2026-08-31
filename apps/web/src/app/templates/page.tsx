"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
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
  RefreshCw,
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
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const loadTemplates = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await templatesApi.list();
      const list = Array.isArray(data) ? data : (data as any)?.templates || [];
      setTemplates(list);

      // Check if selected query param is present
      const selectedId = searchParams.get("selected");
      if (selectedId && list.length > 0) {
        const found = list.find((t: WorkflowTemplateDto) => t.id === selectedId);
        if (found) setPreviewTemplate(found);
      }
    } catch (err: any) {
      setLoadError(err?.message || "Não foi possível carregar a galeria de templates do servidor.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
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
    } catch (err: any) {
      alert(err?.message || "Erro ao clonar template para o workspace.");
    } finally {
      setCloneLoadingId(null);
    }
  };

  // Handle JSON Import
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);
    if (!importJsonText.trim()) {
      setImportError("Insira o payload JSON exportado do workflow para continuar.");
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
      setImportError(err?.message || "JSON com sintaxe inválida ou estrutura incompatível com AgentFlow.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-violet-500/30 selection:text-violet-200">
        {/* Hero Section — Precision Dark Zinc & Electric Violet styling */}
        <div className="relative overflow-hidden border-b border-white/[0.08] bg-gradient-to-b from-zinc-900/90 via-zinc-950/80 to-[#09090b] px-6 py-12 lg:px-12">
          {/* Subtle glow background */}
          <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-96 w-[760px] rounded-full bg-gradient-to-tr from-violet-600/15 via-purple-600/10 to-indigo-500/10 blur-[120px]" />

          <div className="relative mx-auto max-w-6xl">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-xs font-semibold text-violet-300 backdrop-blur-md">
                  <Sparkles className="h-3.5 w-3.5 text-violet-400" aria-hidden="true" />
                  <span>Marketplace de Automações & Templates</span>
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
                  Acelere seus fluxos com{" "}
                  <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
                    Templates Prontos
                  </span>
                </h1>
                <p className="max-w-2xl text-sm md:text-base text-zinc-400 leading-relaxed">
                  Explore fluxos de trabalho pré-configurados para IA Generativa, RAG, CRM, Atendimento, CI/CD e E-commerce. Clone com 1 clique diretamente para seu workspace.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <Button
                  onClick={() => setImportModalOpen(true)}
                  variant="secondary"
                  className="border-white/10 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 gap-2 shadow-sm focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  <span>Importar JSON</span>
                </Button>
                <Button
                  onClick={() => router.push("/workflows")}
                  className="bg-violet-600 hover:bg-violet-500 text-white gap-2 shadow-lg shadow-violet-600/20 font-medium focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 transition-all active:scale-[0.98]"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Criar do Zero</span>
                </Button>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/90 p-2 shadow-2xl backdrop-blur-xl ring-1 ring-white/[0.04]">
              <div className="relative flex-1 w-full">
                <label htmlFor="template-search-input" className="sr-only">
                  Pesquisar templates por nome, conector, caso de uso ou tag
                </label>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" aria-hidden="true" />
                <input
                  id="template-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar por nome, conector (Drive, Slack, Stripe...), caso de uso ou tag..."
                  className="w-full rounded-xl bg-transparent py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <label htmlFor="template-difficulty-filter" className="sr-only">
                  Filtrar por nível de dificuldade
                </label>
                <select
                  id="template-difficulty-filter"
                  value={selectedDifficulty}
                  onChange={(e) => setSelectedDifficulty(e.target.value)}
                  className="rounded-xl border border-white/10 bg-zinc-950/80 px-3.5 py-2.5 text-xs font-medium text-zinc-300 outline-none hover:border-white/20 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 cursor-pointer"
                >
                  <option value="all">Todas Dificuldades</option>
                  <option value="Iniciante">Iniciante</option>
                  <option value="Intermediário">Intermediário</option>
                  <option value="Avançado">Avançado</option>
                </select>

                <div className="h-6 w-[1px] bg-white/10 hidden sm:block" aria-hidden="true" />

                <div className="text-xs text-zinc-400 whitespace-nowrap px-2 font-mono" aria-live="polite">
                  {filteredTemplates.length} {filteredTemplates.length === 1 ? "template" : "templates"}
                </div>
              </div>
            </div>

            {/* Category Pills Navigation */}
            <div className="mt-6 flex flex-wrap items-center gap-2 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Categorias de templates">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                      isSelected
                        ? "bg-violet-600 text-white shadow-lg shadow-violet-600/25 border border-violet-500 font-semibold"
                        : "bg-zinc-900/80 text-zinc-400 border border-white/10 hover:border-white/20 hover:text-zinc-200 hover:bg-zinc-800/80"
                    }`}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
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
            /* Accessible Skeleton Loading State */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true" aria-label="Carregando templates...">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="flex flex-col justify-between rounded-2xl border border-white/5 bg-zinc-900/40 p-5 space-y-4 animate-pulse"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="h-11 w-11 rounded-xl bg-zinc-800/60" />
                      <div className="h-5 w-20 rounded-full bg-zinc-800/60" />
                    </div>
                    <div className="mt-4 h-5 w-3/4 rounded bg-zinc-800/60" />
                    <div className="mt-2 space-y-1.5">
                      <div className="h-3.5 w-full rounded bg-zinc-800/40" />
                      <div className="h-3.5 w-4/5 rounded bg-zinc-800/40" />
                    </div>
                    <div className="mt-4 flex gap-1.5">
                      <div className="h-5 w-16 rounded bg-zinc-800/40" />
                      <div className="h-5 w-20 rounded bg-zinc-800/40" />
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                    <div className="h-4 w-24 rounded bg-zinc-800/40" />
                    <div className="flex gap-2">
                      <div className="h-8 w-16 rounded-lg bg-zinc-800/60" />
                      <div className="h-8 w-14 rounded-lg bg-zinc-800/60" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : loadError ? (
            /* Actionable Error State */
            <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 mb-3 border border-rose-500/20">
                <AlertCircle className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-base font-bold text-zinc-100">Falha ao carregar galeria de templates</h3>
              <p className="mt-1.5 text-xs text-zinc-400 max-w-md">{loadError}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={loadTemplates}
                className="mt-5 border-white/10 text-zinc-200 hover:bg-white/5 gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Tentar novamente
              </Button>
            </div>
          ) : filteredTemplates.length === 0 ? (
            /* Brand Voice Structured Empty State (Diagnosis + Explanation + Unblocking CTA) */
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-zinc-950/60 py-16 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 border border-white/10 text-zinc-400 mb-3.5">
                <BookOpen className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-base font-bold text-zinc-200">Nenhum template encontrado para os filtros</h3>
              <p className="mt-1.5 text-xs text-zinc-400 max-w-md leading-relaxed">
                Não encontramos workflows que correspondam aos termos da pesquisa ou aos critérios de categoria e dificuldade aplicados.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("all");
                    setSelectedDifficulty("all");
                  }}
                  className="border-white/10 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                >
                  Limpar todos os filtros
                </Button>
                <Button
                  size="sm"
                  onClick={() => setImportModalOpen(true)}
                  className="bg-violet-600 hover:bg-violet-500 text-white gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  Importar Template JSON
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTemplates.map((tpl) => {
                const isCloning = cloneLoadingId === tpl.id;
                const nodeCount = tpl.workflow.nodes.length;

                return (
                  <article
                    key={tpl.id}
                    onClick={() => setPreviewTemplate(tpl)}
                    className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-zinc-900/50 p-5 transition-all duration-200 hover:border-violet-500/50 hover:bg-zinc-900/90 hover:shadow-xl hover:shadow-violet-500/10 cursor-pointer backdrop-blur-sm focus-within:ring-2 focus-within:ring-violet-500"
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
                          <Zap className="h-5 w-5" style={{ color: tpl.color || "#6366f1" }} aria-hidden="true" />
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 justify-end">
                          {tpl.featured && (
                            <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400 border border-amber-500/25">
                              <Sparkles className="h-3 w-3" aria-hidden="true" /> Destaque
                            </span>
                          )}
                          <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-zinc-300 border border-white/10">
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
                      <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Conectores suportados">
                        {tpl.connectors.map((connector) => (
                          <span
                            key={connector}
                            className="flex items-center gap-1.5 rounded-md bg-zinc-950/90 px-2 py-0.5 text-[11px] font-medium text-zinc-300 border border-white/10"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                            {connector}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Card Bottom: Metrics and Actions */}
                    <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 text-xs text-zinc-400 font-mono">
                        <span className="flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5 text-violet-400" aria-hidden="true" /> {nodeCount} nós
                        </span>
                        <span className="text-zinc-600">•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" /> {tpl.estimatedSetupMinutes}m
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
                          className="h-8 px-2.5 text-xs text-zinc-300 hover:text-zinc-50 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-violet-500"
                          title="Visualizar Grafo do Workflow"
                          aria-label={`Visualizar detalhes do template ${tpl.name}`}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => handleQuickUse(tpl, e)}
                          disabled={isCloning}
                          className="h-8 px-3 text-xs bg-violet-600 hover:bg-violet-500 text-white font-semibold shadow-md shadow-violet-600/20 focus-visible:ring-2 focus-visible:ring-violet-500"
                          aria-label={`Clonar e usar template ${tpl.name}`}
                        >
                          {isCloning ? "Clonando..." : "Usar"}
                        </Button>
                      </div>
                    </div>
                  </article>
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
              <label htmlFor="import-workflow-name" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Nome do Workflow (Opcional)
              </label>
              <input
                id="import-workflow-name"
                type="text"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="Ex: Meu Fluxo Importado"
                className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>

            <div>
              <label htmlFor="import-workflow-json" className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Conteúdo JSON do Workflow *
              </label>
              <textarea
                id="import-workflow-json"
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                rows={10}
                placeholder='{\n  "name": "Custom Flow",\n  "workflow": {\n    "nodes": [...],\n    "edges": [...]\n  }\n}'
                className="w-full rounded-lg border border-white/10 bg-zinc-900/90 font-mono text-xs text-zinc-200 p-3 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                required
                aria-describedby={importError ? "import-json-error" : undefined}
                aria-invalid={Boolean(importError)}
              />
            </div>

            {importError && (
              <div id="import-json-error" className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{importError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setImportModalOpen(false)}
                className="border-white/10 text-zinc-300 hover:text-zinc-100"
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
          <div className="flex h-96 items-center justify-center bg-[#09090b]">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        </AppLayout>
      }
    >
      <TemplatesMarketplaceContent />
    </Suspense>
  );
}

