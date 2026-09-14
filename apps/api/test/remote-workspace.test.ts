import test from "node:test";
import assert from "node:assert/strict";
import { parseRemoteWorkspaceUri, formatRemoteWorkspaceUri } from "../src/services/remote-workspace/uri-parser.js";
import { RemoteWorkspaceEngine } from "../src/services/remote-workspace/index.js";
import { buildApp } from "../src/server.js";

test("Remote Workspace URI Parser parses various ssh:// schemes", () => {
  const parsed1 = parseRemoteWorkspaceUri("ssh://ubuntu@vps.agentflow.internal:2222/var/www/app");
  assert.equal(parsed1.protocol, "ssh");
  assert.equal(parsed1.username, "ubuntu");
  assert.equal(parsed1.host, "vps.agentflow.internal");
  assert.equal(parsed1.port, 2222);
  assert.equal(parsed1.remotePath, "/var/www/app");

  const parsed2 = parseRemoteWorkspaceUri("ssh://cluster-node-1/home/agent/workspace");
  assert.equal(parsed2.host, "cluster-node-1");
  assert.equal(parsed2.port, 22);
  assert.equal(parsed2.remotePath, "/home/agent/workspace");

  const formatted = formatRemoteWorkspaceUri({
    username: "deploy",
    host: "192.168.1.100",
    port: 2200,
    remotePath: "srv/projects",
  });
  assert.equal(formatted, "ssh://deploy@192.168.1.100:2200/srv/projects");
});

test("RemoteWorkspaceEngine manages workspace connection lifecycle and tmux session naming", async () => {
  const engine = new RemoteWorkspaceEngine();

  const ws = engine.registerWorkspace({
    name: "Production VPS Node",
    uri: "ssh://root@vps-prod.internal:22/opt/agentflow",
    orgId: "org_alpha",
  });

  assert.ok(ws.id);
  assert.equal(ws.name, "Production VPS Node");

  const session = await engine.connectWorkspace(ws.id!);
  assert.equal(session.workspaceId, ws.id);
  assert.equal(session.status, "connected");
  assert.ok(session.tmuxSessionName.startsWith("oc-ws-"));
  assert.ok(session.tunnelSocketPath?.includes("cm-vps-prod.internal"));

  const cmdRes = await engine.executeCommand(ws.id!, {
    command: "uptime",
  });
  // Executa comando via SSH; em ambiente onde o host vps-prod.internal não é resolvido ou offline, exitCode !== 0 e stderr capturada
  assert.ok(typeof cmdRes.exitCode === "number");
  assert.ok(typeof cmdRes.durationMs === "number");

  const disconnected = await engine.disconnectWorkspace(ws.id!);
  assert.equal(disconnected, true);
  assert.equal(engine.getSession(ws.id!)?.status, "disconnected");
});

test("Remote Workspace REST API routes register, connect and list", async () => {
  process.env.ALLOW_MEMORY_DB = "1";
  delete process.env.DATABASE_URL;
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-agentflow-remote-ws";
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const app = await buildApp({ logger: false });
  const token = app.jwt.sign({ sub: "usr_test_admin", email: "admin@agentflow.io", orgId: "org_alpha" });

  const createRes = await app.inject({
    method: "POST",
    url: "/api/remote-workspaces",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      name: "Dev GPU Instance",
      uri: "ssh://developer@gpu-node-99.internal:22/home/developer/code",
      orgId: "org_alpha",
    },
  });

  assert.equal(createRes.statusCode, 201);
  const created = createRes.json();
  assert.ok(created.id);

  const connectRes = await app.inject({
    method: "POST",
    url: `/api/remote-workspaces/${created.id}/connect`,
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(connectRes.statusCode, 200);
  const connected = connectRes.json();
  assert.equal(connected.success, true);
  assert.equal(connected.data.status, "connected");

  const listRes = await app.inject({
    method: "GET",
    url: "/api/remote-workspaces",
    headers: {
      authorization: `Bearer ${token}`,
      "x-org-id": "org_alpha",
    },
  });

  assert.equal(listRes.statusCode, 200);
  const list = listRes.json();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1);
  // Garante que segredos não vazam na resposta (SEC-03)
  assert.equal(list[0].privateKey, undefined);
  assert.equal(list[0].password, undefined);

  // SEC-01 & SEC-02: Execução com comando seguro e bloqueio de cross-org
  const execRes = await app.inject({
    method: "POST",
    url: `/api/remote-workspaces/${created.id}/exec`,
    headers: {
      authorization: `Bearer ${token}`,
      "x-org-id": "org_alpha",
    },
    payload: {
      command: "echo 'safe-remote-command'; whoami",
      cwd: "/home/developer",
      env: { SEC_MODE: "hardened" },
    },
  });
  assert.equal(execRes.statusCode, 200);
  const execData = execRes.json();
  assert.equal(execData.success, true);
  assert.ok(typeof execData.data.exitCode === "number");

  // Cross-org injection/IDOR bloqueado (SEC-02)
  const crossOrgExec = await app.inject({
    method: "POST",
    url: `/api/remote-workspaces/${created.id}/exec`,
    headers: {
      authorization: `Bearer ${token}`,
      "x-org-id": "org_malicious_attacker",
    },
    payload: { command: "id" },
  });
  assert.equal(crossOrgExec.statusCode, 403);
  assert.equal(crossOrgExec.json().code, "FORBIDDEN_ORG");

  await app.close();
});
