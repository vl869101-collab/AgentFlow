/**
 * Testes unitarios do handler gmail (WF3).
 */
import { describe, it, expect } from "vitest";
import { GmailHandler, GMAIL_NATIVE_TYPE, GMAIL_ORIGINAL_TYPE } from "../handlers/gmail.js";

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    executionId: "exec-1",
    nodeId: "node-gmail-1",
    workflowId: "wf3",
    orgId: "test-org",
    nodeConfig: overrides.nodeConfig ?? {
      typeVersion: 2.2,
      originalN8nType: GMAIL_ORIGINAL_TYPE,
      originalN8nId: "82fca877-6b61-4f40-902a-fccd7cf5beea",
      parameters: overrides.parameters ?? { operation: "addLabels", labelIds: ["INBOX"] },
    },
    input: overrides.input ?? undefined,
    credentials: overrides.credentials ?? undefined,
  };
}

describe("WF3: GmailHandler", () => {
  const handler = new GmailHandler();

  it("type e category corretos", () => {
    expect(handler.type).toBe(GMAIL_NATIVE_TYPE);
    expect(handler.category).toBe("action");
  });

  it("addLabels processa mensagem unica do input do emailReadImap", async () => {
    const input = [
      {
        json: {
          id: "msg-001",
          threadId: "thread-001",
          subject: "Q3 Report",
          from: "ceo@acmecorp.com",
          to: "accounting@acmecorp.com",
          date: "2026-08-19T10:30:00Z",
          snippet: "Please find attached.",
        },
        binary: {},
      },
    ];

    const result = await handler.execute(makeCtx({ input }));
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.json.success).toBe(true);
    expect(item.json.id).toBe("msg-001");
    expect(item.json.threadId).toBe("thread-001");
    expect(item.json.operation).toBe("addLabels");
    expect(item.json.labelIds).toEqual(["INBOX"]);
    expect(item.json.labelAdded).toBe(1);
    expect(result.logs.some((l) => l.includes("addLabels"))).toBe(true);
  });

  it("addLabels com labelIds customizados", async () => {
    const input = [{ json: { id: "msg-1", subject: "Test", from: "a@b.com", to: "me@c.com", date: "2026-01-01T00:00:00Z" }, binary: {} }];

    const result = await handler.execute(makeCtx({
      input,
      parameters: { operation: "addLabels", labelIds: ["Label_1", "Label_2", "UNREAD"] },
    }));

    expect(result.items[0].json.labelIds).toEqual(["Label_1", "Label_2", "UNREAD"]);
    expect(result.items[0].json.labelAdded).toBe(3);
  });

  it("addLabels usa INBOX como label default quando labelIds nao informado", async () => {
    const input = [{ json: { id: "msg-1", from: "a@b.com", to: "me@c.com", date: "2026-01-01" }, binary: {} }];

    const result = await handler.execute(makeCtx({
      input,
      parameters: { operation: "addLabels" },
    }));

    expect(result.items[0].json.labelIds).toEqual(["INBOX"]);
  });

  it("addLabels pula item sem message ID", async () => {
    const input = [{ json: { subject: "No ID" } }];

    const result = await handler.execute(makeCtx({ input }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.success).toBe(false);
    expect(result.items[0].json.error).toContain("No message ID");
  });

  it("addLabels processa array de mensagens", async () => {
    const input = [
      { json: { id: "msg-1", subject: "A", from: "a@b.com", to: "me@c.com", date: "2026-01-01" }, binary: {} },
      { json: { id: "msg-2", subject: "B", from: "c@d.com", to: "me@c.com", date: "2026-01-01" }, binary: {} },
      { json: { id: "msg-3", subject: "C", from: "e@f.com", to: "me@c.com", date: "2026-01-01" }, binary: {} },
    ];

    const result = await handler.execute(makeCtx({ input }));
    expect(result.items).toHaveLength(3);
    expect(result.items[0].json.id).toBe("msg-1");
    expect(result.items[1].json.id).toBe("msg-2");
    expect(result.items[2].json.id).toBe("msg-3");
  });

  it("addLabels passa messageId como ID via field alternativo", async () => {
    const input = [{ json: { messageId: "alt-id-123", subject: "Test", from: "a@b.com" } }];

    const result = await handler.execute(makeCtx({ input }));
    expect(result.items[0].json.success).toBe(true);
    expect(result.items[0].json.id).toBe("alt-id-123");
  });

  it("removeLabels remove labels especificados", async () => {
    const input = [{ json: { id: "msg-1", subject: "Test", from: "a@b.com", to: "me@c.com", date: "2026-01-01" } }];

    const result = await handler.execute(makeCtx({
      input,
      parameters: { operation: "removeLabels", labelIds: ["UNREAD", "INBOX"] },
    }));

    expect(result.items[0].json.success).toBe(true);
    expect(result.items[0].json.labelRemoved).toBe(2);
    expect(result.items[0].json.operation).toBe("removeLabels");
  });

  it("send envia email via params.message", async () => {
    const result = await handler.execute(makeCtx({
      parameters: {
        operation: "send",
        message: { subject: "Hello", to: "recipient@example.com", body: "Test body" },
      },
    }));

    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.success).toBe(true);
    expect(result.items[0].json.operation).toBe("send");
    expect(result.items[0].json.to).toBe("recipient@example.com");
    expect(result.items[0].json.subject).toBe("Hello");
    expect(result.items[0].json.labelIds).toEqual(["SENT"]);
  });

  it("send com item de entrada processa subject e from", async () => {
    const input = [{ json: { subject: "Reply", from: "sender@example.com", to: "me@example.com", date: "2026-01-01" } }];

    const result = await handler.execute(makeCtx({
      input,
      parameters: { operation: "send", message: { to: "recipient@example.com" } },
    }));

    const sendResults = result.items.filter((i) => i.json.operation === "send");
    expect(sendResults.length).toBeGreaterThanOrEqual(1);
  });

  it("send sem dados de mensagem retorna erro", async () => {
    const result = await handler.execute(makeCtx({
      parameters: { operation: "send" },
    }));

    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.success).toBe(false);
    expect(result.items[0].json.error).toBeDefined();
  });

  it("get obtém detalhes da mensagem", async () => {
    const input = [{ json: { id: "msg-1", threadId: "thread-1", subject: "Get Test", from: "a@b.com", to: "me@c.com", date: "2026-01-01", snippet: "snippet", labelIds: ["INBOX", "UNREAD"] } }];

    const result = await handler.execute(makeCtx({
      input,
      parameters: { operation: "get" },
    }));

    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.success).toBe(true);
    expect(result.items[0].json.id).toBe("msg-1");
    expect(result.items[0].json.subject).toBe("Get Test");
    expect(result.items[0].json.from).toBe("a@b.com");
    expect(result.items[0].json.labelIds).toEqual(["INBOX", "UNREAD"]);
    expect(result.items[0].json.operation).toBe("get");
  });

  it("operacao desconhecida passa input atraves", async () => {
    const input = [{ json: { id: "msg-1", subject: "Unknown", from: "a@b.com", to: "me@c.com", date: "2026-01-01" } }];

    const result = await handler.execute(makeCtx({
      input,
      parameters: { operation: "unknownOp" },
    }));

    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.id).toBe("msg-1");
    expect(result.logs.some((l) => l.includes("unknown operation"))).toBe(true);
  });

  it("get com item sem message ID retorna erro", async () => {
    const input = [{ json: { subject: "No ID" } }];

    const result = await handler.execute(makeCtx({
      input,
      parameters: { operation: "get" },
    }));

    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.success).toBe(false);
  });

  it("addLabels com input undefined retorna items vazios", async () => {
    const result = await handler.execute(makeCtx({ input: undefined }));
    expect(result.items).toHaveLength(0);
  });

  it("addLabels com input null retorna items vazios", async () => {
    const result = await handler.execute(makeCtx({ input: null }));
    expect(result.items).toHaveLength(0);
  });

  it("get com input como array de mensagens", async () => {
    const input = [
      { json: { id: "m1", subject: "A", from: "a@b.com", to: "me@c.com", date: "2026-01-01", threadId: "t1" } },
      { json: { id: "m2", subject: "B", from: "c@d.com", to: "me@c.com", date: "2026-01-01", threadId: "t2" } },
    ];

    const result = await handler.execute(makeCtx({
      input,
      parameters: { operation: "get" },
    }));

    expect(result.items).toHaveLength(2);
    expect(result.items[0].json.id).toBe("m1");
    expect(result.items[1].json.id).toBe("m2");
  });

  it("removeLabels com labelIds vazio usa array vazio", async () => {
    const input = [{ json: { id: "msg-1", subject: "Test", from: "a@b.com", to: "me@c.com", date: "2026-01-01" } }];

    const result = await handler.execute(makeCtx({
      input,
      parameters: { operation: "removeLabels", labelIds: [] },
    }));

    expect(result.items[0].json.labelRemoved).toBe(0);
  });

  it("send sem to nem subject nos params.message nem no input retorna erro", async () => {
    const result = await handler.execute(makeCtx({
      parameters: { operation: "send", message: {} },
      input: [{ json: { date: "2026-01-01" } }],
    }));

    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.success).toBe(false);
  });

  it("preserva credentials no contexto (nao usado em mock)", async () => {
    const result = await handler.execute(makeCtx({
      input: [{ json: { id: "msg-1", subject: "Cred test", from: "a@b.com", to: "me@c.com", date: "2026-01-01" } }],
      credentials: { clientId: "test-client-id", accessToken: "test-token" },
    }));

    expect(result.items[0].json.success).toBe(true);
  });

  it("log de operacao inclui nome da operacao", async () => {
    const input = [{ json: { id: "msg-1", subject: "Test", from: "a@b.com", to: "me@c.com", date: "2026-01-01" } }];

    const result = await handler.execute(makeCtx({ input }));
    expect(result.logs.some((l) => l.includes("addLabels"))).toBe(true);
    expect(result.logs.some((l) => l.includes("completed"))).toBe(true);
  });

  it("send via params.message gera messageId unico", async () => {
    const result = await handler.execute(makeCtx({
      parameters: {
        operation: "send",
        message: { subject: "Unique", to: "test@example.com", body: "Body" },
      },
    }));

    expect(result.items[0].json.id).toMatch(/^msg-\d+$/);
    expect(result.items[0].json.threadId).toBe(result.items[0].json.id);
  });
});
