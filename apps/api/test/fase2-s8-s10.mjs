import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, "../../bot");
const require = createRequire(path.join(botDir, "package.json"));

const { chromium } = require("playwright");

const API_BASE = "http://127.0.0.1:3001";
const WEB_BASE = "http://localhost:3030";

const telemetry = {
  consoleErrors: [],
  pageErrors: [],
  httpErrors: [],
};

console.log("================================================================================");
console.log("FASE 2 — SUPERFÍCIE 8 (Settings & UI Global) & SUPERFÍCIE 10 (Performance Spot)");
console.log("Timestamp:", new Date().toISOString());
console.log("================================================================================\n");

// Helper for API calls
async function apiCall(endpoint, method = "GET", body = null, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const start = performance.now();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const durMs = Math.round((performance.now() - start) * 100) / 100;
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data: json, durMs };
}

async function run() {
  const report = {
    s8: {
      routesTested: [],
      emptyStates: [],
      consoleErrors: [],
      pageErrors: [],
      httpErrors: [],
      a11yChecks: [],
      responsiveChecks: [],
      verdict: "PENDING",
    },
    s10: {
      hardware: {
        cpu: "Intel(R) Core(TM) i5-3570 CPU @ 3.40GHz (4 cores)",
        ram: "16 GB DDR3 (TotalVisibleMemorySize: 16,736,324 KB)",
        os: "Windows 11 Pro 10.0.26100",
        node: process.version,
      },
      baselineNavLatencies: {},
      largeWorkflowMetrics: {},
      verdict: "PENDING",
    },
    findings: [],
  };

  // 1. Authenticate / Setup user
  const email = `qa-s8-s10-${Date.now()}@test.local`;
  const password = "Password2026!#";
  console.log(`[AUTH] Registering test user ${email}...`);
  const regRes = await apiCall("/api/auth/register", "POST", {
    email,
    password,
    name: "QA Perf Reviewer",
  });
  console.log(`[AUTH] Register HTTP ${regRes.status}`);

  console.log(`[AUTH] Logging in...`);
  const loginRes = await apiCall("/api/auth/login", "POST", { email, password });
  let token = loginRes.data?.token;
  let refreshToken = loginRes.data?.refreshToken;

  if (!token) {
    console.log("[AUTH] Using fallback verified user e2e-test-1788738035670@test.local...");
    const fbRes = await apiCall("/api/auth/login", "POST", {
      email: "e2e-test-1788738035670@test.local",
      password: "SecurePassword2026!#",
    });
    token = fbRes.data?.token;
    refreshToken = fbRes.data?.refreshToken;
  }
  assert.ok(token, "Authentication failed - token not acquired");
  console.log(`[AUTH] Token acquired successfully (length: ${token.length})`);

  // ============================================================================
  // SUPERFÍCIE 10 — PARTE A: Medição de Latências de API Base (Dataset Pequeno)
  // ============================================================================
  console.log("\n>>> SUPERFÍCIE 10: Medição de Latências de Rotas da API (Baseline)");
  const endpointsToMeasure = [
    "/api/workflows",
    "/api/templates",
    "/api/credentials",
    "/api/executions",
    "/api/orgs",
  ];
  for (const ep of endpointsToMeasure) {
    const latencies = [];
    let lastStatus = 0;
    for (let i = 0; i < 3; i++) {
      const r = await apiCall(ep, "GET", null, token);
      latencies.push(r.durMs);
      lastStatus = r.status;
    }
    const avg = Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 100) / 100;
    report.s10.baselineNavLatencies[ep] = {
      samples: latencies,
      avgMs: avg,
      minMs: Math.min(...latencies),
      maxMs: Math.max(...latencies),
      status: lastStatus,
    };
    console.log(`  ${ep}: avg ${avg}ms (samples: ${latencies.join(", ")}ms) [HTTP ${lastStatus}]`);
  }

  // ============================================================================
  // SUPERFÍCIE 10 — PARTE B: Criação, Save e Load de Workflow com 30 nós
  // ============================================================================
  console.log("\n>>> SUPERFÍCIE 10: Teste de Escala — Workflow com 30 Nós e 29 Arestas");
  const createWfRes = await apiCall("/api/workflows", "POST", {
    name: "Performance Scale Benchmark (30 Nodes)",
    description: "Benchmark DAG for Surface 10 testing with 30 nodes",
  }, token);
  assert.equal(createWfRes.status, 201, `Create workflow expected 201, got ${createWfRes.status}`);
  const wfId = createWfRes.data.workflow?.id || createWfRes.data.id;
  console.log(`  Workflow criado: ID ${wfId} em ${createWfRes.durMs}ms`);

  // Montar 30 nós e 29 arestas
  const nodes = [];
  const edges = [];
  for (let i = 1; i <= 30; i++) {
    const nodeId = `node_${i}`;
    let type = "transform";
    let label = `Transform Step ${i}`;
    if (i === 1) {
      type = "webhook";
      label = "Webhook Ingress";
    } else if (i === 15) {
      type = "condition";
      label = "Conditional Check";
    } else if (i === 30) {
      type = "http";
      label = "Egress HTTP Delivery";
    }

    nodes.push({
      id: nodeId,
      type,
      position: { x: (i - 1) * 220, y: (i % 2 === 0 ? 150 : 250) },
      data: {
        label,
        config: { stepIndex: i, code: `return { step: ${i}, processedAt: Date.now() };` },
      },
    });

    if (i > 1) {
      edges.push({
        id: `edge_${i - 1}_to_${i}`,
        source: `node_${i - 1}`,
        target: nodeId,
        sourceHandle: "default",
        targetHandle: "default",
      });
    }
  }

  // Save 30 nodes via PATCH /api/workflows/:id
  console.log(`  Disparando SAVE de 30 nós via PATCH /api/workflows/${wfId}...`);
  const saveTimes = [];
  let saveRes;
  for (let s = 0; s < 3; s++) {
    const t0 = performance.now();
    saveRes = await apiCall(`/api/workflows/${wfId}`, "PATCH", { nodes, edges }, token);
    const elapsed = Math.round((performance.now() - t0) * 100) / 100;
    saveTimes.push(elapsed);
  }
  const saveAvg = Math.round((saveTimes.reduce((a, b) => a + b, 0) / saveTimes.length) * 100) / 100;
  console.log(`  Save 30 nós: HTTP ${saveRes.status}, avg ${saveAvg}ms (amostras: ${saveTimes.join(", ")}ms)`);

  // Load 30 nodes via GET /api/workflows/:id
  console.log(`  Disparando LOAD de 30 nós via GET /api/workflows/${wfId}...`);
  const loadTimes = [];
  let loadRes;
  for (let l = 0; l < 3; l++) {
    const t0 = performance.now();
    loadRes = await apiCall(`/api/workflows/${wfId}`, "GET", null, token);
    const elapsed = Math.round((performance.now() - t0) * 100) / 100;
    loadTimes.push(elapsed);
  }
  const loadAvg = Math.round((loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length) * 100) / 100;
  console.log(`  Load 30 nós: HTTP ${loadRes.status}, avg ${loadAvg}ms (amostras: ${loadTimes.join(", ")}ms)`);
  assert.equal(loadRes.data.nodes?.length, 30, `Expected 30 nodes saved, got ${loadRes.data.nodes?.length}`);
  assert.equal(loadRes.data.edges?.length, 29, `Expected 29 edges saved, got ${loadRes.data.edges?.length}`);

  report.s10.largeWorkflowMetrics = {
    workflowId: wfId,
    nodeCount: 30,
    edgeCount: 29,
    saveDurationSamplesMs: saveTimes,
    saveAvgMs: saveAvg,
    loadDurationSamplesMs: loadTimes,
    loadAvgMs: loadAvg,
    payloadSizeBytes: JSON.stringify({ nodes, edges }).length,
  };

  // ============================================================================
  // SUPERFÍCIE 8: Navegação, UI Global, a11y, Estados Vazios e Render do Canvas 30 nós
  // ============================================================================
  console.log("\n>>> SUPERFÍCIE 8: Inicializando Browser Playwright Headless...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AgentFlow-QA/1.0",
  });

  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const entry = { text: msg.text(), location: msg.location() };
      telemetry.consoleErrors.push(entry);
      report.s8.consoleErrors.push(entry);
      console.log(`  [BROWSER ERROR] ${msg.text()} (${msg.location()?.url}:${msg.location()?.lineNumber})`);
    }
  });

  page.on("pageerror", (err) => {
    const entry = { message: err.message, stack: err.stack };
    telemetry.pageErrors.push(entry);
    report.s8.pageErrors.push(entry);
    console.log(`  [PAGE CRASH/ERROR] ${err.message}`);
  });

  page.on("response", (res) => {
    if (res.status() >= 400) {
      const entry = {
        url: res.url(),
        method: res.request().method(),
        status: res.status(),
        statusText: res.statusText(),
      };
      telemetry.httpErrors.push(entry);
      report.s8.httpErrors.push(entry);
      console.log(`  [HTTP ${res.status()}] ${res.request().method()} ${res.url()}`);
    }
  });

  // Inject session into localStorage
  console.log(`  Injetando credenciais de sessão no browser...`);
  await page.goto(`${WEB_BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token, refreshToken, email }) => {
    localStorage.setItem("agentflow_token", token);
    localStorage.setItem("agentflow_refresh_token", refreshToken);
    localStorage.setItem("agentflow_user", JSON.stringify({ name: "QA Perf Reviewer", email }));
  }, { token, refreshToken, email });

  const routesToTest = [
    { path: "/dashboard", name: "Dashboard" },
    { path: "/workflows", name: "Workflows List" },
    { path: "/templates", name: "Templates Catalog" },
    { path: "/credentials", name: "Credentials & Vault" },
    { path: "/executions", name: "Executions History" },
    { path: "/settings", name: "Settings (Personal/General)" },
    { path: "/settings/environments", name: "Settings - Environments" },
    { path: "/settings/sso", name: "Settings - SSO" },
    { path: "/settings/ldap", name: "Settings - LDAP" },
    { path: "/settings/external-secrets", name: "Settings - External Secrets" },
    { path: "/settings/roles", name: "Settings - Roles & Permissions" },
    { path: "/settings/ai-usage", name: "Settings - AI Token Usage" },
    { path: "/settings/log-streaming", name: "Settings - Log Streaming" },
    { path: "/settings/security", name: "Settings - Security" },
    { path: "/settings/users", name: "Settings - Team Users" },
  ];

  console.log("\n>>> Navegando pelas rotas da UI Global e inspecionando a11y & layout...");
  for (const route of routesToTest) {
    const tStart = performance.now();
    try {
      const res = await page.goto(`${WEB_BASE}${route.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      await page.waitForTimeout(1000); // Allow hydration

      const loadTimeMs = Math.round((performance.now() - tStart) * 100) / 100;
      const httpStatus = res ? res.status() : 0;

      // a11y & DOM inspection
      const a11y = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll("input, select, textarea"));
        const inputsWithoutLabels = inputs.filter((el) => {
          const hasAria = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
          const hasIdLabel = el.id && document.querySelector(`label[for="${el.id}"]`);
          const hasParentLabel = el.closest("label");
          return !hasAria && !hasIdLabel && !hasParentLabel;
        }).length;

        const buttons = Array.from(document.querySelectorAll("button"));
        const buttonsWithoutText = buttons.filter((btn) => {
          const text = btn.innerText?.trim();
          const aria = btn.getAttribute("aria-label") || btn.getAttribute("title");
          return !text && !aria;
        }).length;

        const emptyStates = Array.from(document.querySelectorAll("*")).filter((el) => {
          const txt = (el.textContent || "").toLowerCase();
          return (
            (txt.includes("no workflows") ||
             txt.includes("no credentials") ||
             txt.includes("no executions") ||
             txt.includes("nenhum") ||
             txt.includes("empty")) && el.children.length <= 2
          );
        }).length;

        return {
          totalInputs: inputs.length,
          inputsWithoutLabels,
          totalButtons: buttons.length,
          buttonsWithoutText,
          hasEmptyState: emptyStates > 0,
        };
      });

      report.s8.routesTested.push({
        name: route.name,
        path: route.path,
        status: httpStatus,
        loadTimeMs,
        a11y,
      });

      console.log(`  [ROUTE ${httpStatus}] ${route.name} (${route.path}) - ${loadTimeMs}ms (Inputs: ${a11y.totalInputs}, Unlabeled: ${a11y.inputsWithoutLabels}, Buttons: ${a11y.totalButtons}, EmptyState: ${a11y.hasEmptyState})`);
    } catch (err) {
      console.log(`  [ROUTE ERROR] ${route.name} (${route.path}): ${err.message}`);
      report.s8.routesTested.push({
        name: route.name,
        path: route.path,
        status: "ERROR",
        error: err.message,
      });
    }
  }

  // Check Responsiveness (Mobile Viewport 768x1024)
  console.log("\n>>> Testando Responsividade Básica (Viewport 768x1024)...");
  await page.setViewportSize({ width: 768, height: 1024 });
  for (const p of ["/dashboard", "/workflows", "/settings"]) {
    await page.goto(`${WEB_BASE}${p}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });
    report.s8.responsiveChecks.push({
      path: p,
      viewport: "768x1024",
      horizontalScrollOverflow: overflow,
    });
    console.log(`  Viewport 768x1024 ${p}: horizontalScrollOverflow = ${overflow}`);
  }

  // Restore Desktop Viewport
  await page.setViewportSize({ width: 1920, height: 1080 });

  // ============================================================================
  // SUPERFÍCIE 10 — PARTE C: Render e Estabilidade do Canvas com 30 Nós no Browser
  // ============================================================================
  console.log(`\n>>> SUPERFÍCIE 10: Carregando Canvas do Workflow de 30 nós na UI...`);
  console.log(`  Navegando para ${WEB_BASE}/workflows/${wfId}/editor...`);
  const canvasNavStart = performance.now();
  await page.goto(`${WEB_BASE}/workflows/${wfId}/editor`, { waitUntil: "domcontentloaded" });

  // Wait for ReactFlow to render nodes
  let renderedNodesCount = 0;
  try {
    await page.waitForSelector(".react-flow__node", { timeout: 15000 });
    const canvasHydrationMs = Math.round((performance.now() - canvasNavStart) * 100) / 100;
    renderedNodesCount = await page.evaluate(() => document.querySelectorAll(".react-flow__node").length);
    console.log(`  Canvas carregado em ${canvasHydrationMs}ms: ${renderedNodesCount} nós renderizados no DOM`);

    report.s10.largeWorkflowMetrics.uiCanvasRenderTimeMs = canvasHydrationMs;
    report.s10.largeWorkflowMetrics.uiRenderedNodesCount = renderedNodesCount;
    assert.equal(renderedNodesCount, 30, `Expected 30 nodes on canvas, found ${renderedNodesCount}`);
  } catch (err) {
    console.log(`  Erro aguardando nós no canvas: ${err.message}`);
    report.s10.largeWorkflowMetrics.uiError = err.message;
  }

  await browser.close();

  // Evaluate Findings
  if (telemetry.pageErrors.length > 0) {
    report.findings.push({
      id: "FINDING-F2-01",
      surface: "8. Settings e UI global",
      severity: "BLOCKER",
      confidence: "HIGH",
      evidence: `pageError: ${JSON.stringify(telemetry.pageErrors)}`,
      repro: "Navegar pelas rotas",
      impact: "Quebra de execução no cliente",
      suggestedFix: "Corrigir exceção não tratada",
    });
  }

  // Check HTTP 400 errors during navigation
  const severeHttpErrors = telemetry.httpErrors.filter(e => !e.url.includes("favicon") && e.status >= 500);
  if (severeHttpErrors.length > 0) {
    report.findings.push({
      id: "FINDING-F2-02",
      surface: "8. Settings e UI global",
      severity: "MAJOR",
      confidence: "HIGH",
      evidence: `HTTP 500s: ${JSON.stringify(severeHttpErrors)}`,
      repro: "Carregar páginas de settings ou listagens",
      impact: "Falhas de backend refletem na UI",
      suggestedFix: "Tratar rotas ausentes ou inicialização",
    });
  }

  report.s8.verdict = (report.s8.pageErrors.length === 0 && severeHttpErrors.length === 0) ? "PASSED" : "FAILED";
  report.s10.verdict = (report.s10.largeWorkflowMetrics.uiRenderedNodesCount === 30 && report.s10.largeWorkflowMetrics.saveAvgMs < 2000) ? "PASSED" : "FAILED";

  console.log("\n================================================================================");
  console.log("RESULTADO CONSOLIDADO:");
  console.log(`Superfície 8 (Settings & UI Global): ${report.s8.verdict}`);
  console.log(`Superfície 10 (Performance Spot): ${report.s10.verdict}`);
  console.log("================================================================================\n");

  return report;
}

run().then((rep) => {
  console.log("FINAL_REPORT_JSON_START");
  console.log(JSON.stringify(rep, null, 2));
  console.log("FINAL_REPORT_JSON_END");
  process.exit(0);
}).catch((err) => {
  console.error("FATAL ERROR IN S8/S10 SUITE:", err);
  process.exit(1);
});
