"use client";

import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Copy, Check, ExternalLink, RefreshCw } from "lucide-react";

type Client = { id: string; label: string; group: "CLI" | "WEB" | "IDE"; type: "oauth" | "apitoken" | "both"; command: string; json: string };
const SERVER_DEFAULT = "https://api.agentflow.local/mcp/http";

const CLIENTS: Client[] = [
  { id: "claude-code", label: "Claude Code", group: "CLI", type: "both", command: 'claude mcp add --transport http agentflow $SERVER_URL --header "Authorization: Bearer $TOKEN"', json: JSON.stringify({ mcpServers: { agentflow: { type: "http", url: "$SERVER_URL", headers: { Authorization: "Bearer $TOKEN" } } } }, null, 2) },
  { id: "codex", label: "Muse", group: "CLI", type: "both", command: "codex mcp add agentflow --url $SERVER_URL\ncodex mcp login agentflow", json: JSON.stringify({ mcpServers: { agentflow: { url: "$SERVER_URL", bearerTokenEnv: "AGENTFLOW_TOKEN" } } }, null, 2) },
  { id: "gemini-cli", label: "Gemini CLI", group: "CLI", type: "both", command: 'gemini mcp add agentflow $SERVER_URL --header "Authorization: Bearer $TOKEN"', json: JSON.stringify({ mcpServers: { agentflow: { httpUrl: "$SERVER_URL", headers: { Authorization: "Bearer $TOKEN" } } }, null, 2) },
  { id: "claude-web", label: "Claude.ai", group: "WEB", type: "oauth", command: "One-click: Add to Claude.ai -> Authorize -> /mcp", json: JSON.stringify({ serverUrl: "$SERVER_URL", auth: "oauth" }, null, 2) },
  { id: "chatgpt", label: "ChatGPT", group: "WEB", type: "oauth", command: "Settings -> Connectors -> Add MCP server -> $SERVER_URL -> OAuth", json: JSON.stringify({ mcpServers: { agentflow: { serverUrl: "$SERVER_URL" } } }, null, 2) },
  { id: "cursor", label: "Cursor", group: "IDE", type: "both", command: "cursor --add-mcp agentflow $SERVER_URL", json: JSON.stringify({ mcpServers: { agentflow: { url: "$SERVER_URL", headers: { Authorization: "Bearer $TOKEN" } } } }, null, 2) },
  { id: "vscode", label: "VS Code", group: "IDE", type: "both", command: "VS Code -> MCP: Add Server -> $SERVER_URL", json: JSON.stringify({ servers: { agentflow: { type: "http", url: "$SERVER_URL", headers: { Authorization: "Bearer $TOKEN" } } } }, null, 2) },
  { id: "windsurf", label: "Windsurf", group: "IDE", type: "both", command: "Windsurf -> Settings -> MCP -> Add -> $SERVER_URL", json: JSON.stringify({ mcpServers: { agentflow: { serverUrl: "$SERVER_URL", headers: { Authorization: "Bearer $TOKEN" } } }, null, 2) },
];

function randomToken() {
  const a = [...Array(24)].map(() => Math.random().toString(36)[2]).join("");
  return `af_${a}`;
}

export default function McpPage() {
  const [enabled, setEnabled] = useState(true);
  const [serverUrl, setServerUrl] = useState(SERVER_DEFAULT);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"oauth" | "apikey">("oauth");
  const [selectedClient, setSelectedClient] = useState<Client>(CLIENTS[0]);
  const [token, setToken] = useState<string>("af_****nNkk");
  const [clientDropdown, setClientDropdown] = useState(false);

  const expanded = useMemo(() => ({
    server: serverUrl,
    token,
    command: selectedClient.command.replace(/\$SERVER_URL/g, serverUrl).replace(/\$TOKEN/g, token),
    json: selectedClient.json.replace(/\$SERVER_URL/g, serverUrl).replace(/\$TOKEN/g, token),
  }), [serverUrl, token, selectedClient]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <AppLayout>
      <div className="animate-in fade-in duration-300">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-50">Instance-level MCP</h1>
            <p className="mt-1 text-sm text-zinc-500">Expose AgentFlow as a Model Context Protocol server. Use OAuth or an API key; configure per-client commands.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">MCP status</span>
            <button
              onClick={() => setEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-zinc-700"}`}
              aria-label="Toggle MCP"
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className={`text-xs font-medium ${enabled ? "text-emerald-400" : "text-zinc-500"}`}>{enabled ? "Enabled" : "Disabled"}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-zinc-900 px-4 py-3"><p className="text-xs text-zinc-500">Workflows exposed</p><p className="mt-1 text-lg font-semibold text-white">3</p></div>
          <div className="rounded-lg border border-white/10 bg-zinc-900 px-4 py-3"><p className="text-xs text-zinc-500">Allowed callback</p><p className="mt-1 text-sm font-medium text-white">All</p></div>
          <div className="rounded-lg border border-white/10 bg-zinc-900 px-4 py-3"><p className="text-xs text-zinc-500">Connected clients</p><p className="mt-1 text-lg font-semibold text-white">0</p></div>
        </div>

        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900">
          <div className="flex gap-1 border-b border-white/10 p-1">
            {(["oauth", "apikey"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === tab ? "bg-violet-500 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"}`}>
                {tab === "oauth" ? "OAuth" : "API key"}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-5">
            <div>
              <label className="text-xs font-medium text-zinc-400">Server URL</label>
              <div className="mt-1.5 flex items-center gap-2">
                <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder={SERVER_DEFAULT} className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500 placeholder:text-zinc-600" />
                <button onClick={() => copy(serverUrl, "server")} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10">
                  {copied === "server" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />} {copied === "server" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Distribute this URL to clients. Keep the violet theme: primary actions stay violet, status green.</p>
            </div>

            {activeTab === "apikey" && (
              <div className="rounded-lg border border-white/10 bg-zinc-950 p-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-400">Access token</label>
                  <button onClick={() => setToken(randomToken())} className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-400 hover:bg-white/10"><RefreshCw className="h-3 w-3" /> Regenerate</button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-zinc-200">{token}</code>
                  <button onClick={() => copy(token, "token")} className="rounded-md border border-white/10 bg-white/5 p-2 text-zinc-400 hover:bg-white/10">{copied === "token" ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}</button>
                </div>
                <p className="mt-2 text-xs text-zinc-500">Use <span className="font-mono text-zinc-400">Authorization: Bearer $TOKEN</span> when your client does not support OAuth.</p>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-zinc-400">Your client</label>
              <div className="relative mt-1.5">
                <button onClick={() => setClientDropdown((v) => !v)} className="flex w-full items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/10">
                  <span>{selectedClient.label}</span><span className="text-xs text-zinc-500">{selectedClient.group} · {selectedClient.type}</span>
                </button>
                {clientDropdown && (
                  <div className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-white/10 bg-zinc-900 py-1 shadow-xl">
                    {(["CLI", "WEB", "IDE"] as const).map((group) => (
                      <div key={group}>
                        <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{group}</p>
                        {CLIENTS.filter((c) => c.group === group).map((c) => (
                          <button key={c.id} onClick={() => { setSelectedClient(c); setClientDropdown(false); }} className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/5 ${selectedClient.id === c.id ? "bg-violet-500/20 text-violet-300" : "text-zinc-300"}`}>
                            <span>{c.label}</span>{c.type === "oauth" && <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-xs text-emerald-400">OAuth</span>}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-400">Command</p>
                <button onClick={() => copy(expanded.command, "cmd")} className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">{copied === "cmd" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />} Copy</button>
              </div>
              <pre className="mt-1.5 overflow-auto rounded-md border border-white/10 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-300">{expanded.command}</pre>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-400">Configuration (JSON)</p>
                <button onClick={() => copy(expanded.json, "json")} className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">{copied === "json" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />} Copy</button>
              </div>
              <pre className="mt-1.5 overflow-auto rounded-md border border-white/10 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-300">{expanded.json}</pre>
            </div>

            {activeTab === "oauth" && (
              <div className="flex items-center gap-2 rounded-md border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-xs text-violet-300">
                <ExternalLink className="h-3.5 w-3.5" /> Authenticate via <span className="font-mono">/mcp</span> → redirect to OAuth consent. One-click “Add to {selectedClient.label}” when supported.
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
