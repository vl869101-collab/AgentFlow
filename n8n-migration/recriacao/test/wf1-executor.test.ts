/**
 * Testes do WF1 — "Save Gmail Attachments to Google Drive"
 *
 * Valida a execucao simulada do workflow: gmailTrigger → code (sandbox) → googleDrive
 * Usa credenciais mock (AES-256-GCM) e payload de email simulado com anexos.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";

// CREDENTIAL_ENCRYPTION_KEY is set in vitest.setup.ts before modules load
import { createWf1Workflow, type AgentFlowWorkflow, type AgentFlowNode } from "../wf1-workflow.js";
import { createWf1Credentials, decryptCredentialData } from "../credenciais.js";
import { runWorkflow, topologicalSort, LocalNodeRegistry, createWf1Registry } from "../runner.js";
import { GmailTriggerHandler } from "../handlers/gmailTrigger.js";
import { CodeNodeHandler } from "../handlers/code.js";
import { GoogleDriveHandler } from "../handlers/googleDrive.js";
import { executeCodeInSandbox, detectDangerousPatterns, DEFAULT_TIMEOUT_MS } from "../handlers/code-sandbox.js";
import { createMockCredential } from "../credenciais.js";
import { createCodeExecutionError } from "../handlers/types.js";

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

/** Payload de email simulado com 2 anexos (PDF e PNG) */
function createSimulatedEmail(): Record<string, unknown> {
  return {
    id: "sim-msg-001",
    threadId: "sim-thread-001",
    labelIds: ["INBOX", "UNREAD"],
    snippet: "Please find the invoice and report attached.",
    subject: "Q3 Financial Report",
    from: "ceo@acmecorp.com",
    to: "accounting@acmecorp.com",
    date: "2026-08-19T10:30:00Z",
    attachments: [
      {
        id: "att-001",
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        size: 102400,
        data: "JVBERi0xLjQKJcOkw7zDpO4...", // base64 truncado
      },
      {
        id: "att-002",
        filename: "report.png",
        mimeType: "image/png",
        size: 51200,
        data: "iVBORw0KGgoAAAANSUhEUgAA...", // base64 truncado
      },
    ],
  };
}

/** Payload de email sem anexos (para testar edge case) */
function createEmailWithoutAttachments(): Record<string, unknown> {
  return {
    id: "sim-msg-002",
    subject: "No attachments here",
    from: "user@example.com",
    to: "me@example.com",
    date: "2026-08-19T11:00:00Z",
    snippet: "Just a regular email.",
  };
}

// ═══════════════════════════════════════════
// Workflow Definition Tests
// ═══════════════════════════════════════════

describe("WF1: definicao nativa do workflow", () => {
  it("cria workflow com nome correto", () => {
    const wf = createWf1Workflow();
    expect(wf.name).toBe("Save Gmail Attachments to Google Drive");
  });

  it("tem status DRAFT (n8n original esta inativo)", () => {
    const wf = createWf1Workflow();
    expect(wf.status).toBe("DRAFT");
  });

  it("tem exatamente 3 nodes", () => {
    const wf = createWf1Workflow();
    expect(wf.nodes).toHaveLength(3);
  });

  it("tem exatamente 2 edges (cadeia linear)", () => {
    const wf = createWf1Workflow();
    expect(wf.edges).toHaveLength(2);
  });

  it("node 1: gmailTrigger com parametros do n8n preservados", () => {
    const wf = createWf1Workflow();
    const node = wf.nodes.find((n) => n.type === "gmailTrigger")!;
    expect(node.label).toBe("On New Email");
    expect(node.config.typeVersion).toBe(1.4);
    expect(node.config.originalN8nType).toBe("n8n-nodes-base.gmailTrigger");
    expect(node.config.parameters).toMatchObject({
      event: "messageReceived",
      simple: false,
      filters: { q: "has:attachment", readStatus: "unread" },
      options: { downloadAttachments: true, dataPropertyAttachmentsPrefixName: "attachment_" },
    });
  });

  it("node 2: code com jsCode preservado integralmente", () => {
    const wf = createWf1Workflow();
    const node = wf.nodes.find((n) => n.type === "code")!;
    expect(node.label).toBe("Split Attachments");
    expect(node.config.typeVersion).toBe(2);
    expect(node.config.parameters).toMatchObject({
      mode: "runOnceForEachItem",
    });
    expect(typeof node.config.parameters.jsCode).toBe("string");
    expect(node.config.parameters.jsCode).toContain("const results = []");
    expect(node.config.parameters.jsCode).toContain("$input.item.binary");
    expect(node.config.parameters.jsCode).toContain("return results");
  });

  it("node 3: googleDrive com parametros do upload preservados", () => {
    const wf = createWf1Workflow();
    const node = wf.nodes.find((n) => n.type === "googleDrive")!;
    expect(node.label).toBe("Upload to Google Drive");
    expect(node.config.typeVersion).toBe(3);
    expect(node.config.parameters).toMatchObject({
      resource: "file",
      operation: "upload",
      inputDataFieldName: "data",
      name: "={{ $json.fileName }}",
    });
  });

  it("as edges conectam gmailTrigger -> code -> googleDrive", () => {
    const wf = createWf1Workflow();
    const trigger = wf.nodes.find((n) => n.type === "gmailTrigger")!;
    const code = wf.nodes.find((n) => n.type === "code")!;
    const drive = wf.nodes.find((n) => n.type === "googleDrive")!;

    const e1 = wf.edges.find((e) => e.sourceNodeId === trigger.id && e.targetNodeId === code.id);
    expect(e1).toBeDefined();

    const e2 = wf.edges.find((e) => e.sourceNodeId === code.id && e.targetNodeId === drive.id);
    expect(e2).toBeDefined();
  });

  it("referencias de credenciais incluem Gmail e Google Drive OAuth2 mock", () => {
    const wf = createWf1Workflow();
    expect(wf.credentialRefs).toContain("gmail-oauth2-mock");
    expect(wf.credentialRefs).toContain("google-drive-oauth2-mock");
  });
});

