import { EventEmitter } from "events";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server as HttpServer } from "http";
import * as crypto from "crypto";
import {
  RelayMessageFrameSchema,
  AgentRegisterPayloadSchema,
  TunnelDataPayloadSchema,
  type RelayMessageFrame,
  type AgentRegisterPayload,
  type TunnelDataPayload,
  type PairInitResponse,
  type PairConfirmResponse,
  type ActiveTunnelSession,
} from "./types.js";

export interface EphemeralPairing {
  otp: string;
  tunnelId: string;
  nodeId: string;
  orgId: string;
  userId: string;
  handshakeToken: string;
  createdAt: number;
  expiresAt: number;
  burned: boolean;
  attempts: number;
}

export interface NodeConnection {
  ws: WebSocket;
  tunnelId: string;
  nodeId: string;
  nodeName: string;
  orgId: string;
  capabilities: string[];
  metadata?: Record<string, unknown>;
  connectedAt: number;
  lastHeartbeat: number;
}

export interface MobileClientConnection {
  ws: WebSocket;
  tunnelId: string;
  sessionToken: string;
  userId: string;
  orgId: string;
  deviceId?: string;
  connectedAt: number;
}

export interface RelayServerOptions {
  port?: number;
  server?: HttpServer;
  path?: string;
  secret?: string;
  otpTtlSeconds?: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
}

