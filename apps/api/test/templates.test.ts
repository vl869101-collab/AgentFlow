import assert from "node:assert/strict";
import test from "node:test";
import {
  PRECONFIGURED_TEMPLATES,
  sanitizeTemplateForExport,
} from "../src/services/templates.js";
import { workflowTemplateSchema } from "@agentflow/shared";

test("Template Engine: Pre-configured catalog contains 5 high-value templates", () => {
  assert.equal(PRECONFIGURED_TEMPLATES.length, 5);

  const expectedIds = [
    "rag-pdf-pinecone-ai",
    "lead-ingestion-crm-sync",
    "support-ticket-auto-triage",
    "devops-cicd-incident-alert",
    "ecommerce-cart-recovery",
  ];

  for (const id of expectedIds) {
    const tpl = PRECONFIGURED_TEMPLATES.find((t) => t.id === id);
    assert.ok(tpl, `Template "${id}" should exist in catalog.`);
    assert.ok(tpl.name.length > 0, `Template "${id}" should have a name.`);
    assert.ok(tpl.description.length > 0, `Template "${id}" should have a description.`);
    assert.ok(tpl.category.length > 0, `Template "${id}" should have a category.`);
    assert.ok(Array.isArray(tpl.connectors) && tpl.connectors.length > 0, `Template "${id}" should list connectors.`);
    assert.ok(Array.isArray(tpl.tags) && tpl.tags.length > 0, `Template "${id}" should list tags.`);
    assert.ok(Array.isArray(tpl.workflow.nodes) && tpl.workflow.nodes.length >= 3, `Template "${id}" should have at least 3 nodes.`);
    assert.ok(Array.isArray(tpl.workflow.edges) && tpl.workflow.edges.length >= 2, `Template "${id}" should have edges.`);
  }
});

test("Template Engine: Every pre-configured template passes Zod schema validation", () => {
  for (const tpl of PRECONFIGURED_TEMPLATES) {
    const parsed = workflowTemplateSchema.safeParse(tpl);
    assert.equal(parsed.success, true, `Template "${tpl.id}" failed validation: ${JSON.stringify(parsed.error?.format())}`);
  }
});

test("Template Engine: Specific catalog templates structure matches requirements", () => {
  // 1. Chat with a PDF using AI (RAG with Pinecone)
  const ragTpl = PRECONFIGURED_TEMPLATES.find((t) => t.id === "rag-pdf-pinecone-ai");
  assert.ok(ragTpl);
  assert.ok(ragTpl.name.includes("PDF") && ragTpl.name.includes("Pinecone"));
  assert.ok(ragTpl.connectors.includes("Google Drive") || ragTpl.connectors.includes("Pinecone"));
  const ragTypes = ragTpl.workflow.nodes.map((n) => n.type);
  assert.ok(ragTypes.includes("googleDrive") || ragTypes.includes("webhook"));
  assert.ok(ragTypes.includes("ai_agent") || ragTypes.includes("ai") || ragTypes.includes("vector_store"));

  // 2. Lead Ingestion & CRM Sync
  const crmTpl = PRECONFIGURED_TEMPLATES.find((t) => t.id === "lead-ingestion-crm-sync");
  assert.ok(crmTpl);
  assert.ok(crmTpl.name.includes("Lead") && crmTpl.name.includes("CRM"));
  const crmConnectors = crmTpl.connectors.map((c) => c.toLowerCase());
  assert.ok(crmConnectors.some((c) => c.includes("hubspot") || c.includes("sheets") || c.includes("slack")));

  // 3. Support Ticket Auto-Triage & Sentiment Analysis
  const supportTpl = PRECONFIGURED_TEMPLATES.find((t) => t.id === "support-ticket-auto-triage");
  assert.ok(supportTpl);
  assert.ok(supportTpl.name.includes("Support Ticket") && supportTpl.name.includes("Triage"));

  // 4. DevOps CI/CD Incident Alert
  const devopsTpl = PRECONFIGURED_TEMPLATES.find((t) => t.id === "devops-cicd-incident-alert");
  assert.ok(devopsTpl);
  assert.ok(devopsTpl.name.includes("DevOps") && devopsTpl.name.includes("Incident"));

  // 5. E-commerce Abandoned Cart Recovery
  const ecomTpl = PRECONFIGURED_TEMPLATES.find((t) => t.id === "ecommerce-cart-recovery");
  assert.ok(ecomTpl);
  assert.ok(ecomTpl.name.includes("Abandoned Cart") && ecomTpl.name.includes("Recovery"));
});

test("Template Engine: sanitizeTemplateForExport redacts sensitive secrets and tokens", () => {
  const mockTemplate = {
    id: "test-secrets-template",
    name: "Sensitive Flow",
    description: "Flow with secrets",
    category: "Test",
    tags: ["test"],
    connectors: ["Custom API"],
    difficulty: "Iniciante" as const,
    estimatedSetupMinutes: 5,
    workflow: {
      name: "Secret Flow",
      nodes: [
        {
          id: "node-1",
          type: "http" as const,
          label: "Call External API",
          config: {
            url: "https://api.example.com",
            apiKey: "sk-live-secret-12345",
            token: "ghp_super_secret_token",
            password: "super_secret_password",
            authorization: "Bearer secret-jwt",
            normalConfig: "safe-public-value",
          },
        },
      ],
      edges: [],
    },
  };

  const sanitized = sanitizeTemplateForExport(mockTemplate);

  assert.equal(sanitized.id, "test-secrets-template");
  const nodeConfig = sanitized.workflow.nodes[0]?.config as Record<string, unknown>;
  assert.ok(nodeConfig);
  assert.equal(nodeConfig.normalConfig, "safe-public-value");
  assert.equal(nodeConfig.apiKey, "");
  assert.equal(nodeConfig.token, "");
  assert.equal(nodeConfig.password, "");
  assert.equal(nodeConfig.authorization, "");
});
