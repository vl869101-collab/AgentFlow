import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { BotRuntimeEngine } from "./bot-engine.js";

const PORT = parseInt(process.env.BOT_PORT || "8080", 10);
const engine = new BotRuntimeEngine();

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "agentflow-bot", timestamp: new Date().toISOString() }));
    return;
  }

  if (url.pathname === "/api/bot/state") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, data: engine.getState() }));
    return;
  }

  if (url.pathname === "/api/bot/mode" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { mode } = JSON.parse(body);
        const newState = engine.setMode(mode);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data: newState }));
      } catch (err: unknown) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
      }
    });
    return;
  }

  if (url.pathname === "/api/bot/action" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const actionData = JSON.parse(body);
        const result = await engine.executeBrowserAction(actionData);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data: result }));
      } catch (err: unknown) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

const wss = new WebSocketServer({ server, path: "/ws/bot" });

wss.on("connection", (ws: WebSocket) => {
  // Send current state on connection
  ws.send(JSON.stringify({ type: "init", state: engine.getState(), tasks: engine.getTasks() }));

  const stateListener = (state: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "state:update", state }));
    }
  };

  const actionListener = (action: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "action:executed", action }));
    }
  };

  engine.on("state:change", stateListener);
  engine.on("action:executed", actionListener);

  ws.on("message", async (data: string) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "set_mode") {
        engine.setMode(msg.mode);
      } else if (msg.type === "execute_action") {
        await engine.executeBrowserAction(msg.action);
      } else if (msg.type === "mcp_tool") {
        await engine.invokeMcpTool(msg.serverName, msg.toolName, msg.args);
      }
    } catch (err: unknown) {
      ws.send(JSON.stringify({ type: "error", error: err instanceof Error ? err.message : String(err) }));
    }
  });

  ws.on("close", () => {
    engine.off("state:change", stateListener);
    engine.off("action:executed", actionListener);
  });
});

export async function bootstrap() {
  await engine.start();
  server.listen(PORT, () => {
    console.log(`[AgentFlowBot] Server listening on http://localhost:${PORT}`);
    console.log(`[AgentFlowBot] WebSocket server ready on ws://localhost:${PORT}/ws/bot`);
    console.log(`[AgentFlowBot] noVNC bridge target: http://localhost:${process.env.NOVNC_PORT || 6080}`);
  });
}

if (process.env.NODE_ENV !== "test") {
  bootstrap().catch(console.error);
}

export { engine, server };
