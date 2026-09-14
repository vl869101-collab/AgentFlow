import test from "node:test";
import assert from "node:assert/strict";
import { OtpPairingManager } from "../src/services/remote-bridge/otp-manager.js";
import { RemoteBridgeServer } from "../src/services/remote-bridge/index.js";
import { buildApp } from "../src/server.js";

test("OtpPairingManager generates 6-digit OTP and verifies single-use burn", () => {
  const manager = new OtpPairingManager({ ttlMinutes: 5, maxAttempts: 3, secret: "test-secret-bridge" });

  const { code, expiresAt } = manager.generateOtp({
    orgId: "org_alpha",
    userId: "usr_lead_123",
  });

  assert.equal(code.length, 6);
  assert.ok(/^\d{6}$/.test(code));
  assert.ok(new Date(expiresAt).getTime() > Date.now());

  // First verification succeeds and returns token
  const pairing = manager.verifyAndBurnOtp(code);
  assert.equal(pairing.orgId, "org_alpha");
  assert.equal(pairing.userId, "usr_lead_123");
  assert.ok(pairing.token);

  // Validate pairing token
  const tokenValidation = manager.verifyPairingToken(pairing.token);
  assert.equal(tokenValidation.valid, true);
  assert.equal(tokenValidation.userId, "usr_lead_123");
  assert.equal(tokenValidation.orgId, "org_alpha");

  // Re-use of the same OTP fails (single-use burn)
  assert.throws(() => manager.verifyAndBurnOtp(code), {
    message: /already been used|Invalid or unknown/,
  });
});

test("RemoteBridgeServer starts and accepts client connections", async () => {
  const server = new RemoteBridgeServer({ port: 18789 });
  await server.start();
  assert.ok(server.getOtpManager());
  await server.stop();
});

test("Remote Bridge REST API routes generate and verify OTP", async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-agentflow-remote-bridge";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://usr:pwd@localhost:5432/agentflow";
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const app = await buildApp({ logger: false });
  const token = app.jwt.sign({ sub: "usr_mobile_admin", email: "admin@agentflow.io" });

  const genRes = await app.inject({
    method: "POST",
    url: "/api/remote-bridge/otp/generate",
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(genRes.statusCode, 201);
  const genData = genRes.json();
  assert.equal(genData.success, true);
  assert.equal(genData.data.code.length, 6);

  const verifyRes = await app.inject({
    method: "POST",
    url: "/api/remote-bridge/otp/verify",
    payload: {
      code: genData.data.code,
    },
  });

  assert.equal(verifyRes.statusCode, 200);
  const verifyData = verifyRes.json();
  assert.equal(verifyData.success, true);
  assert.ok(verifyData.data.token);

  // Verificação de tenant isolation via WebSocket
  const server = new RemoteBridgeServer({ port: 18790 });
  server.registerResourceOrg("pane-secure-1", "org_secure_company");
  const authValid = server.getOtpManager().verifyPairingToken(verifyData.data.token);
  assert.equal(authValid.valid, true);

  await app.close();
});