// ═══════════════════════════════════════════
// Credential Encryption Tests (AES-256-GCM)
// ═══════════════════════════════════════════

describe("WF1: credenciais com encriptacao AES-256-GCM", () => {
  it("createMockCredential encripta e permete decrypt", () => {
    const cred = createMockCredential("test-id", "Test OAuth2", "gmail", { token: "abc123" }, "test-org");
    expect(cred.encryptedData).not.toContain("abc123"); // Deve estar encriptado
    expect(cred.type).toBe("oauth2");
    expect(cred.provider).toBe("gmail");

    const decrypted = decryptCredentialData(cred);
    expect(decrypted.token).toBe("abc123");
    expect(decrypted.client_id).toBeUndefined();
  });

  it("createWf1Credentials cria credenciais Gmail e Google Drive mock", () => {
    const creds = createWf1Credentials("test-org");
    expect(creds.gmail.id).toBe("cred-gmail-oauth2-wf1");
    expect(creds.googleDrive.id).toBe("cred-google-drive-oauth2-wf1");
    expect(creds.gmail.encryptedData).not.toContain("mock-gmail-refresh-token");
    expect(creds.googleDrive.encryptedData).not.toContain("mock-drive-refresh-token");

    const gmailData = decryptCredentialData(creds.gmail);
    expect(gmailData.client_id).toBe("mock-gmail-client-id.apps.googleusercontent.com");
    expect(gmailData.scope).toBe("https://www.googleapis.com/auth/gmail.readonly");

    const driveData = decryptCredentialData(creds.googleDrive);
    expect(driveData.scope).toBe("https://www.googleapis.com/auth/drive.file");
  });

  it("envelope AES-256-GCM tem iv, ct, tag", () => {
    const cred = createMockCredential("x", "X", "test", { key: "value" }, "org");
    const envelope = JSON.parse(cred.encryptedData);
    expect(envelope).toHaveProperty("iv");
    expect(envelope).toHaveProperty("ct");
    expect(envelope).toHaveProperty("tag");
    expect(typeof envelope.iv).toBe("string");
    expect(typeof envelope.ct).toBe("string");
    expect(typeof envelope.tag).toBe("string");
  });

  it("produz ciphertext diferente para mesmo plaintext (IV aleatorio)", () => {
    const cred1 = createMockCredential("a", "A", "test", { token: "same" }, "org");
    const cred2 = createMockCredential("b", "B", "test", { token: "same" }, "org");
    expect(cred1.encryptedData).not.toBe(cred2.encryptedData);
    expect(decryptCredentialData(cred1).token).toBe("same");
    expect(decryptCredentialData(cred2).token).toBe("same");
  });
});

// ═══════════════════════════════════════════
// Topological Sort Tests
// ═══════════════════════════════════════════

describe("WF1: topological sort", () => {
  it("ordena os 3 nodes na sequencia correta: gmailTrigger -> code -> googleDrive", () => {
    const wf = createWf1Workflow();
    const sorted = topologicalSort(wf.nodes, wf.edges);

    expect(sorted).toHaveLength(3);
    expect(sorted[0].type).toBe("gmailTrigger");
    expect(sorted[1].type).toBe("code");
    expect(sorted[2].type).toBe("googleDrive");
  });

  it("lança erro para ciclo no grafo", () => {
    const nodes: AgentFlowNode[] = [
      { id: "a", type: "trigger", label: "A", config: {}, position: { x: 0, y: 0 } },
      { id: "b", type: "advanced", label: "B", config: {}, position: { x: 100, y: 0 } },
      { id: "c", type: "advanced", label: "C", config: {}, position: { x: 200, y: 0 } },
    ];
    // a e trigger, b -> c -> b forma ciclo
    const edges = [
      { id: "e1", sourceNodeId: "a", targetNodeId: "b" },
      { id: "e2", sourceNodeId: "b", targetNodeId: "c" },
      { id: "e3", sourceNodeId: "c", targetNodeId: "b" },
    ];

    expect(() => topologicalSort(nodes, edges)).toThrow("Cycle detected");
  });

  it("lança erro quando nao ha trigger (todos os nodes tem entrada)", () => {
    const nodes: AgentFlowNode[] = [
      { id: "a", type: "advanced", label: "A", config: {}, position: { x: 0, y: 0 } },
      { id: "b", type: "advanced", label: "B", config: {}, position: { x: 100, y: 0 } },
    ];
    // Ciclo a -> b -> a: ambos sao targets, nenhum e trigger
    const edges = [
      { id: "e1", sourceNodeId: "a", targetNodeId: "b" },
      { id: "e2", sourceNodeId: "b", targetNodeId: "a" },
    ];
    // Como todos os nodes sao targets, o "no trigger" check dispara antes do cycle detection
    expect(() => topologicalSort(nodes, edges)).toThrow(/no trigger/i);
  });
});

