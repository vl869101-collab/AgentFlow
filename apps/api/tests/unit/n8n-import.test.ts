import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { importN8nWorkflow } from "@agentflow/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflowsDir = join(__dirname, "..", "..", "..", "..", "n8n-migration", "workflows");

function loadWorkflow(fileName: string): string {
  return readFileSync(join(workflowsDir, fileName), "utf-8");
}

// ═══════════════════════════════════════════
// Workflow 1: Save Gmail Attachments to Google Drive
// ═══════════════════════════════════════════

describe("n8n import: Save Gmail Attachments to Google Drive", () => {
  const result = importN8nWorkflow(loadWorkflow("Save_Gmail_Attachments_to_Google_Drive.json"));

  it("imports workflow name correctly", () => {
    expect(result.workflow.name).toBe("Save Gmail Attachments to Google Drive");
  });

  it("imports status as DRAFT (inactive)", () => {
    expect(result.workflow.status).toBe("DRAFT");
  });

  it("imports exactly 3 nodes", () => {
    expect(result.nodes).toHaveLength(3);
  });

  it("maps gmailTrigger node correctly", () => {
    const node = result.nodes.find((n) => n.type === "gmailTrigger");
    expect(node).toBeDefined();
    expect(node!.label).toBe("On New Email");
    expect(node!.config.originalN8nType).toBe("n8n-nodes-base.gmailTrigger");
    expect(node!.config.typeVersion).toBe(1.4);
    expect(node!.config.parameters).toMatchObject({
      event: "messageReceived",
      simple: false,
      filters: { q: "has:attachment", readStatus: "unread" },
      options: { downloadAttachments: true },
    });
    expect(node!.position).toEqual({ x: 0, y: 0 });
  });

  it("maps code node correctly", () => {
    const node = result.nodes.find((n) => n.type === "code");
    expect(node).toBeDefined();
    expect(node!.label).toBe("Split Attachments");
    expect(node!.config.originalN8nType).toBe("n8n-nodes-base.code");
    expect(node!.config.typeVersion).toBe(2);
    expect(node!.config.parameters).toMatchObject({
      mode: "runOnceForEachItem",
    });
    expect(typeof node!.config.parameters.jsCode).toBe("string");
    expect(node!.config.parameters.jsCode).toContain("const results = []");
  });

  it("maps googleDrive node correctly", () => {
    const node = result.nodes.find((n) => n.type === "googleDrive");
    expect(node).toBeDefined();
    expect(node!.label).toBe("Upload to Google Drive");
    expect(node!.config.originalN8nType).toBe("n8n-nodes-base.googleDrive");
    expect(node!.config.typeVersion).toBe(3);
    expect(node!.config.parameters).toMatchObject({
      resource: "file",
      operation: "upload",
      inputDataFieldName: "data",
      name: "={{ $json.fileName }}",
    });
  });

  it("imports exactly 2 edges (linear chain)", () => {
    expect(result.edges).toHaveLength(2);
  });

  it("maps edges correctly: gmailTrigger → code → googleDrive", () => {
    const gmailNode = result.nodes.find((n) => n.type === "gmailTrigger")!;
    const codeNode = result.nodes.find((n) => n.type === "code")!;
    const driveNode = result.nodes.find((n) => n.type === "googleDrive")!;

    const edge1 = result.edges.find((e) => e.sourceNodeId === gmailNode.id && e.targetNodeId === codeNode.id);
    expect(edge1).toBeDefined();

    const edge2 = result.edges.find((e) => e.sourceNodeId === codeNode.id && e.targetNodeId === driveNode.id);
    expect(edge2).toBeDefined();
  });

  it("has no warnings", () => {
    expect(result.warnings).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════
// Workflow 2: My workflow (evaluation trigger only)
// ═══════════════════════════════════════════

describe("n8n import: My workflow", () => {
  const result = importN8nWorkflow(loadWorkflow("My_workflow.json"));

  it("imports workflow name correctly", () => {
    expect(result.workflow.name).toBe("My workflow");
  });

  it("imports status as DRAFT", () => {
    expect(result.workflow.status).toBe("DRAFT");
  });

  it("imports exactly 1 node", () => {
    expect(result.nodes).toHaveLength(1);
  });

  it("maps evaluationTrigger node correctly", () => {
    const node = result.nodes[0];
    expect(node.type).toBe("evaluationTrigger");
    expect(node.label).toBe("When fetching a dataset row");
    expect(node.config.originalN8nType).toBe("n8n-nodes-base.evaluationTrigger");
    expect(node.config.typeVersion).toBe(4.7);
    expect(node.position).toEqual({ x: 0, y: 0 });
  });

  it("has no edges (standalone node)", () => {
    expect(result.edges).toHaveLength(0);
  });

  it("has no warnings", () => {
    expect(result.warnings).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════
// Workflow 3: My workflow 2 (IMAP → Gmail)
// ═══════════════════════════════════════════

describe("n8n import: My workflow 2", () => {
  const result = importN8nWorkflow(loadWorkflow("My_workflow_2.json"));

  it("imports workflow name correctly", () => {
    expect(result.workflow.name).toBe("My workflow 2");
  });

  it("imports status as DRAFT", () => {
    expect(result.workflow.status).toBe("DRAFT");
  });

  it("imports exactly 2 nodes", () => {
    expect(result.nodes).toHaveLength(2);
  });

  it("maps emailReadImap node correctly", () => {
    const node = result.nodes.find((n) => n.type === "emailReadImap");
    expect(node).toBeDefined();
    expect(node!.label).toBe("Email Trigger (IMAP)");
    expect(node!.config.originalN8nType).toBe("n8n-nodes-base.emailReadImap");
    expect(node!.config.typeVersion).toBe(2.2);
    expect(node!.position).toEqual({ x: 0, y: 0 });
  });

  it("maps gmail node correctly", () => {
    const node = result.nodes.find((n) => n.type === "gmail");
    expect(node).toBeDefined();
    expect(node!.label).toBe("Add label to message");
    expect(node!.config.originalN8nType).toBe("n8n-nodes-base.gmail");
    expect(node!.config.typeVersion).toBe(2.2);
    expect(node!.config.parameters).toMatchObject({
      operation: "addLabels",
    });
    expect(node!.config.webhookId).toBe("09fc1dd4-a6dd-4e14-a817-de6d6c6503fd");
  });

  it("imports exactly 1 edge (linear chain)", () => {
    expect(result.edges).toHaveLength(1);
  });

  it("maps edge correctly: emailReadImap → gmail", () => {
    const imapNode = result.nodes.find((n) => n.type === "emailReadImap")!;
    const gmailNode = result.nodes.find((n) => n.type === "gmail")!;
    const edge = result.edges.find((e) => e.sourceNodeId === imapNode.id && e.targetNodeId === gmailNode.id);
    expect(edge).toBeDefined();
  });

  it("has no warnings", () => {
    expect(result.warnings).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════
// Importer edge cases
// ═══════════════════════════════════════════

describe("n8n importer edge cases", () => {
  it("handles n8n export wrapped in { data: {...} }", () => {
    const wrapped = { data: { name: "Test", nodes: [], connections: {} } };
    const result = importN8nWorkflow(wrapped as any);
    expect(result.workflow.name).toBe("Test");
  });

  it("handles n8n export as flat structure", () => {
    const flat = { name: "Flat", nodes: [], connections: {} };
    const result = importN8nWorkflow(flat as any);
    expect(result.workflow.name).toBe("Flat");
  });

  it("generates unique IDs for nodes without n8n IDs", () => {
    const raw = {
      name: "No IDs",
      nodes: [{ name: "A", type: "n8n-nodes-base.httpRequest", typeVersion: 1, position: [0, 0], parameters: {} }],
      connections: {},
    };
    const result = importN8nWorkflow(raw as any);
    expect(result.nodes[0].id).toMatch(/^n8n-/);
  });

  it("preserves n8n node IDs with n8n- prefix", () => {
    const raw = {
      name: "With IDs",
      nodes: [
        { id: "abc-123", name: "Node A", type: "n8n-nodes-base.webhook", typeVersion: 1, position: [0, 0], parameters: {} },
      ],
      connections: {},
    };
    const result = importN8nWorkflow(raw as any);
    expect(result.nodes[0].id).toBe("n8n-abc-123");
  });

  it("warns about connections referencing missing nodes", () => {
    const raw = {
      name: "Bad Edges",
      nodes: [{ name: "A", type: "n8n-nodes-base.httpRequest", typeVersion: 1, position: [0, 0], parameters: {} }],
      connections: {
        A: { main: [[{ node: "Nonexistent", type: "main", index: 0 }]] },
      },
    };
    const result = importN8nWorkflow(raw as any);
    expect(result.warnings).toContain("Connection target node not found: Nonexistent");
  });

  it("returns empty result for workflow with no nodes", () => {
    const raw = { name: "Empty", nodes: [], connections: {} };
    const result = importN8nWorkflow(raw as any);
    expect(result.workflow.name).toBe("Empty");
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════
// Type mapping coverage
// ═══════════════════════════════════════════

describe("n8n node type mapping", () => {
  const allN8nTypes = [
    "n8n-nodes-base.webhook",
    "n8n-nodes-base.cron",
    "n8n-nodes-base.httpRequest",
    "n8n-nodes-base.if",
    "n8n-nodes-base.set",
    "n8n-nodes-base.code",
    "n8n-nodes-base.merge",
    "n8n-nodes-base.gmailTrigger",
    "n8n-nodes-base.googleDrive",
    "n8n-nodes-base.evaluationTrigger",
    "n8n-nodes-base.emailReadImap",
    "n8n-nodes-base.gmail",
  ];

  it("maps all known n8n types to valid AgentFlow types", () => {
    const raw = {
      name: "Type Test",
      nodes: allN8nTypes.map((type, i) => ({
        name: `Node ${i}`,
        type,
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      })),
      connections: {},
    };
    const result = importN8nWorkflow(raw as any);
    expect(result.nodes).toHaveLength(allN8nTypes.length);
    for (const node of result.nodes) {
      expect(node.type).toBeTruthy();
      expect(typeof node.type).toBe("string");
    }
  });
});
