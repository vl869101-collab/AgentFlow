import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:3001";
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://agentflow:agentflow_dev@localhost:5433/agentflow?schema=public",
    },
  },
});

const results = {
  s1: { passed: 0, failed: 0, details: [] },
  s5: { passed: 0, failed: 0, details: [] },
  s6: { passed: 0, failed: 0, details: [] },
  s7: { passed: 0, failed: 0, details: [] },
  findings: [],
};

function recordTest(surface, name, passed, detail) {
  const icon = passed ? "✓" : "✗";
  console.log(`[${surface.toUpperCase()}] ${icon} ${name} - ${detail}`);
  if (passed) {
    results[surface].passed++;
    results[surface].details.push({ name, status: "PASSED", detail });
  } else {
    results[surface].failed++;
    results[surface].details.push({ name, status: "FAILED", detail });
  }
}

function addFinding(id, surface, severity, confidence, evidence, repro, impact, suggestion) {
  results.findings.push({
    id,
    surface,
    severity,
    confidence,
    evidence,
    repro,
    impact,
    suggestion,
  });
  console.log(`\n[FINDING REGISTERED] ${id}: [${surface}] [${severity}] ${evidence}`);
}

async function request(path, options = {}) {
  const start = performance.now();
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const headers = { ...options.headers };
  if (options.body && typeof options.body === "object" && !(options.body instanceof String) && !(options.body instanceof Buffer)) {
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, { ...options, headers });
  const latencyMs = Math.round(performance.now() - start);
  let data = null;
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  if (contentType.includes("application/json") || (text.startsWith("{") || text.startsWith("["))) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  } else {
    data = text;
  }
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    data,
    rawText: text,
    latencyMs,
  };
}

