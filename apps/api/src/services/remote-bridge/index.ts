import { EventEmitter } from "events";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { OtpPairingManager } from "./otp-manager.js";
import {
  BridgeClientMessageSchema,
  type BridgeClientMessage,
  type BridgeServerMessage,
} from "./types.js";

// Singleton compartilhado de OtpPairingManager para RemoteBridge
export const sharedOtpManager = new OtpPairingManager();

interface BridgeClientConnection {
  ws: WebSocket;
  userId?: string;
  orgId?: string;
  authenticated: boolean;
  subscriptions: Set<string>; // paneIds or missionIds
}

export type OrgValidatorFn = (resourceType: "pane" | "mission", resourceId: string, orgId: string) => Promise<boolean> | boolean;

export class RemoteBridgeServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, BridgeClientConnection> = new Map();
  private otpManager: OtpPairingManager;
  private port: number;
  private orgValidator?: OrgValidatorFn;
  private resourceOrgMap: Map<string, string> = new Map(); // resourceId -> orgId cache/registry

  constructor(options: { port?: number; otpManager?: OtpPairingManager; orgValidator?: OrgValidatorFn } = {}) {
    super();
    this.port = options.port || parseInt(process.env.REMOTE_BRIDGE_PORT || "8789", 10);
    this.otpManager = options.otpManager || sharedOtpManager;
    this.orgValidator = options.orgValidator;
  }

  public getOtpManager(): OtpPairingManager {
    return this.otpManager;
  }

  /**
   * Registra vínculo de tenant para um recurso (pane ou mission)
   */
  public registerResourceOrg(resourceId: string, orgId: string): void {
    this.resourceOrgMap.set(resourceId, orgId);
  }

  /**
   * Define validador customizado de acesso por org
   */
  public setOrgValidator(validator: OrgValidatorFn): void {
    this.orgValidator = validator;
  }

  /**
   * Valida se a organização do cliente tem permissão para acessar o recurso
   * Adota política estrita Fail-Closed (Deny-by-Default) conforme SEC-02.
   */
  private async validateOrgAccess(resourceType: "pane" | "mission", resourceId: string, orgId?: string): Promise<boolean> {
    if (!orgId) return false;

    // Se houver validador customizado (ex: banco de dados / RBAC)
    if (this.orgValidator) {
      return await this.orgValidator(resourceType, resourceId, orgId);
    }

    // Se o recurso estiver registrado no mapa de recursos local
    const mappedOrg = this.resourceOrgMap.get(resourceId);
    if (mappedOrg) {
      return mappedOrg === orgId;
    }

    // FAIL-CLOSED (SEC-02): Proíbe acesso por padrão se o recurso não pertencer comprovadamente à org
    return false;
  }

  /**
   * Inicia o servidor WebSocket na porta 8789
   */
  public async start(): Promise<void> {
    if (this.wss) return;

    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      const client: BridgeClientConnection = {
        ws,
        authenticated: false,
        subscriptions: new Set(),
      };
      this.clients.set(ws, client);

      ws.on("message", async (raw: string) => {
        try {
          const parsed = JSON.parse(raw.toString());
          const message = BridgeClientMessageSchema.parse(parsed);
          await this.handleClientMessage(client, message);
        } catch (err: unknown) {
          this.sendToClient(client, {
            type: "error",
            message: err instanceof Error ? err.message : "Invalid message envelope",
          });
        }
      });

      ws.on("close", () => {
        this.clients.delete(ws);
      });
    });

    this.emit("started", { port: this.port });
  }

  private async handleClientMessage(client: BridgeClientConnection, msg: BridgeClientMessage): Promise<void> {
    if (msg.type === "auth") {
      const verified = this.otpManager.verifyPairingToken(msg.token);
      if (verified.valid) {
        client.authenticated = true;
        client.userId = verified.userId;
        client.orgId = verified.orgId;
        this.sendToClient(client, {
          type: "auth.success",
          userId: verified.userId,
          orgId: verified.orgId,
        });
        this.emit("client:authenticated", { userId: verified.userId, orgId: verified.orgId });
      } else {
        this.sendToClient(client, {
          type: "error",
          message: "Authentication token invalid or expired",
          code: "AUTH_FAILED",
        });
      }
      return;
    }

    if (msg.type === "ping") {
      this.sendToClient(client, { type: "pong" });
      return;
    }

    // Require authentication for operational commands
    if (!client.authenticated) {
      this.sendToClient(client, {
        type: "error",
        message: "Unauthenticated: send auth message first",
        code: "UNAUTHENTICATED",
      });
      return;
    }

    if (msg.type === "pane.subscribe") {
      const allowed = await this.validateOrgAccess("pane", msg.paneId, client.orgId);
      if (!allowed) {
        this.sendToClient(client, {
          type: "error",
          message: `Access denied to pane ${msg.paneId} for org ${client.orgId}`,
          code: "FORBIDDEN_ORG",
        });
        return;
      }
      client.subscriptions.add(msg.paneId);
      this.emit("pane:subscribed", { paneId: msg.paneId, userId: client.userId, orgId: client.orgId });
    } else if (msg.type === "pane.input") {
      const allowed = await this.validateOrgAccess("pane", msg.paneId, client.orgId);
      if (!allowed) {
        this.sendToClient(client, {
          type: "error",
          message: `Access denied to pane ${msg.paneId} for org ${client.orgId}`,
          code: "FORBIDDEN_ORG",
        });
        return;
      }
      this.emit("pane:input", { paneId: msg.paneId, data: msg.data, userId: client.userId, orgId: client.orgId });
    } else if (msg.type === "pane.resize") {
      const allowed = await this.validateOrgAccess("pane", msg.paneId, client.orgId);
      if (!allowed) {
        this.sendToClient(client, {
          type: "error",
          message: `Access denied to pane ${msg.paneId} for org ${client.orgId}`,
          code: "FORBIDDEN_ORG",
        });
        return;
      }
      this.emit("pane:resize", { paneId: msg.paneId, cols: msg.cols, rows: msg.rows, orgId: client.orgId });
    } else if (msg.type === "mission.subscribe") {
      const allowed = await this.validateOrgAccess("mission", msg.missionId, client.orgId);
      if (!allowed) {
        this.sendToClient(client, {
          type: "error",
          message: `Access denied to mission ${msg.missionId} for org ${client.orgId}`,
          code: "FORBIDDEN_ORG",
        });
        return;
      }
      client.subscriptions.add(msg.missionId);
      this.emit("mission:subscribed", { missionId: msg.missionId, userId: client.userId, orgId: client.orgId });
    }
  }

  /**
   * Envia stream de output de terminal para os clientes inscritos no paneId
   */
  public broadcastPaneOutput(paneId: string, data: string): void {
    const payload: BridgeServerMessage = {
      type: "pane.output",
      paneId,
      data,
      timestamp: new Date().toISOString(),
    };

    for (const client of this.clients.values()) {
      if (client.authenticated && client.subscriptions.has(paneId)) {
        this.sendToClient(client, payload);
      }
    }
  }

  private sendToClient(client: BridgeClientConnection, msg: BridgeServerMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(msg));
    }
  }

  public async stop(): Promise<void> {
    if (!this.wss) return;

    for (const ws of this.clients.keys()) {
      ws.close();
    }
    this.clients.clear();

    await new Promise<void>((resolve) => {
      this.wss?.close(() => resolve());
    });
    this.wss = null;
  }
}
