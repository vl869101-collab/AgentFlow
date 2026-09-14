"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Database,
  Edit2,
  Eye,
  EyeOff,
  GitBranch,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Server,
  Terminal,
  Trash2,
  Workflow,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type EnvironmentType = "development" | "staging" | "production";

interface EnvVariable {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  description: string;
  updatedAt: string;
}

interface EnvConfig {
  id: EnvironmentType;
  name: string;
  badgeColor: string;
  instanceUrl: string;
  gitBranch: string;
  activeExecutions: number;
  syncStatus: "in-sync" | "drift" | "syncing";
}

export default function EnvironmentsPage() {
  const [activeEnv, setActiveEnv] = useState<EnvironmentType>("production");
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVar, setEditingVar] = useState<EnvVariable | null>(null);
  const [modalKey, setModalKey] = useState("");
  const [modalValue, setModalValue] = useState("");
  const [modalIsSecret, setModalIsSecret] = useState(true);
  const [modalDescription, setModalDescription] = useState("");

  const environments: Record<EnvironmentType, EnvConfig> = {
    development: {
      id: "development",
      name: "Development",
      badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/30",
      instanceUrl: "https://dev.flow.agentflow.internal",
      gitBranch: "develop",
      activeExecutions: 8,
      syncStatus: "in-sync",
    },
    staging: {
      id: "staging",
      name: "Staging / QA",
      badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/30",
      instanceUrl: "https://staging.flow.agentflow.internal",
      gitBranch: "staging",
      activeExecutions: 14,
      syncStatus: "in-sync",
    },
    production: {
      id: "production",
      name: "Production Cluster",
      badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      instanceUrl: "https://app.agentflow.io",
      gitBranch: "main",
      activeExecutions: 84,
      syncStatus: "in-sync",
    },
  };

  const [variables, setVariables] = useState<Record<EnvironmentType, EnvVariable[]>>({
    development: [
      { id: "d1", key: "API_BASE_URL", value: "https://api-dev.agentflow.internal/v1", isSecret: false, description: "Internal dev microservices gateway", updatedAt: "2 hours ago" },
      { id: "d2", key: "OPENAI_API_KEY", value: "••••••••••••", isSecret: true, description: "Sandbox OpenAI developer key", updatedAt: "1 day ago" },
      { id: "d3", key: "LOG_LEVEL", value: "debug", isSecret: false, description: "Verbose execution logging", updatedAt: "3 days ago" },
    ],
    staging: [
      { id: "s1", key: "API_BASE_URL", value: "https://api-staging.agentflow.internal/v1", isSecret: false, description: "QA testing backend gateway", updatedAt: "5 hours ago" },
      { id: "s2", key: "OPENAI_API_KEY", value: "••••••••••••", isSecret: true, description: "Staging OpenAI pool token", updatedAt: "2 days ago" },
      { id: "s3", key: "LOG_LEVEL", value: "info", isSecret: false, description: "Standard operational logs", updatedAt: "1 week ago" },
    ],
    production: [
      { id: "p1", key: "API_BASE_URL", value: "https://api.agentflow.io/v1", isSecret: false, description: "Production Core API Gateway", updatedAt: "Just now" },
      { id: "p2", key: "OPENAI_API_KEY", value: "••••••••••••", isSecret: true, description: "Enterprise tier OpenAI production key", updatedAt: "Yesterday" },
      { id: "p3", key: "STRIPE_SECRET_KEY", value: "••••••••••••", isSecret: true, description: "Production payment processing key", updatedAt: "3 days ago" },
      { id: "p4", key: "REDIS_CACHE_URL", value: "rediss://prod-redis.cluster:6379", isSecret: true, description: "Cluster caching broker URL", updatedAt: "1 week ago" },
      { id: "p5", key: "MAX_CONCURRENT_WORKFLOWS", value: "250", isSecret: false, description: "Worker thread concurrency limit", updatedAt: "2 weeks ago" },
    ],
  });

  function toggleReveal(id: string) {
    const next = new Set(revealedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setRevealedIds(next);
  }

  function handleCopy(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  }

  async function handleSyncEnvironment() {
    setSyncing(true);
    await new Promise((r) => setTimeout(r, 850));
    setSyncing(false);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  }

  function openCreateModal() {
    setEditingVar(null);
    setModalKey("");
    setModalValue("");
    setModalIsSecret(true);
    setModalDescription("");
    setModalOpen(true);
  }

  function openEditModal(v: EnvVariable) {
    setEditingVar(v);
    setModalKey(v.key);
    setModalValue(v.value);
    setModalIsSecret(v.isSecret);
    setModalDescription(v.description);
    setModalOpen(true);
  }

  function handleSaveVariable() {
    if (!modalKey.trim()) return;

    if (editingVar) {
      setVariables({
        ...variables,
        [activeEnv]: variables[activeEnv].map((v) =>
          v.id === editingVar.id
            ? {
                ...v,
                key: modalKey.trim().toUpperCase(),
                value: modalValue,
                isSecret: modalIsSecret,
                description: modalDescription,
                updatedAt: "Just now",
              }
            : v,
        ),
      });
    } else {
      const newVar: EnvVariable = {
        id: String(Date.now()),
        key: modalKey.trim().toUpperCase(),
        value: modalValue,
        isSecret: modalIsSecret,
        description: modalDescription,
        updatedAt: "Just now",
      };
      setVariables({
        ...variables,
        [activeEnv]: [newVar, ...variables[activeEnv]],
      });
    }
    setModalOpen(false);
  }

  function handleDeleteVariable(id: string) {
    setVariables({
      ...variables,
      [activeEnv]: variables[activeEnv].filter((v) => v.id !== id),
    });
  }

  const currentConfig = environments[activeEnv];
  const currentVars = variables[activeEnv] || [];

  return (
    <AppLayout>
      <div className="max-w-5xl space-y-8 animate-in fade-in duration-300 pb-16">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-zinc-50">Multi-Environment Variables</h1>
              <span className="rounded-full bg-violet-500/10 border border-violet-500/30 px-2.5 py-0.5 text-xs font-semibold text-violet-400">
                Enterprise CI/CD
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              Isolate environment configs between Dev, Staging, and Production with hardware-level AES-256 encryption.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleSyncEnvironment} loading={syncing} className="text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              Push Git Sync
            </Button>
            <Button onClick={openCreateModal} className="text-xs">
              <Plus className="h-3.5 w-3.5" />
              Add Variable
            </Button>
          </div>
        </div>

        {/* Saved Toast */}
        {savedNotice ? (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-zinc-900/95 px-4 py-3 text-xs text-emerald-300 shadow-2xl backdrop-blur-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Environment configurations pushed to target cluster instances.
          </div>
        ) : null}

        {/* Environment Selector Switcher */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(["development", "staging", "production"] as EnvironmentType[]).map((envKey) => {
            const config = environments[envKey];
            const isSelected = activeEnv === envKey;
            return (
              <button
                key={envKey}
                type="button"
                onClick={() => setActiveEnv(envKey)}
                className={`relative flex flex-col gap-3 rounded-xl border p-4 text-left transition-all duration-200 ${
                  isSelected
                    ? "border-violet-500/50 bg-violet-950/20 shadow-lg shadow-violet-950/30"
                    : "border-white/10 bg-zinc-900/70 hover:border-white/20 hover:bg-zinc-900"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${envKey === "production" ? "bg-emerald-400" : envKey === "staging" ? "bg-amber-400" : "bg-blue-400"}`} />
                    <span className="text-sm font-semibold text-zinc-100">{config.name}</span>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${config.badgeColor}`}>
                    {config.gitBranch}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-zinc-400">
                  <div className="truncate font-mono text-[11px] text-zinc-500">{config.instanceUrl}</div>
                  <div className="flex items-center justify-between pt-1 text-[11px]">
                    <span>{variables[envKey]?.length || 0} variables</span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Synced
                    </span>
                  </div>
                </div>
                {isSelected ? (
                  <span className="absolute -bottom-[1px] left-6 right-6 h-[2px] bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Environment Overview Banner */}
        <Card className="border border-white/10 bg-zinc-900/80 p-5">
          <div className="grid gap-6 sm:grid-cols-4 text-xs">
            <div>
              <span className="text-zinc-500 font-medium uppercase tracking-wider text-[10px]">Active Instance</span>
              <p className="mt-1 font-mono text-zinc-200 truncate">{currentConfig.instanceUrl}</p>
            </div>
            <div>
              <span className="text-zinc-500 font-medium uppercase tracking-wider text-[10px]">Connected Git Branch</span>
              <div className="mt-1 flex items-center gap-1.5 font-mono text-zinc-200">
                <GitBranch className="h-3.5 w-3.5 text-violet-400" />
                <span>{currentConfig.gitBranch}</span>
              </div>
            </div>
            <div>
              <span className="text-zinc-500 font-medium uppercase tracking-wider text-[10px]">Active Workflows</span>
              <p className="mt-1 text-zinc-200 font-semibold">{currentConfig.activeExecutions} workflows deployed</p>
            </div>
            <div>
              <span className="text-zinc-500 font-medium uppercase tracking-wider text-[10px]">KMS Encryption Key</span>
              <div className="mt-1 flex items-center gap-1.5 text-emerald-400">
                <Lock className="h-3.5 w-3.5" />
                <span>AES-256-GCM (Hardware HSM)</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Variables Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Layers className="h-4 w-4 text-violet-400" />
              <h3>{currentConfig.name} Key-Value Store ({currentVars.length})</h3>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-white/10 bg-zinc-900">
            <div className="grid grid-cols-[1.8fr_2.5fr_1.2fr_0.8fr] gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-medium text-zinc-400">
              <span>Variable Key &amp; Description</span>
              <span>Value (Decrypted on Execution)</span>
              <span>Last Modified</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-white/5">
              {currentVars.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">
                  No variables defined for {currentConfig.name}. Click &quot;Add Variable&quot; to configure keys.
                </div>
              ) : (
                currentVars.map((v) => {
                  const isRevealed = revealedIds.has(v.id);
                  return (
                    <div key={v.id} className="grid grid-cols-[1.8fr_2.5fr_1.2fr_0.8fr] items-center gap-2 px-4 py-3 text-xs">
                      <div>
                        <div className="flex items-center gap-1.5 font-mono font-semibold text-zinc-100">
                          {v.isSecret ? <Lock className="h-3 w-3 text-amber-400 shrink-0" /> : null}
                          <span className="truncate">{v.key}</span>
                        </div>
                        {v.description ? (
                          <p className="mt-0.5 text-[11px] text-zinc-500 truncate">{v.description}</p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex-1 font-mono text-zinc-300 bg-zinc-950/60 rounded px-2.5 py-1.5 border border-white/5 truncate">
                          {v.isSecret && !isRevealed ? "••••••••••••••••••••••••" : v.value}
                        </div>
                        {v.isSecret ? (
                          <button
                            type="button"
                            onClick={() => toggleReveal(v.id)}
                            className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                            title={isRevealed ? "Hide secret" : "Reveal secret"}
                          >
                            {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 text-zinc-400" />}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleCopy(v.id, v.value)}
                          className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                          title="Copy value"
                        >
                          {copiedId === v.id ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>

                      <div className="text-zinc-500 text-[11px]">{v.updatedAt}</div>

                      <div className="flex items-center justify-end gap-2 text-right">
                        <button
                          type="button"
                          onClick={() => openEditModal(v)}
                          className="p-1 text-zinc-400 hover:text-violet-400 transition-colors"
                          title="Edit variable"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteVariable(v.id)}
                          className="p-1 text-zinc-500 hover:text-rose-400 transition-colors"
                          title="Delete variable"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Modal for Add / Edit */}
        {modalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
            <div className="w-full max-w-lg rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-semibold text-zinc-100">
                  {editingVar ? "Edit Environment Variable" : "Add Environment Variable"}
                </h3>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${currentConfig.badgeColor}`}>
                  {currentConfig.name}
                </span>
              </div>

              <div className="space-y-3 pt-2">
                <Input
                  label="Variable Key (Uppercase)"
                  value={modalKey}
                  onChange={(e) => setModalKey(e.target.value)}
                  placeholder="e.g. STRIPE_WEBHOOK_SECRET"
                />
                <Input
                  label="Value"
                  value={modalValue}
                  onChange={(e) => setModalValue(e.target.value)}
                  placeholder="Enter variable or secret value"
                  type={modalIsSecret ? "password" : "text"}
                />
                <Input
                  label="Description / Purpose"
                  value={modalDescription}
                  onChange={(e) => setModalDescription(e.target.value)}
                  placeholder="e.g. Production Stripe endpoint webhook signing key"
                />
                <label className="flex items-center gap-2.5 pt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modalIsSecret}
                    onChange={(e) => setModalIsSecret(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-zinc-800 text-violet-600 accent-violet-600"
                  />
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">Encrypt as sensitive secret</p>
                    <p className="text-[11px] text-zinc-500">
                      Masked in logs and only decrypted in worker runtime execution sandbox.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
                <Button variant="secondary" onClick={() => setModalOpen(false)} className="text-xs">
                  Cancel
                </Button>
                <Button onClick={handleSaveVariable} className="text-xs">
                  <Save className="h-3.5 w-3.5" />
                  {editingVar ? "Update Variable" : "Save Variable"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Documentation Footer */}
        <div className="flex items-center justify-between text-xs text-zinc-500 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-zinc-400" />
            <span>AgentFlow Environment Sync Agent (Git-backed)</span>
          </div>
          <span>Referenced in expressions via <code className="text-violet-400">$env.VARIABLE_NAME</code></span>
        </div>
      </div>
    </AppLayout>
  );
}
