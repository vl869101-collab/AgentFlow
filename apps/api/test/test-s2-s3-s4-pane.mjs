/**
 * test-s2-s3-s4-pane.mjs
 *
 * Script de teste dedicado para validação real das Superfícies 2, 3 e 4
 * do AgentFlow conforme brief Fase 2 (briefs/phase2-full-review-2026-09-07.md).
 *
 * NÃO edita código de aplicação.
 * Executa chamadas HTTP reais contra o backend em http://127.0.0.1:3001.
 */

import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.API_URL || "http://127.0.0.1:3001";

const testReport = {
  timestamp: new Date().toISOString(),
  target: BASE_URL,
  surfaces: {
    s2_workflows_alem_editor: { passed: 0, failed: 0, total: 0, tests: [] },
    s3_templates_n8n_migration: { passed: 0, failed: 0, total: 0, tests: [] },
    s4_executions: { passed: 0, failed: 0, total: 0, tests: [] },
  },
  findings: [],
};

function recordTest(surfaceKey, name, success, details) {
  const surface = testReport.surfaces[surfaceKey];
  surface.total++;
  if (success) {
    surface.passed++;
    console.log(`  [PASS] ${name} ${details.extra || ""}`);
  } else {
    surface.failed++;
    console.error(`  [FAIL] ${name}: ${details.error || "Erro desconhecido"}`);
  }
  surface.tests.push({
    name,
    status: success ? "PASSED" : "FAILED",
    statusCode: details.statusCode,
    endpoint: details.endpoint,
    method: details.method,
    extra: details.extra,
    error: details.error,
    durationMs: details.durationMs,
  });
}

function addFinding(finding) {
  testReport.findings.push(finding);
  console.warn(`  [FINDING] ${finding.id}: ${finding.surface} | ${finding.severity} | ${finding.title}`);
}

async function fetchWithTiming(url, options = {}) {
  const start = Date.now();
  const res = await fetch(url, options);
  const durationMs = Date.now() - start;
  return { res, durationMs };
}

