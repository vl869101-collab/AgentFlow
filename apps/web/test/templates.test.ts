import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workflowTemplateSchema, cloneTemplateSchema, importTemplateSchema, type WorkflowTemplate } from "@agentflow/shared";

describe("Workflow Templates & Marketplace Web Integration", () => {
  it("validates template schema compliance for frontend consumption", () => {
    const template: WorkflowTemplate = {
      id: "rag-pdf-pinecone-ai",
      name: "Chat with a PDF using AI (RAG with Pinecone)",
      description: "Carregue documentos PDF, gere embeddings vetoriais e converse via LLM com contexto exato.",
      category: "IA & RAG",
      tags: ["RAG", "PDF", "Pinecone", "OpenAI", "Embeddings"],
      icon: "file-text",
      color: "#8b5cf6",
      connectors: ["Google Drive", "Pinecone", "OpenAI", "Slack"],
      difficulty: "Intermediário",
      estimatedSetupMinutes: 10,
      featured: true,
      workflow: {
        name: "PDF RAG Workflow",
        description: "Pipeline RAG automatizado",
        nodes: [
          { id: "trigger-1", type: "webhook", label: "Upload de PDF", config: {}, position: { x: 100, y: 150 } },
          { id: "rag-1", type: "ai_agent", label: "Pinecone Retrieval", config: {}, position: { x: 400, y: 150 } },
        ],
        edges: [
          { id: "e1", sourceNodeId: "trigger-1", targetNodeId: "rag-1" },
        ],
      },
    };

    const parsed = workflowTemplateSchema.safeParse(template);
    assert.equal(parsed.success, true);
  });

  it("validates clone and import request payloads", () => {
    const cloneValid = cloneTemplateSchema.safeParse({ name: "Meu Fluxo Customizado" });
    assert.equal(cloneValid.success, true);

    const importValid = importTemplateSchema.safeParse({
      template: {
        name: "Custom Exported Template",
        workflow: {
          nodes: [{ id: "n1", type: "webhook", config: {} }],
          edges: [],
        },
      },
      name: "Novo Fluxo Importado",
    });
    assert.equal(importValid.success, true);

    const importInvalid = importTemplateSchema.safeParse({
      template: "invalid-string",
    });
    assert.equal(importInvalid.success, false);
  });

  it("formats and filters templates correctly based on query criteria", () => {
    const mockList: WorkflowTemplate[] = [
      {
        id: "t1",
        name: "RAG Pipeline",
        description: "AI search",
        category: "IA & RAG",
        tags: ["AI"],
        connectors: ["OpenAI"],
        difficulty: "Intermediário",
        estimatedSetupMinutes: 5,
        workflow: { name: "W1", description: "", nodes: [], edges: [] },
      },
      {
        id: "t2",
        name: "CRM Webhook Sync",
        description: "HubSpot sync",
        category: "Vendas & CRM",
        tags: ["CRM"],
        connectors: ["HubSpot"],
        difficulty: "Iniciante",
        estimatedSetupMinutes: 3,
        workflow: { name: "W2", description: "", nodes: [], edges: [] },
      },
    ];

    const aiTemplates = mockList.filter((t) => t.category === "IA & RAG");
    assert.equal(aiTemplates.length, 1);
    assert.equal(aiTemplates[0]?.id, "t1");

    const searchResults = mockList.filter((t) =>
      `${t.name} ${t.description} ${t.connectors.join(" ")}`.toLowerCase().includes("hubspot")
    );
    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0]?.id, "t2");
  });
});
