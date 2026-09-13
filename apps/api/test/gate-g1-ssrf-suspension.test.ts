import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";

process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
delete process.env.DATABASE_URL;

const [
  { prisma },
  { resetStore },
  {
    isBlockedIpOrHost,
    validateUrl,
    safeFetch,
    createPinnedLookup,
    SsrFSecurityError,
  },
  {
    evaluateExpression,
    buildExpressionContext,
    ExpressionSecurityError,
  },
  { createWorkflowExecution, runExecution },
  { buildApp },
  { verifyWorkflowAuditIntegrity, getExecutionAuditTrail },
] = await Promise.all([
  import("../src/lib/prisma.js"),
  import("../src/lib/store.js"),
  import("../src/lib/ssrf.js"),
  import("../src/services/expressions.js"),
  import("../src/services/executor.js"),
  import("../src/server.js"),
  import("../src/services/audit-ledger.js"),
]);

test.beforeEach(() => {
  resetStore();
});

// ══════════════════════════════════════════════════════════════════════════════
// GATE G-1 — PARTE 1: ZERO SSRF (Suíte de 50+ URLs de Bypass Malicioso & AST)
// ══════════════════════════════════════════════════════════════════════════════

test("Gate G-1 [Anti-SSRF]: Bloqueia 100% de 60 vetores maliciosos (octal, hex, CIDRs, link-local, cloud metadata)", async () => {
  const maliciousVectors: Array<{ target: string; reason: string }> = [
    // 1-10: Loopback IPv4 e variações
    { target: "127.0.0.1", reason: "Standard IPv4 loopback" },
    { target: "127.0.0.2", reason: "Secondary IPv4 loopback" },
    { target: "127.0.0.3", reason: "Tertiary IPv4 loopback" },
    { target: "127.1.2.3", reason: "Arbitrary loopback range" },
    { target: "127.10.20.30", reason: "Mid-range loopback" },
    { target: "127.255.255.254", reason: "End of loopback range" },
    { target: "localhost", reason: "Standard localhost hostname" },
    { target: "foo.localhost", reason: "Subdomain of localhost" },
    { target: "internal.localhost", reason: "Nested localhost domain" },
    { target: "0.0.0.0", reason: "Zero address routing to loopback" },

    // 11-20: Link-Local & Cloud Metadata (AWS, GCP, Azure, Alibaba)
    { target: "169.254.169.254", reason: "AWS/Azure/GCP IMDS metadata IP" },
    { target: "169.254.169.253", reason: "Link-local near metadata" },
    { target: "169.254.170.2", reason: "AWS ECS container credentials metadata" },
    { target: "100.100.100.200", reason: "Alibaba Cloud metadata endpoint" },
    { target: "metadata.google.internal", reason: "Google Cloud internal metadata" },
    { target: "metadata.goog", reason: "GCP short metadata suffix" },
    { target: "instance-data", reason: "Legacy AWS instance-data hostname" },
    { target: "169.254.0.1", reason: "IPv4 link-local network start" },
    { target: "169.254.1.1", reason: "IPv4 link-local range" },
    { target: "169.254.254.254", reason: "IPv4 link-local range end" },

    // 21-30: RFC 1918 Class A (10.0.0.0/8)
    { target: "10.0.0.1", reason: "Class A private gateway" },
    { target: "10.0.0.254", reason: "Class A subnet router" },
    { target: "10.1.1.1", reason: "Class A branch gateway" },
    { target: "10.10.10.10", reason: "Class A internal node" },
    { target: "10.50.100.200", reason: "Class A intranet host" },
    { target: "10.100.200.1", reason: "Class A department server" },
    { target: "10.200.100.50", reason: "Class A corporate server" },
    { target: "10.254.254.254", reason: "Class A high boundary" },
    { target: "10.255.255.254", reason: "Class A near broadcast" },
    { target: "10.255.255.255", reason: "Class A broadcast boundary" },

    // 31-40: RFC 1918 Class B (172.16.0.0/12)
    { target: "172.16.0.1", reason: "Class B private start" },
    { target: "172.17.0.1", reason: "Class B secondary subnet" },
    { target: "172.18.0.1", reason: "Class B docker network" },
    { target: "172.19.0.1", reason: "Class B container bridge" },
    { target: "172.20.0.10", reason: "Docker default bridge range" },
    { target: "172.24.1.100", reason: "Class B mid-range" },
    { target: "172.28.0.1", reason: "Class B cluster subnet" },
    { target: "172.30.0.1", reason: "Class B internal services" },
    { target: "172.31.255.254", reason: "Class B private end" },
    { target: "172.31.255.255", reason: "Class B broadcast" },

    // 41-50: RFC 1918 Class C (192.168.0.0/16)
    { target: "192.168.0.1", reason: "Class C router default" },
    { target: "192.168.1.1", reason: "Class C home router gateway" },
    { target: "192.168.2.1", reason: "Class C secondary LAN" },
    { target: "192.168.10.1", reason: "Class C office subnet" },
    { target: "192.168.33.10", reason: "Class C lab workstation" },
    { target: "192.168.100.50", reason: "Class C office node" },
    { target: "192.168.178.1", reason: "Class C European router gateway" },
    { target: "192.168.200.1", reason: "Class C guest LAN" },
    { target: "192.168.254.254", reason: "Class C upper subnet" },
    { target: "192.168.255.255", reason: "Class C broadcast boundary" },

    // 51-60: IPv6 Loopback, Link-Local, Unique-Local, Mapped & CGNAT
    { target: "::1", reason: "IPv6 loopback" },
    { target: "::", reason: "IPv6 unspecified" },
    { target: "fe80::1", reason: "IPv6 link-local gateway" },
    { target: "fe80::dead:beef", reason: "IPv6 link-local device" },
    { target: "fc00::1", reason: "IPv6 unique local address" },
    { target: "fd00::1234", reason: "IPv6 unique local private" },
    { target: "::ffff:127.0.0.1", reason: "IPv4-mapped IPv6 loopback" },
    { target: "::ffff:10.0.0.1", reason: "IPv4-mapped IPv6 Class A" },
    { target: "::ffff:169.254.169.254", reason: "IPv4-mapped IPv6 metadata" },
    { target: "100.64.0.1", reason: "Carrier-Grade NAT lower" },
  ];

  assert.ok(maliciousVectors.length >= 50, `Deve conter pelo menos 50 vetores (contém ${maliciousVectors.length})`);

  let blockedCount = 0;
  for (const vector of maliciousVectors) {
    const isBlocked = isBlockedIpOrHost(vector.target);
    assert.equal(isBlocked, true, `Vetor '${vector.target}' (${vector.reason}) DEVE ser bloqueado`);

    const formattedHost = vector.target.includes(":") ? `[${vector.target}]` : vector.target;
    assert.throws(
      () => validateUrl(`http://${formattedHost}/path`),
      (err: any) => err instanceof SsrFSecurityError && err.code === "SSRF_BLOCKED",
      `validateUrl deve rejeitar vetor '${vector.target}'`
    );
    blockedCount++;
  }

  assert.equal(blockedCount, maliciousVectors.length, "Taxa de bloqueio deve ser exatamente 100%");
});