export class RelayServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private port?: number;
  private server?: HttpServer;
  private path: string;
  private secret: string;
  private otpTtlSeconds: number;
  private heartbeatIntervalMs: number;
  private heartbeatTimeoutMs: number;

  // Armazenamento em memória
  private nodes: Map<string, NodeConnection> = new Map(); // tunnelId -> NodeConnection
  private nodeByWs: Map<WebSocket, string> = new Map(); // ws -> tunnelId
  private mobileClients: Map<WebSocket, MobileClientConnection> = new Map(); // ws -> MobileClientConnection
  private clientsByTunnel: Map<string, Set<WebSocket>> = new Map(); // tunnelId -> Set<Mobile ws>
  private pairings: Map<string, EphemeralPairing> = new Map(); // otp -> EphemeralPairing
  private pairingsByToken: Map<string, EphemeralPairing> = new Map(); // handshakeToken -> EphemeralPairing

  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: RelayServerOptions = {}) {
    super();
    this.port = options.port;
    this.server = options.server;
    this.path = options.path || "/v1/agent-tunnel";
    this.otpTtlSeconds = options.otpTtlSeconds || 120;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 15000;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs || 45000;

    if (options.secret) {
      this.secret = options.secret;
    } else if (process.env.RELAY_SECRET && process.env.RELAY_SECRET.trim().length >= 16) {
      this.secret = process.env.RELAY_SECRET.trim();
    } else if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
      this.secret = process.env.JWT_SECRET.trim();
    } else {
      this.secret = crypto.randomBytes(32).toString("hex");
    }

    this.startPeriodicCleanup();
  }

  public getSecret(): string {
    return this.secret;
  }

  /**
   * Inicia o WebSocket Server
   */
  public async start(): Promise<void> {
    if (this.wss) return;

    if (this.server) {
      this.wss = new WebSocketServer({ server: this.server, path: this.path });
    } else if (this.port) {
      this.wss = new WebSocketServer({ port: this.port, path: this.path });
    } else {
      // Cria porta efêmera ou padrão 8090 se não especificado
      const defaultPort = parseInt(process.env.RELAY_PORT || "8090", 10);
      this.wss = new WebSocketServer({ port: defaultPort, path: this.path });
      this.port = defaultPort;
    }

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.emit("started", { port: this.port, path: this.path });
  }

  /**
   * Trata nova conexão WebSocket (pode ser Nó Dial-Out ou Cliente Mobile)
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const clientType = url.searchParams.get("type") || "unknown";
    const authHeader = req.headers["authorization"] || url.searchParams.get("token") || "";

    ws.on("message", async (raw: Buffer | string) => {
      try {
        const text = typeof raw === "string" ? raw : raw.toString("utf8");
        const parsed = JSON.parse(text);
        const frame = RelayMessageFrameSchema.parse(parsed);

        await this.routeFrame(ws, frame);
      } catch (err: unknown) {
        this.sendFrame(ws, {
          version: "1.0.0",
          id: crypto.randomUUID(),
          tunnelId: "unknown",
          type: "ERROR",
          timestamp: Date.now(),
          payload: {
            error: err instanceof Error ? err.message : "Malformed relay frame envelope",
          },
        });
      }
    });

    ws.on("close", () => {
      this.handleDisconnect(ws);
    });

    ws.on("error", (err) => {
      this.emit("ws:error", { error: err.message });
      this.handleDisconnect(ws);
    });
  }

  /**
   * Roteia mensagens do protocolo Relay
   */
  private async routeFrame(ws: WebSocket, frame: RelayMessageFrame): Promise<void> {
    switch (frame.type) {
      case "AGENT_REGISTER": {
        const payload = AgentRegisterPayloadSchema.parse(frame.payload);
        this.registerNode(ws, frame.tunnelId || `tun_${payload.nodeId}`, payload);
        break;
      }

      case "HEARTBEAT_PING": {
        const tunnelId = this.nodeByWs.get(ws);
        if (tunnelId && this.nodes.has(tunnelId)) {
          const node = this.nodes.get(tunnelId)!;
          node.lastHeartbeat = Date.now();
          this.sendFrame(ws, {
            version: "1.0.0",
            id: crypto.randomUUID(),
            tunnelId,
            type: "HEARTBEAT_PONG",
            timestamp: Date.now(),
            payload: { status: "ok" },
          });
        }
        break;
      }

      case "HEARTBEAT_PONG": {
        const tunnelId = this.nodeByWs.get(ws);
        if (tunnelId && this.nodes.has(tunnelId)) {
          this.nodes.get(tunnelId)!.lastHeartbeat = Date.now();
        }
        break;
      }

      case "TUNNEL_DATA": {
        // Tunelamento bidirecional
        const isNode = this.nodeByWs.has(ws);
        if (isNode) {
          // De Node para Mobile Clients deste túnel
          const tunnelId = this.nodeByWs.get(ws)!;
          this.broadcastToMobileClients(tunnelId, frame);
        } else {
          // De Mobile Client para o Node do túnel
          const client = this.mobileClients.get(ws);
          if (client) {
            this.sendToNode(client.tunnelId, frame);
          } else {
            this.sendError(ws, "Unauthenticated client", "UNAUTHORIZED");
          }
        }
        break;
      }

      case "VOICE_COMMAND_INPUT": {
        const client = this.mobileClients.get(ws);
        if (client) {
          this.sendToNode(client.tunnelId, frame);
          this.emit("voice:command", { tunnelId: client.tunnelId, payload: frame.payload });
        } else {
          this.sendError(ws, "Unauthenticated client", "UNAUTHORIZED");
        }
        break;
      }

      case "VOICE_FEEDBACK_OUTPUT": {
        const isNode = this.nodeByWs.has(ws);
        if (isNode) {
          const tunnelId = this.nodeByWs.get(ws)!;
          this.broadcastToMobileClients(tunnelId, frame);
          this.emit("voice:feedback", { tunnelId, payload: frame.payload });
        }
        break;
      }

      case "OVERCLOCK_IPC_DISPATCH": {
        const client = this.mobileClients.get(ws);
        if (client) {
          this.sendToNode(client.tunnelId, frame);
        }
        break;
      }

      case "CLIENT_PAIR_REQUEST": {
        // Mobile tentando conectar ao túnel via SessionToken
        const token = (frame.payload as { sessionToken?: string })?.sessionToken;
        if (!token) {
          this.sendError(ws, "Session token required", "UNAUTHORIZED");
          return;
        }
        const verified = this.verifySessionToken(token);
        if (!verified.valid || verified.tunnelId !== frame.tunnelId) {
          this.sendError(ws, "Invalid or expired session token", "UNAUTHORIZED");
          return;
        }

        const clientConn: MobileClientConnection = {
          ws,
          tunnelId: frame.tunnelId,
          sessionToken: token,
          userId: verified.userId,
          orgId: verified.orgId,
          connectedAt: Date.now(),
        };

        this.mobileClients.set(ws, clientConn);
        if (!this.clientsByTunnel.has(frame.tunnelId)) {
          this.clientsByTunnel.set(frame.tunnelId, new Set());
        }
        this.clientsByTunnel.get(frame.tunnelId)!.add(ws);

        this.sendFrame(ws, {
          version: "1.0.0",
          id: crypto.randomUUID(),
          tunnelId: frame.tunnelId,
          type: "TUNNEL_ESTABLISHED",
          timestamp: Date.now(),
          payload: {
            status: "connected",
            tunnelId: frame.tunnelId,
            userId: verified.userId,
          },
        });

        this.emit("mobile:connected", { tunnelId: frame.tunnelId, userId: verified.userId });
        break;
      }

      default:
        this.emit("frame:unhandled", frame);
    }
  }

  /**
   * Registra VPS Dial-Out ativa
   */
  public registerNode(ws: WebSocket, tunnelId: string, payload: AgentRegisterPayload): void {
    // Validação da API Key do Nó
    const validKey = this.validateApiKey(payload.apiKey);
    if (!validKey) {
      this.sendError(ws, "Invalid agent API key or HMAC signature", "AUTH_FAILED");
      ws.close(4001, "Auth Failed");
      return;
    }

    const nodeConn: NodeConnection = {
      ws,
      tunnelId,
      nodeId: payload.nodeId,
      nodeName: payload.nodeName || `vps-${payload.nodeId.slice(0, 6)}`,
      orgId: "org-default",
      capabilities: payload.capabilities,
      metadata: payload.metadata,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    // Remove conexão anterior com o mesmo tunnelId se houver
    if (this.nodes.has(tunnelId)) {
      const oldNode = this.nodes.get(tunnelId)!;
      try {
        oldNode.ws.close();
      } catch {}
      this.nodeByWs.delete(oldNode.ws);
    }

    this.nodes.set(tunnelId, nodeConn);
    this.nodeByWs.set(ws, tunnelId);

    this.sendFrame(ws, {
      version: "1.0.0",
      id: crypto.randomUUID(),
      tunnelId,
      type: "TUNNEL_ESTABLISHED",
      timestamp: Date.now(),
      payload: {
        status: "registered",
        tunnelId,
        nodeId: payload.nodeId,
      },
    });

    this.emit("node:registered", { tunnelId, nodeId: payload.nodeId });
  }

  /**
   * Valida chave de API da VPS
   */
  public validateApiKey(apiKey: string): boolean {
    if (!apiKey || typeof apiKey !== "string") return false;
    if (apiKey === this.secret) return true;
    if (apiKey.startsWith("af_node_") || apiKey.startsWith("apk_") || apiKey.length >= 16) {
      return true;
    }
    return false;
  }

  /**
   * Inicia processo de pareamento móvel gerando OTP efêmero (120s) e QR Payload
   */
  public initPairing(params: {
    nodeId?: string;
    tunnelId?: string;
    orgId?: string;
    userId?: string;
    relayHost?: string;
    ttlSeconds?: number;
  }): PairInitResponse {
    this.cleanExpiredPairings();

    // Se nenhum tunnelId/nodeId fornecido, tenta associar ao primeiro nó online
    let targetTunnelId = params.tunnelId;
    let targetNodeId = params.nodeId || "node-vps";

    if (!targetTunnelId) {
      if (this.nodes.size > 0) {
        const first = Array.from(this.nodes.values())[0];
        targetTunnelId = first.tunnelId;
        targetNodeId = first.nodeId;
      } else {
        targetTunnelId = `tun_${targetNodeId}`;
      }
    }

    const ttlSeconds = params.ttlSeconds || this.otpTtlSeconds;
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;

    // Gera OTP de 6 dígitos numéricos
    let otp = "";
    let attempts = 0;
    do {
      otp = Math.floor(100000 + crypto.randomInt(900000)).toString();
      attempts++;
    } while (this.pairings.has(otp) && attempts < 10);

    // Formata OTP amigável: "749-218"
    const formattedOtp = `${otp.slice(0, 3)}-${otp.slice(3)}`;

    // Cria token efêmero de handshake HMAC
    const handshakeToken = crypto
      .createHmac("sha256", this.secret)
      .update(`${targetTunnelId}:${otp}:${now}:${expiresAt}`)
      .digest("hex");

    const relayHost = params.relayHost || process.env.RELAY_HOST || "relay.agentflow.local";

    const pairingRecord: EphemeralPairing = {
      otp,
      tunnelId: targetTunnelId,
      nodeId: targetNodeId,
      orgId: params.orgId || "org-default",
      userId: params.userId || "user-admin",
      handshakeToken,
      createdAt: now,
      expiresAt,
      burned: false,
      attempts: 0,
    };

    this.pairings.set(otp, pairingRecord);
    this.pairings.set(formattedOtp, pairingRecord);
    this.pairingsByToken.set(handshakeToken, pairingRecord);

    // QR Payload padrão para PWA / Mobile Camera
    const qrPayload = JSON.stringify({
      app: "AgentFlow-Jarvis",
      version: "1.0.0",
      relayHost,
      tunnelId: targetTunnelId,
      otp: formattedOtp,
      handshakeToken,
      expiresAt: new Date(expiresAt).toISOString(),
    });

    return {
      otp: formattedOtp,
      tunnelId: targetTunnelId,
      relayHost,
      handshakeToken,
      qrPayload,
      expiresAt: new Date(expiresAt).toISOString(),
      ttlSeconds,
    };
  }

  /**
   * Confirma pareamento, valida OTP/HandshakeToken e emite SessionToken de 30 dias
   */
  public confirmPairing(params: {
    otp: string;
    handshakeToken?: string;
    deviceId?: string;
  }): PairConfirmResponse {
    this.cleanExpiredPairings();

    const normalizedOtp = params.otp.replace(/[^0-9]/g, "");
    let record = this.pairings.get(normalizedOtp);

    if (!record && params.handshakeToken) {
      record = this.pairingsByToken.get(params.handshakeToken);
    }

    const now = Date.now();
    if (!record) {
      throw new Error("Invalid or expired pairing OTP");
    }

    if (record.burned) {
      throw new Error("Pairing OTP has already been used");
    }

    if (now > record.expiresAt) {
      this.pairings.delete(record.otp);
      throw new Error("Pairing OTP has expired");
    }

    record.attempts += 1;
    if (record.attempts > 3) {
      record.burned = true;
      this.pairings.delete(record.otp);
      throw new Error("Maximum verification attempts exceeded for OTP");
    }

    // Queima o OTP (Single-Use)
    record.burned = true;
    this.pairings.delete(record.otp);
    this.pairings.delete(`${record.otp.slice(0, 3)}-${record.otp.slice(3)}`);
    this.pairingsByToken.delete(record.handshakeToken);

    // Gera SessionToken assinado
    const sessionExpiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 dias
    const rawPayload = `${record.userId}:${record.orgId}:${record.tunnelId}:${now}:${sessionExpiresAt}`;
    const sig = crypto.createHmac("sha256", this.secret).update(rawPayload).digest("hex");
    const sessionToken = Buffer.from(`${rawPayload}:${sig}`).toString("base64url");

    const relayWsUrl = `wss://${process.env.RELAY_HOST || "relay.agentflow.local"}/v1/agent-tunnel`;

    return {
      success: true,
      tunnelId: record.tunnelId,
      sessionToken,
      relayWsUrl,
      nodeId: record.nodeId,
      expiresAt: new Date(sessionExpiresAt).toISOString(),
    };
  }

  /**
   * Valida SessionToken para conexões móveis persistentes
   */
  public verifySessionToken(token: string): {
    valid: boolean;
    userId: string;
    orgId: string;
    tunnelId: string;
  } {
    try {
      const decoded = Buffer.from(token, "base64url").toString("utf8");
      const parts = decoded.split(":");
      if (parts.length !== 6) {
        return { valid: false, userId: "", orgId: "", tunnelId: "" };
      }

      const [userId, orgId, tunnelId, issuedAt, expiresAt, signature] = parts;
      const expectedSig = crypto
        .createHmac("sha256", this.secret)
        .update(`${userId}:${orgId}:${tunnelId}:${issuedAt}:${expiresAt}`)
        .digest("hex");

      const sigBuffer = Buffer.from(signature, "hex");
      const expectedSigBuffer = Buffer.from(expectedSig, "hex");

      if (
        sigBuffer.length !== expectedSigBuffer.length ||
        !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
      ) {
        return { valid: false, userId: "", orgId: "", tunnelId: "" };
      }

      if (Date.now() > parseInt(expiresAt, 10)) {
        return { valid: false, userId: "", orgId: "", tunnelId: "" };
      }

      return { valid: true, userId, orgId, tunnelId };
    } catch {
      return { valid: false, userId: "", orgId: "", tunnelId: "" };
    }
  }

  /**
   * Encaminha frame para o Nó VPS correspondente
   */
  public sendToNode(tunnelId: string, frame: RelayMessageFrame): boolean {
    const node = this.nodes.get(tunnelId);
    if (!node || node.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.sendFrame(node.ws, frame);
    return true;
  }

  /**
   * Encaminha frame do Nó para todos os Mobile Clients conectados ao túnel
   */
  public broadcastToMobileClients(tunnelId: string, frame: RelayMessageFrame): void {
    const clients = this.clientsByTunnel.get(tunnelId);
    if (!clients) return;

    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendFrame(ws, frame);
      }
    }
  }

  private sendFrame(ws: WebSocket, frame: RelayMessageFrame): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame));
    }
  }

  private sendError(ws: WebSocket, message: string, code?: string): void {
    this.sendFrame(ws, {
      version: "1.0.0",
      id: crypto.randomUUID(),
      tunnelId: "system",
      type: "ERROR",
      timestamp: Date.now(),
      payload: { error: message, code },
    });
  }

  /**
   * Trata desconexões
   */
  private handleDisconnect(ws: WebSocket): void {
    // Se for Node
    if (this.nodeByWs.has(ws)) {
      const tunnelId = this.nodeByWs.get(ws)!;
      this.nodeByWs.delete(ws);
      this.nodes.delete(tunnelId);
      this.emit("node:disconnected", { tunnelId });
    }

    // Se for Mobile
    if (this.mobileClients.has(ws)) {
      const client = this.mobileClients.get(ws)!;
      this.mobileClients.delete(ws);
      const group = this.clientsByTunnel.get(client.tunnelId);
      if (group) {
        group.delete(ws);
        if (group.size === 0) {
          this.clientsByTunnel.delete(client.tunnelId);
        }
      }
      this.emit("mobile:disconnected", { tunnelId: client.tunnelId, userId: client.userId });
    }
  }

  /**
   * Limpeza periódica de pares expirados e nós zumbis
   */
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanExpiredPairings();
      this.checkZombieNodes();
    }, 15000);

    const timer = this.cleanupInterval as unknown as { unref?: () => void };
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  }

  private cleanExpiredPairings(): void {
    const now = Date.now();
    for (const [key, pairing] of this.pairings.entries()) {
      if (now > pairing.expiresAt || pairing.burned) {
        this.pairings.delete(key);
      }
    }
    for (const [token, pairing] of this.pairingsByToken.entries()) {
      if (now > pairing.expiresAt || pairing.burned) {
        this.pairingsByToken.delete(token);
      }
    }
  }

  private checkZombieNodes(): void {
    const now = Date.now();
    for (const [tunnelId, node] of this.nodes.entries()) {
      if (now - node.lastHeartbeat > this.heartbeatTimeoutMs) {
        try {
          node.ws.close(4000, "Heartbeat Timeout");
        } catch {}
        this.nodes.delete(tunnelId);
        this.nodeByWs.delete(node.ws);
        this.emit("node:timeout", { tunnelId });
      }
    }
  }

  /**
   * Retorna lista de sessões de túneis ativas
   */
  public getActiveSessions(): ActiveTunnelSession[] {
    const sessions: ActiveTunnelSession[] = [];
    for (const [tunnelId, node] of this.nodes.entries()) {
      const clientCount = this.clientsByTunnel.get(tunnelId)?.size || 0;
      sessions.push({
        tunnelId,
        nodeId: node.nodeId,
        nodeName: node.nodeName,
        orgId: node.orgId,
        connectedAt: node.connectedAt,
        lastHeartbeat: node.lastHeartbeat,
        capabilities: node.capabilities,
        clientCount,
        status: clientCount > 0 ? "paired" : "online",
      });
    }
    return sessions;
  }

  /**
   * Encerra o servidor e conexões
   */
  public async stop(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const node of this.nodes.values()) {
      try {
        node.ws.close();
      } catch {}
    }
    for (const client of this.mobileClients.values()) {
      try {
        client.ws.close();
      } catch {}
    }

    this.nodes.clear();
    this.nodeByWs.clear();
    this.mobileClients.clear();
    this.clientsByTunnel.clear();
    this.pairings.clear();
    this.pairingsByToken.clear();

    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss?.close(() => resolve());
      });
      this.wss = null;
    }
  }
}

// Instância Singleton compartilhada para uso na API
export const sharedRelayServer = new RelayServer();
