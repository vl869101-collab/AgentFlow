import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const botDir = path.resolve(__dirname, "../../bot");
const require = createRequire(path.join(botDir, "package.json"));

const { chromium } = require("playwright");

const API_BASE = "http://127.0.0.1:3001";
const WEB_BASE = "http://localhost:3030";

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

async function main() {
  console.log("================================================================================");
  console.log("FASE 2 — SUPERFÍCIE 8 (Settings & UI Global) & SUPERFÍCIE 10 (Performance Spot)");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Host Architecture:", os.arch(), os.platform(), os.release());
  console.log("CPU:", os.cpus()[0]?.model, `(${os.cpus().length} cores)`);
  console.log("Total RAM:", Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10, "GB");
  console.log("Free RAM:", Math.round(os.freemem() / (1024 * 1024 * 1024) * 100) / 100, "GB");
  console.log("Node version:", process.version);
  console.log("================================================================================\n");

  const results = {
    metadata: {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      hardware: {
        cpu: `${os.cpus()[0]?.model} (${os.cpus().length} cores)`,
        ramTotalGB: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10,
        ramFreeGB: Math.round(os.freemem() / (1024 * 1024 * 1024) * 100) / 100,
        os: `${os.type()} ${os.release()} (${os.arch()})`,
        limitations: "Bare-metal local dev execution on Intel Core i5-3570 without dedicated GPU. Backend with PostgreSQL connected and Redis offline (fallback in-memory). Frontend served by Next.js dev server on :3030.",
      },
    },
    surface8: {
      routes: [],
      viewportsTested: ["1280x800", "768x1024"],
      consoleErrors: [],
      pageErrors: [],
      httpErrors: [],
      emptyStatesFound: [],
      a11ySummary: {
        totalInputsAudited: 0,
        unlabeledInputsTotal: 0,
        totalButtonsAudited: 0,
        unlabeledButtonsTotal: 0,
        imagesWithoutAltTotal: 0,
      },
      responsivenessSummary: {
        routesWithHorizontalOverflow: [],
      },
      verdict: "PENDING",
    },
    surface10: {
      baselineApiLatencies: {},
      workflow30Nodes: {
        id: null,
        nodeCount: 30,
        edgeCount: 29,
        saveSamplesMs: [],
        saveAvgMs: 0,
        saveMinMs: 0,
        saveMaxMs: 0,
        loadSamplesMs: [],
        loadAvgMs: 0,
        loadMinMs: 0,
        loadMaxMs: 0,
        payloadBytes: 0,
        uiCanvasMountTimeMs: 0,
        uiRenderedNodesCount: 0,
        uiErrors: [],
      },
      verdict: "PENDING",
    },
    findings: [],
  };

  // --------------------------------------------------------------------------
  // 1. Autenticação para testes
  // --------------------------------------------------------------------------
  const email = `qa-f2-s8-s10-${Date.now()}@test.local`;
  const password = "Password2026!#";
  console.log(`[AUTH] Registrando usuário de teste ${email}...`);
  const regRes = await apiCall("/api/auth/register", "POST", {
    email,
    password,
    name: "QA Surface 8 and 10",
  });
  console.log(`[AUTH] Resposta registro: HTTP ${regRes.status}`);

  console.log("[AUTH] Efetuando login...");
  const loginRes = await apiCall("/api/auth/login", "POST", { email, password });
  let token = loginRes.data?.token;
  let refreshToken = loginRes.data?.refreshToken;

  if (!token) {
    console.log("[AUTH] Fallback para usuário de teste preexistente...");
    const fbRes = await apiCall("/api/auth/login", "POST", {
      email: "e2e-test-1788738035670@test.local",
      password: "SecurePassword2026!#",
    });
    token = fbRes.data?.token;
    refreshToken = fbRes.data?.refreshToken;
  }
  assert.ok(token, "Falha ao obter token JWT de autenticação");
  console.log(`[AUTH] Token JWT obtido com sucesso (${token.length} chars)\n`);

  // --------------------------------------------------------------------------
  // 2. SUPERFÍCIE 10: Medição Empírica de Latências de Rotas Principais
  // --------------------------------------------------------------------------
  console.log(">>> [SUPERFÍCIE 10] Medição Empírica de Latências de Rotas Principais (Baseline API)");
  const endpoints = [
    { ep: "/health", auth: false },
    { ep: "/api/workflows", auth: true },
    { ep: "/api/templates", auth: true },
    { ep: "/api/credentials", auth: true },
    { ep: "/api/executions", auth: true },
    { ep: "/api/orgs", auth: true },
  ];

  for (const { ep, auth: reqAuth } of endpoints) {
    const samples = [];
    let lastStatus = 0;
    for (let i = 0; i < 3; i++) {
      const r = await apiCall(ep, "GET", null, reqAuth ? token : null);
      samples.push(r.durMs);
      lastStatus = r.status;
    }
    const avg = Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 100) / 100;
    results.surface10.baselineApiLatencies[ep] = {
      samplesMs: samples,
      avgMs: avg,
      minMs: Math.min(...samples),
      maxMs: Math.max(...samples),
      status: lastStatus,
    };
    console.log(`  ${ep.padEnd(20)}: avg ${avg}ms (min: ${Math.min(...samples)}ms, max: ${Math.max(...samples)}ms) [HTTP ${lastStatus}]`);
  }

  // --------------------------------------------------------------------------
  // 3. SUPERFÍCIE 10: Criação, Save e Load de Workflow com 30 Nós e 29 Arestas
  // --------------------------------------------------------------------------
  console.log("\n>>> [SUPERFÍCIE 10] Workflow Scale Test: Criação, Save e Load com 30 Nós e 29 Arestas");
  const createRes = await apiCall("/api/workflows", "POST", {
    name: "Benchmark 30 Nodes DAG - Surface 10",
    description: "Stress test workflow with 30 nodes and 29 edges for latency evaluation",
  }, token);
  assert.equal(createRes.status, 201, `Criação de workflow retornou ${createRes.status}`);
  const wfId = createRes.data.workflow?.id || createRes.data.id;
  results.surface10.workflow30Nodes.id = wfId;
  console.log(`  Workflow criado: ID ${wfId} em ${createRes.durMs}ms`);

  // Montar 30 nós lineares e 29 arestas com IDs únicos
  const nodes = [];
  const edges = [];
  for (let i = 1; i <= 30; i++) {
    const nodeId = `node_${wfId}_${i}`;
    let type = "transform";
    let label = `Transform ${i}`;
    if (i === 1) {
      type = "webhook";
      label = "Webhook Start";
    } else if (i === 15) {
      type = "condition";
      label = "Condition 15";
    } else if (i === 30) {
      type = "http";
      label = "HTTP Finish";
    }

    nodes.push({
      id: nodeId,
      type: type,
      position: { x: (i - 1) * 240, y: i % 2 === 0 ? 120 : 260 },
      data: {
        type,
        label,
        description: `Node ${i} in benchmark scale DAG`,
        status: "PENDING",
        config: {
          stepIndex: i,
          expression: `step_${i}_data`,
        },
      },
    });

    if (i > 1) {
      edges.push({
        id: `edge_${wfId}_${i - 1}_to_${i}`,
        source: `node_${wfId}_${i - 1}`,
        target: nodeId,
        sourceHandle: "default",
        targetHandle: "default",
      });
    }
  }

  const payloadStr = JSON.stringify({ nodes, edges });
  results.surface10.workflow30Nodes.payloadBytes = payloadStr.length;
  console.log(`  Payload com 30 nós e 29 arestas serializado: ${(payloadStr.length / 1024).toFixed(2)} KB`);

  // Medição do tempo de Save (PATCH /api/workflows/:id)
  console.log(`  Medindo tempo de SAVE (PATCH /api/workflows/${wfId})... (3 amostras)`);
  const saveSamples = [];
  for (let s = 0; s < 3; s++) {
    const r = await apiCall(`/api/workflows/${wfId}`, "PATCH", { nodes, edges }, token);
    if (r.status !== 200) {
      console.error("Save Error Details:", JSON.stringify(r.data));
    }
    assert.equal(r.status, 200, `Save falhou com status ${r.status}: ${JSON.stringify(r.data)}`);
    saveSamples.push(r.durMs);
  }
  const saveAvg = Math.round((saveSamples.reduce((a, b) => a + b, 0) / saveSamples.length) * 100) / 100;
  results.surface10.workflow30Nodes.saveSamplesMs = saveSamples;
  results.surface10.workflow30Nodes.saveAvgMs = saveAvg;
  results.surface10.workflow30Nodes.saveMinMs = Math.min(...saveSamples);
  results.surface10.workflow30Nodes.saveMaxMs = Math.max(...saveSamples);
  console.log(`  Save 30 nós: avg ${saveAvg}ms (min: ${Math.min(...saveSamples)}ms, max: ${Math.max(...saveSamples)}ms)`);

  // Medição do tempo de Load (GET /api/workflows/:id)
  console.log(`  Medindo tempo de LOAD (GET /api/workflows/${wfId})... (3 amostras)`);
  const loadSamples = [];
  let loadedData = null;
  for (let l = 0; l < 3; l++) {
    const r = await apiCall(`/api/workflows/${wfId}`, "GET", null, token);
    assert.equal(r.status, 200, `Load falhou com status ${r.status}`);
    loadSamples.push(r.durMs);
    loadedData = r.data;
  }
  const loadAvg = Math.round((loadSamples.reduce((a, b) => a + b, 0) / loadSamples.length) * 100) / 100;
  results.surface10.workflow30Nodes.loadSamplesMs = loadSamples;
  results.surface10.workflow30Nodes.loadAvgMs = loadAvg;
  results.surface10.workflow30Nodes.loadMinMs = Math.min(...loadSamples);
  results.surface10.workflow30Nodes.loadMaxMs = Math.max(...loadSamples);
  assert.equal(loadedData.nodes?.length, 30, `Esperado 30 nós salvos, retornado ${loadedData.nodes?.length}`);
  assert.equal(loadedData.edges?.length, 29, `Esperado 29 arestas salvas, retornado ${loadedData.edges?.length}`);
  console.log(`  Load 30 nós: avg ${loadAvg}ms (min: ${Math.min(...loadSamples)}ms, max: ${Math.max(...loadSamples)}ms) [Nós: ${loadedData.nodes?.length}, Arestas: ${loadedData.edges?.length}]`);

  // --------------------------------------------------------------------------
  // 4. SUPERFÍCIE 8: Navegação Headless, a11y, Responsividade e UI Global
  // --------------------------------------------------------------------------
  console.log("\n>>> [SUPERFÍCIE 8] Inicializando Navegador Headless Playwright (Chromium)...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const routesToTest = [
    { path: "/dashboard", name: "Dashboard" },
    { path: "/workflows", name: "Workflows" },
    { path: "/templates", name: "Templates" },
    { path: "/credentials", name: "Credentials" },
    { path: "/executions", name: "Executions" },
    { path: "/settings", name: "Settings" },
    { path: "/settings/environments", name: "Settings - Environments" },
    { path: "/settings/sso", name: "Settings - SSO" },
    { path: "/settings/ldap", name: "Settings - LDAP" },
    { path: "/settings/external-secrets", name: "Settings - External Secrets" },
    { path: "/settings/security", name: "Settings - Security" },
    { path: "/settings/roles", name: "Settings - Roles" },
    { path: "/settings/users", name: "Settings - Users" },
    { path: "/settings/ai-usage", name: "Settings - AI Usage" },
    { path: "/settings/opentelemetry", name: "Settings - OpenTelemetry" },
    { path: "/settings/community-nodes", name: "Settings - Community Nodes" },
    { path: "/settings/log-streaming", name: "Settings - Log Streaming" },
  ];

  const viewports = [
    { name: "Desktop", width: 1280, height: 800 },
    { name: "Tablet/Portrait", width: 768, height: 1024 },
  ];

  for (const vp of viewports) {
    console.log(`\n--- Testando Viewport ${vp.name} (${vp.width}x${vp.height}) ---`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: `AgentFlow-QA-${vp.name}/1.0`,
    });
    const page = await context.newPage();

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const entry = {
          viewport: `${vp.width}x${vp.height}`,
          route: page.url(),
          text: msg.text(),
          location: msg.location(),
        };
        results.surface8.consoleErrors.push(entry);
        console.log(`    [CONSOLE ERROR] [${vp.name}] ${msg.text().slice(0, 140)}`);
      }
    });

    page.on("pageerror", (err) => {
      const entry = {
        viewport: `${vp.width}x${vp.height}`,
        route: page.url(),
        message: err.message,
        stack: err.stack,
      };
      results.surface8.pageErrors.push(entry);
      console.log(`    [PAGE ERROR / EXCEPTION] [${vp.name}] ${err.message}`);
    });

    page.on("response", (res) => {
      if (res.status() >= 400) {
        const url = res.url();
        // Ignore expected 404 for optional assets like favicon
        if (!url.includes("favicon.ico")) {
          const entry = {
            viewport: `${vp.width}x${vp.height}`,
            status: res.status(),
            method: res.request().method(),
            url: res.url(),
          };
          results.surface8.httpErrors.push(entry);
          console.log(`    [HTTP >= 400] [${vp.name}] ${res.status()} ${res.request().method()} ${res.url().slice(0, 100)}`);
        }
      }
    });

    // Injetar credenciais no localStorage
    await page.goto(`${WEB_BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.evaluate(({ token, refreshToken, email }) => {
      localStorage.setItem("agentflow_token", token);
      localStorage.setItem("agentflow_refresh_token", refreshToken);
      localStorage.setItem("agentflow_user", JSON.stringify({ name: "QA Surface 8 and 10", email }));
    }, { token, refreshToken, email });

    for (const r of routesToTest) {
      const startNav = performance.now();
      try {
        const resp = await page.goto(`${WEB_BASE}${r.path}`, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        await page.waitForTimeout(700); // tempo para hidratação React

        const navMs = Math.round((performance.now() - startNav) * 100) / 100;
        const httpStatus = resp ? resp.status() : 0;

        // Inspeção DOM: a11y, empty states e overflow
        const domAnalysis = await page.evaluate(() => {
          // Inputs
          const inputs = Array.from(document.querySelectorAll("input, select, textarea"));
          const unlabeledInputs = inputs.filter((el) => {
            const hasAria = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
            const hasId = el.id && document.querySelector(`label[for="${el.id}"]`);
            const hasParentLabel = el.closest("label");
            const isHidden = el.getAttribute("type") === "hidden";
            return !isHidden && !hasAria && !hasId && !hasParentLabel;
          });

          // Botões
          const buttons = Array.from(document.querySelectorAll("button"));
          const unlabeledButtons = buttons.filter((btn) => {
            const text = btn.innerText?.trim();
            const aria = btn.getAttribute("aria-label") || btn.getAttribute("title");
            return !text && !aria;
          });

          // Imagens
          const images = Array.from(document.querySelectorAll("img"));
          const imagesWithoutAlt = images.filter((img) => !img.hasAttribute("alt"));

          // Foco e tabindex
          const focusable = Array.from(document.querySelectorAll("a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])"));

          // Empty states
          const allText = document.body.innerText || "";
          const emptyPhrases = [
            "no workflows", "nenhum workflow", "create workflow", "criar workflow",
            "no executions", "nenhuma execução", "no credentials", "nenhuma credencial",
            "no templates", "nenhum template", "no environments", "nenhum ambiente",
            "no users", "nenhum usuário", "no data", "nenhum dado", "empty"
          ];
          const hasEmptyStateIndication = emptyPhrases.some(p => allText.toLowerCase().includes(p));

          // Responsividade / Overflow horizontal
          const hasHorizontalOverflow = document.documentElement.scrollWidth > window.innerWidth;

          return {
            totalInputs: inputs.length,
            unlabeledInputsCount: unlabeledInputs.length,
            totalButtons: buttons.length,
            unlabeledButtonsCount: unlabeledButtons.length,
            totalImages: images.length,
            imagesWithoutAltCount: imagesWithoutAlt.length,
            focusableCount: focusable.length,
            hasEmptyStateIndication,
            hasHorizontalOverflow,
          };
        });

        // Registrar métricas
        if (vp.width === 1280) {
          results.surface8.routes.push({
            name: r.name,
            path: r.path,
            status: httpStatus,
            loadTimeMs: navMs,
            a11y: domAnalysis,
          });
          results.surface8.a11ySummary.totalInputsAudited += domAnalysis.totalInputs;
          results.surface8.a11ySummary.unlabeledInputsTotal += domAnalysis.unlabeledInputsCount;
          results.surface8.a11ySummary.totalButtonsAudited += domAnalysis.totalButtons;
          results.surface8.a11ySummary.unlabeledButtonsTotal += domAnalysis.unlabeledButtonsCount;
          results.surface8.a11ySummary.imagesWithoutAltTotal += domAnalysis.imagesWithoutAltCount;
          if (domAnalysis.hasEmptyStateIndication) {
            results.surface8.emptyStatesFound.push({ route: r.path, name: r.name });
          }
        }

        if (domAnalysis.hasHorizontalOverflow) {
          results.surface8.responsivenessSummary.routesWithHorizontalOverflow.push({
            viewport: `${vp.width}x${vp.height}`,
            route: r.path,
          });
        }

        console.log(`  [OK] ${r.name.padEnd(30)} ${r.path.padEnd(30)} | ${navMs}ms | Overflow: ${domAnalysis.hasHorizontalOverflow} | Unlabeled(Input: ${domAnalysis.unlabeledInputsCount}, Btn: ${domAnalysis.unlabeledButtonsCount}) | EmptyState: ${domAnalysis.hasEmptyStateIndication}`);
      } catch (err) {
        console.log(`  [FAIL] ${r.name.padEnd(30)} ${r.path.padEnd(30)} | ERRO: ${err.message}`);
        results.surface8.routes.push({
          name: r.name,
          path: r.path,
          status: "TIMEOUT_OR_ERROR",
          error: err.message,
        });
      }
    }
    await context.close();
  }

  // --------------------------------------------------------------------------
  // 5. SUPERFÍCIE 10 (Parte C): Medição de Montagem do Canvas com 30 Nós na UI
  // --------------------------------------------------------------------------
  console.log("\n>>> [SUPERFÍCIE 10] Medição do Tempo de Montagem do Canvas na UI (30 nós)");
  const canvasContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const canvasPage = await canvasContext.newPage();

  canvasPage.on("console", (msg) => {
    if (msg.type() === "error") {
      results.surface10.workflow30Nodes.uiErrors.push(msg.text());
      console.log(`    [CANVAS ERROR] ${msg.text().slice(0, 140)}`);
    }
  });

  // Login
  await canvasPage.goto(`${WEB_BASE}/login`, { waitUntil: "domcontentloaded" });
  await canvasPage.evaluate(({ token, refreshToken, email }) => {
    localStorage.setItem("agentflow_token", token);
    localStorage.setItem("agentflow_refresh_token", refreshToken);
    localStorage.setItem("agentflow_user", JSON.stringify({ name: "QA Surface 8 and 10", email }));
  }, { token, refreshToken, email });

  const editorUrl = `${WEB_BASE}/workflows/${wfId}/editor`;
  console.log(`  Navegando para o editor do workflow: ${editorUrl}...`);
  const canvasStart = performance.now();
  await canvasPage.goto(editorUrl, { waitUntil: "domcontentloaded" });

  try {
    // Aguardar até que nós do React Flow sejam renderizados
    await canvasPage.waitForSelector(".react-flow__node", { timeout: 15000 });
    const canvasMountMs = Math.round((performance.now() - canvasStart) * 100) / 100;
    const renderedNodes = await canvasPage.evaluate(() => document.querySelectorAll(".react-flow__node").length);
    const renderedEdges = await canvasPage.evaluate(() => document.querySelectorAll(".react-flow__edge").length);

    results.surface10.workflow30Nodes.uiCanvasMountTimeMs = canvasMountMs;
    results.surface10.workflow30Nodes.uiRenderedNodesCount = renderedNodes;
    results.surface10.workflow30Nodes.uiRenderedEdgesCount = renderedEdges;
    console.log(`  [CANVAS MOUNT SUCESSO] Renderizou ${renderedNodes} nós e ${renderedEdges} arestas no DOM em ${canvasMountMs}ms`);
  } catch (err) {
    console.log(`  [CANVAS MOUNT FALHA]: ${err.message}`);
    results.surface10.workflow30Nodes.uiErrors.push(err.message);
  }

  await canvasContext.close();
  await browser.close();

  // --------------------------------------------------------------------------
  // 6. Consolidação dos Veredictos e Findings
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("CONSOLIDAÇÃO DE FINDINGS E VEREDICTOS");
  console.log("================================================================================");

  // Análise de Findings:
  // Finding 1: Inputs ou Buttons sem label acessível
  if (results.surface8.a11ySummary.unlabeledInputsTotal > 0 || results.surface8.a11ySummary.unlabeledButtonsTotal > 0) {
    results.findings.push({
      id: "FINDING-F2-08",
      surface: "8. Settings e UI global",
      severity: "MINOR",
      confidence: "HIGH",
      evidence: `Total de ${results.surface8.a11ySummary.unlabeledButtonsTotal} botões sem aria-label/texto acessível e ${results.surface8.a11ySummary.unlabeledInputsTotal} inputs sem label associado mapeados em 17 rotas.`,
      repro: "Inspeção DOM em /settings, /workflows e subrotas de settings.",
      impact: "Dificuldade de navegação para usuários dependentes de leitores de tela (a11y WCAG 2.1 AA).",
      suggestedFix: "Adicionar atributos aria-label explicativos a botões de ícone (ex: ChevronDown, MoreVertical, Search) e vincular labels a inputs.",
    });
  }

  // Finding 2: Overflow horizontal em viewport móvel/tablet
  if (results.surface8.responsivenessSummary.routesWithHorizontalOverflow.length > 0) {
    const overflowRoutes = [...new Set(results.surface8.responsivenessSummary.routesWithHorizontalOverflow.map(r => r.route))];
    results.findings.push({
      id: "FINDING-F2-09",
      surface: "8. Settings e UI global",
      severity: "MINOR",
      confidence: "HIGH",
      evidence: `Overflow horizontal detectado no viewport 768x1024 nas rotas: ${overflowRoutes.join(", ")}.`,
      repro: "Carregar as rotas mencionadas com viewport width <= 768px.",
      impact: "Barra de rolagem horizontal indesejada em tablets em modo retrato ou telas estreitas.",
      suggestedFix: "Adicionar 'overflow-x-hidden' ou ajustar grid/tabelas nas páginas de settings e workflows para mobile/tablet.",
    });
  }

  // Finding 3: HTTP >= 400 durante navegação
  const realHttpErrors = results.surface8.httpErrors.filter(e => e.status >= 500);
  if (realHttpErrors.length > 0) {
    results.findings.push({
      id: "FINDING-F2-10",
      surface: "8. Settings e UI global",
      severity: "MAJOR",
      confidence: "HIGH",
      evidence: `Erros HTTP 500 detectados: ${JSON.stringify(realHttpErrors)}`,
      repro: "Navegação nas rotas afetadas",
      impact: "Falhas de backend refletem diretamente na interface do usuário.",
      suggestedFix: "Implementar tratamento de fallback e tratar exceções não capturadas no backend.",
    });
  }

  // Veredictos
  const s8HasBlockers = results.surface8.pageErrors.length > 0 || realHttpErrors.length > 0;
  results.surface8.verdict = s8HasBlockers ? "FAILED" : "PASSED";

  const s10Passed = results.surface10.workflow30Nodes.uiRenderedNodesCount === 30 &&
                    results.surface10.workflow30Nodes.saveAvgMs > 0 &&
                    results.surface10.workflow30Nodes.saveAvgMs < 3000;
  results.surface10.verdict = s10Passed ? "PASSED" : "FAILED";

  console.log(`Veredicto Superfície 8 (Settings & UI Global): ${results.surface8.verdict}`);
  console.log(`Veredicto Superfície 10 (Performance Spot): ${results.surface10.verdict}`);
  console.log(`Total Findings gerados: ${results.findings.length}`);

  // Salvar evidências estruturadas em JSON
  const evidencePath = path.join(__dirname, "test-s8-s10-results.json");
  await fs.writeFile(evidencePath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nEvidências estruturadas gravadas em: ${evidencePath}`);

  return results;
}

main().catch((err) => {
  console.error("ERRO FATAL NA EXECUÇÃO DE S8/S10:", err);
  process.exit(1);
});
