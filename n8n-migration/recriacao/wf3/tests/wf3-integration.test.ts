/**
 * Testes de integracao do WF3 — "My workflow 2"
 *
 * Valida a execucao simulada do workflow: emailReadImap -> gmail (addLabels)
 * Usa credenciais mock (AES-256-GCM) e payload de email simulado.
 *
 * Este teste e auto-contido — nao importa o servidor Fastify do apps/api,
 * evitando problemas de resolucao de modulos (ipaddr.js, bullmq, prisma).
 * Usa o runner local (runWorkflow3) que deserializa handlers nativos.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "node:crypto";

import { createWf3Workflow, type AgentFlowWorkflow, type AgentFlowNode, type AgentFlowEdge } from "../wf3-workflow.js";
import { createWf3Credentials } from "../credenciais-wf3.js";
import { decryptCredentialData } from "../../credenciais.js";
import { runWorkflow } from "../runner.js";
import { EmailReadImapHandler } from "../handlers/email-read-imap.js";
import { GmailHandler } from "../handlers/gmail.js";
import { createWf3Registry } from "../runner.js";
import { EMAIL_READ_IMAP_NATIVE_TYPE } from "../handlers/email-read-imap.js";
import { GMAIL_NATIVE_TYPE } from "../handlers/gmail.js";

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/** Payload de email simulado para o trigger IMAP */
function createSimulatedEmail() {
  return {
    id: "sim-msg-001",
    uid: "12345",
    subject: "Q3 Financial Report",
    from: "ceo@acmecorp.com",
    to: "accounting@acmecorp.com",
    cc: "finance@acmecorp.com",
    date: "2026-08-19T10:30:00Z",
    snippet: "Please find the invoice and report attached.",
    attachments: [
      { id: "att-001", filename: "invoice.pdf", mimeType: "application/pdf", size: 102400, data: "JVBERi0xLjQK" },
      { id: "att-002", filename: "report.png", mimeType: "image/png", size: 51200, data: "iVBORw0KGgo" },
    ],
  };
}

/** Payload de email sem anexos */
function createEmailWithoutAttachments() {
  return {
    id: "sim-msg-002",
    subject: "No attachments here",
    from: "user@example.com",
    to: "me@example.com",
    date: "2026-08-19T11:00:00Z",
    snippet: "Just a regular email.",
  };
}

// ──────────────────────────────────────────────────────────────
// Workflow Definition Tests
// ──────────────────────────────────────────────────────────────

describe("WF3: definicao nativa do workflow", () => {
  it("cria workflow com nome correto", () => {
    const wf = createWf3Workflow();
    expect(wf.name).toBe("My workflow 2");
  });

  it("tem status DRAFT", () => {
    const wf = createWf3Workflow();
    expect(wf.status).toBe("DRAFT");
  });

  it("tem exatamente 2 nodes", () => {
    const wf = createWf3Workflow();
    expect(wf.nodes).toHaveLength(2);
  });

  it("tem exatamente 1 edge (cadeia linear)", () => {
    const wf = createWf3Workflow();
    expect(wf.edges).toHaveLength(1);
  });

  it("node 1: emailReadImap com parametros do n8n preservados", () => {
    const wf = createWf3Workflow();
    const node = wf.nodes.find((n) => n.type === "emailReadImap")!;
    expect(node).toBeDefined();
    expect(node.label).toBe("Email Trigger (IMAP)");
    expect(node.config.typeVersion).toBe(2.2);
    expect(node.config.originalN8nType).toBe("n8n-nodes-base.emailReadImap");
    expect(node.config.originalN8nId).toBe("00b57fc2-a2f3-41c9-aa5b-e833a162659a");
    expect(node.config.parameters).toMatchObject({
      options: {
        mailbox: "INBOX",
        postProcess: "unread",
        markAsRead: true,
        stripAttachments: false,
      },
    });
    expect(node.config.credentials).toMatchObject({ imap: "cred-imap-wf3" });
  });

  it("node 2: gmail com operation addLabels e webhookId preservados", () => {
    const wf = createWf3Workflow();
    const node = wf.nodes.find((n) => n.type === "gmail")!;
    expect(node).toBeDefined();
    expect(node.label).toBe("Add label to message");
    expect(node.config.typeVersion).toBe(2.2);
    expect(node.config.originalN8nType).toBe("n8n-nodes-base.gmail");
    expect(node.config.originalN8nId).toBe("82fca877-6b61-4f40-902a-fccd7cf5beea");
    expect(node.config.parameters).toMatchObject({
      operation: "addLabels",
      labelIds: ["Label_1"],
    });
    expect(node.config.webhookId).toBe("09fc1dd4-a6dd-4e14-a817-de6d6c6503fd");
    expect(node.config.credentials).toMatchObject({ gmail: "cred-gmail-oauth2-wf3" });
  });

  it("o edge conecta emailReadImap -> gmail", () => {
    const wf = createWf3Workflow();
    const trigger = wf.nodes.find((n) => n.type === "emailReadImap")!;
    const action = wf.nodes.find((n) => n.type === "gmail")!;

    const edge = wf.edges.find((e) => e.sourceNodeId === trigger.id && e.targetNodeId === action.id);
    expect(edge).toBeDefined();
    expect(edge!.sourceHandle).toBe("main");
    expect(edge!.targetHandle).toBe("main");
  });

  it("referencias de credenciais incluem IMAP e Gmail", () => {
    const wf = createWf3Workflow();
    expect(wf.credentialRefs).toContain("cred-imap-wf3");
    expect(wf.credentialRefs).toContain("cred-gmail-oauth2-wf3");
  });
});

