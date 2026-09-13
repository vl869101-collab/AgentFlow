import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { RelayServer } from "../src/services/relay/relay-server.js";
import { buildApp } from "../src/server.js";

test("RelayServer initiates pairing OTP and confirms single-use token", () => {
  const server = new RelayServer({ secret: "test-relay-super-secret-key-12345" });

  const init = server.initPairing({
    nodeId: "vps-test-node-01",
    orgId: "org-alpha",
    userId: "usr-admin",
    relayHost: "relay.test.local",
    ttlSeconds: 120,
  });

  assert.ok(init.otp);
  assert.ok(/^\d{3}-\d{3}$/.test(init.otp));
  assert.equal(init.tunnelId, "tun_vps-test-node-01");
  assert.ok(init.handshakeToken);
  assert.ok(init.qrPayload.includes("AgentFlow-Jarvis"));

  // First confirmation succeeds
  const confirmed = server.confirmPairing({
    otp: init.otp,
    handshakeToken: init.handshakeToken,
  });

  assert.equal(confirmed.success, true);
  assert.equal(confirmed.tunnelId, "tun_vps-test-node-01");
  assert.equal(confirmed.nodeId, "vps-test-node-01");
  assert.ok(confirmed.sessionToken);

  // Validate session token
  const validation = server.verifySessionToken(confirmed.sessionToken);
  assert.equal(validation.valid, true);
  assert.equal(validation.userId, "usr-admin");
  assert.equal(validation.orgId, "org-alpha");
  assert.equal(validation.tunnelId, "tun_vps-test-node-01");

  // Reusing same OTP fails (single-use burned)
  assert.throws(
    () =>
      server.confirmPairing({
        otp: init.otp,
        handshakeToken: init.handshakeToken,
      }),
    { message: /already been used|Invalid or expired/ }
  );
});

test("RelayServer WebSocket lifecycle and node registration", async () => {
  const relayPort = 19091;
  const server = new RelayServer({ port: relayPort, path: "/v1/agent-tunnel" });
  await server.start();

  const ws = new WebSocket(`ws://127.0.0.1:${relayPort}/v1/agent-tunnel`);

  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => {
      // Register node
      ws.send(
        JSON.stringify({
          version: "1.0.0",
          id: "msg-1",
          tunnelId: "tun_vps-99",
          type: "AGENT_REGISTER",
          timestamp: Date.now(),
          payload: {
            nodeId: "vps-99",
            nodeName: "VPS Production",
            apiKey: "af_node_test_key_12345",
            capabilities: ["vnc", "novnc", "pty", "jarvis"],
          },
        })
      );
    });

    ws.on("message", (raw) => {
      const parsed = JSON.parse(raw.toString());
      if (parsed.type === "TUNNEL_ESTABLISHED") {
        assert.equal(parsed.tunnelId, "tun_vps-99");
        assert.equal(parsed.payload.status, "registered");
        resolve();
      }
    });

    ws.on("error", reject);
  });

  // Verify active sessions
  const sessions = server.getActiveSessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].nodeId, "vps-99");
  assert.equal(sessions[0].tunnelId, "tun_vps-99");

  // Send Heartbeat Ping
  await new Promise<void>((resolve) => {
    ws.on("message", (raw) => {
      const parsed = JSON.parse(raw.toString());
      if (parsed.type === "HEARTBEAT_PONG") {
        assert.equal(parsed.payload.status, "ok");
        resolve();
      }
    });

    ws.send(
      JSON.stringify({
        version: "1.0.0",
        id: "msg-2",
        tunnelId: "tun_vps-99",
        type: "HEARTBEAT_PING",
        timestamp: Date.now(),
        payload: { timestamp: Date.now() },
      })
    );
  });

  ws.close();
  await server.stop();
});

test("Relay REST API routes: init, confirm and status", async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-agentflow-relay-server-12345";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://usr:pwd@localhost:5432/agentflow";
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const app = await buildApp({ logger: false });
  const token = app.jwt.sign({ sub: "usr_relay_tester", email: "relay@agentflow.io" });

  // 1. POST /api/relay/pair/init
  const initRes = await app.inject({
    method: "POST",
    url: "/api/relay/pair/init",
    headers: { authorization: `Bearer ${token}` },
    payload: { nodeId: "vps-node-rest-01" },
  });

  assert.equal(initRes.statusCode, 201);
  const initBody = JSON.parse(initRes.body);
  assert.equal(initBody.success, true);
  assert.ok(initBody.data.otp);
  assert.ok(initBody.data.qrPayload);

  // 2. POST /api/relay/pair/confirm
  const confirmRes = await app.inject({
    method: "POST",
    url: "/api/relay/pair/confirm",
    payload: {
      otp: initBody.data.otp,
      handshakeToken: initBody.data.handshakeToken,
      deviceId: "iphone-16-pro",
    },
  });

  assert.equal(confirmRes.statusCode, 200);
  const confirmBody = JSON.parse(confirmRes.body);
  assert.equal(confirmBody.success, true);
  assert.ok(confirmBody.data.sessionToken);
  assert.equal(confirmBody.data.nodeId, "vps-node-rest-01");

  // 3. GET /api/relay/status
  const statusRes = await app.inject({
    method: "GET",
    url: "/api/relay/status",
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(statusRes.statusCode, 200);
  const statusBody = JSON.parse(statusRes.body);
  assert.equal(statusBody.success, true);
  assert.ok(typeof statusBody.data.activeNodesCount === "number");
});
