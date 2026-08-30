"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Ellipsis, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { credentials as credentialsApi, type Credential } from "@/lib/api";
import { cn } from "@/lib/utils";

type Provider = {
  id: string;
  name: string;
  mark: string;
  markClass: string;
  icon?: string;
  supportsResponsesApi?: boolean;
};

type ProviderConfig = {
  enabled: boolean;
  credentialId: string;
  contextWindow: number;
  responsesApiEnabled: boolean;
  updatedAt?: string;
};

type StoredChatSettings = {
  chatEnabled?: boolean;
  providers?: Record<string, ProviderConfig>;
};

const SETTINGS_KEY = "agentflow_chat_provider_settings";

const providers: Provider[] = [
  {
    id: "openai",
    name: "OpenAI",
    mark: "O",
    markClass: "bg-white/10 text-zinc-100",
    icon: "openai",
    supportsResponsesApi: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    mark: "AI",
    markClass: "bg-orange-400/10 text-orange-200",
    icon: "anthropic",
  },
  {
    id: "google",
    name: "Google",
    mark: "G",
    markClass: "bg-blue-500/10 text-blue-300",
    icon: "google",
  },
  {
    id: "azure-key",
    name: "Azure (API Key)",
    mark: "A",
    markClass: "bg-sky-500/10 text-sky-300",
    icon: "microsoftazure",
  },
  {
    id: "azure-entra",
    name: "Azure (Entra ID)",
    mark: "A",
    markClass: "bg-sky-500/10 text-sky-300",
    icon: "microsoftazure",
  },
  {
    id: "ollama",
    name: "Ollama",
    mark: "O",
    markClass: "bg-zinc-100/10 text-zinc-300",
    icon: "ollama",
  },
  {
    id: "bedrock",
    name: "AWS Bedrock",
    mark: "aws",
    markClass: "bg-orange-500/10 text-orange-300",
    icon: "amazonaws",
  },
  {
    id: "vercel",
    name: "Vercel AI Gateway",
    mark: "V",
    markClass: "bg-white/10 text-zinc-100",
    icon: "vercel",
  },
  {
    id: "grok",
    name: "xAI Grok",
    mark: "x",
    markClass: "bg-white/10 text-zinc-200",
    icon: "x",
  },
  { id: "groq", name: "Groq", mark: "G", markClass: "bg-red-500/10 text-red-300" },
  {
    id: "openrouter",
    name: "OpenRouter",
    mark: "R",
    markClass: "bg-cyan-500/10 text-cyan-300",
    icon: "openrouter",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    mark: "D",
    markClass: "bg-indigo-500/10 text-indigo-300",
    icon: "deepseek",
  },
  { id: "cohere", name: "Cohere", mark: "C", markClass: "bg-rose-500/10 text-rose-300" },
  {
    id: "mistral",
    name: "Mistral Cloud",
    mark: "M",
    markClass: "bg-amber-500/10 text-amber-300",
    icon: "mistralai",
  },
  {
    id: "nvidia",
    name: "NVIDIA Nemotron",
    mark: "N",
    markClass: "bg-lime-500/10 text-lime-300",
    icon: "nvidia",
  },
];

const defaultProviderConfig: ProviderConfig = {
  enabled: true,
  credentialId: "",
  contextWindow: 20,
  responsesApiEnabled: true,
};