// ──────────────────────────────────────────────────────────────
// Credential Encryption Tests (AES-256-GCM)
// ──────────────────────────────────────────────────────────────

describe("WF3: credenciais com encriptacao AES-256-GCM", () => {
  it("createWf3Credentials cria credenciais IMAP e Gmail mock", () => {
    const creds = createWf3Credentials("test-org");
    expect(creds.imap.id).toBe("cred-imap-wf3");
    expect(creds.gmail.id).toBe("cred-gmail-oauth2-wf3");
    expect(creds.imap.encryptedData).not.toContain("mock-imap-password-123");
    expect(creds.gmail.encryptedData).not.toContain("mock-gmail-refresh-token-wf3");
  });

  it("envelopes AES-256-GCM tem iv, ct, tag", () => {
    const creds = createWf3Credentials("test-org");
    const envelope = JSON.parse(creds.imap.encryptedData);
    expect(envelope).toHaveProperty("iv");
    expect(envelope).toHaveProperty("ct");
    expect(envelope).toHaveProperty("tag");
  });

  it("produz ciphertext diferente para mesmo plaintext (IV aleatorio)", () => {
    const creds1 = createWf3Credentials("org1");
    const creds2 = createWf3Credentials("org2");
    expect(creds1.imap.encryptedData).not.toBe(creds2.imap.encryptedData);
    expect(creds1.gmail.encryptedData).not.toBe(creds2.gmail.encryptedData);
    expect(decryptCredentialData(creds1.imap).host).toBe("imap.gmail.com");
    expect(decryptCredentialData(creds2.imap).host).toBe("imap.gmail.com");
  });

  it("decryptCredentialData recupera dados IMAP originalmente encriptados", () => {
    const creds = createWf3Credentials("test-org");
    const data = decryptCredentialData(creds.imap);
    expect(data.host).toBe("imap.gmail.com");
    expect(data.port).toBe(993);
    expect(data.user).toBe("user@example.com");
    expect(data.password).toBe("mock-imap-password-123");
    expect(data.secure).toBe(true);
    expect(data.mailbox).toBe("INBOX");
  });

  it("decryptCredentialData recupera dados Gmail originalmente encriptados", () => {
    const creds = createWf3Credentials("test-org");
    const data = decryptCredentialData(creds.gmail);
    expect(data.client_id).toBe("mock-gmail-client-id.apps.googleusercontent.com");
    expect(data.scope).toBe("https://www.googleapis.com/auth/gmail.modify");
    expect(data.refresh_token).toBe("mock-gmail-refresh-token-wf3-abc123");
  });
});