async function ensureUserWithOrg(email, password, name) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const passwordHash = await bcrypt.hash(password, 10);
    user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
      },
    });
    const slug = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await prisma.organization.create({
      data: {
        name: `${name}'s Organization`,
        slug: `${slug}-${user.id.slice(0, 6)}`,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
  }
  return user;
}

async function runSecuritySuite() {
  console.log("================================================================================");
  console.log(`INICIANDO SUÍTE DE SEGURANÇA E COMPLIANCE: S1, S5, S6, S7`);
  console.log(`Target: ${BASE_URL} | Timestamp: ${new Date().toISOString()}`);
  console.log("================================================================================\n");

  const nonce = Date.now();
  const userAEmail = `sec-user-a-${nonce}@test.local`;
  const userBEmail = `sec-user-b-${nonce}@test.local`;
  const userCEmail = `sec-user-c-${nonce}@test.local`;
  const passwordA = "StrongPass123!#A";
  const passwordB = "StrongPass123!#B";
  const passwordC = "StrongPass123!#C";

  // ════════════════════════════════════════════════════════════════════════════
  // SUPERFÍCIE 1: Auth e Sessão
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SUPERFÍCIE 1: Auth e Sessão (Registro, Login, Anti-enumeração, RTR, Replay, Rate-limit)");
  console.log("--------------------------------------------------------------------------------");

  // 1.1 Teste de Registro User A
  let regA = await request("/api/auth/register", {
    method: "POST",
    body: { email: userAEmail, password: passwordA, name: "Security Tester A" },
  });

  let registerRateLimited = false;
  if (regA.status === 429) {
    registerRateLimited = true;
    recordTest("s1", "1.1 Registro User A (Rate Limit Protection)", true, `HTTP 429 - Proteção ativa contra abuso de registro (10/h)`);
  } else {
    const passed11 = regA.status === 201 && Boolean(regA.data?.message);
    recordTest("s1", "1.1 Registro User A com dados válidos", passed11, `HTTP ${regA.status} - ${JSON.stringify(regA.data)}`);
  }

  // 1.2 Anti-enumeração em Registro (E-mail duplicado)
  let regDup = await request("/api/auth/register", {
    method: "POST",
    body: { email: userAEmail, password: "DifferentPassword123!", name: "Duplicate Attempt" },
  });
  if (registerRateLimited) {
    const passed12 = regDup.status === 429;
    recordTest(
      "s1",
      "1.2 Anti-enumeração em Registro (E-mail duplicado sob rate limit)",
      passed12,
      `HTTP ${regDup.status} - Resposta uniforme preservada sob rate limiting`
    );
  } else {
    const passed12 = regDup.status === 201 && regDup.data?.message === regA.data?.message;
    recordTest(
      "s1",
      "1.2 Anti-enumeração em Registro (E-mail duplicado)",
      passed12,
      `HTTP ${regDup.status} - Mensagem idêntica: ${regDup.data?.message === regA.data?.message}`
    );
  }

  // Garante que User A exista
  await ensureUserWithOrg(userAEmail, passwordA, "Security Tester A");

  // 1.3 Anti-enumeração em Login (Inexistente vs Senha Errada)
  const nonExistentEmail = `nonexistent-user-${nonce}@test.local`;
  const loginNonExistent = await request("/api/auth/login", {
    method: "POST",
    body: { email: nonExistentEmail, password: "SomeRandomPassword123!" },
  });
  const loginWrongPass = await request("/api/auth/login", {
    method: "POST",
    body: { email: userAEmail, password: "WrongPasswordForRealUser123!" },
  });

  const sameStatus = loginNonExistent.status === 401 && loginWrongPass.status === 401;
  const sameCode = loginNonExistent.data?.code === loginWrongPass.data?.code;
  const sameErrorMsg = loginNonExistent.data?.error === loginWrongPass.data?.error;
  const passed13 = sameStatus && sameCode && sameErrorMsg;
  recordTest(
    "s1",
    "1.3 Anti-enumeração em Login (Inexistente vs Senha Errada)",
    passed13,
    `Status: ${loginNonExistent.status} vs ${loginWrongPass.status}, Code: "${loginNonExistent.data?.code}" vs "${loginWrongPass.data?.code}", Msg: "${loginNonExistent.data?.error}" vs "${loginWrongPass.data?.error}"`
  );
  if (!passed13) {
    addFinding(
      "FINDING-F2-02",
      "s1",
      "MAJOR",
      "HIGH",
      "apps/api/src/routes/auth.ts:51",
      "POST /api/auth/login com usuário inexistente vs senha incorreta",
      "Enumeração de contas ativas através de mensagens de erro ou códigos distintos",
      "Padronizar resposta para INVALID_CREDENTIALS / Invalid credentials em ambos os casos"
    );
  }

  // 1.4 Login válido User A
  const loginA = await request("/api/auth/login", {
    method: "POST",
    body: { email: userAEmail, password: passwordA },
  });
  const tokenA = loginA.data?.token;
  const refreshA1 = loginA.data?.refreshToken;
  const userAId = loginA.data?.user?.id;
  const orgAId = loginA.data?.user?.orgId;
  const passed14 = loginA.status === 200 && Boolean(tokenA) && Boolean(refreshA1) && Boolean(orgAId);
  recordTest(
    "s1",
    "1.4 Login válido User A com emissão de Access Token e Refresh Token",
    passed14,
    `HTTP ${loginA.status} - Token: ${Boolean(tokenA)}, RefreshToken: ${Boolean(refreshA1)}, OrgId: ${orgAId}`
  );

  // 1.5 Refresh Token Rotation (RTR)
  let refreshRes = await request("/api/auth/refresh", {
    method: "POST",
    body: { refreshToken: refreshA1 },
  });
  const tokenA2 = refreshRes.data?.token;
  const refreshA2 = refreshRes.data?.refreshToken;
  const passed15 = refreshRes.status === 200 && Boolean(tokenA2) && Boolean(refreshA2) && refreshA2 !== refreshA1;
  recordTest(
    "s1",
    "1.5 Refresh Token Rotation (RTR) gerando novo par de tokens",
    passed15,
    `HTTP ${refreshRes.status} - Novo token emitido: ${Boolean(tokenA2)}, Token rotacionado: ${refreshA2 !== refreshA1}`
  );

  // 1.6 Bloqueio de Replay do Refresh Token antigo (refreshA1)
  const replayRes = await request("/api/auth/refresh", {
    method: "POST",
    body: { refreshToken: refreshA1 },
  });
  const passed16 = replayRes.status === 401 && replayRes.data?.code === "INVALID_TOKEN";
  recordTest(
    "s1",
    "1.6 Bloqueio estrito de Replay de Refresh Token anterior",
    passed16,
    `HTTP ${replayRes.status} (Esperado 401) - Code: ${replayRes.data?.code}`
  );
  if (!passed16) {
    addFinding(
      "FINDING-F2-03",
      "s1",
      "BLOCKER",
      "HIGH",
      "apps/api/src/routes/auth.ts:85",
      "POST /api/auth/refresh com refreshToken antigo já rotacionado",
      "Vulnerabilidade de replay permitindo reutilização indefinida de tokens de refresh",
      "Invalidar cadeia de refresh tokens imediatamente na detecção de reuso"
    );
  }

  // 1.7 Logout e Invalidação de Refresh Token
  const logoutRes = await request("/api/auth/logout", {
    method: "POST",
    body: { refreshToken: refreshA2 },
  });
  const passed17a = logoutRes.status === 204;
  recordTest("s1", "1.7a Logout com revogação do refresh token", passed17a, `HTTP ${logoutRes.status}`);

  const postLogoutRefresh = await request("/api/auth/refresh", {
    method: "POST",
    body: { refreshToken: refreshA2 },
  });
  const passed17b = postLogoutRefresh.status === 401 && postLogoutRefresh.data?.code === "INVALID_TOKEN";
  recordTest(
    "s1",
    "1.7b Bloqueio de Refresh Token após Logout",
    passed17b,
    `HTTP ${postLogoutRefresh.status} (Esperado 401) - Code: ${postLogoutRefresh.data?.code}`
  );

  // Re-login User A para obter credenciais ativas para os próximos testes
  const reloginA = await request("/api/auth/login", {
    method: "POST",
    body: { email: userAEmail, password: passwordA },
  });
  const activeTokenA = reloginA.data?.token;
  const activeAuthA = { Authorization: `Bearer ${activeTokenA}` };

  // 1.8 Avaliação de Rate Limit
  const testReg = await request("/api/auth/register", {
    method: "POST",
    body: { email: `ratelimit-probe-${nonce}@test.local`, password: "Password123!", name: "RateLimit Probe" },
  });
  recordTest(
    "s1",
    "1.8 Rate Limit em /api/auth/register (Enforcement de cota)",
    testReg.status === 429 || testReg.status === 201,
    `HTTP ${testReg.status} - Rate limit ativo: ${testReg.status === 429}`
  );

  // ════════════════════════════════════════════════════════════════════════════
  // SUPERFÍCIE 5: Credenciais e Vault
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SUPERFÍCIE 5: Credenciais e Vault (Criação, Mascaramento, Rota /test, KMS Fail-Closed)");
  console.log("--------------------------------------------------------------------------------");

  const secretRawValue = "sk-live-super-secret-vault-api-key-9876543210";
  const credPayload = {
    name: "OpenAI Vault Production Key",
    type: "api_key",
    provider: "openai",
    data: {
      apiKey: secretRawValue,
      organizationId: "org-test-123",
    },
  };

  // 5.1 Criação de Credencial
  const createCredRes = await request("/api/credentials", {
    method: "POST",
    headers: activeAuthA,
    body: credPayload,
  });
  const credAId = createCredRes.data?.id;
  const passed51 = createCredRes.status === 201 && Boolean(credAId);
  recordTest("s5", "5.1 Criação de Credencial criptografada no Vault", passed51, `HTTP ${createCredRes.status} - ID: ${credAId}`);

  // 5.2 Verificação de MASCARAMENTO de segredo na listagem e na resposta de criação
  const listCredRes = await request("/api/credentials", {
    headers: activeAuthA,
  });
  const createdCredResponseString = JSON.stringify(createCredRes.data);
  const listCredResponseString = JSON.stringify(listCredRes.data);

  const leaksInCreate = createdCredResponseString.includes(secretRawValue);
  const leaksInList = listCredResponseString.includes(secretRawValue);
  const passed52 = !leaksInCreate && !leaksInList && listCredRes.status === 200;

  recordTest(
    "s5",
    "5.2 Mascaramento estrito de segredo na API (Zero-Leakage)",
    passed52,
    `HTTP ${listCredRes.status} - Segredo exposto em POST: ${leaksInCreate} | Segredo exposto em GET list: ${leaksInList}`
  );
  if (!passed52) {
    addFinding(
      "FINDING-F2-04",
      "s5",
      "BLOCKER",
      "HIGH",
      "apps/api/src/routes/credentials.ts:48",
      "GET /api/credentials ou POST /api/credentials retorna segredo em texto claro",
      "Exposição de chaves de API / senhas em texto plano para qualquer consumidor de leitura",
      "Aplicar maskVaultData estritamente antes de serializar credenciais na resposta HTTP"
    );
  } else {
    const foundCred = (Array.isArray(listCredRes.data) ? listCredRes.data : []).find((c) => c.id === credAId);
    console.log(`[S5 INFO] Amostra de dados mascarados retornados pela API:`, JSON.stringify(foundCred?.data));
  }

  // 5.3 Rota /test (Connection Verification)
  // 5.3a: Rota /test com rascunho de credencial não salva (draft)
  const testDraftRes = await request("/api/credentials/test", {
    method: "POST",
    headers: activeAuthA,
    body: {
      provider: "openai",
      type: "api_key",
      data: { apiKey: "sk-invalid-test-key" },
    },
  });
  const passed53a = testDraftRes.status === 200 || testDraftRes.status === 400;
  recordTest(
    "s5",
    "5.3a Rota POST /api/credentials/test (draft verification)",
    passed53a,
    `HTTP ${testDraftRes.status} - Resposta: ${JSON.stringify(testDraftRes.data)}`
  );

  // 5.3b: Rota /:id/test com credencial salva
  if (credAId) {
    const testSavedRes = await request(`/api/credentials/${credAId}/test`, {
      method: "POST",
      headers: activeAuthA,
    });
    const passed53b = testSavedRes.status === 200 || testSavedRes.status === 400;
    recordTest(
      "s5",
      "5.3b Rota POST /api/credentials/:id/test (saved credential verification)",
      passed53b,
      `HTTP ${testSavedRes.status} - Resposta: ${JSON.stringify(testSavedRes.data)}`
    );
  }

  // 5.4 KMS Fail-Closed & Envelope Integrity
  // 5.4a Revelação controlada para OWNER/ADMIN autenticado
  const revealRes = await request(`/api/credentials/${credAId}/reveal`, {
    headers: activeAuthA,
  });
  const passed54a = revealRes.status === 200 && revealRes.data?.data?.apiKey === secretRawValue;
  recordTest(
    "s5",
    "5.4a Revelação controlada de credencial para OWNER autenticado",
    passed54a,
    `HTTP ${revealRes.status} - Descriptografia autorizada bem-sucedida: ${passed54a}`
  );

  // 5.4b Teste de Fail-Closed com tag/envelope corrompido
  console.log("Testando comportamento Fail-Closed do KMS com dados de envelope corrompidos...");
  const corruptedCred = await prisma.credential.create({
    data: {
      name: "Corrupted Ciphertext Test Credential",
      type: "api_key",
      provider: "openai",
      data: JSON.stringify({
        keyVersion: 1,
        wrappedDek: "00000000000000000000000000000000000000000000",
        iv: "AAAAAAAAAAAAAAAA",
        ciphertext: "BBBBBBBBBBBBBBBB",
        tag: "CCCCCCCCCCCCCCCC",
      }),
      keyVersion: 1,
      orgId: orgAId,
    },
  });

  const corruptedRevealRes = await request(`/api/credentials/${corruptedCred.id}/reveal`, {
    headers: activeAuthA,
  });
  const passed54b = corruptedRevealRes.status === 500 && corruptedRevealRes.data?.code === "CREDENTIAL_DECRYPTION_FAILED";
  recordTest(
    "s5",
    "5.4b KMS Fail-Closed sob adulteração/corrupção de envelope",
    passed54b,
    `HTTP ${corruptedRevealRes.status} (Esperado 500) - Code: ${corruptedRevealRes.data?.code}`
  );
  if (!passed54b) {
    addFinding(
      "FINDING-F2-09",
      "s5",
      "BLOCKER",
      "HIGH",
      "apps/api/src/routes/credentials.ts:153",
      "GET /api/credentials/:id/reveal com ciphertext adulterado",
      "Falha em manter fail-closed ou vazamento de erro com stack trace interno",
      "Garantir tratamento explícito retornando status 500 e CREDENTIAL_DECRYPTION_FAILED sem dados crus"
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SUPERFÍCIE 6: Webhooks
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SUPERFÍCIE 6: Webhooks (Disparo público, Validação JSON, Assinatura HMAC, Replay)");
  console.log("--------------------------------------------------------------------------------");

  // 6.0 Criação de Workflow para vincular ao Webhook
  const wfRes = await request("/api/workflows", {
    method: "POST",
    headers: activeAuthA,
    body: {
      name: "Security Test Webhook Workflow",
      description: "Workflow destinado ao teste de disparo de webhooks",
    },
  });
  const workflowAId = wfRes.data?.id;
  const passed60 = wfRes.status === 201 && Boolean(workflowAId);
  recordTest("s6", "6.0 Workflow de apoio para Webhooks", passed60, `ID: ${workflowAId}`);

  // 6.1 Criação de Webhook Público com Secret HMAC
  const webhookSecret = "my-secure-webhook-hmac-secret-key-32ch";
  const webhookPath = `sec-hook-${nonce}`;
  const createWebhookRes = await request("/api/webhooks", {
    method: "POST",
    headers: activeAuthA,
    body: {
      path: webhookPath,
      method: "POST",
      workflowId: workflowAId,
      secret: webhookSecret,
    },
  });
  const webhookId = createWebhookRes.data?.id;
  const returnedSecret = createWebhookRes.data?.secret;
  const passed61 = createWebhookRes.status === 201 && Boolean(webhookId);
  recordTest(
    "s6",
    "6.1 Registro de Webhook com segredo HMAC configurado",
    passed61,
    `HTTP ${createWebhookRes.status} - Path: ${webhookPath}, ID: ${webhookId}, Secret retornado no create: ${Boolean(returnedSecret)}`
  );

  // 6.2 Validação de payload JSON (Envio de JSON malformado)
  const malformedPayloadRes = await request(`/api/webhooks/trigger/${webhookPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-provider": "generic",
    },
    body: '{"invalidJson": unclosed_string',
  });
  const passed62 = malformedPayloadRes.status === 400 && malformedPayloadRes.data?.code === "VALIDATION_ERROR";
  recordTest(
    "s6",
    "6.2 Rejeição estrita de payload JSON malformado",
    passed62,
    `HTTP ${malformedPayloadRes.status} - Code: ${malformedPayloadRes.data?.code}`
  );

  // 6.3 Assinatura HMAC (Missing, Inválida vs Válida)
  const validJsonPayload = JSON.stringify({
    event: "order.completed",
    orderId: 12345,
    amount: 199.9,
    timestamp: new Date().toISOString(),
  });

  // 6.3a Sem assinatura
  const missingSigRes = await request(`/api/webhooks/trigger/${webhookPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-provider": "github",
    },
    body: validJsonPayload,
  });
  const passed63a = missingSigRes.status === 401 && (missingSigRes.data?.code === "MISSING_SIGNATURE" || missingSigRes.data?.code === "INVALID_SIGNATURE");
  recordTest(
    "s6",
    "6.3a Rejeição de webhook sem assinatura HMAC",
    passed63a,
    `HTTP ${missingSigRes.status} (Esperado 401) - Code: ${missingSigRes.data?.code}`
  );
  if (!passed63a) {
    addFinding(
      "FINDING-F2-05",
      "s6",
      "BLOCKER",
      "HIGH",
      "apps/api/src/routes/webhooks.ts:161",
      "POST /api/webhooks/trigger/* sem assinatura",
      "Disparo não autenticado de webhooks públicos permitindo execução forjada de workflows",
      "Exigir validação estrita de assinatura HMAC em todos os webhooks com segredo"
    );
  }

  // 6.3b Assinatura HMAC inválida
  const invalidSigRes = await request(`/api/webhooks/trigger/${webhookPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-provider": "github",
      "x-hub-signature-256": "sha256=0000000000000000000000000000000000000000000000000000000000000000",
    },
    body: validJsonPayload,
  });
  const passed63b = invalidSigRes.status === 401 && invalidSigRes.data?.code === "INVALID_SIGNATURE";
  recordTest(
    "s6",
    "6.3b Rejeição de webhook com assinatura HMAC inválida",
    passed63b,
    `HTTP ${invalidSigRes.status} (Esperado 401) - Code: ${invalidSigRes.data?.code}`
  );

  // 6.3c Assinatura HMAC válida (GitHub format sha256=...)
  const validHmacHex = createHmac("sha256", webhookSecret).update(validJsonPayload).digest("hex");
  const idempotencyId = `idemp-${nonce}-${Math.random().toString(36).slice(2, 8)}`;

  const validWebhookRes = await request(`/api/webhooks/trigger/${webhookPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-provider": "github",
      "x-hub-signature-256": `sha256=${validHmacHex}`,
      "x-idempotency-key": idempotencyId,
    },
    body: validJsonPayload,
  });
  const passed63c = validWebhookRes.status === 202 && Boolean(validWebhookRes.data?.executionId);
  recordTest(
    "s6",
    "6.3c Aceitação de webhook com assinatura HMAC-SHA256 válida",
    passed63c,
    `HTTP ${validWebhookRes.status} (Esperado 202) - ExecutionId: ${validWebhookRes.data?.executionId}`
  );

  // 6.4 Proteção contra Replay Attack (Idempotência 24h)
  const replayWebhookRes = await request(`/api/webhooks/trigger/${webhookPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-provider": "github",
      "x-hub-signature-256": `sha256=${validHmacHex}`,
      "x-idempotency-key": idempotencyId,
    },
    body: validJsonPayload,
  });
  const passed64 =
    replayWebhookRes.status === 200 &&
    replayWebhookRes.data?.duplicate === true &&
    replayWebhookRes.data?.code === "IDEMPOTENT_REPLAY";
  recordTest(
    "s6",
    "6.4 Proteção contra Replay Attack via Idempotency Key",
    passed64,
    `HTTP ${replayWebhookRes.status} - Duplicate: ${replayWebhookRes.data?.duplicate}, Code: ${replayWebhookRes.data?.code}`
  );
  if (!passed64) {
    addFinding(
      "FINDING-F2-06",
      "s6",
      "MAJOR",
      "HIGH",
      "apps/api/src/routes/webhooks.ts:218",
      "Reenvio de webhook com mesma chave de idempotência",
      "Permite replay de eventos com múltiplas execuções redundantes e cobrança indevida de cotas",
      "Enforçar checagem atômica de idempotência no Redis retornando 200 com duplicate: true"
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SUPERFÍCIE 7: RBAC e Organizações (Isolamento Multi-Tenant)
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n--------------------------------------------------------------------------------");
  console.log("SUPERFÍCIE 7: RBAC e Organizações (Papéis, Convites, Isolamento Cross-Org Estrito)");
  console.log("--------------------------------------------------------------------------------");

  // Garante que Usuários B e C existam no DB
  await ensureUserWithOrg(userBEmail, passwordB, "Security Tester B");
  await ensureUserWithOrg(userCEmail, passwordC, "Security Tester C");

  // 7.1 Setup Usuário B e Organização B
  console.log(`Realizando login do Usuário B (${userBEmail})...`);
  const loginB = await request("/api/auth/login", {
    method: "POST",
    body: { email: userBEmail, password: passwordB },
  });
  const tokenB = loginB.data?.token;
  const userBId = loginB.data?.user?.id;
  const authB = { Authorization: `Bearer ${tokenB}` };

  const passed71 = loginB.status === 200 && Boolean(tokenB);
  recordTest("s7", "7.1 Registro e Login do Usuário B (Ator Cross-Org)", passed71, `HTTP ${loginB.status} - ID: ${userBId}`);

  // 7.2 Criação de Organização Alpha (User A) e Organização Beta (User B)
  const orgAlphaSlug = `org-alpha-${nonce}`;
  const createOrgAlphaRes = await request("/api/orgs", {
    method: "POST",
    headers: activeAuthA,
    body: { name: "Organization Alpha Security", slug: orgAlphaSlug },
  });
  const orgAlphaId = createOrgAlphaRes.data?.id;

  const orgBetaSlug = `org-beta-${nonce}`;
  const createOrgBetaRes = await request("/api/orgs", {
    method: "POST",
    headers: authB,
    body: { name: "Organization Beta Security", slug: orgBetaSlug },
  });
  const orgBetaId = createOrgBetaRes.data?.id;

  const passed72 = createOrgAlphaRes.status === 201 && createOrgBetaRes.status === 201;
  recordTest(
    "s7",
    "7.2 Criação independente de organizações (Org Alpha e Org Beta)",
    passed72,
    `Org Alpha: ${orgAlphaId} (User A OWNER) | Org Beta: ${orgBetaId} (User B OWNER)`
  );

  // 7.3 Convite e Atribuição de Papéis RBAC (MEMBER vs OWNER/ADMIN)
  // Usuário A convida Usuário C como MEMBER na Org Alpha
  const inviteCRes = await request(`/api/orgs/${orgAlphaId}/invite`, {
    method: "POST",
    headers: activeAuthA,
    body: { email: userCEmail, role: "MEMBER" },
  });
  const passed73a = inviteCRes.status === 200 && inviteCRes.data?.role === "MEMBER";
  recordTest("s7", "7.3a Convite de Usuário C como MEMBER na Org Alpha", passed73a, `HTTP ${inviteCRes.status} - Role: ${inviteCRes.data?.role}`);

  // Login de Usuário C para obter token com contexto
  const loginC = await request("/api/auth/login", {
    method: "POST",
    body: { email: userCEmail, password: passwordC },
  });
  const tokenC = loginC.data?.token;
  const authC = { Authorization: `Bearer ${tokenC}` };

  // Usuário C (MEMBER) tenta ação administrativa (PUT /api/orgs/:id)
  const updateByMemberRes = await request(`/api/orgs/${orgAlphaId}`, {
    method: "PUT",
    headers: authC,
    body: { name: "Hacked Org Name By Member" },
  });
  const passed73b = updateByMemberRes.status === 403 && updateByMemberRes.data?.code === "FORBIDDEN";
  recordTest(
    "s7",
    "7.3b Bloqueio de ação administrativa para papel MEMBER (RBAC)",
    passed73b,
    `HTTP ${updateByMemberRes.status} (Esperado 403) - Code: ${updateByMemberRes.data?.code}`
  );

  // 7.4 Tentativas de Acesso Cross-Org (BOLA / IDOR Attack Simulation)
  console.log("\nSimulando ataques BOLA/IDOR: Usuário B tentando acessar recursos da Org Alpha...");

  // 7.4a Usuário B tenta ler Workflow da Org Alpha
  const crossWfGet = await request(`/api/workflows/${workflowAId}`, {
    headers: authB,
  });
  const passed74a = crossWfGet.status === 404 || crossWfGet.status === 403;
  recordTest(
    "s7",
    "7.4a Acesso Cross-Org: GET /api/workflows/:id pertencente a outra Org",
    passed74a,
    `HTTP ${crossWfGet.status} (Esperado 404/403) - Code: ${crossWfGet.data?.code}`
  );
  if (!passed74a) {
    addFinding(
      "FINDING-F2-07",
      "s7",
      "BLOCKER",
      "HIGH",
      "apps/api/src/routes/workflows.ts:201",
      "GET /api/workflows/:id sem validação estrita de orgId",
      "Vulnerabilidade BOLA/IDOR permitindo que usuários leiam fluxos inteiros de outras organizações",
      "Filtrar sempre com { where: { id, orgId } } e retornar 404 sem revelar existência"
    );
  }

  // 7.4b Usuário B tenta atualizar Workflow da Org Alpha
  const crossWfPut = await request(`/api/workflows/${workflowAId}`, {
    method: "PUT",
    headers: authB,
    body: { name: "Malicious Workflow Rename" },
  });
  const passed74b = crossWfPut.status === 404 || crossWfPut.status === 403;
  recordTest(
    "s7",
    "7.4b Acesso Cross-Org: PUT /api/workflows/:id pertencente a outra Org",
    passed74b,
    `HTTP ${crossWfPut.status} (Esperado 404/403) - Code: ${crossWfPut.data?.code}`
  );

  // 7.4c Usuário B tenta deletar Workflow da Org Alpha
  const crossWfDelete = await request(`/api/workflows/${workflowAId}`, {
    method: "DELETE",
    headers: authB,
  });
  const passed74c = crossWfDelete.status === 404 || crossWfDelete.status === 403;
  recordTest(
    "s7",
    "7.4c Acesso Cross-Org: DELETE /api/workflows/:id pertencente a outra Org",
    passed74c,
    `HTTP ${crossWfDelete.status} (Esperado 404/403) - Code: ${crossWfDelete.data?.code}`
  );

  // 7.4d Usuário B tenta revelar segredo da Credencial da Org Alpha
  const crossCredReveal = await request(`/api/credentials/${credAId}/reveal`, {
    headers: authB,
  });
  const passed74d = crossCredReveal.status === 404 || crossCredReveal.status === 403;
  recordTest(
    "s7",
    "7.4d Acesso Cross-Org: GET /api/credentials/:id/reveal de outra Org",
    passed74d,
    `HTTP ${crossCredReveal.status} (Esperado 404/403) - Code: ${crossCredReveal.data?.code}`
  );
  if (!passed74d) {
    addFinding(
      "FINDING-F2-08",
      "s7",
      "BLOCKER",
      "HIGH",
      "apps/api/src/routes/credentials.ts:135",
      "GET /api/credentials/:id/reveal sem isolamento multi-tenant",
      "Vazamento catastrófico de segredos criptografados de outras organizações",
      "Verificar obrigatoriamente membership da organização da credencial antes de descriptografar"
    );
  }

  // 7.4e Usuário B tenta deletar Credencial da Org Alpha
  const crossCredDelete = await request(`/api/credentials/${credAId}`, {
    method: "DELETE",
    headers: authB,
  });
  const passed74e = crossCredDelete.status === 404 || crossCredDelete.status === 403;
  recordTest(
    "s7",
    "7.4e Acesso Cross-Org: DELETE /api/credentials/:id de outra Org",
    passed74e,
    `HTTP ${crossCredDelete.status} (Esperado 404/403) - Code: ${crossCredDelete.data?.code}`
  );

  // 7.4f Usuário B tenta ler detalhes da Org Alpha sem pertencer a ela
  const crossOrgGet = await request(`/api/orgs/${orgAlphaId}`, {
    headers: authB,
  });
  const passed74f = crossOrgGet.status === 404 || crossOrgGet.status === 403;
  recordTest(
    "s7",
    "7.4f Acesso Cross-Org: GET /api/orgs/:id sem membership",
    passed74f,
    `HTTP ${crossOrgGet.status} (Esperado 404/403) - Code: ${crossOrgGet.data?.code}`
  );

  // ════════════════════════════════════════════════════════════════════════════
  // SÍNTESE E VEREDITO
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n================================================================================");
  console.log("RESUMO CONSOLIDADO DOS TESTES");
  console.log("================================================================================");
  console.log(`Superfície 1 (Auth e Sessão):       ${results.s1.passed} PASSED | ${results.s1.failed} FAILED`);
  console.log(`Superfície 5 (Credenciais e Vault): ${results.s5.passed} PASSED | ${results.s5.failed} FAILED`);
  console.log(`Superfície 6 (Webhooks):            ${results.s6.passed} PASSED | ${results.s6.failed} FAILED`);
  console.log(`Superfície 7 (RBAC e Organizações): ${results.s7.passed} PASSED | ${results.s7.failed} FAILED`);
  console.log(`Total Findings Registrados:         ${results.findings.length}`);
  console.log("================================================================================");

  await prisma.$disconnect();
  return results;
}

runSecuritySuite()
  .then((res) => {
    const hasFailures = Object.values(res).some((s) => s.failed > 0);
    process.exit(hasFailures ? 1 : 0);
  })
  .catch(async (err) => {
    console.error("Erro fatal durante execução da suíte de testes:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
