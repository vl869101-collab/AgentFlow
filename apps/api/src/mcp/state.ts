// In-memory MCP server state: enabled flag + connected clients counter.
// Not persisted — resets on process restart, which is fine for the MCP surface.

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes without activity = disconnected
const CLEANUP_INTERVAL_MS = 60 * 1000;

type Session = {
  id: string;
  lastSeen: number;
};

const sessions = new Map<string, Session>();

let enabled = true;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.lastSeen > SESSION_TTL_MS) sessions.delete(id);
    }
  }, CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();
}

export function isMcpEnabled(): boolean {
  return enabled;
}

export function setMcpEnabled(value: boolean): void {
  enabled = value;
}

export function registerSession(sessionId: string): void {
  startCleanup();
  sessions.set(sessionId, { id: sessionId, lastSeen: Date.now() });
}

export function touchSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) session.lastSeen = Date.now();
}

export function unregisterSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function connectedClients(): number {
  return sessions.size;
}

export function activeSessionIds(): string[] {
  return Array.from(sessions.keys());
}