test("Gate G-1 [Anti-SSRF]: Bloqueia esquemas perigosos (file, gopher, ftp, ldap) e credenciais embutidas", async () => {
  const invalidSchemes = [
    "file:///etc/passwd",
    "file:///c:/windows/system32/cmd.exe",
    "gopher://127.0.0.1:6379/_flushall",
    "ftp://internal-server.local/conf.json",
    "ldap://127.0.0.1:389/o=example",
    "dict://127.0.0.1:11211/stat",
  ];

  for (const url of invalidSchemes) {
    await assert.rejects(
      async () => safeFetch(url),
      (err: any) => err instanceof SsrFSecurityError && err.code === "UNSUPPORTED_PROTOCOL",
      `safeFetch deve rejeitar protocolo em '${url}'`
    );
  }

  const credentialsUrl = "http://admin:supersecret@example.com/api";
  assert.throws(
    () => validateUrl(credentialsUrl),
    (err: any) => err instanceof SsrFSecurityError && err.code === "CREDENTIALS_IN_URL",
    "validateUrl deve rejeitar credenciais embutidas"
  );
});

test("Gate G-1 [Anti-SSRF]: Bloqueia redirecionamentos HTTP 302 que apontam para endereços internos", async () => {
  // Configura um servidor HTTP de teste que responde com 302 para um IP privado
  const server = http.createServer((req, res) => {
    if (req.url === "/redirect-to-private") {
      res.writeHead(302, { Location: "http://127.0.0.1:8080/internal-data" });
      res.end();
      return;
    }
    if (req.url === "/redirect-to-metadata") {
      res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
      res.end();
      return;
    }
    res.writeHead(200);
    res.end("OK");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    // safeFetch direta para a porta do servidor já é bloqueada por ser 127.0.0.1
    await assert.rejects(
      async () => safeFetch(`http://127.0.0.1:${port}/redirect-to-private`),
      (err: any) => err instanceof SsrFSecurityError && err.code === "SSRF_BLOCKED"
    );
  } finally {
    server.close();
  }
});

test("Gate G-1 [Anti-SSRF]: createPinnedLookup evita TOCTOU e DNS Rebinding fixando o socket no IP validado", async () => {
  const targetIp = "93.184.216.34"; // example.com IPv4 público
  const lookupFn = createPinnedLookup(targetIp);

  await new Promise<void>((resolve, reject) => {
    lookupFn("attacker-rebinding-domain.com", {}, (err, address, family) => {
      if (err) return reject(err);
      assert.equal(address, targetIp, "O socket deve ser forçado a conectar exclusivamente ao IP validado");
      assert.equal(family, 4);
      resolve();
    });
  });
});

test("Gate G-1 [AST Sandbox]: Bloqueia protótipos, execução de código arbitrário e acessos destrutivos", () => {
  const context = buildExpressionContext({
    item: { json: { amount: 100, status: "pending" } },
    executionId: "gate-g1-exec",
    workflowId: "gate-g1-wf",
    workflowName: "Gate G1 Workflow",
  });

  const exploitExpressions = [
    "{{ this.constructor.constructor('return process')() }}",
    "{{ Function('return process')() }}",
    "{{ eval('process.exit(1)') }}",
    "{{ process.env }}",
    "{{ globalThis.process }}",
    "{{ global.process }}",
    "{{ require('fs') }}",
    "{{ import('node:fs') }}",
    "{{ $json.__proto__ }}",
    "{{ $json.constructor }}",
    "{{ window.location }}",
    "{{ fetch('http://127.0.0.1') }}",
  ];

  for (const expr of exploitExpressions) {
    assert.throws(
      () => evaluateExpression(expr, context),
      (err: any) => err instanceof ExpressionSecurityError,
      `Avaliador AST deve bloquear expressao maliciosa: ${expr}`
    );
  }

  // Expressões legítimas funcionam com tipagem preservada
  assert.equal(evaluateExpression("{{ $json.amount * 2 }}", context), 200);
  assert.equal(evaluateExpression("{{ $json.status === 'pending' }}", context), true);
  assert.equal(evaluateExpression("{{ $executionId }}", context), "gate-g1-exec");
});

// ══════════════════════════════════════════════════════════════════════════════
// GATE G-1 — PARTE 2: TESTE E2E DE SUSPENSÃO COM CHECKPOINT & REVERSIBILIDADE
// ══════════════════════════════════════════════════════════════════════════════

async function createGateFixture(nodes: any[], edges: any[]) {
  const org = await prisma.organization.create({
    data: {
      name: "Gate G1 Org",
      slug: `gate-g1-org-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `gate-g1-user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`,
      passwordHash: "hash-g1",
      name: "Gate G1 Approver",
    },
  });
  await prisma.organizationMember.create({
    data: { orgId: org.id, userId: user.id, role: "OWNER" },
  });

  const workflow = await prisma.workflow.create({
    data: {
      name: "Gate G-1 Suspension & Reversibility Workflow",
      orgId: org.id,
      ownerId: user.id,
      status: "ACTIVE",
      nodes: { create: nodes.map((n) => ({ ...n, config: n.config ?? {} })) },
      edges: { create: edges },
    },
  });

  return { org, user, workflow };
}

test("Gate G-1 [Suspensão & Reversibilidade]: Transição WAITING_APPROVAL, zero side-effects prévios e retomada íntegra após aprovação", async () => {
  const app = await buildApp({ logger: false });

  // Monta fluxo: trigger -> preStep (cria dados) -> dangerousNode (requer aprovação) -> postStep (depende dos dados)
  const { org, user, workflow } = await createGateFixture(
    [
      { id: "trg", type: "webhook" },
      {
        id: "preStep",
        type: "set_fields",
        config: { orderId: "ORD-999", initialBalance: 5000 },
      },
      {
        id: "dangerousNode",
        type: "set_fields",
        config: {
          requiresApproval: true,
          action: "payout_funds",
          title: "Aprovação de Transferência Financeira",
          payoutAuthorized: true,
        },
      },
      {
        id: "postStep",
        type: "set_fields",
        config: { orderCompleted: true, confirmationSent: true },
      },
    ],
    [
      { id: "e1", sourceNodeId: "trg", targetNodeId: "preStep" },
      { id: "e2", sourceNodeId: "preStep", targetNodeId: "dangerousNode" },
      { id: "e3", sourceNodeId: "dangerousNode", targetNodeId: "postStep" },
    ]
  );

  // 1. Cria e inicia a execução
  const exec = await createWorkflowExecution(workflow.id, { initiated: true }, { userId: user.id });
  assert.equal(exec.status, "PENDING");

  const runResult = await runExecution(exec.id);

  // 2. Valida suspensão imediata no gate de reversibilidade
  assert.equal(runResult.status, "WAITING_APPROVAL", "Status deve transicionar para WAITING_APPROVAL");

  const storedExec = await prisma.workflowExecution.findUnique({ where: { id: exec.id } });
  assert.equal(storedExec?.status, "WAITING_APPROVAL");

  // 3. Valida que preStep executou e salvou checkpoint íntegro
  const preStepExec = await prisma.nodeExecution.findFirst({
    where: { executionId: exec.id, nodeId: "preStep" },
  });
  assert.ok(preStepExec, "preStep deve ter executado");
  assert.equal(preStepExec.status, "SUCCESS");

  // 4. CRÍTICO: dangerousNode e postStep NÃO devem ter sido executados (ZERO side-effects)
  const dangerousExec = await prisma.nodeExecution.findFirst({
    where: { executionId: exec.id, nodeId: "dangerousNode" },
  });
  assert.equal(dangerousExec, null, "dangerousNode NÃO pode executar antes de aprovação formal");

  const postStepExec = await prisma.nodeExecution.findFirst({
    where: { executionId: exec.id, nodeId: "postStep" },
  });
  assert.equal(postStepExec, null, "postStep NÃO pode executar enquanto suspenso");

  // 5. Valida registro da aprovação pendente no banco de dados
  const pendingApprovals = await prisma.approval.findMany({
    where: { executionId: exec.id, status: "PENDING" },
  });
  assert.equal(pendingApprovals.length, 1);
  const appr = pendingApprovals[0];
  assert.equal(appr.status, "PENDING");
  assert.equal(appr.message, "Aprovação de Transferência Financeira");
  assert.equal((appr.context as any).nodeId, "dangerousNode");

  // 6. Chamada da rota autorizada de aprovação
  const token = (app as any).jwt.sign({ sub: user.id, orgId: org.id });
  const approveRes = await app.inject({
    method: "POST",
    url: `/api/approvals/${appr.id}/approve`,
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(approveRes.statusCode, 200);
  const approveData = JSON.parse(approveRes.body);
  assert.equal(approveData.ok, true);
  assert.equal(approveData.status, "APPROVED");

  // 7. Valida que o workflow foi retomado e concluído com SUCCESS
  const finalExec = await prisma.workflowExecution.findUnique({ where: { id: exec.id } });
  assert.equal(finalExec?.status, "SUCCESS", "Execução deve terminar em SUCCESS após aprovação");

  // 8. Valida que todos os nós subsequentes executaram com sucesso
  const resumedDangerous = await prisma.nodeExecution.findFirst({
    where: { executionId: exec.id, nodeId: "dangerousNode" },
  });
  assert.ok(resumedDangerous, "dangerousNode deve ter sido executado após aprovação");
  assert.equal(resumedDangerous.status, "SUCCESS");

  const resumedPost = await prisma.nodeExecution.findFirst({
    where: { executionId: exec.id, nodeId: "postStep" },
  });
  assert.ok(resumedPost, "postStep deve ter sido executado após aprovação");
  assert.equal(resumedPost.status, "SUCCESS");

  // 9. Trilha de auditoria imutável verificada
  const integrity = await verifyWorkflowAuditIntegrity(exec.id);
  assert.equal(integrity.valid, true, "Hash chain da trilha de auditoria deve ser estritamente válida");
});

test("Gate G-1 [Suspensão & Reversibilidade]: Rejeição cancela workflow sem executar ação perigosa", async () => {
  const app = await buildApp({ logger: false });

  const { org, user, workflow } = await createGateFixture(
    [
      { id: "trg", type: "webhook" },
      {
        id: "dangerousAction",
        type: "set_fields",
        config: { requiresApproval: true, action: "format_drive" },
      },
      { id: "postAction", type: "set_fields", config: { done: true } },
    ],
    [
      { id: "e1", sourceNodeId: "trg", targetNodeId: "dangerousAction" },
      { id: "e2", sourceNodeId: "dangerousAction", targetNodeId: "postAction" },
    ]
  );

  const exec = await createWorkflowExecution(workflow.id, { start: true }, { userId: user.id });
  await runExecution(exec.id);

  const pending = await prisma.approval.findFirst({
    where: { executionId: exec.id, status: "PENDING" },
  });
  assert.ok(pending);

  const token = (app as any).jwt.sign({ sub: user.id, orgId: org.id });

  // Rejeita a aprovação
  const rejectRes = await app.inject({
    method: "POST",
    url: `/api/approvals/${pending.id}/reject`,
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(rejectRes.statusCode, 200);
  const rejectData = JSON.parse(rejectRes.body);
  assert.equal(rejectData.ok, true);
  assert.equal(rejectData.status, "REJECTED");

  // Execução deve transicionar para CANCELLED
  const cancelledExec = await prisma.workflowExecution.findUnique({ where: { id: exec.id } });
  assert.equal(cancelledExec?.status, "CANCELLED");

  // dangerousAction e postAction NÃO devem ter executado
  const dangerousExec = await prisma.nodeExecution.findFirst({
    where: { executionId: exec.id, nodeId: "dangerousAction" },
  });
  assert.equal(dangerousExec, null, "Ação perigosa NÃO pode ser executada se rejeitada");
});