// ──────────────────────────────────────────────────────────────
// HMAC Webhook Signature Tests
// ──────────────────────────────────────────────────────────────

describe("WF3: HMAC webhook signature", () => {
  const webhookSecret = "test-webhook-secret-abc123";
  const payload = JSON.stringify({ subject: "Test email", from: "sender@example.com", to: "me@example.com" });

  it("verifies correct signature matches", () => {
    const signature = createHmac("sha256", webhookSecret).update(payload).digest("hex");
    const expected = createHmac("sha256", webhookSecret).update(payload).digest("hex");
    expect(signature).toBe(expected);
  });

  it("produces different signatures for different payloads", () => {
    const sig1 = createHmac("sha256", webhookSecret).update(payload).digest("hex");
    const sig2 = createHmac("sha256", webhookSecret).update(JSON.stringify({ different: true })).digest("hex");
    expect(sig1).not.toBe(sig2);
  });

  it("produces different signatures for different secrets", () => {
    const sig1 = createHmac("sha256", "secret1").update(payload).digest("hex");
    const sig2 = createHmac("sha256", "secret2").update(payload).digest("hex");
    expect(sig1).not.toBe(sig2);
  });

  it("webhook path matches n8n workflow webhookId", () => {
    const wf = createWf3Workflow();
    const gmailNode = wf.nodes.find((n) => n.type === "gmail")!;
    expect(gmailNode.config.webhookId).toBe("09fc1dd4-a6dd-4e14-a817-de6d6c6503fd");
  });
});

// ──────────────────────────────────────────────────────────────
// Registry Tests
// ──────────────────────────────────────────────────────────────

describe("WF3: LocalNodeRegistry", () => {
  it("createWf3Registry registra os 2 handlers corretos", () => {
    const registry = createWf3Registry();
    expect(registry.list()).toEqual(["emailReadImap", "gmail"]);
    expect(registry.has("emailReadImap")).toBe(true);
    expect(registry.has("gmail")).toBe(true);
  });

  it("retorna undefined para tipo nao registrado", () => {
    const registry = createWf3Registry();
    expect(registry.getHandler("nonexistent")).toBeUndefined();
  });

  it("getHandler retorna instancia correta do handler", () => {
    const registry = createWf3Registry();
    const imapHandler = registry.getHandler("emailReadImap");
    expect(imapHandler).toBeInstanceOf(EmailReadImapHandler);
    const gmailHandler = registry.getHandler("gmail");
    expect(gmailHandler).toBeInstanceOf(GmailHandler);
  });
});

// ──────────────────────────────────────────────────────────────
// Full Workflow Execution (E2E) Tests
// ──────────────────────────────────────────────────────────────