// ═══════════════════════════════════════════
// LocalNodeRegistry Tests
// ═══════════════════════════════════════════

describe("WF1: LocalNodeRegistry", () => {
  it("registra e recupera handlers", () => {
    const registry = new LocalNodeRegistry();
    registry.register("gmailTrigger", new GmailTriggerHandler());
    expect(registry.has("gmailTrigger")).toBe(true);
    expect(registry.getHandler("gmailTrigger")).toBeDefined();
  });

  it("createWf1Registry registra os 3 handlers corretos", () => {
    const registry = createWf1Registry();
    expect(registry.list()).toEqual(["gmailTrigger", "code", "googleDrive"]);
  });

  it("retorna undefined para tipo nao registrado", () => {
    const registry = new LocalNodeRegistry();
    expect(registry.getHandler("nonexistent")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════
// Handler: GmailTriggerHandler
// ═══════════════════════════════════════════

describe("WF1: GmailTriggerHandler", () => {
  const handler = new GmailTriggerHandler();

  it("tipo e categoria corretos", () => {
    expect(handler.type).toBe("gmailTrigger");
    expect(handler.category).toBe("trigger");
  });

  it("processa email simulado com 2 anexos", async () => {
    const email = createSimulatedEmail();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "gmail-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 1.4,
        originalN8nType: "n8n-nodes-base.gmailTrigger",
        parameters: {
          event: "messageReceived",
          filters: { q: "has:attachment" },
          options: { downloadAttachments: true, dataPropertyAttachmentsPrefixName: "attachment_" },
        },
      },
      input: email,
    });

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.json.subject).toBe("Q3 Financial Report");
    expect(item.json.from).toBe("ceo@acmecorp.com");
    expect(Array.isArray(item.json.attachments)).toBe(true);
    expect(item.json.attachments).toHaveLength(2);
    expect(item.json.attachments[0].filename).toBe("invoice.pdf");
    expect(item.json.attachments[1].filename).toBe("report.png");
    expect(result.logs.length).toBeGreaterThan(0);
  });

  it("retorna metadata quando input esta vazio", async () => {
    const result = await handler.execute({
      executionId: "test",
      nodeId: "gmail-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 1.4,
        parameters: { event: "messageReceived", filters: {}, options: {} },
      },
      input: undefined,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].json._trigger).toBe("gmailTrigger");
    expect(result.items[0].json._config.event).toBe("messageReceived");
  });

  it("extrai anexos de propriedades prefixadas quando nao ha array attachments", async () => {
    const email = {
      id: "msg-2",
      subject: "Test",
      from: "a@b.com",
      to: "me@c.com",
      date: "2026-08-19T12:00:00Z",
      attachment_file1: { filename: "doc.txt", mimeType: "text/plain", data: "SGVsbG8=" },
      attachment_file2: { filename: "img.jpg", mimeType: "image/jpeg", data: "base64data" },
    };
    const result = await handler.execute({
      executionId: "test",
      nodeId: "gmail-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 1.4,
        parameters: {
          event: "messageReceived",
          options: { downloadAttachments: true, dataPropertyAttachmentsPrefixName: "attachment_" },
        },
      },
      input: email,
    });

    expect(result.items[0].json.attachments).toHaveLength(2);
    expect(result.items[0].json.attachments[0].filename).toBe("doc.txt");
    expect(result.items[0].json.attachments[1].filename).toBe("img.jpg");
  });
});

// ═══════════════════════════════════════════
// Handler: CodeNodeHandler (Sandbox)
// ═══════════════════════════════════════════

