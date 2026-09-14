import { z } from "zod";

export const RemoteWorkspaceUriSchema = z.string().regex(/^ssh:\/\//, "Must be an ssh:// URI");

export interface ParsedRemoteWorkspaceUri {
  raw: string;
  protocol: "ssh";
  username: string;
  host: string;
  port: number;
  remotePath: string;
}

export const RemoteWorkspaceConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  uri: RemoteWorkspaceUriSchema,
  sshKeyCredentialId: z.string().optional(),
  privateKey: z.string().optional(),
  password: z.string().optional(),
  strictHostKeyChecking: z.enum(["yes", "no", "accept-new"]).optional().default("accept-new"),
  knownHostsFile: z.string().optional(),
  orgId: z.string(),
  userId: z.string().optional(),
  keepaliveIntervalSec: z.number().min(1).max(3600).default(15),
  keepaliveCountMax: z.number().min(1).max(100).default(3),
  controlPersistSec: z.number().min(0).max(86400).default(600),
  autoReconnect: z.boolean().default(true),
});
export type RemoteWorkspaceConfig = z.infer<typeof RemoteWorkspaceConfigSchema>;

export const RemoteSessionStateSchema = z.object({
  workspaceId: z.string(),
  sessionId: z.string(), // oc-ws-<workspaceId>-<random>
  tunnelSocketPath: z.string().optional(),
  status: z.enum(["disconnected", "connecting", "connected", "reconnecting", "error", "closed"]),
  remotePath: stringSchema(),
  host: z.string(),
  port: z.number(),
  user: z.string(),
  latencyMs: z.number().optional(),
  lastHealthCheck: z.string(),
  tmuxSessionName: z.string(),
  activePanesCount: z.number().default(0),
  connectedAt: z.string().optional(),
  reconnectAttempts: z.number().default(0),
  lastError: z.string().optional(),
});
export type RemoteSessionState = z.infer<typeof RemoteSessionStateSchema>;

function stringSchema() {
  return z.string().default("/");
}

export const RemoteCommandRequestSchema = z.object({
  command: z.string(),
  cwd: z.string().optional(),
  timeoutMs: z.number().default(30000),
  env: z.record(z.string()).optional(),
});
export type RemoteCommandRequest = z.infer<typeof RemoteCommandRequestSchema>;

export const RemoteCommandResultSchema = z.object({
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number(),
});
export type RemoteCommandResult = z.infer<typeof RemoteCommandResultSchema>;
