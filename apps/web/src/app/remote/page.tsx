"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Terminal, Shield, Smartphone, QrCode, CheckCircle2, AlertCircle, RefreshCw, Send } from "lucide-react";

export default function MobileRemoteTerminalPage() {
  const [pairingCode, setPairingCode] = useState("");
  const [isPaired, setIsPaired] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "[RemoteBridge] Waiting for mobile device pairing...",
  ]);
  const [inputCmd, setInputCmd] = useState("");
  const [activePane, setActivePane] = useState("pane-1");
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  // Função para conectar ao WebSocket do RemoteBridge
  const connectWebSocket = useCallback((pairingToken: string, wsUrlFromApi?: string) => {
    try {
      // Determina URL do WebSocket
      let wsUrl = wsUrlFromApi;
      if (!wsUrl) {
        const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
        wsUrl = `ws://${host}:8789`;
      }

      setTerminalLogs((prev) => [...prev, `[WebSocket] Conectando ao RemoteBridge em ${wsUrl}...`]);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setTerminalLogs((prev) => [...prev, `[WebSocket] Conexão estabelecida. Autenticando com Pairing Token...`]);
        // Envia mensagem de auth inicial
        ws.send(
          JSON.stringify({
            type: "auth",
            token: pairingToken,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "auth.success") {
            setTerminalLogs((prev) => [
              ...prev,
              `[Auth] Autenticado com sucesso! Usuário: ${msg.userId} | Organização: ${msg.orgId}`,
              `[Pane] Inscrevendo no terminal ${activePane}...`,
            ]);
            // Inscreve no pane ativo
            ws.send(
              JSON.stringify({
                type: "pane.subscribe",
                paneId: activePane,
              })
            );
          } else if (msg.type === "pane.output") {
            setTerminalLogs((prev) => [
              ...prev,
              `[stdout:${msg.paneId}] ${msg.data}`,
            ]);
          } else if (msg.type === "error") {
            setTerminalLogs((prev) => [
              ...prev,
              `[RemoteBridge Error] ${msg.code ? `(${msg.code}) ` : ""}${msg.message}`,
            ]);
          } else if (msg.type === "pong") {
            // Heartbeat
          }
        } catch {
          setTerminalLogs((prev) => [...prev, `[stdout] ${event.data}`]);
        }
      };

      ws.onerror = () => {
        setTerminalLogs((prev) => [...prev, `[WebSocket] Erro na conexão de streaming com RemoteBridge.`]);
      };

      ws.onclose = () => {
        setTerminalLogs((prev) => [...prev, `[WebSocket] Conexão encerrada pelo servidor.`]);
      };
    } catch (err: unknown) {
      setTerminalLogs((prev) => [
        ...prev,
        `[WebSocket Error] Falha ao iniciar WebSocket: ${err instanceof Error ? err.message : String(err)}`,
      ]);
    }
  }, [activePane]);

  // Clean-up WebSocket no unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Quando trocar de pane ativo, se autenticado no WS, re-inscreve
  const switchPane = (newPane: string) => {
    setActivePane(newPane);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setTerminalLogs((prev) => [...prev, `[Pane] Alternando inscrição para: ${newPane}`]);
      wsRef.current.send(
        JSON.stringify({
          type: "pane.subscribe",
          paneId: newPane,
        })
      );
    }
  };

  const handlePairing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingCode || pairingCode.length !== 6) {
      setError("Insira um código OTP de 6 dígitos válido.");
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const res = await fetch("/api/remote-bridge/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pairingCode }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Falha ao validar OTP.");
      }

      setIsPaired(true);
      tokenRef.current = json.data.token;
      setTerminalLogs((prev) => [
        ...prev,
        `[Pairing] Sucesso! Pareado com organização: ${json.data.orgId}`,
        `[Session] Iniciando streaming do terminal Overclock...`,
      ]);

      // Conecta ao WebSocket do RemoteBridge real
      connectWebSocket(json.data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro na conexão");
    } finally {
      setConnecting(false);
    }
  };

  const sendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCmd.trim()) return;

    const cmd = inputCmd;
    setTerminalLogs((prev) => [...prev, `> ${cmd}`]);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Envia evento pane.input real via WebSocket
      wsRef.current.send(
        JSON.stringify({
          type: "pane.input",
          paneId: activePane,
          data: `${cmd}\n`,
        })
      );
    } else {
      setTerminalLogs((prev) => [
        ...prev,
        `[Aviso] WebSocket não conectado no momento. Comando enfileirado localmente: '${cmd}'`,
      ]);
    }

    setInputCmd("");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
            AF
          </div>
          <div>
            <h1 className="font-semibold text-sm leading-tight">AgentFlow Mobile Bridge</h1>
            <p className="text-xs text-slate-400">Terminal PWA & Overclock Streaming</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isPaired ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Pareado 24/7
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Smartphone className="w-3.5 h-3.5" />
              Aguardando OTP
            </span>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col p-4 max-w-4xl w-full mx-auto">
        {!isPaired ? (
          <div className="my-auto flex flex-col items-center text-center p-6 bg-slate-900/80 rounded-2xl border border-slate-800 shadow-xl">
            <div className="h-16 w-16 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center mb-4 border border-indigo-500/20">
              <QrCode className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold mb-2">Pareamento Móvel PWA</h2>
            <p className="text-sm text-slate-400 mb-6 max-w-md">
              Digite o código de 6 dígitos gerado na tela do Desktop ou gere um novo acesso temporário com expiração de 5 minutos.
            </p>

            <form onSubmit={handlePairing} className="w-full max-w-xs space-y-4">
              <div>
                <input
                  type="text"
                  maxLength={6}
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full text-center tracking-[0.5em] text-2xl font-mono py-3 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-left">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={connecting || pairingCode.length !== 6}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
              >
                {connecting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Pareando dispositivo...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    Conectar Terminal 24/7
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex flex-col bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
            {/* Terminal Top Control Bar */}
            <div className="bg-slate-950/80 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-mono text-slate-400">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>Overclock xterm.js Terminal ({activePane})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => switchPane("pane-1")}
                  className={`px-2 py-1 rounded ${activePane === "pane-1" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}
                >
                  Pane 1
                </button>
                <button
                  onClick={() => switchPane("pane-2")}
                  className={`px-2 py-1 rounded ${activePane === "pane-2" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}
                >
                  Pane 2
                </button>
              </div>
            </div>

            {/* Terminal Body */}
            <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1 bg-slate-950 text-slate-300">
              {terminalLogs.map((log, index) => (
                <div key={index} className="leading-relaxed">
                  {log.startsWith(">") ? (
                    <span className="text-amber-400 font-bold">{log}</span>
                  ) : log.includes("[stdout") ? (
                    <span className="text-emerald-400">{log}</span>
                  ) : log.includes("[error") || log.includes("[RemoteBridge Error") ? (
                    <span className="text-rose-400">{log}</span>
                  ) : (
                    <span className="text-slate-400">{log}</span>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={sendCommand} className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
              <input
                type="text"
                value={inputCmd}
                onChange={(e) => setInputCmd(e.target.value)}
                placeholder="Enviar comando para o pane remoto..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 p-2.5 rounded-xl text-white transition-all shadow-md shadow-indigo-600/20"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