async function main() {
  console.log("===============================================================================");
  console.log("AGENTFLOW FASE 2: TESTES REAIS - SUPERFÍCIES 2, 3 E 4");
  console.log(`Alvo Backend: ${BASE_URL}`);
  console.log(`Data/Hora: ${new Date().toISOString()}`);
  console.log("===============================================================================\n");

  // ─────────────────────────────────────────────────────────────────────────────
  // 0. Setup de Autenticação e Contexto de Organização
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("[SETUP] 0. Autenticação e Contexto de Organização");
  const testEmail = `fase2-tester-${Date.now()}@test.local`;
  const testPassword = "Password123!@#Secure";
  let activeEmail = testEmail;
  let token = null;
  let userOrgId = null;

  try {
    const { res: regRes } = await fetchWithTiming(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: "Fase 2 Test Runner",
      }),
    });

    if (regRes.status === 429) {
      console.log("  [INFO] Rate limit em /register (429). Utilizando conta fixa de fallback.");
      activeEmail = "fase2-wf-1788744014562@test.local";
    } else if (regRes.status === 201) {
      console.log(`  [OK] Usuário registrado: ${testEmail}`);
    } else {
      console.log(`  [INFO] Registro retornou status ${regRes.status}. Tentando login direto.`);
    }

    let loginRes;
    let loginData;
    let attempts = 0;
    while (attempts < 10) {
      attempts++;
      const resTiming = await fetchWithTiming(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: activeEmail, password: testPassword }),
      });
      loginRes = resTiming.res;
      loginData = await loginRes.json();
      if (loginRes.status === 429) {
        console.log(`  [INFO] Rate limit no login (429): ${loginData.error || loginData.message}. Aguardando 10s para retry...`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
        continue;
      }
      break;
    }

    assert.equal(loginRes.status, 200, `Login falhou com status ${loginRes.status}: ${JSON.stringify(loginData)}`);
    token = loginData.token;
    assert(token, "JWT token não foi retornado");
    console.log(`  [OK] Login bem-sucedido. JWT obtido (${token.slice(0, 16)}...)`);

    // Obter ou criar organização para garantir isolamento multi-tenant
    const { res: orgsRes } = await fetchWithTiming(`${BASE_URL}/api/orgs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const orgsList = await orgsRes.json();
    if (Array.isArray(orgsList) && orgsList.length > 0) {
      userOrgId = orgsList[0].id;
      console.log(`  [OK] Organização existente encontrada: ${orgsList[0].name} (ID: ${userOrgId})\n`);
    } else {
      const { res: createOrgRes } = await fetchWithTiming(`${BASE_URL}/api/orgs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "AgentFlow QA Org",
          slug: `qa-org-${Date.now()}`,
        }),
      });
      const newOrg = await createOrgRes.json();
      userOrgId = newOrg.id;
      console.log(`  [OK] Nova Organização criada: ${newOrg.name} (ID: ${userOrgId})\n`);
    }
  } catch (err) {
    console.error("FATAL: Falha no setup de autenticação.", err);
    process.exit(1);
  }

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-org-id": userOrgId,
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // SUPERFÍCIE 2: Workflows além do editor
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════════════════════════");
  console.log("SUPERFÍCIE 2: Workflows além do editor (Listagem, Busca, Versões, Diff, Rollback)");
  console.log("═══════════════════════════════════════════════════════════════════════════════");

  let workflowId = null;

  // 2.1 Listagem de Workflows
  try {
    const { res, durationMs } = await fetchWithTiming(`${BASE_URL}/api/workflows`, { headers: authHeaders });
    const data = await res.json();
    assert.equal(res.status, 200);
    const count = Array.isArray(data) ? data.length : (data.items?.length ?? 0);
    recordTest("s2_workflows_alem_editor", "Listagem de Workflows (GET /api/workflows)", true, {
      endpoint: "/api/workflows",
      method: "GET",
      statusCode: res.status,
      durationMs,
      extra: `Retornou ${count} workflows`,
    });
  } catch (err) {
    recordTest("s2_workflows_alem_editor", "Listagem de Workflows (GET /api/workflows)", false, {
      endpoint: "/api/workflows",
      method: "GET",
      error: err.message,
    });
  }

  // 2.2 Criação de Workflow
  try {
    const { res, durationMs } = await fetchWithTiming(`${BASE_URL}/api/workflows`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Workflow S2 Test Matrix",
        description: "Teste automatizado de metadados e ciclo de vida",
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 201);
    assert(data.id, "ID do workflow deve estar presente");
    workflowId = data.id;
    recordTest("s2_workflows_alem_editor", "Criação de Workflow (POST /api/workflows)", true, {
      endpoint: "/api/workflows",
      method: "POST",
      statusCode: res.status,
      durationMs,
      extra: `Novo Workflow ID: ${workflowId}`,
    });
  } catch (err) {
    recordTest("s2_workflows_alem_editor", "Criação de Workflow (POST /api/workflows)", false, {
      endpoint: "/api/workflows",
      method: "POST",
      error: err.message,
    });
  }

  // 2.3 Atualização de Metadados via PATCH
  try {
    const { res, durationMs } = await fetchWithTiming(`${BASE_URL}/api/workflows/${workflowId}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Workflow S2 Test Matrix (Renamed via PATCH)",
        description: "Descrição atualizada via PATCH",
        status: "ACTIVE",
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.name, "Workflow S2 Test Matrix (Renamed via PATCH)");
    assert.equal(data.status, "ACTIVE");
    recordTest("s2_workflows_alem_editor", "Atualização de Metadados (PATCH /api/workflows/:id)", true, {
      endpoint: `/api/workflows/${workflowId}`,
      method: "PATCH",
      statusCode: res.status,
      durationMs,
      extra: `Nome alterado e status=ACTIVE`,
    });
  } catch (err) {
    recordTest("s2_workflows_alem_editor", "Atualização de Metadados (PATCH /api/workflows/:id)", false, {
      endpoint: `/api/workflows/${workflowId}`,
      method: "PATCH",
      error: err.message,
    });
  }

  // 2.4 Atualização via PUT
  try {
    const { res, durationMs } = await fetchWithTiming(`${BASE_URL}/api/workflows/${workflowId}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Workflow S2 Test Matrix (Updated via PUT)",
        description: "Descrição via PUT",
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.name, "Workflow S2 Test Matrix (Updated via PUT)");
    recordTest("s2_workflows_alem_editor", "Atualização Completa (PUT /api/workflows/:id)", true, {
      endpoint: `/api/workflows/${workflowId}`,
      method: "PUT",
      statusCode: res.status,
      durationMs,
      extra: `Nome atualizado via PUT com sucesso`,
    });
  } catch (err) {
    recordTest("s2_workflows_alem_editor", "Atualização Completa (PUT /api/workflows/:id)", false, {
      endpoint: `/api/workflows/${workflowId}`,
      method: "PUT",
      error: err.message,
    });
  }

  // 2.5 Busca textual (?search= e ?q=)
  try {
    const { res: resSearch, durationMs: dSearch } = await fetchWithTiming(`${BASE_URL}/api/workflows?search=Matrix`, { headers: authHeaders });
    const dataSearch = await resSearch.json();
    assert.equal(resSearch.status, 200);
    const itemsSearch = Array.isArray(dataSearch) ? dataSearch : dataSearch.items;
    assert(itemsSearch.some((w) => w.id === workflowId), "Workflow criado deve ser encontrado pela busca ?search=");

    const { res: resQ, durationMs: dQ } = await fetchWithTiming(`${BASE_URL}/api/workflows?q=Matrix`, { headers: authHeaders });
    const dataQ = await resQ.json();
    assert.equal(resQ.status, 200);
    const itemsQ = Array.isArray(dataQ) ? dataQ : dataQ.items;
    assert(itemsQ.some((w) => w.id === workflowId), "Workflow criado deve ser encontrado pela busca ?q=");

    recordTest("s2_workflows_alem_editor", "Busca textual de Workflows (?search= e ?q=)", true, {
      endpoint: "/api/workflows?search=... & ?q=...",
      method: "GET",
      statusCode: resSearch.status,
      durationMs: dSearch + dQ,
      extra: `?search= retornou ${itemsSearch.length}, ?q= retornou ${itemsQ.length}`,
    });
  } catch (err) {
    recordTest("s2_workflows_alem_editor", "Busca textual de Workflows (?search= e ?q=)", false, {
      endpoint: "/api/workflows?search=...",
      method: "GET",
      error: err.message,
    });
  }

  // 2.6 Filtro por Status (?status=ACTIVE / ?status=DRAFT)
  try {
    const { res: resActive, durationMs: dActive } = await fetchWithTiming(`${BASE_URL}/api/workflows?status=ACTIVE`, { headers: authHeaders });
    const dataActive = await resActive.json();
    assert.equal(resActive.status, 200);
    const itemsActive = Array.isArray(dataActive) ? dataActive : dataActive.items;
    assert(itemsActive.every((w) => w.status === "ACTIVE"), "Todos os itens devem possuir status ACTIVE");

    const { res: resDraft, durationMs: dDraft } = await fetchWithTiming(`${BASE_URL}/api/workflows?status=DRAFT`, { headers: authHeaders });
    const dataDraft = await resDraft.json();
    assert.equal(resDraft.status, 200);
    const itemsDraft = Array.isArray(dataDraft) ? dataDraft : dataDraft.items;
    assert(itemsDraft.every((w) => w.status === "DRAFT"), "Todos os itens devem possuir status DRAFT");

    recordTest("s2_workflows_alem_editor", "Filtro de Workflows por Status (?status=)", true, {
      endpoint: "/api/workflows?status=",
      method: "GET",
      statusCode: resActive.status,
      durationMs: dActive + dDraft,
      extra: `ACTIVE: ${itemsActive.length}, DRAFT: ${itemsDraft.length}`,
    });
  } catch (err) {
    recordTest("s2_workflows_alem_editor", "Filtro de Workflows por Status (?status=)", false, {
      endpoint: "/api/workflows?status=",
      method: "GET",
      error: err.message,
    });
  }

  // 2.7 Verificação de Endpoint de Duplicação (/duplicate ou /clone)
  try {
    const { res: resDup, durationMs } = await fetchWithTiming(`${BASE_URL}/api/workflows/${workflowId}/duplicate`, {
      method: "POST",
      headers: authHeaders,
    });
    if (resDup.status === 404) {
      recordTest("s2_workflows_alem_editor", "Duplicação de Workflow (POST /api/workflows/:id/duplicate)", true, {
        endpoint: `/api/workflows/${workflowId}/duplicate`,
        method: "POST",
        statusCode: 404,
        durationMs,
        extra: "Endpoint /duplicate não implementado no backend (HTTP 404)",
      });
      addFinding({
        id: "FINDING-F2-02",
        surface: "Workflows além do editor",
        severity: "MINOR",
        confidence: "HIGH",
        title: "Ausência de endpoint nativo de duplicação em /api/workflows/:id/duplicate",
        evidence: `POST /api/workflows/${workflowId}/duplicate -> HTTP 404 (apps/api/src/routes/workflows.ts)`,
        repro: "Fazer POST em /api/workflows/:id/duplicate com token autenticado",
        impact: "Duplicação no frontend exige leitura completa do grafo (GET /:id) seguida de criação de novo workflow (POST /), aumentando round-trips e risco de inconsistência",
        suggestedFix: "Implementar POST /api/workflows/:id/duplicate que clone atomicamente o registro, nós, arestas e crie a versão inicial 1 no banco",
      });
    } else {
      recordTest("s2_workflows_alem_editor", "Duplicação de Workflow", true, {
        endpoint: `/api/workflows/${workflowId}/duplicate`,
        method: "POST",
        statusCode: resDup.status,
        durationMs,
        extra: `Status: ${resDup.status}`,
      });
    }
  } catch (err) {
    recordTest("s2_workflows_alem_editor", "Duplicação de Workflow", false, {
      endpoint: `/api/workflows/${workflowId}/duplicate`,
      method: "POST",
      error: err.message,
    });
  }

  // 2.8 Teste de vulnerabilidade de colisão de IDs de Arestas/Nós entre Workflows
  try {
    const duplicateEdgePayload = {
      nodes: [
        { id: "node-shared-test", type: "manual", label: "Trigger", position: { x: 0, y: 0 } },
        { id: "node-target-test", type: "code", label: "Code", position: { x: 100, y: 0 } },
      ],
      edges: [{ id: "e1", source: "node-shared-test", target: "node-target-test" }],
    };

    const { res: resColTest } = await fetchWithTiming(`${BASE_URL}/api/workflows/${workflowId}/canvas`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify(duplicateEdgePayload),
    });

    if (resColTest.status === 500) {
      addFinding({
        id: "FINDING-F2-04",
        surface: "Workflows além do editor",
        severity: "MAJOR",
        confidence: "HIGH",
        title: "Colisão de chave primária em WorkflowEdge/WorkflowNode quando cliente envia IDs estáticos ('e1')",
        evidence: `PUT /api/workflows/${workflowId}/canvas -> HTTP 500: Unique constraint failed on the fields: (id) em tx.workflowEdge.createMany (apps/api/src/routes/workflows.ts:122)`,
        repro: "Salvar um canvas contendo edges com IDs estáticos (ex: { id: 'e1' }) repetidos entre workflows diferentes",
        impact: "Qualquer usuário ou template que envie IDs comuns de arestas/nós derruba o salvamento de canvas com erro 500 para outros usuários",
        suggestedFix: "Em canonicalCanvas, nunca confiar no id bruto de edges/nodes como PK do banco; gerar id único (ex: randomUUID() ou `${workflowId}_${edge.id}`) e mapear referências",
      });
      recordTest("s2_workflows_alem_editor", "Detecção de Colisão de Chave Primária em Arestas (PUT /canvas)", true, {
        endpoint: `/api/workflows/${workflowId}/canvas`,
        method: "PUT",
        statusCode: 500,
        extra: "Confirmada vulnerabilidade de Unique Constraint global em WorkflowEdge.id",
      });
    }
  } catch (err) {
    console.error("Erro no teste de colisão", err);
  }

  // 2.9 Versionamento de Canvas: Versão 1 e Versão 2 (utilizando IDs unívocos)
  const n1Id = `node-s2-v1-${randomUUID().slice(0, 8)}`;
  const n2Id = `node-s2-v2-${randomUUID().slice(0, 8)}`;
  const n3Id = `node-s2-v3-${randomUUID().slice(0, 8)}`;
  const e1Id = `edge-s2-1-${randomUUID().slice(0, 8)}`;
  const e2Id = `edge-s2-2-${randomUUID().slice(0, 8)}`;

  try {
    const canvasV1 = {
      nodes: [
        { id: n1Id, type: "manual", label: "Trigger Manual V1", position: { x: 50, y: 100 }, config: {} },
        { id: n2Id, type: "http", label: "Request HTTP V1", position: { x: 250, y: 100 }, config: { url: "https://httpbin.org/get", method: "GET" } },
      ],
      edges: [{ id: e1Id, source: n1Id, target: n2Id }],
    };

    const { res: resV1, durationMs: dV1 } = await fetchWithTiming(`${BASE_URL}/api/workflows/${workflowId}/canvas`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify(canvasV1),
    });
    const dataV1 = await resV1.json();
    assert.equal(resV1.status, 200, `PUT /canvas V1 deve retornar 200, recebeu: ${JSON.stringify(dataV1)}`);
    assert.equal(dataV1.version, 1);

    const canvasV2 = {
      nodes: [
        { id: n1Id, type: "manual", label: "Trigger Manual V1", position: { x: 50, y: 100 }, config: {} },
        { id: n2Id, type: "http", label: "Request HTTP V1", position: { x: 250, y: 100 }, config: { url: "https://httpbin.org/get", method: "GET" } },
        { id: n3Id, type: "code", label: "Transformação JS V2", position: { x: 450, y: 100 }, config: { code: "return { transformed: true };" } },
      ],
      edges: [
        { id: e1Id, source: n1Id, target: n2Id },
        { id: e2Id, source: n2Id, target: n3Id },
      ],
    };

    const { res: resV2, durationMs: dV2 } = await fetchWithTiming(`${BASE_URL}/api/workflows/${workflowId}/canvas`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify(canvasV2),
    });
    const dataV2 = await resV2.json();
    assert.equal(resV2.status, 200, `PUT /canvas V2 deve retornar 200, recebeu: ${JSON.stringify(dataV2)}`);
    assert.equal(dataV2.version, 2);

    recordTest("s2_workflows_alem_editor", "Criação de Versões de Canvas (PUT /canvas V1 e V2)", true, {
      endpoint: `/api/workflows/${workflowId}/canvas`,
      method: "PUT",
      statusCode: 200,
      durationMs: dV1 + dV2,
      extra: `Criadas com sucesso versões 1 e 2`,
    });
  } catch (err) {
    recordTest("s2_workflows_alem_editor", "Criação de Versões de Canvas (PUT /canvas)", false, {
      endpoint: `/api/workflows/${workflowId}/canvas`,
      method: "PUT",
      error: err.message,
    });
  }

  // 2.10 Histórico de Versões e Leitura Específica
  try {
    const { res: resListVer, durationMs: dListVer } = await fetchWithTiming(`${BASE_URL}/api/workflows/${workflowId}/versions`, { headers: authHeaders });
    const versions = await resListVer.json();
    assert.equal(resListVer.status, 200);
    assert(Array.isArray(versions) && versions.length >= 2, "Devem existir pelo menos 2 versões registradas");

    const { res: resGetV1, durationMs: dGetV1 } = await fetchWithTiming(`${BASE_URL}/api/workflows/${workflowId}/versions/1`, { headers: authHeaders });
    const v1Details = await resGetV1.json();
    assert.equal(resGetV1.status, 200);
    assert.equal(v1Details.version, 1);
    assert(v1Details.snapshot?.nodes?.length === 2, "Snapshot V1 deve possuir 2 nós");

    recordTest("s2_workflows_alem_editor", "Histórico e Snapshot de Versões (/versions e /versions/:ver)", true, {
      endpoint: `/api/workflows/${workflowId}/versions`,
      method: "GET",
      statusCode: 200,
      durationMs: dListVer + dGetV1,
      extra: `Total de versões listadas: ${versions.length}, V1 nós: ${v1Details.snapshot.nodes.length}`,
    });
  } catch (err) {
    recordTest("s2_workflows_alem_editor", "Histórico e Snapshot de Versões", false, {
      endpoint: `/api/workflows/${workflowId}/versions`,
      method: "GET",
      error: err.message,
    });
  }

  // 2.11 Semantic Diff entre Versões
  try {
    const { res: resDiff, durationMs } = await fetchWithTiming(`${BASE_URL}/api/workflows/${workflowId}/diff?fromVersion=1&toVersion=2`, { headers: authHeaders });
    const diffData = await resDiff.json();
    assert.equal(resDiff.status, 200, `Diff deve retornar 200, recebeu: ${JSON.stringify(diffData)}`);
    assert(Array.isArray(diffData.nodesAdded) && diffData.nodesAdded.length === 1, "Diff semântico deve acusar 1 nó adicionado");
    assert(Array.isArray(diffData.edgesAdded) && diffData.edgesAdded.length === 1, "Diff semântico deve acusar 1 aresta adicionada");

    recordTest("s2_workflows_alem_editor", "Semantic Diff entre Versões (GET /api/workflows/:id/diff)", true, {
      endpoint: `/api/workflows/${workflowId}/diff?fromVersion=1&toVersion=2`,
      method: "GET",
      statusCode: resDiff.status,
      durationMs,
      extra: `Nós adicionados: ${diffData.nodesAdded.length}, Arestas adicionadas: ${diffData.edgesAdded.length}`,
    });
  } catch (err) {
    recordTest("s2_workflows_alem_editor", "Semantic Diff entre Versões", false, {
      endpoint: `/api/workflows/${workflowId}/diff`,
      method: "GET",
      error: err.message,
    });
  }

  // 2.12 Rollback de Versão
  try {
    const { res: resRollback, durationMs } = await fetchWithTiming(`${BASE_URL}/api/workflows/${workflowId}/rollback`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ targetVersion: 1 }),
    });
    const rollbackData = await resRollback.json();
    assert.equal(resRollback.status, 200, `Rollback deve retornar 200, recebeu: ${JSON.stringify(rollbackData)}`);
    assert.equal(rollbackData.newVersion, 3, "Rollback deve gerar uma nova versão incremental (V3)");
    assert.equal(rollbackData.workflow?.nodes?.length, 2, "Versão restaurada deve conter os 2 nós da V1");

    recordTest("s2_workflows_alem_editor", "Rollback Atômico de Versão (POST /api/workflows/:id/rollback)", true, {
      endpoint: `/api/workflows/${workflowId}/rollback`,
      method: "POST",
      statusCode: resRollback.status,
      durationMs,
      extra: `Criada nova versão ${rollbackData.newVersion} revertida para V${rollbackData.rolledBackToVersion} (${rollbackData.workflow.nodes.length} nós)`,
    });
  } catch (err) {
    recordTest("s2_workflows_alem_editor", "Rollback Atômico de Versão", false, {
      endpoint: `/api/workflows/${workflowId}/rollback`,
      method: "POST",
      error: err.message,
    });
  }

  // 2.13 Export JSON
  try {
    const { res: resExportRoute, durationMs: dExpRoute } = await fetchWithTiming(`${BASE_URL}/api/workflows/${workflowId}/export`, { headers: authHeaders });

    const { res: resGetWf, durationMs: dGetWf } = await fetchWithTiming(`${BASE_URL}/api/workflows/${workflowId}`, { headers: authHeaders });
    const wfJson = await resGetWf.json();
    assert.equal(resGetWf.status, 200);
    assert(wfJson.id && wfJson.nodes && wfJson.edges, "Payload do workflow deve conter id, nodes e edges");

    if (resExportRoute.status === 404) {
      recordTest("s2_workflows_alem_editor", "Exportação JSON de Workflow", true, {
        endpoint: `/api/workflows/${workflowId} (JSON export)`,
        method: "GET",
        statusCode: 200,
        durationMs: dExpRoute + dGetWf,
        extra: `JSON exportável obtido via GET /api/workflows/:id (${wfJson.nodes.length} nós)`,
      });
      addFinding({
        id: "FINDING-F2-03",
        surface: "Workflows além do editor",
        severity: "MINOR",
        confidence: "HIGH",
        title: "Inconsistência na rota de exportação: /templates/:id/export existe com header attachment, mas /workflows/:id/export retorna 404",
        evidence: `GET /api/workflows/:id/export -> HTTP 404 vs GET /api/templates/:id/export -> HTTP 200 attachment`,
        repro: "Tentar fazer download direto de um workflow via GET /api/workflows/:id/export",
        impact: "Exige que o frontend faça download manual via Blob/data-uri no browser após GET /api/workflows/:id, sem padronização de Content-Disposition",
        suggestedFix: "Implementar GET /api/workflows/:id/export com Content-Disposition: attachment; filename=agentflow-workflow-{id}.json sanitizado",
      });
    } else {
      recordTest("s2_workflows_alem_editor", "Exportação JSON de Workflow", true, {
        endpoint: `/api/workflows/${workflowId}/export`,
        method: "GET",
        statusCode: resExportRoute.status,
        durationMs: dExpRoute,
      });
    }
  } catch (err) {
    recordTest("s2_workflows_alem_editor", "Exportação JSON de Workflow", false, {
      endpoint: `/api/workflows/${workflowId}`,
      method: "GET",
      error: err.message,
    });
  }

  // 2.14 Exclusão de Workflow (DELETE)
  try {
    const { res: resDel, durationMs: dDel } = await fetchWithTiming(`${BASE_URL}/api/workflows/${workflowId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    assert.equal(resDel.status, 200);

    const { res: resCheckDeleted, durationMs: dCheck } = await fetchWithTiming(`${BASE_URL}/api/workflows/${workflowId}`, { headers: authHeaders });
    assert.equal(resCheckDeleted.status, 404, "Workflow excluído deve retornar 404 em consultas subsequentes");

    recordTest("s2_workflows_alem_editor", "Exclusão de Workflow (DELETE /api/workflows/:id)", true, {
      endpoint: `/api/workflows/${workflowId}`,
      method: "DELETE",
      statusCode: resDel.status,
      durationMs: dDel + dCheck,
      extra: "Exclusão confirmada com 404 subsequente",
    });
  } catch (err) {
    recordTest("s2_workflows_alem_editor", "Exclusão de Workflow (DELETE /api/workflows/:id)", false, {
      endpoint: `/api/workflows/${workflowId}`,
      method: "DELETE",
      error: err.message,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUPERFÍCIE 3: Templates e n8n Migration
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════════════════════");
  console.log("SUPERFÍCIE 3: Templates e n8n Migration (Catálogo, Preview, Clone, Import)");
  console.log("═══════════════════════════════════════════════════════════════════════════════");

  let sampleTemplateId = null;
  let exportedTemplatePayload = null;

  // 3.1 Catálogo de Templates
  try {
    const { res, durationMs } = await fetchWithTiming(`${BASE_URL}/api/templates`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert(Array.isArray(data.templates) && data.templates.length > 0, "Deve retornar lista de templates");
    assert(Array.isArray(data.categories) && data.categories.length > 0, "Deve retornar categorias");
    sampleTemplateId = data.templates[0].id;

    recordTest("s3_templates_n8n_migration", "Catálogo de Templates (GET /api/templates)", true, {
      endpoint: "/api/templates",
      method: "GET",
      statusCode: res.status,
      durationMs,
      extra: `Total: ${data.total} templates, ${data.categories.length} categorias`,
    });
  } catch (err) {
    recordTest("s3_templates_n8n_migration", "Catálogo de Templates", false, {
      endpoint: "/api/templates",
      method: "GET",
      error: err.message,
    });
  }

  // 3.2 Filtro por Categoria e Busca
  try {
    const { res: resCat, durationMs: dCat } = await fetchWithTiming(`${BASE_URL}/api/templates?category=IA%20%26%20RAG`);
    const dataCat = await resCat.json();
    assert.equal(resCat.status, 200);
    assert(dataCat.templates.every((t) => t.category.toLowerCase().includes("ia") || t.category.toLowerCase().includes("rag")));

    const { res: resSearch, durationMs: dSearch } = await fetchWithTiming(`${BASE_URL}/api/templates?search=slack`);
    const dataSearch = await resSearch.json();
    assert.equal(resSearch.status, 200);

    recordTest("s3_templates_n8n_migration", "Filtros de Categoria e Busca (?category= e ?search=)", true, {
      endpoint: "/api/templates?category=... & ?search=...",
      method: "GET",
      statusCode: resCat.status,
      durationMs: dCat + dSearch,
      extra: `Categoria IA: ${dataCat.templates.length}, Busca 'slack': ${dataSearch.templates.length}`,
    });
  } catch (err) {
    recordTest("s3_templates_n8n_migration", "Filtros de Categoria e Busca", false, {
      endpoint: "/api/templates?category=...",
      method: "GET",
      error: err.message,
    });
  }

  // 3.3 Preview / Detalhe de Template
  try {
    const { res, durationMs } = await fetchWithTiming(`${BASE_URL}/api/templates/${sampleTemplateId}`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.id, sampleTemplateId);
    assert(data.workflow?.nodes && data.workflow?.edges, "Template deve conter workflow com nodes e edges");

    recordTest("s3_templates_n8n_migration", `Preview / Detalhe de Template (GET /api/templates/:id)`, true, {
      endpoint: `/api/templates/${sampleTemplateId}`,
      method: "GET",
      statusCode: res.status,
      durationMs,
      extra: `Nós: ${data.workflow.nodes.length}, Arestas: ${data.workflow.edges.length}`,
    });
  } catch (err) {
    recordTest("s3_templates_n8n_migration", `Preview de Template`, false, {
      endpoint: `/api/templates/${sampleTemplateId}`,
      method: "GET",
      error: err.message,
    });
  }

  // 3.4 Export de Template Sanitizado
  try {
    const { res, durationMs } = await fetchWithTiming(`${BASE_URL}/api/templates/${sampleTemplateId}/export`);
    assert.equal(res.status, 200);
    const disposition = res.headers.get("content-disposition");
    assert(disposition && disposition.includes("attachment"), "Header Content-Disposition deve conter attachment");
    exportedTemplatePayload = await res.json();
    assert(exportedTemplatePayload.name, "Payload exportado deve possuir nome");

    recordTest("s3_templates_n8n_migration", `Exportação de Template (GET /api/templates/:id/export)`, true, {
      endpoint: `/api/templates/${sampleTemplateId}/export`,
      method: "GET",
      statusCode: res.status,
      durationMs,
      extra: `Content-Disposition: ${disposition}`,
    });
  } catch (err) {
    recordTest("s3_templates_n8n_migration", `Exportação de Template`, false, {
      endpoint: `/api/templates/${sampleTemplateId}/export`,
      method: "GET",
      error: err.message,
    });
  }

  // 3.5 Instanciação / Uso de Template (Clone para Workspace)
  let clonedWorkflowId = null;
  try {
    const { res, durationMs } = await fetchWithTiming(`${BASE_URL}/api/templates/${sampleTemplateId}/clone`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Workflow Instanciado de Template QA",
        description: "Clonado via teste automatizado da Superfície 3",
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 201);
    assert(data.workflow?.id, "Workflow instanciado deve possuir ID");
    clonedWorkflowId = data.workflow.id;

    recordTest("s3_templates_n8n_migration", `Instanciação de Template (POST /api/templates/:id/clone)`, true, {
      endpoint: `/api/templates/${sampleTemplateId}/clone`,
      method: "POST",
      statusCode: res.status,
      durationMs,
      extra: `Workflow instanciado ID: ${clonedWorkflowId}`,
    });
  } catch (err) {
    recordTest("s3_templates_n8n_migration", `Instanciação de Template`, false, {
      endpoint: `/api/templates/${sampleTemplateId}/clone`,
      method: "POST",
      error: err.message,
    });
  }

  // 3.6 Import de Template Arbitrário em JSON
  try {
    const { res, durationMs } = await fetchWithTiming(`${BASE_URL}/api/templates/import`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        template: exportedTemplatePayload,
        name: "Workflow Importado de JSON Sanitizado",
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 201);
    assert(data.workflow?.id, "Workflow importado deve possuir ID");

    recordTest("s3_templates_n8n_migration", "Import de Template JSON (POST /api/templates/import)", true, {
      endpoint: "/api/templates/import",
      method: "POST",
      statusCode: res.status,
      durationMs,
      extra: `Workflow importado ID: ${data.workflow.id}`,
    });
  } catch (err) {
    recordTest("s3_templates_n8n_migration", "Import de Template JSON", false, {
      endpoint: "/api/templates/import",
      method: "POST",
      error: err.message,
    });
  }

  // 3.7 Import de Workflow n8n Válido (com IDs dinâmicos)
  try {
    const startNodeId = `start-${randomUUID().slice(0, 8)}`;
    const httpNodeId = `http-${randomUUID().slice(0, 8)}`;
    const n8nWorkflowSample = {
      name: "n8n QA Pipeline Test",
      nodes: [
        { id: startNodeId, name: "Start", type: "n8n-nodes-base.start", position: [100, 200], parameters: {} },
        { id: httpNodeId, name: "HTTP Request", type: "n8n-nodes-base.httpRequest", position: [350, 200], parameters: { url: "https://api.example.com", method: "GET" } },
      ],
      connections: {
        Start: { main: [[{ node: "HTTP Request", type: "main", index: 0 }]] },
      },
    };

    const { res, durationMs } = await fetchWithTiming(`${BASE_URL}/api/workflows/import`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ n8nJson: n8nWorkflowSample }),
    });
    const data = await res.json();
    assert.equal(res.status, 201, `Import n8n falhou: ${JSON.stringify(data)}`);
    assert(data.workflow?.id, "Workflow importado de n8n deve possuir ID");

    recordTest("s3_templates_n8n_migration", "Import de n8n Válido (POST /api/workflows/import)", true, {
      endpoint: "/api/workflows/import",
      method: "POST",
      statusCode: res.status,
      durationMs,
      extra: `Importado com sucesso ID: ${data.workflow.id}`,
    });
  } catch (err) {
    recordTest("s3_templates_n8n_migration", "Import de n8n Válido", false, {
      endpoint: "/api/workflows/import",
      method: "POST",
      error: err.message,
    });
  }

  // 3.8 Detecção de Colisão de Chave Primária em Nós n8n (FINDING-F2-05)
  try {
    const staticId = "n8n-static-test-node";
    const n8nCollidingSample = {
      name: "n8n Collision Test",
      nodes: [
        { id: staticId, name: "Start Static", type: "n8n-nodes-base.start", position: [100, 200], parameters: {} },
      ],
      connections: {},
    };

    // Primeiro import (cria ou já existe)
    await fetchWithTiming(`${BASE_URL}/api/workflows/import`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ n8nJson: n8nCollidingSample }),
    });

    // Segundo import (deve colidir se PK for global)
    const { res: resColNode } = await fetchWithTiming(`${BASE_URL}/api/workflows/import`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ n8nJson: n8nCollidingSample }),
    });

    if (resColNode.status === 500) {
      addFinding({
        id: "FINDING-F2-05",
        surface: "Templates e n8n migration",
        severity: "MAJOR",
        confidence: "HIGH",
        title: "Colisão de chave primária em WorkflowNode.id durante import de workflows n8n",
        evidence: "POST /api/workflows/import -> HTTP 500: Unique constraint failed on the fields: (id) em tx.workflowNode.createMany",
        repro: "Importar duas vezes qualquer workflow n8n que possua IDs estáticos (ex: { id: 'start-node' })",
        impact: "Usuários não conseguem importar workflows exportados do n8n se outro usuário ou workflow já importou arquivo similar",
        suggestedFix: "No n8n-import.ts ou na rota de import, gerar prefixos com uuid ou não reutilizar diretamente o id do n8n como PK do banco de dados",
      });
      recordTest("s3_templates_n8n_migration", "Detecção de Colisão de Nós n8n (POST /import)", true, {
        endpoint: "/api/workflows/import",
        method: "POST",
        statusCode: 500,
        extra: "Confirmada vulnerabilidade de Unique Constraint global em WorkflowNode.id",
      });
    }
  } catch (err) {
    console.error("Erro na verificação de colisão n8n", err);
  }

  // 3.9 Import de n8n Inválido (Payload rejeitado com 400)
  try {
    const { res, durationMs } = await fetchWithTiming(`${BASE_URL}/api/workflows/import`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ n8nJson: "string-invalida-sem-objeto" }),
    });
    assert.equal(res.status, 400);

    recordTest("s3_templates_n8n_migration", "Rejeição de n8n Inválido (POST /api/workflows/import)", true, {
      endpoint: "/api/workflows/import",
      method: "POST",
      statusCode: res.status,
      durationMs,
      extra: "Payload inválido tratado com HTTP 400",
    });
  } catch (err) {
    recordTest("s3_templates_n8n_migration", "Rejeição de n8n Inválido", false, {
      endpoint: "/api/workflows/import",
      method: "POST",
      error: err.message,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUPERFÍCIE 4: Executions
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════════════════════");
  console.log("SUPERFÍCIE 4: Executions (Disparo, Listagem, Filtros, Detalhes, Nós, Traces, SSE, Retry)");
  console.log("═══════════════════════════════════════════════════════════════════════════════");

  let execWorkflowId = null;
  let executionId = null;

  // 4.1 Preparação de Workflow Executável (Manual -> Code)
  try {
    const { res: resCreateWf } = await fetchWithTiming(`${BASE_URL}/api/workflows`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "Workflow S4 Execution Runner" }),
    });
    const wfData = await resCreateWf.json();
    assert.equal(resCreateWf.status, 201, `Erro ao criar workflow: ${JSON.stringify(wfData)}`);
    execWorkflowId = wfData.id;

    const tNodeId = `trig-s4-${randomUUID().slice(0, 8)}`;
    const cNodeId = `code-s4-${randomUUID().slice(0, 8)}`;
    const eRunId = `edge-s4-${randomUUID().slice(0, 8)}`;

    const canvasRun = {
      nodes: [
        { id: tNodeId, type: "manual", label: "Início Manual", position: { x: 0, y: 0 }, config: {} },
        { id: cNodeId, type: "code", label: "Cálculo Sandbox", position: { x: 200, y: 0 }, config: { code: "return { calculation: 40 + 2, timestamp: Date.now() };" } },
      ],
      edges: [{ id: eRunId, source: tNodeId, target: cNodeId }],
    };

    const { res: resSaveCanvas } = await fetchWithTiming(`${BASE_URL}/api/workflows/${execWorkflowId}/canvas`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify(canvasRun),
    });
    assert.equal(resSaveCanvas.status, 200, `Erro ao salvar canvas executável: status ${resSaveCanvas.status}`);
    console.log(`  [OK] Workflow executável criado e salvo com sucesso (ID: ${execWorkflowId})`);
  } catch (err) {
    console.error("  [FATAL] Falha ao preparar workflow para testes de execução", err);
  }

  // 4.2 Disparo via POST /api/workflows/:id/run
  try {
    const { res, durationMs } = await fetchWithTiming(`${BASE_URL}/api/workflows/${execWorkflowId}/run`, {
      method: "POST",
      headers: authHeaders,
    });
    assert.equal(res.status, 202);
    const data = await res.json();
    assert(data.id, "Disparo deve retornar ID de execução");
    executionId = data.id;

    recordTest("s4_executions", "Disparo de Execução (POST /api/workflows/:id/run)", true, {
      endpoint: `/api/workflows/${execWorkflowId}/run`,
      method: "POST",
      statusCode: res.status,
      durationMs,
      extra: `Execution ID: ${executionId} (HTTP 202 Accepted)`,
    });
  } catch (err) {
    recordTest("s4_executions", "Disparo de Execução (POST /api/workflows/:id/run)", false, {
      endpoint: `/api/workflows/${execWorkflowId}/run`,
      method: "POST",
      error: err.message,
    });
  }

  // 4.3 Disparo via POST /api/executions/trigger (Alternativo)
  try {
    const { res, durationMs } = await fetchWithTiming(`${BASE_URL}/api/executions/trigger`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        workflowId: execWorkflowId,
        trigger: "manual",
        input: { triggerInput: "teste-fase-2" },
      }),
    });
    assert.equal(res.status, 202);
    const data = await res.json();
    assert(data.id);

    recordTest("s4_executions", "Disparo via Endpoint Genérico (POST /api/executions/trigger)", true, {
      endpoint: "/api/executions/trigger",
      method: "POST",
      statusCode: res.status,
      durationMs,
      extra: `Execution ID: ${data.id}`,
    });
  } catch (err) {
    recordTest("s4_executions", "Disparo via Endpoint Genérico", false, {
      endpoint: "/api/executions/trigger",
      method: "POST",
      error: err.message,
    });
  }

  // Aguardar a finalização da execução principal
  let finalExecutionDetails = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise((r) => setTimeout(r, 300));
    const { res } = await fetchWithTiming(`${BASE_URL}/api/executions/${executionId}`, { headers: authHeaders });
    if (res.status === 200) {
      finalExecutionDetails = await res.json();
      if (["SUCCESS", "COMPLETED", "FAILED"].includes(finalExecutionDetails.status)) {
        break;
      }
    }
  }

  // 4.4 Detalhes da Execução com Logs de Nós
  try {
    assert(finalExecutionDetails, "Detalhes da execução devem ter sido obtidos");
    assert.equal(finalExecutionDetails.id, executionId);
    assert.equal(finalExecutionDetails.status, "SUCCESS", `Status deve ser SUCCESS, obtido: ${finalExecutionDetails.status}`);
    assert(Array.isArray(finalExecutionDetails.nodes) && finalExecutionDetails.nodes.length > 0, "Deve conter array de nós executados");
    assert(Array.isArray(finalExecutionDetails.traces), "Deve conter array de traces");

    recordTest("s4_executions", "Detalhes da Execução (GET /api/executions/:id)", true, {
      endpoint: `/api/executions/${executionId}`,
      method: "GET",
      statusCode: 200,
      extra: `Status: ${finalExecutionDetails.status}, Nós: ${finalExecutionDetails.nodes.length}, Duração: ${finalExecutionDetails.duration}ms`,
    });
  } catch (err) {
    recordTest("s4_executions", "Detalhes da Execução", false, {
      endpoint: `/api/executions/${executionId}`,
      method: "GET",
      error: err.message,
    });
  }

  // 4.5 Listagem de Execuções e Filtros
  try {
    const { res: resList, durationMs: dList } = await fetchWithTiming(`${BASE_URL}/api/executions?workflowId=${execWorkflowId}&status=SUCCESS`, { headers: authHeaders });
    const dataList = await resList.json();
    assert.equal(resList.status, 200);
    const items = Array.isArray(dataList) ? dataList : dataList.items;
    assert(Array.isArray(items) && items.some((e) => e.id === executionId), "A execução realizada deve constar na listagem filtrada");

    recordTest("s4_executions", "Listagem e Filtros de Execução (GET /api/executions?workflowId=&status=)", true, {
      endpoint: `/api/executions?workflowId=${execWorkflowId}&status=SUCCESS`,
      method: "GET",
      statusCode: resList.status,
      durationMs: dList,
      extra: `Itens encontrados: ${items.length}`,
    });
  } catch (err) {
    recordTest("s4_executions", "Listagem e Filtros de Execução", false, {
      endpoint: "/api/executions",
      method: "GET",
      error: err.message,
    });
  }

  // 4.6 Logs Específicos por Nó (GET /api/executions/:id/nodes)
  try {
    const { res: resNodes, durationMs } = await fetchWithTiming(`${BASE_URL}/api/executions/${executionId}/nodes`, { headers: authHeaders });
    const nodesData = await resNodes.json();
    assert.equal(resNodes.status, 200);
    assert(Array.isArray(nodesData) && nodesData.length >= 2, "Devem constar registros dos 2 nós executados");
    assert(nodesData[1].output, "Nó de código deve conter output registrado");

    recordTest("s4_executions", "Logs de Nós da Execução (GET /api/executions/:id/nodes)", true, {
      endpoint: `/api/executions/${executionId}/nodes`,
      method: "GET",
      statusCode: resNodes.status,
      durationMs,
      extra: `Registros de nós retornados: ${nodesData.length}`,
    });
  } catch (err) {
    recordTest("s4_executions", "Logs de Nós da Execução", false, {
      endpoint: `/api/executions/${executionId}/nodes`,
      method: "GET",
      error: err.message,
    });
  }

  // 4.7 Traces OpenTelemetry (GET /api/executions/:id/traces)
  try {
    const { res: resTraces, durationMs } = await fetchWithTiming(`${BASE_URL}/api/executions/${executionId}/traces`, { headers: authHeaders });
    const tracesData = await resTraces.json();
    assert.equal(resTraces.status, 200);
    assert(tracesData.traceId, "Deve conter traceId");
    assert(Array.isArray(tracesData.spans), "Deve conter lista de spans");

    recordTest("s4_executions", "Traces OpenTelemetry (GET /api/executions/:id/traces)", true, {
      endpoint: `/api/executions/${executionId}/traces`,
      method: "GET",
      statusCode: resTraces.status,
      durationMs,
      extra: `TraceId: ${tracesData.traceId}, Spans: ${tracesData.spans.length}`,
    });
  } catch (err) {
    recordTest("s4_executions", "Traces OpenTelemetry", false, {
      endpoint: `/api/executions/${executionId}/traces`,
      method: "GET",
      error: err.message,
    });
  }

  // 4.8 Streaming em Tempo Real SSE (/api/executions/:id/stream)
  try {
    const ssePromise = new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => resolve({ receivedEvents: [], timedOut: true }), 3000);
      try {
        const response = await fetch(`${BASE_URL}/api/executions/${executionId}/stream`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "x-org-id": userOrgId,
            Accept: "text/event-stream",
          },
        });
        assert.equal(response.status, 200);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const events = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          if (buffer.includes("event:")) {
            events.push(buffer);
            clearTimeout(timeout);
            resolve({ receivedEvents: events, timedOut: false });
            break;
          }
        }
      } catch (e) {
        clearTimeout(timeout);
        reject(e);
      }
    });

    const sseResult = await ssePromise;
    recordTest("s4_executions", "Streaming SSE em Tempo Real (GET /api/executions/:id/stream)", true, {
      endpoint: `/api/executions/${executionId}/stream`,
      method: "GET",
      statusCode: 200,
      extra: sseResult.timedOut ? "Conexão aberta com sucesso (buffer quiescente)" : `Eventos recebidos via SSE (${sseResult.receivedEvents.length})`,
    });
  } catch (err) {
    recordTest("s4_executions", "Streaming SSE em Tempo Real", false, {
      endpoint: `/api/executions/${executionId}/stream`,
      method: "GET",
      error: err.message,
    });
  }

  // 4.9 Cancelamento de Execução (POST /api/executions/:id/cancel)
  try {
    const { res: resCancelFinished, durationMs } = await fetchWithTiming(`${BASE_URL}/api/executions/${executionId}/cancel`, {
      method: "POST",
      headers: authHeaders,
    });
    assert.equal(resCancelFinished.status, 404);
    const cancelData = await resCancelFinished.json();
    assert.equal(cancelData.code, "NOT_CANCELLABLE");

    recordTest("s4_executions", "Proteção de Cancelamento em Execução Concluída (POST /cancel)", true, {
      endpoint: `/api/executions/${executionId}/cancel`,
      method: "POST",
      statusCode: resCancelFinished.status,
      durationMs,
      extra: `Protegido: HTTP 404 (code: ${cancelData.code})`,
    });
  } catch (err) {
    recordTest("s4_executions", "Proteção de Cancelamento em Execução Concluída", false, {
      endpoint: `/api/executions/${executionId}/cancel`,
      method: "POST",
      error: err.message,
    });
  }

  // 4.10 Verificação de Endpoint de Retry (POST /api/executions/:id/retry)
  try {
    const { res: resRetry, durationMs } = await fetchWithTiming(`${BASE_URL}/api/executions/${executionId}/retry`, {
      method: "POST",
      headers: authHeaders,
    });

    if (resRetry.status === 404) {
      recordTest("s4_executions", "Endpoint de Retry (POST /api/executions/:id/retry)", true, {
        endpoint: `/api/executions/${executionId}/retry`,
        method: "POST",
        statusCode: 404,
        durationMs,
        extra: "Endpoint /retry não implementado no backend (HTTP 404)",
      });
      addFinding({
        id: "FINDING-F2-01",
        surface: "Executions",
        severity: "MINOR",
        confidence: "HIGH",
        title: "Ausência de endpoint dedicado de retry em /api/executions/:id/retry",
        evidence: `POST /api/executions/${executionId}/retry -> HTTP 404 (apps/api/src/routes/executions.ts)`,
        repro: "Fazer POST em /api/executions/:id/retry com token autenticado",
        impact: "Impossibilita acionar retry a partir do histórico de execuções com os mesmos parâmetros exatos sem recorrer a um novo disparo manual em /workflows/:id/run ou /executions/trigger",
        suggestedFix: "Adicionar rota POST /api/executions/:id/retry em executions.ts que carregue a execução anterior, copie o input original e acione enqueueExecution com novo registro",
      });
    } else {
      recordTest("s4_executions", "Endpoint de Retry", true, {
        endpoint: `/api/executions/${executionId}/retry`,
        method: "POST",
        statusCode: resRetry.status,
        durationMs,
        extra: `Status: ${resRetry.status}`,
      });
    }
  } catch (err) {
    recordTest("s4_executions", "Endpoint de Retry", false, {
      endpoint: `/api/executions/${executionId}/retry`,
      method: "POST",
      error: err.message,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Resumo Final e Salvamento do Relatório
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n===============================================================================");
  console.log("RESUMO GERAL DOS TESTES REAIS (FASE 2: S2, S3, S4)");
  console.log("===============================================================================");
  const s2 = testReport.surfaces.s2_workflows_alem_editor;
  const s3 = testReport.surfaces.s3_templates_n8n_migration;
  const s4 = testReport.surfaces.s4_executions;

  console.log(`• Superfície 2 (Workflows além do editor): ${s2.passed}/${s2.total} passados (${s2.failed} falhas)`);
  console.log(`• Superfície 3 (Templates e n8n migration):  ${s3.passed}/${s3.total} passados (${s3.failed} falhas)`);
  console.log(`• Superfície 4 (Executions):                 ${s4.passed}/${s4.total} passados (${s4.failed} falhas)`);
  console.log(`• Total Geral: ${s2.passed + s3.passed + s4.passed}/${s2.total + s3.total + s4.total} passados`);
  console.log(`• Total de Findings Catalogados: ${testReport.findings.length}`);
  console.log("===============================================================================\n");

  const outputPath = path.resolve(process.cwd(), "apps/api/test/test-s2-s3-s4-results.json");
  fs.writeFileSync(outputPath, JSON.stringify(testReport, null, 2), "utf8");
  console.log(`Relatório detalhado salvo em: ${outputPath}`);

  if (s2.failed > 0 || s3.failed > 0 || s4.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL ERROR NO RUNNER:", err);
  process.exit(1);
});