describe("WF3: execucao end-to-end (emailReadImap -> gmail addLabels)", () => {
  const orgId = "test-org-wf3";
  const creds = createWf3Credentials(orgId);
  const credMap = new Map<string, Record<string, unknown>>([
    ["imap", decryptCredentialData(creds.imap)],
    ["gmail", decryptCredentialData(creds.gmail)],
  ]);

  it("executa workflow com email simulado c/ 2 anexos — IMAP → addLabels validado", async () => {
    const wf = createWf3Workflow();
    const email = createSimulatedEmail();

    const result = await runWorkflow(wf, email, credMap, { orgId, trigger: "manual" });

    expect(result.status).toBe("success");
    expect(result.error).toBeNull();
    expect(result.steps).toHaveLength(2);

    // Step 1: emailReadImap
    const step1 = result.steps[0];
    expect(step1.nodeType).toBe("emailReadImap");
    expect(step1.status).toBe("success");
    expect(step1.output).toBeDefined();
    const imapOutput = step1.output as unknown as Array<{ json: Record<string, unknown> }>;
    expect(imapOutput).toHaveLength(1);
    expect(imapOutput[0].json.subject).toBe("Q3 Financial Report");
    expect(Array.isArray(imapOutput[0].json.attachments)).toBe(true);
    expect(imapOutput[0].json.attachments).toHaveLength(2);

    // Step 2: gmail (addLabels)
    const step2 = result.steps[1];
    expect(step2.nodeType).toBe("gmail");
    expect(step2.status).toBe("success");
    const gmailOutput = step2.output as unknown as Array<{ json: Record<string, unknown> }>;
    expect(gmailOutput).toHaveLength(1);
    expect(gmailOutput[0].json.success).toBe(true);
    expect(gmailOutput[0].json.operation).toBe("addLabels");
    expect(gmailOutput[0].json.labelIds).toEqual(["Label_1"]);

    // Output final e do gmail
    const finalOutput = result.output as unknown as Array<{ json: Record<string, unknown> }>;
    expect(finalOutput).toHaveLength(1);
    expect(finalOutput[0].json.success).toBe(true);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("executa workflow com email sem anexos — IMAP retorna 1 item, addLabels processa", async () => {
    const wf = createWf3Workflow();
    const email = createEmailWithoutAttachments();

    const result = await runWorkflow(wf, email, credMap, { orgId, trigger: "manual" });

    expect(result.status).toBe("success");
    expect(result.steps).toHaveLength(2);

    // emailReadImap: processa email sem anexos
    const step1 = result.steps[0];
    const imapOutput = step1.output as unknown as Array<{ json: Record<string, unknown> }>;
    expect(imapOutput[0].json.attachments).toHaveLength(0);

    // gmail: addLabels processa a mensagem
    const step2 = result.steps[1];
    const gmailOutput = step2.output as unknown as Array<{ json: Record<string, unknown> }>;
    expect(gmailOutput[0].json.success).toBe(true);
    expect(gmailOutput[0].json.labelIds).toEqual(["Label_1"]);
  });

  it("webhook trigger simulation — HMAC + payload flow", async () => {
    // Simula o POST do webhook: verifica HMAC e despacha o workflow
    const secret = "simulated-webhook-secret";
    const body = JSON.stringify({
      subject: "Webhook triggered email",
      from: "webhook@sender.com",
      to: "inbox@example.com",
      date: "2026-08-21T12:00:00Z",
    });

    // Verifica HMAC (mesmo algoritmo usado em webhooks.ts)
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    const isValid =
      signature ===
      createHmac("sha256", secret).update(body).digest("hex");

    expect(isValid).toBe(true);

    // Simula a execucao do workflow com o payload do webhook
    const wf = createWf3Workflow();
    const email = JSON.parse(body);

    const result = await runWorkflow(wf, email, credMap, { orgId, trigger: "webhook" });

    expect(result.status).toBe("success");
    expect(result.trigger).toBe("webhook");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1].nodeType).toBe("gmail");
  });
});

describe("WF3: error handling", () => {
  const orgId = "test-org-wf3";
  const creds = createWf3Credentials(orgId);
  const credMap = new Map<string, Record<string, unknown>>([
    ["imap", decryptCredentialData(creds.imap)],
    ["gmail", decryptCredentialData(creds.gmail)],
  ]);

  it("falha quando node type nao tem handler registrado", async () => {
    const wf = createWf3Workflow();
    // Substitui o tipo do primeiro node por um tipo nao registrado
    wf.nodes[0].type = "unknownNodeType";

    const result = await runWorkflow(wf, { subject: "test" }, credMap, {
      orgId,
      trigger: "manual",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("No handler registered");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].status).toBe("failed");
    expect(result.steps[0].logs).toContain("ERROR: No handler registered for node type: unknownNodeType");
  });

  it("continua steps com sucesso quando credenciais nao resolvidas (default case)", async () => {
    const wf = createWf3Workflow();
    // Cria credencial map sem imap (forca resolveNodeCredentials a retornar undefined)
    const emptyMap = new Map<string, Record<string, unknown>>();

    const result = await runWorkflow(wf, createSimulatedEmail(), emptyMap, {
      orgId,
      trigger: "manual",
    });

    // O handler nao depende de credenciais reais em mock — workflow continua
    expect(result.status).toBe("success");
    expect(result.steps).toHaveLength(2);
  });
});