describe("WF1: CodeNodeHandler (sandbox seguro)", () => {
  const handler = new CodeNodeHandler();

  it("tipo e categoria corretos", () => {
    expect(handler.type).toBe("code");
    expect(handler.category).toBe("transform");
  });

  it("executa jsCode do Split Attachments e produz 2 items", async () => {
    const email = createSimulatedEmail();
    const jsCode = createWf1Workflow().nodes.find((n) => n.type === "code")!.config.parameters.jsCode as string;

    const result = await handler.execute({
      executionId: "test",
      nodeId: "code-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 2,
        originalN8nType: "n8n-nodes-base.code",
        parameters: { mode: "runOnceForEachItem", jsCode },
      },
      input: [
        {
          json: email,
          binary: {
            attachment_invoice: {
              fileName: "invoice.pdf",
              mimeType: "application/pdf",
              size: 102400,
              data: "JVBERi0xLjQKJcOkw7zDpO4...",
            },
            attachment_report: {
              fileName: "report.png",
              mimeType: "image/png",
              size: 51200,
              data: "iVBORw0KGgoAAAANSUhEUgAA...",
            },
          },
        },
      ],
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].json.fileName).toBe("invoice.pdf");
    expect(result.items[0].json.mimeType).toBe("application/pdf");
    expect(result.items[0].json.subject).toBe("Q3 Financial Report");
    expect(result.items[0].json.from).toBe("ceo@acmecorp.com");
    expect(result.items[0].binary).toBeDefined();
    expect(result.items[0].binary!.data).toBeDefined();

    expect(result.items[1].json.fileName).toBe("report.png");
    expect(result.items[1].json.mimeType).toBe("image/png");
  });

  it("lança erro quando jsCode esta vazio", async () => {
    await expect(
      handler.execute({
        executionId: "test",
        nodeId: "code-1",
        workflowId: "wf1",
        orgId: "test-org",
        nodeConfig: { typeVersion: 2, parameters: { jsCode: "" } },
        input: [],
      }),
    ).rejects.toThrow("no jsCode");
  });

  it("lança erro quando parametros estao ausentes", async () => {
    await expect(
      handler.execute({
        executionId: "test",
        nodeId: "code-1",
        workflowId: "wf1",
        orgId: "test-org",
        nodeConfig: { typeVersion: 2 },
        input: [],
      }),
    ).rejects.toThrow("no parameters");
  });

  it("blokia codigo com padroes perigosos (require, process)", async () => {
    await expect(
      handler.execute({
        executionId: "test",
        nodeId: "code-1",
        workflowId: "wf1",
        orgId: "test-org",
        nodeConfig: {
          typeVersion: 2,
          parameters: { mode: "runOnceForEachItem", jsCode: "const r = require('fs'); return r;" },
        },
        input: [{ json: {} }],
      }),
    ).rejects.toThrow("CODE_SECURITY_BLOCK");
  });

  it("blokia codigo com process", async () => {
    await expect(
      handler.execute({
        executionId: "test",
        nodeId: "code-1",
        workflowId: "wf1",
        orgId: "test-org",
        nodeConfig: {
          typeVersion: 2,
          parameters: { mode: "runOnceForEachItem", jsCode: "return process.env;" },
        },
        input: [{ json: {} }],
      }),
    ).rejects.toThrow("CODE_SECURITY_BLOCK");
  });

  it("executa codigo runOnceForAllItems uma vez com todos items", async () => {
    const result = await handler.execute({
      executionId: "test",
      nodeId: "code-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 1,
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: "return $input.all().map(i => ({ json: { count: $input.length } }))",
        },
      },
      input: [{ json: { a: 1 } }, { json: { b: 2 } }],
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].json.count).toBe(2);
  });

  it("trata erro de runtime no codigo do usuario", async () => {
    await expect(
      handler.execute({
        executionId: "test",
        nodeId: "code-1",
        workflowId: "wf1",
        orgId: "test-org",
        nodeConfig: {
          typeVersion: 2,
          parameters: { mode: "runOnceForEachItem", jsCode: "throw new Error('runtime error');" },
        },
        input: [{ json: {} }],
      }),
    ).rejects.toThrow("CODE_RUNTIME_ERROR");
  });

  it("trata codigo que faz timeout", { timeout: 10_000 }, async () => {
    const infinite = "while(true) {}";
    await expect(
      handler.execute({
        executionId: "test",
        nodeId: "code-1",
        workflowId: "wf1",
        orgId: "test-org",
        nodeConfig: {
          typeVersion: 2,
          parameters: { mode: "runOnceForEachItem", jsCode: infinite },
        },
        input: [{ json: {} }],
      }),
    ).rejects.toThrow("timeout");
  });
});

// ═══════════════════════════════════════════
// Handler: GoogleDriveHandler
// ═══════════════════════════════════════════