function SettingsSubNav() {
  const items = [
    { label: "Personal", href: "/personal" },
    { label: "Users", href: "/settings/users" },
    { label: "AI Usage", href: "/settings/ai-usage" },
    { label: "Roles", badge: "New", href: "/settings/roles" },
    { label: "External Secrets", href: "/settings/external-secrets" },
    { label: "Environments", href: "/settings/environments" },
    { label: "SSO", href: "/settings/sso" },
    { label: "Security & policies", href: "/settings/security" },
    { label: "LDAP", href: "/settings/ldap" },
    { label: "Log Streaming", href: "/settings/log-streaming" },
    { label: "OpenTelemetry", href: "/settings/opentelemetry" },
    { label: "Community nodes", href: "/settings/community-nodes" },
    { label: "Instance-level MCP", href: "/mcp" },
    { label: "Chat", badge: "Preview", active: true, href: "/chat" },
    { label: "AI Assistant", badge: "Preview", href: "/assistant" },
  ];

  return (
    <aside className="hidden w-52 shrink-0 border-r border-white/10 bg-zinc-900/30 lg:block">
      <div className="p-3">
        <Link
          href="/settings"
          className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
        >
          <ChevronLeft className="h-3 w-3" /> Settings
        </Link>
        <div className="mt-4 space-y-0.5">
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors",
                item.active
                  ? "bg-white/10 text-zinc-50"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
              )}
            >
              <span>{item.label}</span>
              {item.badge ? (
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[9px] font-semibold",
                    item.badge === "New"
                      ? "bg-white/10 text-zinc-400"
                      : "bg-violet-500/20 text-violet-300",
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
        <p className="mt-6 px-2.5 text-xs font-medium text-orange-500">Version 2.36.5</p>
      </div>
    </aside>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
        checked ? "bg-emerald-500" : "bg-zinc-700",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function ProviderMark({ provider }: { provider: Provider }) {
  const [iconLoaded, setIconLoaded] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md text-[10px] font-bold",
        provider.markClass,
      )}
    >
      <span className={cn("transition-opacity", iconLoaded && "opacity-0")}>{provider.mark}</span>
      {provider.icon && !iconFailed ? (
        <img
          src={`https://api.iconify.design/simple-icons:${provider.icon}.svg?height=28&color=%23ffffff`}
          alt=""
          draggable={false}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setIconLoaded(true)}
          onError={() => setIconFailed(true)}
          className={cn(
            "absolute h-4 w-4 object-contain transition-opacity",
            iconLoaded ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}
    </span>
  );
}

function formatUpdatedAt(updatedAt?: string) {
  if (!updatedAt) return "-";
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function matchesProvider(credential: Credential, provider: Provider) {
  const value = credential.provider.toLowerCase();
  const aliases =
    provider.id === "nvidia" ? ["nvidia", "nemotron"] : [provider.id, provider.name.toLowerCase()];
  return aliases.some((alias) => value.includes(alias));
}

export default function ChatSettingsPage() {
  const [chatEnabled, setChatEnabled] = useState(true);
  const [providerConfigs, setProviderConfigs] = useState<Record<string, ProviderConfig>>({});
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [menuProviderId, setMenuProviderId] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [draft, setDraft] = useState<ProviderConfig>(defaultProviderConfig);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedCredentials = useMemo(
    () =>
      selectedProvider
        ? credentials.filter((credential) => matchesProvider(credential, selectedProvider))
        : [],
    [credentials, selectedProvider],
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredChatSettings;
        if (typeof parsed.chatEnabled === "boolean") setChatEnabled(parsed.chatEnabled);
        if (parsed.providers && typeof parsed.providers === "object")
          setProviderConfigs(parsed.providers);
      }
    } catch {
      // Ignore malformed local preferences and keep the safe defaults.
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ chatEnabled, providers: providerConfigs }),
    );
  }, [chatEnabled, providerConfigs, settingsLoaded]);

  useEffect(() => {
    let active = true;
    credentialsApi
      .list()
      .then((items) => {
        if (active) setCredentials(items);
      })
      .catch(() => {
        if (active) setCredentials([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!menuProviderId) return;
    const onDocumentPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node))
        setMenuProviderId(null);
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuProviderId(null);
    };
    document.addEventListener("pointerdown", onDocumentPointerDown);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [menuProviderId]);

  function openProvider(provider: Provider) {
    setMenuProviderId(null);
    setSelectedProvider(provider);
    setDraft({ ...defaultProviderConfig, ...providerConfigs[provider.id] });
  }

  function confirmProvider() {
    if (!selectedProvider) return;
    setProviderConfigs((current) => ({
      ...current,
      [selectedProvider.id]: { ...draft, updatedAt: new Date().toISOString() },
    }));
    setSelectedProvider(null);
  }

  function refreshCredentials() {
    credentialsApi
      .list()
      .then(setCredentials)
      .catch(() => setCredentials([]));
  }

  return (
    <AppLayout>
      <div className="flex min-h-[calc(100vh-4rem)] -m-6 overflow-hidden">
        <SettingsSubNav />
        <main className="min-w-0 flex-1 bg-[#171717] px-5 py-8 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Chat</h1>
                  <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-200">
                    Preview
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                  Configure which providers Chat can use. Credentials stay in the encrypted
                  credential vault.
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 sm:justify-start">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
                  <Sparkles className="h-4 w-4 text-orange-300" />
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-200">Enable Chat</p>
                  <p className="text-[11px] text-zinc-600">Available across AgentFlow</p>
                </div>
                <Toggle checked={chatEnabled} label="Enable Chat" onChange={setChatEnabled} />
              </div>
            </div>

            <section className="mt-9" aria-labelledby="providers-heading">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 id="providers-heading" className="text-base font-medium text-zinc-100">
                    Providers
                  </h2>
                  <p className="mt-1 text-xs text-zinc-600">
                    Choose credentials and provider defaults for Chat.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={refreshCredentials}
                  className="rounded-md border border-white/10 p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                  aria-label="Refresh credentials"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-4 overflow-x-auto pb-1">
                <div className="min-w-[620px] overflow-visible rounded-xl border border-white/10 bg-[#202020] shadow-2xl shadow-black/10">
                  <div className="grid grid-cols-[minmax(11rem,1.7fr)_minmax(5rem,0.8fr)_minmax(5rem,0.7fr)_2.5rem] gap-4 border-b border-white/[0.07] bg-white/[0.025] px-4 py-3 text-[11px] font-semibold text-zinc-400 sm:px-5">
                    <span>Provider</span>
                    <span>Models</span>
                    <span>Last edited</span>
                    <span className="sr-only">Actions</span>
                  </div>
                  <div className="divide-y divide-white/[0.07]">
                    {providers.map((provider, index) => {
                      const config = providerConfigs[provider.id];
                      const isMenuOpen = menuProviderId === provider.id;
                      return (
                        <div
                          key={provider.id}
                          className="grid grid-cols-[minmax(11rem,1.7fr)_minmax(5rem,0.8fr)_minmax(5rem,0.7fr)_2.5rem] items-center gap-4 px-4 py-3.5 text-sm transition-colors hover:bg-white/[0.025] sm:px-5"
                        >
                          <span className="flex min-w-0 items-center gap-2.5 font-medium text-zinc-100">
                            <ProviderMark provider={provider} />
                            <span className="truncate">{provider.name}</span>
                          </span>
                          <span className="text-xs text-zinc-300">All models</span>
                          <span className="text-xs text-zinc-500">
                            {formatUpdatedAt(config?.updatedAt)}
                          </span>
                          <div
                            className="relative flex justify-end"
                            ref={isMenuOpen ? menuRef : undefined}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setMenuProviderId((current) =>
                                  current === provider.id ? null : provider.id,
                                )
                              }
                              className={cn(
                                "group relative flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
                                isMenuOpen
                                  ? "bg-white/10 text-zinc-100"
                                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200",
                              )}
                              aria-label={`${provider.name} options`}
                              aria-expanded={isMenuOpen}
                            >
                              <Ellipsis className="h-4 w-4" />
                              {!isMenuOpen ? (
                                <span className="pointer-events-none absolute right-0 top-9 z-20 whitespace-nowrap rounded-md border border-white/10 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                                  Edit provider
                                </span>
                              ) : null}
                            </button>
                            {isMenuOpen ? (
                              <div
                                className={cn(
                                  "absolute right-0 z-30 w-36 rounded-lg border border-white/10 bg-zinc-800 p-1 shadow-2xl shadow-black/50",
                                  index >= providers.length - 2 ? "bottom-9" : "top-9",
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => openProvider(provider)}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-zinc-200 hover:bg-white/10"
                                >
                                  Edit provider
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      <Modal
        open={selectedProvider !== null}
        onClose={() => setSelectedProvider(null)}
        title={selectedProvider ? `Configure ${selectedProvider.name}` : undefined}
        className="max-w-xl"
      >
        {selectedProvider ? (
          <div className="space-y-7">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-medium text-zinc-100">Enable {selectedProvider.name}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Allow Chat workflows to select this provider.
                </p>
              </div>
              <Toggle
                checked={draft.enabled}
                label={`Enable ${selectedProvider.name}`}
                onChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
              />
            </div>

            <div>
              <label htmlFor="default-credential" className="text-sm font-medium text-zinc-200">
                Default credential
              </label>
              <select
                id="default-credential"
                value={draft.credentialId}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, credentialId: event.target.value }))
                }
                className="mt-2 h-10 w-full rounded-md border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-200 outline-none transition-colors focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
              >
                <option value="">Select</option>
                {selectedCredentials.map((credential) => (
                  <option key={credential.id} value={credential.id}>
                    {credential.name}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-zinc-500">
                {selectedCredentials.length
                  ? "Credentials are encrypted and scoped to this workspace."
                  : `No ${selectedProvider.name} credential is available yet.`}{" "}
                <Link
                  href="/credentials"
                  className="inline-flex items-center gap-1 text-orange-300 hover:text-orange-200"
                >
                  Manage credentials <ExternalLink className="h-3 w-3" />
                </Link>
              </p>
            </div>

            {selectedProvider.supportsResponsesApi ? (
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-sm font-medium text-zinc-100">Use Responses API</p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">
                    Disable when this credential uses an OpenAI-compatible base URL that does not
                    support the Responses API.
                  </p>
                </div>
                <Toggle
                  checked={draft.responsesApiEnabled}
                  label="Use Responses API"
                  onChange={(responsesApiEnabled) =>
                    setDraft((current) => ({ ...current, responsesApiEnabled }))
                  }
                />
              </div>
            ) : null}

            <div>
              <p className="text-sm font-medium text-zinc-100">Context window (messages)</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Number of previous message and reply pairs available to Chat for this provider.
              </p>
              <div className="mt-3 flex h-10 overflow-hidden rounded-md border border-white/10 bg-zinc-950">
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      contextWindow: Math.max(0, current.contextWindow - 1),
                    }))
                  }
                  className="w-10 border-r border-white/10 text-lg text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                  aria-label="Decrease context window"
                >
                  -
                </button>
                <output
                  className="flex flex-1 items-center justify-center text-sm font-medium text-zinc-100"
                  aria-live="polite"
                >
                  {draft.contextWindow}
                </output>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      contextWindow: Math.min(100, current.contextWindow + 1),
                    }))
                  }
                  className="w-10 border-l border-white/10 text-lg text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                  aria-label="Increase context window"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-white/10 pt-5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSelectedProvider(null)}
                className="rounded-md"
              >
                Cancel
              </Button>
              <button
                type="button"
                onClick={confirmProvider}
                className="rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
              >
                Confirm
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </AppLayout>
  );
}
