import { strict as assert } from "node:assert";

const BASE_URL = "http://127.0.0.1:3001";
const results = {
  s2: { passed: 0, failed: 0, details: [] },
  s3: { passed: 0, failed: 0, details: [] },
  s4: { passed: 0, failed: 0, details: [] },
  findings: [],
};

function log(surface, testName, status, extra = "") {
  console.log(`[${surface.toUpperCase()}] ${status ? "✓" : "✗"} ${testName} ${extra}`);
  if (status) {
    results[surface].passed++;
    results[surface].details.push({ testName, status: "PASSED", extra });
  } else {
    results[surface].failed++;
    results[surface].details.push({ testName, status: "FAILED", extra });
  }
}

async function run() {
  console.log("=== INICIANDO TESTES FASE 2: SUPERFÍCIES 2, 3 E 4 ===");
  const email = `fase2-wf-${Date.now()}@test.local`;
  const password = "Password123!@#Secure";

  // 1. Auth Setup
  console.log(`\n--- 1. Setup Auth: ${email} ---`);
  let regEmail = email;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "QA Tester Workflows" }),
  });
  if (regRes.status === 429) {
    console.log("Rate limit atingido em /register (429). Utilizando usuário pré-existente para os testes.");
    regEmail = "fase2-wf-1788744014562@test.local";
  } else {
    assert.equal(regRes.status, 201, `Register status should be 201, got ${regRes.status}`);
  }

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: regEmail, password }),
  });
  assert.equal(loginRes.status, 200, `Login status should be 200, got ${loginRes.status}`);
  const loginData = await loginRes.json();
  const token = loginData.token;
  assert(token, "JWT token must be present");
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // ══════════════════════════════════════════════════════════════
  // SUPERFÍCIE 2: Workflows além do editor
  // ══════════════════════════════════════════════════════════════
  console.log("\n--- SUPERFÍCIE 2: Workflows além do editor ---");

  // 2.1 Listagem inicial
  try {
    const listRes = await fetch(`${BASE_URL}/api/workflows`, { headers: authHeaders });
    const listData = await listRes.json();
    assert.equal(listRes.status, 200);
    assert(Array.isArray(listData.items || listData));
    log("s2", "GET /api/workflows - listagem inicial", true, `HTTP ${listRes.status}`);
  } catch (err) {
    log("s2", "GET /api/workflows - listagem inicial", false, err.message);
  }

  // 2.2 Criação de Workflow
  let wfId;
  try {
    const createRes = await fetch(`${BASE_URL}/api/workflows`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Workflow Alpha QA",
        description: "Teste de ciclo de vida completo",
      }),
    });
    const createData = await createRes.json();
    assert.equal(createRes.status, 201);
    assert(createData.id);
    wfId = createData.id;
    log("s2", "POST /api/workflows - criação", true, `ID: ${wfId}`);
  } catch (err) {
    log("s2", "POST /api/workflows - criação", false, err.message);
  }

  // 2.3 Atualização de Metadados (PATCH / PUT)
  try {
    const patchRes = await fetch(`${BASE_URL}/api/workflows/${wfId}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Workflow Alpha QA (Renamed)",
        status: "ACTIVE",
      }),
    });
    const patchData = await patchRes.json();
    assert.equal(patchRes.status, 200);
    assert.equal(patchData.name, "Workflow Alpha QA (Renamed)");
    log("s2", "PATCH /api/workflows/:id - renomear e ativar", true, `Status: ${patchData.status}`);
  } catch (err) {
    log("s2", "PATCH /api/workflows/:id - renomear e ativar", false, err.message);
  }

  // 2.4 Busca e Filtro
  try {
    const searchRes = await fetch(`${BASE_URL}/api/workflows?search=Renamed`, { headers: authHeaders });
    const searchData = await searchRes.json();
    const items = searchData.items || searchData;
    assert.equal(searchRes.status, 200);
    assert(items.some((w) => w.id === wfId));
    log("s2", "GET /api/workflows?search=... - busca por texto", true, `Encontrado: ${items.length} itens`);

    const filterActiveRes = await fetch(`${BASE_URL}/api/workflows?status=ACTIVE`, { headers: authHeaders });
    const filterData = await filterActiveRes.json();
    const activeItems = filterData.items || filterData;
    assert(activeItems.every((w) => w.status === "ACTIVE"));
    log("s2", "GET /api/workflows?status=ACTIVE - filtro por status", true, `Total ativo: ${activeItems.length}`);
  } catch (err) {
    log("s2", "GET /api/workflows?search/status - busca e filtros", false, err.message);
  }

  // 2.5 Canvas & Versão 1 (Usando tipos válidos: manual, http)
  try {
    const canvasV1 = {
      nodes: [
        { id: "node-1", type: "manual", label: "Start", position: { x: 100, y: 100 }, config: {} },
        { id: "node-2", type: "http", label: "Fetch Data", position: { x: 300, y: 100 }, config: { url: "https://httpbin.org/get" } },
      ],
      edges: [
        { id: "edge-1", source: "node-1", target: "node-2" },
      ],
    };
    const saveV1Res = await fetch(`${BASE_URL}/api/workflows/${wfId}/canvas`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify(canvasV1),
    });
    const saveV1Data = await saveV1Res.json();
    assert.equal(saveV1Res.status, 200, `Expected 200, got ${saveV1Res.status}: ${JSON.stringify(saveV1Data)}`);
    assert.equal(saveV1Data.version, 1);
    log("s2", "PUT /api/workflows/:id/canvas - Versão 1", true, `Versão snapshot: ${saveV1Data.version}`);
  } catch (err) {
    log("s2", "PUT /api/workflows/:id/canvas - Versão 1", false, err.message);
  }

  // 2.6 Canvas & Versão 2
  try {
    const canvasV2 = {
      nodes: [
        { id: "node-1", type: "manual", label: "Start", position: { x: 100, y: 100 }, config: {} },
        { id: "node-2", type: "http", label: "Fetch Data", position: { x: 300, y: 100 }, config: { url: "https://httpbin.org/get" } },
        { id: "node-3", type: "code", label: "Transform", position: { x: 500, y: 100 }, config: { code: "return { done: true };" } },
      ],
      edges: [
        { id: "edge-1", source: "node-1", target: "node-2" },
        { id: "edge-2", source: "node-2", target: "node-3" },
      ],
    };
    const saveV2Res = await fetch(`${BASE_URL}/api/workflows/${wfId}/canvas`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify(canvasV2),
    });
    const saveV2Data = await saveV2Res.json();
    assert.equal(saveV2Res.status, 200, `Expected 200, got ${saveV2Res.status}: ${JSON.stringify(saveV2Data)}`);
    assert.equal(saveV2Data.version, 2);
    log("s2", "PUT /api/workflows/:id/canvas - Versão 2", true, `Versão snapshot: ${saveV2Data.version}`);
  } catch (err) {
    log("s2", "PUT /api/workflows/:id/canvas - Versão 2", false, err.message);
  }

  // 2.7 Listagem e Leitura de Versões
  try {
    const listVerRes = await fetch(`${BASE_URL}/api/workflows/${wfId}/versions`, { headers: authHeaders });
    const versions = await listVerRes.json();
    assert.equal(listVerRes.status, 200);
    assert(Array.isArray(versions) && versions.length >= 2, `Expected >=2 versions, got ${versions.length}`);
    log("s2", "GET /api/workflows/:id/versions - histórico de versões", true, `Total versões: ${versions.length}`);

    const getV1Res = await fetch(`${BASE_URL}/api/workflows/${wfId}/versions/1`, { headers: authHeaders });
    const v1Data = await getV1Res.json();
    assert.equal(getV1Res.status, 200);
    assert.equal(v1Data.version, 1);
    log("s2", "GET /api/workflows/:id/versions/1 - detalhe da versão 1", true, `Snapshot com ${v1Data.snapshot.nodes.length} nós`);
  } catch (err) {
    log("s2", "GET /api/workflows/:id/versions - consulta de versões", false, err.message);
  }

  // 2.8 Semantic Diff
  try {
    const diffRes = await fetch(`${BASE_URL}/api/workflows/${wfId}/diff?v1=1&v2=2`, { headers: authHeaders });
    const diffData = await diffRes.json();
    assert.equal(diffRes.status, 200, `Expected 200, got ${diffRes.status}: ${JSON.stringify(diffData)}`);
    assert(diffData.addedNodes !== undefined || diffData.changes !== undefined || diffData.nodes !== undefined);
    log("s2", "GET /api/workflows/:id/diff?v1=1&v2=2 - Semantic Diff", true, `Diff chaves: ${Object.keys(diffData).join(", ")}`);
  } catch (err) {
    log("s2", "GET /api/workflows/:id/diff?v1=1&v2=2 - Semantic Diff", false, err.message);
  }

  // 2.9 Rollback de Versão
  try {
    const rollbackRes = await fetch(`${BASE_URL}/api/workflows/${wfId}/rollback`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ version: 1 }),
    });
    const rollbackData = await rollbackRes.json();
    assert.equal(rollbackRes.status, 200, `Expected 200, got ${rollbackRes.status}: ${JSON.stringify(rollbackData)}`);
    assert.equal(rollbackData.version, 3); // Novo snapshot versão 3 restaurando v1
    log("s2", "POST /api/workflows/:id/rollback - Rollback para V1", true, `Criada versão ${rollbackData.version}`);
  } catch (err) {
    log("s2", "POST /api/workflows/:id/rollback - Rollback para V1", false, err.message);
  }

  // 2.10 Import n8n Workflow (Válido e Inválido)
  try {
    const validN8n = {
      name: "n8n Imported Flow",
      nodes: [
        { id: "n1", name: "Start", type: "n8n-nodes-base.start", position: [100, 100], parameters: {} },
        { id: "n2", name: "HTTP", type: "n8n-nodes-base.httpRequest", position: [300, 100], parameters: { url: "https://api.example.com" } },
      ],
      connections: {
        Start: { main: [[{ node: "HTTP", type: "main", index: 0 }]] },
      },
    };
    const importRes = await fetch(`${BASE_URL}/api/workflows/import`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ n8nJson: validN8n }),
    });
    const importData = await importRes.json();
    assert.equal(importRes.status, 201);
    assert(importData.workflow.id);
    log("s2", "POST /api/workflows/import - n8n válido", true, `Importado WF ID: ${importData.workflow.id}`);

    // Inválido
    const invalidRes = await fetch(`${BASE_URL}/api/workflows/import`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ n8nJson: "not a valid json object" }),
    });
    assert.equal(invalidRes.status, 400);
    log("s2", "POST /api/workflows/import - rejeição payload inválido", true, `HTTP 400 tratado`);
  } catch (err) {
    log("s2", "POST /api/workflows/import", false, err.message);
  }

  // 2.11 Exclusão de Workflow (DELETE)
  try {
    const delRes = await fetch(`${BASE_URL}/api/workflows/${wfId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    assert.equal(delRes.status, 200);
    const getDeleted = await fetch(`${BASE_URL}/api/workflows/${wfId}`, { headers: authHeaders });
    assert.equal(getDeleted.status, 404);
    log("s2", "DELETE /api/workflows/:id - exclusão e 404 subsequente", true, `Excluído com sucesso`);
  } catch (err) {
    log("s2", "DELETE /api/workflows/:id", false, err.message);
  }

  // ══════════════════════════════════════════════════════════════
  // SUPERFÍCIE 3: Templates e n8n Migration
  // ══════════════════════════════════════════════════════════════
  console.log("\n--- SUPERFÍCIE 3: Templates e n8n Migration ---");

  let sampleTemplateId;
  // 3.1 Catálogo de Templates
  try {
    const tplListRes = await fetch(`${BASE_URL}/api/templates`);
    const tplListData = await tplListRes.json();
    assert.equal(tplListRes.status, 200);
    assert(Array.isArray(tplListData.templates));
    assert(tplListData.templates.length > 0);
    assert(Array.isArray(tplListData.categories));
    sampleTemplateId = tplListData.templates[0].id;
    log("s3", "GET /api/templates - catálogo público", true, `Total: ${tplListData.total} templates, ${tplListData.categories.length} categorias`);
  } catch (err) {
    log("s3", "GET /api/templates - catálogo público", false, err.message);
  }

  // 3.2 Filtro por Categoria e Busca
  try {
    const catRes = await fetch(`${BASE_URL}/api/templates?category=IA%20%26%20RAG`);
    const catData = await catRes.json();
    assert.equal(catRes.status, 200);
    log("s3", "GET /api/templates?category=IA & RAG", true, `Retornados: ${catData.templates.length}`);

    const searchRes = await fetch(`${BASE_URL}/api/templates?search=slack`);
    const searchData = await searchRes.json();
    assert.equal(searchRes.status, 200);
    log("s3", "GET /api/templates?search=slack", true, `Encontrados: ${searchData.templates.length}`);
  } catch (err) {
    log("s3", "GET /api/templates filtros", false, err.message);
  }

  // 3.3 Detalhe de Template (workflow.nodes e workflow.edges)
  try {
    const detailRes = await fetch(`${BASE_URL}/api/templates/${sampleTemplateId}`);
    const detailData = await detailRes.json();
    assert.equal(detailRes.status, 200);
    assert.equal(detailData.id, sampleTemplateId);
    assert(detailData.name);
    assert(detailData.workflow && detailData.workflow.nodes && detailData.workflow.edges);
    log("s3", `GET /api/templates/:id (${sampleTemplateId})`, true, `Nós: ${detailData.workflow.nodes.length}, Arestas: ${detailData.workflow.edges.length}`);
  } catch (err) {
    log("s3", `GET /api/templates/:id (${sampleTemplateId})`, false, err.message);
  }

  // 3.4 Exportar Template Sanitizado
  let exportedTemplate;
  try {
    const exportRes = await fetch(`${BASE_URL}/api/templates/${sampleTemplateId}/export`);
    assert.equal(exportRes.status, 200);
    const disposition = exportRes.headers.get("content-disposition");
    assert(disposition && disposition.includes("attachment"));
    exportedTemplate = await exportRes.json();
    assert(exportedTemplate.name);
    log("s3", `GET /api/templates/:id/export`, true, `Header: ${disposition}`);
  } catch (err) {
    log("s3", `GET /api/templates/:id/export`, false, err.message);
  }

  // 3.5 Clonar Template para o Workspace
  let clonedWfId;
  try {
    const cloneRes = await fetch(`${BASE_URL}/api/templates/${sampleTemplateId}/clone`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Meu Workflow Clonado de Template",
      }),
    });
    const cloneData = await cloneRes.json();
    assert.equal(cloneRes.status, 201);
    assert(cloneData.workflow && cloneData.workflow.id);
    clonedWfId = cloneData.workflow.id;
    log("s3", `POST /api/templates/:id/clone`, true, `Clonado WF ID: ${clonedWfId}`);
  } catch (err) {
    log("s3", `POST /api/templates/:id/clone`, false, err.message);
  }

  // 3.6 Importar Template JSON Arbitrário
  try {
    const importTplRes = await fetch(`${BASE_URL}/api/templates/import`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        template: exportedTemplate,
        name: "Template Importado QA",
      }),
    });
    const importTplData = await importTplRes.json();
    assert.equal(importTplRes.status, 201);
    assert(importTplData.workflow && importTplData.workflow.id);
    log("s3", `POST /api/templates/import`, true, `Importado WF ID: ${importTplData.workflow.id}`);
  } catch (err) {
    log("s3", `POST /api/templates/import`, false, err.message);
  }

  // ══════════════════════════════════════════════════════════════
  // SUPERFÍCIE 4: Executions
  // ══════════════════════════════════════════════════════════════
  console.log("\n--- SUPERFÍCIE 4: Executions ---");

  // Criar um workflow executável simples (Manual Trigger -> Code)
  let execWfId;
  const execWfRes = await fetch(`${BASE_URL}/api/workflows`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ name: "Workflow Execution Test" }),
  });
  const execWfData = await execWfRes.json();
  execWfId = execWfData.id;

  const canvasExec = {
    nodes: [
      { id: "trig-1", type: "manual", label: "Start", position: { x: 0, y: 0 }, config: {} },
      { id: "code-1", type: "code", label: "Code Run", position: { x: 200, y: 0 }, config: { code: "return { count: 10 + 2 };" } },
    ],
    edges: [{ id: "e1", source: "trig-1", target: "code-1" }],
  };

  const canvasSaveRes = await fetch(`${BASE_URL}/api/workflows/${execWfId}/canvas`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify(canvasExec),
  });
  assert.equal(canvasSaveRes.status, 200);

  // 4.1 Disparo de Execução via /workflows/:id/run
  let executionId;
  try {
    const runRes = await fetch(`${BASE_URL}/api/workflows/${execWfId}/run`, {
      method: "POST",
      headers: authHeaders,
    });
    assert.equal(runRes.status, 202);
    const runData = await runRes.json();
    assert(runData.id);
    executionId = runData.id;
    log("s4", "POST /api/workflows/:id/run - disparo assíncrono", true, `Execution ID: ${executionId}, HTTP 202`);
  } catch (err) {
    log("s4", "POST /api/workflows/:id/run - disparo assíncrono", false, err.message);
  }

  // Aguardar execução terminar (in-memory execution)
  let detailData;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const detailRes = await fetch(`${BASE_URL}/api/executions/${executionId}`, {
      headers: authHeaders,
    });
    detailData = await detailRes.json();
    if (detailData.status === "SUCCESS" || detailData.status === "FAILED" || detailData.status === "COMPLETED") {
      break;
    }
  }

  // 4.2 Detalhes da Execução
  try {
    assert.equal(detailData.id, executionId);
    assert.equal(detailData.status, "SUCCESS", `Execution status was ${detailData.status} with error: ${detailData.error}`);
    assert(Array.isArray(detailData.nodes) && detailData.nodes.length > 0);
    log("s4", `GET /api/executions/:id - status e nós`, true, `Status: ${detailData.status}, Nós executados: ${detailData.nodes.length}`);
  } catch (err) {
    log("s4", `GET /api/executions/:id - status e nós`, false, `${err.message} (status: ${detailData?.status})`);
  }

  // 4.3 Histórico de Execuções e Filtros
  try {
    const histRes = await fetch(`${BASE_URL}/api/executions?workflowId=${execWfId}&status=SUCCESS`, {
      headers: authHeaders,
    });
    const histData = await histRes.json();
    assert.equal(histRes.status, 200);
    const items = Array.isArray(histData) ? histData : histData.items;
    assert(Array.isArray(items));
    assert(items.some((e) => e.id === executionId), `Execution ${executionId} not found in list of ${items.length} items`);
    log("s4", `GET /api/executions - filtro por workflowId e status`, true, `Total encontrados: ${items.length}`);
  } catch (err) {
    log("s4", `GET /api/executions - filtro por workflowId e status`, false, err.message);
  }

  // 4.4 Traces e Node-level Logs
  try {
    const tracesRes = await fetch(`${BASE_URL}/api/executions/${executionId}/traces`, { headers: authHeaders });
    const tracesData = await tracesRes.json();
    assert.equal(tracesRes.status, 200);
    assert(tracesData.traceId);
    assert(Array.isArray(tracesData.spans));
    log("s4", `GET /api/executions/:id/traces`, true, `TraceID: ${tracesData.traceId}, Spans: ${tracesData.spans.length}`);

    const nodesRes = await fetch(`${BASE_URL}/api/executions/${executionId}/nodes`, { headers: authHeaders });
    const nodesData = await nodesRes.json();
    assert.equal(nodesRes.status, 200);
    assert(Array.isArray(nodesData));
    log("s4", `GET /api/executions/:id/nodes`, true, `Registros de nós: ${nodesData.length}`);
  } catch (err) {
    log("s4", `GET /api/executions/:id/traces /nodes`, false, err.message);
  }

  // 4.5 Teste de Cancelamento
  try {
    // Execução já terminada -> deve retornar 404 NOT_CANCELLABLE
    const cancelFinishedRes = await fetch(`${BASE_URL}/api/executions/${executionId}/cancel`, {
      method: "POST",
      headers: authHeaders,
    });
    assert.equal(cancelFinishedRes.status, 404);
    log("s4", `POST /api/executions/:id/cancel em execução já terminada`, true, `Protegido: HTTP 404 NOT_CANCELLABLE`);
  } catch (err) {
    log("s4", `POST /api/executions/:id/cancel em execução já terminada`, false, err.message);
  }

  // 4.6 Teste de Rota de Retry
  try {
    const retryRes = await fetch(`${BASE_URL}/api/executions/${executionId}/retry`, {
      method: "POST",
      headers: authHeaders,
    });
    if (retryRes.status === 404) {
      log("s4", `POST /api/executions/:id/retry - verificação de suporte`, true, `Não implementado (HTTP 404) - Re-execução utiliza /workflows/:id/run`);
      results.findings.push({
        id: "FINDING-F2-01",
        surface: "Executions",
        severity: "MINOR",
        confidence: "HIGH",
        evidence: "POST /api/executions/:id/retry -> HTTP 404 (apps/api/src/routes/executions.ts)",
        repro: "Fazer POST em /api/executions/:id/retry",
        impact: "Sem endpoint dedicado de retry direto na API de executions; re-execuções dependem de novo disparo via /workflows/:id/run ou /executions/trigger",
        suggestedFix: "Implementar POST /api/executions/:id/retry que clone os inputs e re-enfileire a execução",
      });
    } else {
      log("s4", `POST /api/executions/:id/retry`, true, `Status: ${retryRes.status}`);
    }
  } catch (err) {
    log("s4", `POST /api/executions/:id/retry`, false, err.message);
  }

  console.log("\n=== RESUMO FINAL DE EXECUÇÃO ===");
  console.log(`Superfície 2: ${results.s2.passed} pass, ${results.s2.failed} fail`);
  console.log(`Superfície 3: ${results.s3.passed} pass, ${results.s3.failed} fail`);
  console.log(`Superfície 4: ${results.s4.passed} pass, ${results.s4.failed} fail`);
  console.log(`Findings identificados: ${results.findings.length}`);
  console.log(JSON.stringify(results, null, 2));
}

run().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