describe("WF1: GoogleDriveHandler", () => {
  const handler = new GoogleDriveHandler();

  it("tipo e categoria corretos", () => {
    expect(handler.type).toBe("googleDrive");
    expect(handler.category).toBe("action");
  });

  it("faz upload simulado de 2 anexos e registra no .uploads", async () => {
    const splitItems = [
      {
        json: { fileName: "invoice.pdf", mimeType: "application/pdf", subject: "Q3 Financial Report", from: "ceo@acmecorp.com" },
        binary: {
          data: {
            filename: "invoice.pdf",
            mimeType: "application/pdf",
            size: 102400,
            data: "JVBERi0xLjQKJcOkw7zDpO4...",
          },
        },
      },
      {
        json: { fileName: "report.png", mimeType: "image/png", subject: "Q3 Financial Report", from: "ceo@acmecorp.com" },
        binary: {
          data: {
            filename: "report.png",
            mimeType: "image/png",
            size: 51200,
            data: "iVBORw0KGgoAAAANSUhEUgAA...",
          },
        },
      },
    ];

    const result = await handler.execute({
      executionId: "test",
      nodeId: "drive-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 3,
        originalN8nType: "n8n-nodes-base.googleDrive",
        parameters: {
          resource: "file",
          operation: "upload",
          inputDataFieldName: "data",
          name: "={{ $json.fileName }}",
          driveId: { __rl: true, mode: "list", value: "My Drive", cachedResultName: "My Drive" },
          folderId: { __rl: true, mode: "list", value: "root", cachedResultName: "/ (Root folder)" },
        },
      },
      input: splitItems,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].json.success).toBe(true);
    expect(result.items[0].json.name).toBe("invoice.pdf");
    expect(result.items[0].json.mimeType).toBe("application/pdf");
    expect(result.items[0].json.webViewLink).toBeDefined();

    expect(result.items[1].json.success).toBe(true);
    expect(result.items[1].json.name).toBe("report.png");
    expect(result.items[1].json.mimeType).toBe("image/png");

    expect(handler.uploads).toHaveLength(2);
    expect(handler.uploads[0].name).toBe("invoice.pdf");
    expect(handler.uploads[1].name).toBe("report.png");
  });

  it("trata item sem dados binarios", async () => {
    const result = await handler.execute({
      executionId: "test",
      nodeId: "drive-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 3,
        parameters: { resource: "file", operation: "upload", name: "test.txt" },
      },
      input: [{ json: { fileName: "test.txt" }, binary: {} }],
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.success).toBe(false);
    expect(result.items[0].json.error).toContain("No binary data");
  });

  it("ignora operacao diferente de upload", async () => {
    const result = await handler.execute({
      executionId: "test",
      nodeId: "drive-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 3,
        parameters: { resource: "file", operation: "list" },
      },
      input: [{ json: {} }],
    });

    expect(result.items).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════
// Code Sandbox Tests
// ═══════════════════════════════════════════

describe("WF1: code-sandbox", () => {
  it("detectDangerousPatterns identifica require", () => {
    expect(detectDangerousPatterns("require('fs')")).toContain("require");
  });

  it("detectDangerousPatterns identifica process", () => {
    expect(detectDangerousPatterns("process.env")).toContain("process");
  });

  it("detectDangerousPatterns identifica eval e Function", () => {
    expect(detectDangerousPatterns("eval('x')")).toContain("eval");
    expect(detectDangerousPatterns("new Function('x')")).toContain("Function constructor");
  });

  it("detectDangerousPatterns codigo limpo retorna lista vazia", () => {
    const cleanCode = "const x = $json.value; return { result: x * 2 }";
    expect(detectDangerousPatterns(cleanCode)).toHaveLength(0);
  });

  it("executeCodeInSandbox executa codigo simples e retorna valor", async () => {
    const { result } = await executeCodeInSandbox("return 42;", {});
    expect(result).toBe(42);
  });

  it("executeCodeInSandbox injeta variaveis n8n ($json, $input)", async () => {
    const { result } = await executeCodeInSandbox(
      "return { subject: $json.subject, hasInput: $input.all().length > 0 };",
      {
        $json: { subject: "Test Email" },
        $input: {
          all: () => [{ json: { subject: "A" } }, { json: { subject: "B" } }],
          first: () => ({ json: { subject: "A" } }),
          last: () => ({ json: { subject: "B" } }),
          length: 2,
        },
        $now: "2026-01-01T00:00:00Z",
      },
    );
    expect(result).toEqual({ subject: "Test Email", hasInput: true });
  });

  it("executeCodeInSandbox capta logs do console", async () => {
    const { logs } = await executeCodeInSandbox("console.log('hello from sandbox'); console.error('an error');", {});
    expect(logs).toContain("hello from sandbox");
    expect(logs[1]).toContain("[ERROR] an error");
  });

  it("executeCodeInSandbox bloqueia padroes perigosos", async () => {
    await expect(executeCodeInSandbox("return require('fs');", {})).rejects.toThrow("CODE_SECURITY_BLOCK");
  });

  it("executeCodeInSandbox trata erro de runtime", async () => {
    await expect(executeCodeInSandbox("undefined.foo;", {})).rejects.toThrow("CODE_RUNTIME_ERROR");
  });

  it("executeCodeInSandbox usa timeout customizado", async () => {
    const start = Date.now();
    await expect(
      executeCodeInSandbox("while(true) {}", {}, { timeoutMs: 500 }),
    ).rejects.toThrow("timeout");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(400);
    expect(elapsed).toBeLessThan(2000);
  });

  it("DEFAULT_TIMEOUT_MS e 5000", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(5000);
  });
});

// ═══════════════════════════════════════════
// Full Workflow Execution (E2E) Tests
// ═══════════════════════════════════════════

describe("WF1: execucao end-to-end (gmailTrigger -> code -> googleDrive)", () => {
  const orgId = "test-org-wf1";
  const creds = createWf1Credentials(orgId);
  const credMap = new Map([
    ["gmail", decryptCredentialData(creds.gmail)],
    ["googleDrive", decryptCredentialData(creds.googleDrive)],
  ]);

  it("executa workflow com email simulado c/ 2 anexos — split -> upload validado", async () => {
    const wf = createWf1Workflow();
    const email = createSimulatedEmail();

    const result = await runWorkflow(wf, email, credMap, { orgId, trigger: "manual" });

    expect(result.status).toBe("success");
    expect(result.error).toBeNull();
    expect(result.steps).toHaveLength(3);

    // Step 1: gmailTrigger
    const step1 = result.steps[0];
    expect(step1.nodeType).toBe("gmailTrigger");
    expect(step1.status).toBe("success");
    expect(step1.output).toBeDefined();

    // Step 2: code (Split Attachments)
    const step2 = result.steps[1];
    expect(step2.nodeType).toBe("code");
    expect(step2.status).toBe("success");
    const codeOutput = step2.output as unknown as { json: Record<string, unknown> }[];
    expect(codeOutput).toHaveLength(2);
    expect(codeOutput[0].json.fileName).toBe("invoice.pdf");
    expect(codeOutput[1].json.fileName).toBe("report.png");

    // Step 3: googleDrive (Upload)
    const step3 = result.steps[2];
    expect(step3.nodeType).toBe("googleDrive");
    expect(step3.status).toBe("success");
    const driveOutput = step3.output as unknown as { json: Record<string, unknown> }[];
    expect(driveOutput).toHaveLength(2);
    expect(driveOutput[0].json.success).toBe(true);
    expect(driveOutput[0].json.name).toBe("invoice.pdf");
    expect(driveOutput[1].json.success).toBe(true);
    expect(driveOutput[1].json.name).toBe("report.png");

    // Output final e o do googleDrive
    const finalOutput = result.output as unknown as { json: Record<string, unknown> }[];
    expect(finalOutput).toHaveLength(2);
    expect(finalOutput[0].json.success).toBe(true);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("executa workflow com email sem anexos — split produz 0 items, upload produz 0", async () => {
    const wf = createWf1Workflow();
    const email = createEmailWithoutAttachments();

    const result = await runWorkflow(wf, email, credMap, { orgId, trigger: "manual" });

    expect(result.status).toBe("success");
    expect(result.steps).toHaveLength(3);

    // gmailTrigger recebe email sem attachments
    const step1 = result.steps[0];
    const triggerOutput = step1.output as unknown as { json: Record<string, unknown> }[];
    expect(triggerOutput[0].json.attachments).toHaveLength(0);

    // code node: input vem do gmailTrigger — o email nao tem binary, entao split produz 0 items
    const step2 = result.steps[1];
    expect(step2.status).toBe("success");
    const codeOutput = step2.output as unknown as { json: Record<string, unknown> }[];
    expect(codeOutput).toHaveLength(0);

    // googleDrive: nenhum item para upload
    const step3 = result.steps[2];
    expect(step3.status).toBe("success");
    const driveOutput = step3.output as unknown as { json: Record<string, unknown> }[];
    expect(driveOutput).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════
// Additional Coverage Tests
// ═══════════════════════════════════════════

describe("WF1: additional coverage tests", () => {
  it("code-sandbox console.warn e console.info sao capturados", async () => {
    const { logs } = await executeCodeInSandbox(
      "console.warn('alerta'); console.info('informacao'); console.dir({}); console.debug('debug');",
      {},
    );
    expect(logs.some((l) => l.includes("[WARN] alerta"))).toBe(true);
    expect(logs.some((l) => l.includes("informacao"))).toBe(true);
  });

  it("CodeNodeHandler trata input null/undefined", async () => {
    const handler = new CodeNodeHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "code-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 2,
        parameters: { mode: "runOnceForEachItem", jsCode: "return { json: { processed: true } };"},
      },
      input: undefined,
    });
    expect(result.items).toHaveLength(0);
  });

  it("CodeNodeHandler trata input como array direto", async () => {
    const handler = new CodeNodeHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "code-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 2,
        parameters: { mode: "runOnceForEachItem", jsCode: "return { json: { count: $input.item.json.val } };" },
      },
      input: [{ json: { val: 42 } }],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.count).toBe(42);
  });

  it("CodeNodeHandler trata codigo que retorna null", async () => {
    const handler = new CodeNodeHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "code-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 2,
        parameters: { mode: "runOnceForEachItem", jsCode: "return null;" },
      },
      input: [{ json: {} }],
    });
    expect(result.items).toHaveLength(0);
  });

  it("CodeNodeHandler trata codigo que retorna valor nao-objeto", async () => {
    const handler = new CodeNodeHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "code-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 2,
        parameters: { mode: "runOnceForEachItem", jsCode: "return 42;" },
      },
      input: [{ json: {} }],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.result).toBe(42);
  });

  it("CodeNodeHandler runOnceForAllItems trata resultado nao-array", async () => {
    const handler = new CodeNodeHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "code-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 2,
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: "return { json: { total: $input.length } };",
        },
      },
      input: [{ json: { a: 1 } }, { json: { b: 2 } }],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.total).toBe(2);
  });

  it("GmailTriggerHandler trata input array (pass-through items)", async () => {
    const handler = new GmailTriggerHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "gmail-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 1.4,
        parameters: { event: "messageReceived", filters: {}, options: {} },
      },
      input: [{ json: { subject: "array input" } }],
    });
    // Array input nao e tratado como objeto unico — cai no else
    expect(result.items[0].json._trigger).toBe("gmailTrigger");
  });

  it("GmailTriggerHandler extrai anexos de propriedades prefixadas sem downloadAttachments", async () => {
    const handler = new GmailTriggerHandler();
    const email = {
      id: "msg-3",
      subject: "Test",
      from: "a@b.com",
      date: "2026-08-19T12:00:00Z",
      attachment_file1: { filename: "doc.txt", mimeType: "text/plain", data: "SGVsbG8=" },
    };
    const result = await handler.execute({
      executionId: "test",
      nodeId: "gmail-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 1.4,
        parameters: {
          event: "messageReceived",
          options: { downloadAttachments: false }, // sem prefixo
        },
      },
      input: email,
    });
    // Sem dataPropertyAttachmentsPrefixName, usa padrao "attachment_"
    expect(result.items[0].json.attachments).toHaveLength(1);
  });

  it("GoogleDriveHandler usa binaryPropertyName customizado", async () => {
    const handler = new GoogleDriveHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "drive-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 3,
        parameters: {
          resource: "file",
          operation: "upload",
          binaryPropertyName: "custom",
          name: "test.txt",
        },
      },
      input: [
        {
          json: { fileName: "test.txt" },
          binary: {
            custom: {
              fileName: "test.txt",
              mimeType: "text/plain",
              size: 100,
              data: "SGVsbG8=",
            },
          },
        },
      ],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.success).toBe(true);
    expect(result.items[0].json.name).toBe("test.txt");
  });

  it("GoogleDriveHandler trata input null", async () => {
    const handler = new GoogleDriveHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "drive-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 3,
        parameters: { resource: "file", operation: "upload", name: "test" },
      },
      input: null,
    });
    expect(result.items).toHaveLength(0);
  });

  it("GoogleDriveHandler nome vem do binaryObj quando template esta vazio", async () => {
    const handler = new GoogleDriveHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "drive-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 3,
        parameters: { resource: "file", operation: "upload" },
      },
      input: [
        {
          json: {},
          binary: {
            data: {
              fileName: "fallback.txt",
              mimeType: "text/plain",
              size: 50,
              data: "SGVsbG8=",
            },
          },
        },
      ],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.name).toBe("fallback.txt");
  });

  it("createCodeExecutionError usa code default quando nao informado", () => {
    const err = createCodeExecutionError("custom error");
    expect(err.code).toBe("CODE_EXECUTION_ERROR");
    expect((err as Error).message).toBe("custom error");
    expect(err.statusCode).toBe(500);
  });

  it("createCodeExecutionError usa code customizado", () => {
    const err = createCodeExecutionError("custom error", "CUSTOM_CODE");
    expect(err.code).toBe("CUSTOM_CODE");
  });

  it("CodeNodeHandler usa $input.first/last e $helpers.returnJsonArray", async () => {
    const handler = new CodeNodeHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "code-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 2,
        parameters: {
          mode: "runOnceForEachItem",
          jsCode: "const f = $input.first(); const l = $input.last(); return $helpers.returnJsonArray({ json: { first: f.json.val, last: l.json.val } });",
        },
      },
      input: [{ json: { val: 10 } }, { json: { val: 20 } }],
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].json.first).toBe(10);
    expect(result.items[0].json.last).toBe(20);
  });

  it("CodeNodeHandler usa $helpers.createBinary", async () => {
    const handler = new CodeNodeHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "code-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 2,
        parameters: {
          mode: "runOnceForEachItem",
          jsCode: "return [{ json: { ok: true }, binary: { data: $helpers.createBinary('SGVsbG8=', 'test.txt', 'text/plain') } }];",
        },
      },
      input: [{ json: {} }],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].binary?.data).toBeDefined();
  });

  it("CodeNodeHandler trata item que e string no input", async () => {
    const handler = new CodeNodeHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "code-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 2,
        parameters: {
          mode: "runOnceForEachItem",
          jsCode: "return { json: { processed: true } };",
        },
      },
      input: [42 as unknown],
    });
    expect(result.items).toHaveLength(1);
  });

  it("GmailTriggerHandler extrai anexos com nome alternativo (name, contentType, content)", async () => {
    const handler = new GmailTriggerHandler();
    const email = {
      id: "msg-alt",
      subject: "Alt",
      from: "a@b.com",
      to: "c@d.com",
      date: "2026-01-01T00:00:00Z",
      attachments: [
        {
          id: "att-x",
          name: "report.txt",
          contentType: "text/plain",
          size: 500,
          content: "SGVsbG8=",
        },
      ],
    };
    const result = await handler.execute({
      executionId: "test",
      nodeId: "gmail-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 1.4,
        parameters: { event: "messageReceived", options: { downloadAttachments: true, dataPropertyAttachmentsPrefixName: "attachment_" } },
      },
      input: email,
    });
    expect(result.items[0].json.attachments[0].filename).toBe("report.txt");
    expect(result.items[0].json.attachments[0].mimeType).toBe("text/plain");
    expect(result.items[0].json.attachments[0].data).toBe("SGVsbG8=");
    expect(result.items[0].binary["attachment_report"]).toBeDefined();
    expect(result.items[0].binary["attachment_report"]!.fileName).toBe("report.txt");
  });

  it("GoogleDriveHandler sem binaryPropertyName usa 'data' como padrao", async () => {
    const handler = new GoogleDriveHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "drive-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 3,
        parameters: { resource: "file", operation: "upload" },
      },
      input: [
        {
          json: {},
          binary: {
            data: {
              fileName: "auto.txt",
              mimeType: "text/plain",
              size: 10,
              data: "SGVsbG8=",
            },
          },
        },
      ],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.name).toBe("auto.txt");
  });

  it("GmailTriggerHandler email sem anexos nenhum (sem array, sem prefixo)", async () => {
    const handler = new GmailTriggerHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "gmail-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 1.4,
        parameters: { event: "messageReceived", options: { downloadAttachments: true, dataPropertyAttachmentsPrefixName: "attachment_" } },
      },
      input: {
        id: "msg-no-att",
        subject: "No Att",
        from: "a@b.com",
        date: "2026-01-01T00:00:00Z",
      },
    });
    expect(result.items[0].json.attachments).toHaveLength(0);
    expect(result.items[0].binary).toEqual({});
  });

  it("GmailTriggerHandler attachment sem filename usa id como fallback", async () => {
    const handler = new GmailTriggerHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "gmail-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 1.4,
        parameters: { event: "messageReceived", options: { downloadAttachments: true, dataPropertyAttachmentsPrefixName: "att_" } },
      },
      input: {
        id: "msg",
        subject: "Test",
        from: "a@b.com",
        date: "2026-01-01T00:00:00Z",
        attachments: [{ data: "base64" }], // sem id, filename, mimeType
      },
    });
    const att = result.items[0].json.attachments[0];
    expect(att.filename).toBe("attachment_0"); // fallback para att-0
    expect(att.mimeType).toBe("application/octet-stream"); // fallback
    expect(att.size).toBe(0); // fallback
    expect(att.data).toBe("base64");
  });

  it("CodeNodeHandler runOnceForAllItems usa $helpers.returnJsonArray", async () => {
    const handler = new CodeNodeHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "code-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 2,
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: "return $helpers.returnJsonArray({ json: { total: $input.all().length } });",
        },
      },
      input: [{ json: { a: 1 } }, { json: { b: 2 } }, { json: { c: 3 } }],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.total).toBe(3);
  });

  it("CodeNodeHandler trata result com json mas sem binary", async () => {
    const handler = new CodeNodeHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "code-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 2,
        parameters: { mode: "runOnceForEachItem", jsCode: "return { json: { val: 1 } };" },
      },
      input: [{ json: {} }],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.val).toBe(1);
    expect(result.items[0].binary).toBeUndefined();
  });

  it("GoogleDriveHandler usa item.json.data quando binary ausente", async () => {
    const handler = new GoogleDriveHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "drive-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 3,
        parameters: { resource: "file", operation: "upload", name: "test.txt" },
      },
      input: [
        {
          json: {
            fileName: "test.txt",
            data: {
              fileName: "test.txt",
              mimeType: "text/plain",
              size: 10,
              data: "SGVsbG8=",
            },
          },
        },
      ],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.success).toBe(true);
    expect(result.items[0].json.name).toBe("test.txt");
  });

  it("GoogleDriveHandler trata item sem binary e sem json.data", async () => {
    const handler = new GoogleDriveHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "drive-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 3,
        parameters: { resource: "file", operation: "upload", name: "test2.txt" },
      },
      input: [{ json: { fileName: "test2.txt" } }],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.success).toBe(false);
  });

  it("GoogleDriveHandler simulateUpload usa mimeType padrao quando ausente", async () => {
    const handler = new GoogleDriveHandler();
    const result = await handler.execute({
      executionId: "test",
      nodeId: "drive-1",
      workflowId: "wf1",
      orgId: "test-org",
      nodeConfig: {
        typeVersion: 3,
        parameters: { resource: "file", operation: "upload", name: "f.txt" },
      },
      input: [
        {
          json: {},
          binary: {
            data: { fileName: "f.txt", data: "abc" }, // sem mimeType
          },
        },
      ],
    });
    expect(result.items[0].json.mimeType).toBe("application/octet-stream");
  });
});
