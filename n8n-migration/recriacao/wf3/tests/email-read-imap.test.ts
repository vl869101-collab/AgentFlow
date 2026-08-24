/**
 * Testes unitarios do handler emailReadImap (WF3).
 */
import { describe, it, expect } from "vitest";
import { EmailReadImapHandler, EMAIL_READ_IMAP_NATIVE_TYPE } from "../handlers/email-read-imap.js";
import { EMAIL_READ_IMAP_ORIGINAL_TYPE } from "../handlers/email-read-imap.js";

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    executionId: "exec-1",
    nodeId: "node-email-1",
    workflowId: "wf3",
    orgId: "test-org",
    nodeConfig: overrides.nodeConfig ?? {
      typeVersion: 2.2,
      originalN8nType: EMAIL_READ_IMAP_ORIGINAL_TYPE,
      originalN8nId: "00b57fc2-a2f3-41c9-aa5b-e833a162659a",
      parameters: overrides.parameters ?? { options: { mailbox: "INBOX", postProcess: "unread", markAsRead: true } },
    },
    input: overrides.input ?? undefined,
    credentials: overrides.credentials ?? undefined,
  };
}

describe("WF3: EmailReadImapHandler", () => {
  const handler = new EmailReadImapHandler();

  it("type e category corretos", () => {
    expect(handler.type).toBe(EMAIL_READ_IMAP_NATIVE_TYPE);
    expect(handler.category).toBe("trigger");
  });

  it("processa email simulado com 2 anexos", async () => {
    const email = {
      id: "email-001",
      subject: "Q3 Financial Report",
      from: "ceo@acmecorp.com",
      to: "accounting@acmecorp.com",
      date: "2026-08-19T10:30:00Z",
      snippet: "Please find the invoice and report attached.",
      attachments: [
        { id: "att-001", filename: "invoice.pdf", mimeType: "application/pdf", size: 102400, data: "JVBERi0xLjQK" },
        { id: "att-002", filename: "report.png", mimeType: "image/png", size: 51200, data: "iVBORw0KGgo" },
      ],
    };

    const result = await handler.execute(makeCtx({ input: email }));
    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.json.subject).toBe("Q3 Financial Report");
    expect(item.json.from).toBe("ceo@acmecorp.com");
    expect(item.json.to).toBe("accounting@acmecorp.com");
    expect(item.json.attachments).toHaveLength(2);
    expect(item.json.attachments[0].filename).toBe("invoice.pdf");
    expect(item.json.attachments[1].filename).toBe("report.png");
    expect(item.binary).toBeDefined();
    expect(item.binary!["invoice"]).toBeDefined();
    expect(item.binary!["report"]).toBeDefined();
    expect(item.binary!["invoice"].fileName).toBe("invoice.pdf");
    expect(item.binary!["invoice"].mimeType).toBe("application/pdf");
    expect(result.logs.length).toBeGreaterThan(0);
  });

  it("processa email sem anexos", async () => {
    const email = {
      id: "email-002",
      subject: "No attachments here",
      from: "user@example.com",
      to: "me@example.com",
      date: "2026-08-19T11:00:00Z",
      snippet: "Just a regular email.",
    };

    const result = await handler.execute(makeCtx({ input: email }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.attachments).toHaveLength(0);
    expect(result.items[0].binary).toBeUndefined();
  });

  it("retorna metadata quando input esta vazio", async () => {
    const result = await handler.execute(makeCtx({ input: undefined }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json._trigger).toBe(EMAIL_READ_IMAP_NATIVE_TYPE);
    expect(result.items[0].json._config.mailbox).toBe("INBOX");
    expect(result.items[0].json._config.postProcess).toBe("unread");
    expect(result.items[0].json._config.markAsRead).toBe(true);
  });

  it("retorna metadata quando input e um objeto vazio", async () => {
    const result = await handler.execute(makeCtx({ input: {} }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json._trigger).toBe(EMAIL_READ_IMAP_NATIVE_TYPE);
  });

  it("processa input como array de emails", async () => {
    const emails = [
      { id: "e1", subject: "Subject 1", from: "a@b.com", to: "me@c.com", date: "2026-01-01T00:00:00Z" },
      { id: "e2", subject: "Subject 2", from: "d@e.com", to: "me@c.com", date: "2026-01-01T01:00:00Z" },
    ];

    const result = await handler.execute(makeCtx({ input: emails }));
    expect(result.items).toHaveLength(2);
    expect(result.items[0].json.id).toBe("e1");
    expect(result.items[1].json.id).toBe("e2");
  });

  it("filtra por assunto quando filterBySubject esta configurado", async () => {
    const emails = [
      { id: "e1", subject: "Invoice #123", from: "a@b.com", to: "me@c.com", date: "2026-01-01T00:00:00Z" },
      { id: "e2", subject: "Meeting notes", from: "d@e.com", to: "me@c.com", date: "2026-01-01T01:00:00Z" },
      { id: "e3", subject: "Invoice #456", from: "f@g.com", to: "me@c.com", date: "2026-01-01T02:00:00Z" },
    ];

    const result = await handler.execute(
      makeCtx({
        input: emails,
        parameters: { options: { mailbox: "INBOX", postProcess: "unread", markAsRead: true, filterBySubject: "invoice" } },
      }),
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0].json.subject).toBe("Invoice #123");
    expect(result.items[1].json.subject).toBe("Invoice #456");
  });

  it("filtra por assunto case-insensitive", async () => {
    const emails = [
      { id: "e1", subject: "INVOICE", from: "a@b.com", to: "me@c.com", date: "2026-01-01T00:00:00Z" },
    ];

    const result = await handler.execute(
      makeCtx({
        input: emails,
        parameters: { options: { filterBySubject: "invoice" } },
      }),
    );
    expect(result.items).toHaveLength(1);
  });

  it("limita numero de emails quando limit esta configurado", async () => {
    const emails = [
      { id: "e1", subject: "A", from: "a@b.com", to: "me@c.com", date: "2026-01-01T00:00:00Z" },
      { id: "e2", subject: "B", from: "d@e.com", to: "me@c.com", date: "2026-01-01T01:00:00Z" },
      { id: "e3", subject: "C", from: "f@g.com", to: "me@c.com", date: "2026-01-01T02:00:00Z" },
      { id: "e4", subject: "D", from: "h@i.com", to: "me@c.com", date: "2026-01-01T03:00:00Z" },
      { id: "e5", subject: "E", from: "j@k.com", to: "me@c.com", date: "2026-01-01T04:00:00Z" },
    ];

    const result = await handler.execute(
      makeCtx({
        input: emails,
        parameters: { options: { mailbox: "INBOX", limit: 3 } },
      }),
    );
    expect(result.items).toHaveLength(3);
    expect(result.items[0].json.id).toBe("e1");
    expect(result.items[2].json.id).toBe("e3");
  });

  it("stripAttachments remove anexos do output", async () => {
    const email = {
      id: "e1",
      subject: "With attachments",
      from: "a@b.com",
      to: "me@c.com",
      date: "2026-01-01T00:00:00Z",
      attachments: [
        { id: "att-1", filename: "doc.pdf", mimeType: "application/pdf", size: 100, data: "base64" },
      ],
    };

    const result = await handler.execute(
      makeCtx({
        input: email,
        parameters: { options: { stripAttachments: true } },
      }),
    );
    expect(result.items[0].json.attachments).toHaveLength(0);
    expect(result.items[0].binary).toBeUndefined();
  });

  it("processa email sem subject", async () => {
    const email = {
      id: "e1",
      from: "a@b.com",
      to: "me@c.com",
      date: "2026-01-01T00:00:00Z",
    };

    const result = await handler.execute(makeCtx({ input: email }));
    expect(result.items[0].json.subject).toBe("(no subject)");
  });

  it("processa email com multiplos destinatarios", async () => {
    const email = {
      id: "e1",
      subject: "Multi-recipient",
      from: "a@b.com",
      to: "me@c.com",
      cc: "boss@d.com",
      bcc: "secret@e.com",
      date: "2026-01-01T00:00:00Z",
    };

    const result = await handler.execute(makeCtx({ input: email }));
    expect(result.items[0].json.cc).toBe("boss@d.com");
    expect(result.items[0].json.bcc).toBe("secret@e.com");
  });

  it("usa mailbox padrao INBOX quando options e vazio", async () => {
    const result = await handler.execute(makeCtx({ parameters: { options: {} } }));
    expect(result.items[0].json._config.mailbox).toBe("INBOX");
  });

  it("preserva uid quando presente", async () => {
    const email = {
      id: "msg-123",
      uid: "uid-456",
      subject: "Test",
      from: "a@b.com",
      to: "me@c.com",
      date: "2026-01-01T00:00:00Z",
    };

    const result = await handler.execute(makeCtx({ input: email }));
    expect(result.items[0].json.id).toBe("msg-123");
    expect(result.items[0].json.uid).toBe("uid-456");
  });

  it("marca como lido quando markAsRead e true", async () => {
    const email = {
      id: "e1",
      subject: "Test read",
      from: "a@b.com",
      to: "me@c.com",
      date: "2026-01-01T00:00:00Z",
    };

    const result = await handler.execute(makeCtx({ input: email }));
    expect(result.logs.some((l) => l.includes("marked"))).toBe(true);
  });

  it("nao marca como lido quando markAsRead e false", async () => {
    const email = {
      id: "e1",
      subject: "Test unread",
      from: "a@b.com",
      to: "me@c.com",
      date: "2026-01-01T00:00:00Z",
    };

    const result = await handler.execute(
      makeCtx({
        input: email,
        parameters: { options: { mailbox: "INBOX", markAsRead: false } },
      }),
    );
    expect(result.logs.some((l) => l.includes("marked"))).toBe(false);
  });

  it("nao filtra quando filterBySubject nao esta configurado", async () => {
    const emails = [
      { id: "e1", subject: "Any", from: "a@b.com", to: "me@c.com", date: "2026-01-01T00:00:00Z" },
      { id: "e2", subject: "All", from: "d@e.com", to: "me@c.com", date: "2026-01-01T01:00:00Z" },
    ];

    const result = await handler.execute(makeCtx({ input: emails }));
    expect(result.items).toHaveLength(2);
  });

  it("retorna item vazio quando input e null", async () => {
    const result = await handler.execute(makeCtx({ input: null }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json._trigger).toBe(EMAIL_READ_IMAP_NATIVE_TYPE);
  });

  it("ignora items nao-objeto no array de input", async () => {
    const result = await handler.execute(makeCtx({ input: [null, 42, { id: "e1", subject: "valid", from: "a@b.com", to: "me@c.com", date: "2026-01-01" }, "string"] }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].json.subject).toBe("valid");
  });

  it("log de conexao IMAP inclui mailbox", async () => {
    const result = await handler.execute(makeCtx({ input: undefined }));
    expect(result.logs.some((l) => l.includes("INBOX"))).toBe(true);
    expect(result.logs.some((l) => l.includes("IMAP"))).toBe(true);
  });

  it("processa anexos com campos alternativos (name, contentType)", async () => {
    const email = {
      id: "e1",
      subject: "Alt attachment",
      from: "a@b.com",
      to: "me@c.com",
      date: "2026-01-01T00:00:00Z",
      attachments: [
        { id: "a1", name: "report.txt", contentType: "text/plain", size: 50, content: "SGVsbG8=" },
      ],
    };

    const result = await handler.execute(makeCtx({ input: email }));
    expect(result.items[0].json.attachments[0].filename).toBe("report.txt");
    expect(result.items[0].binary!["report"].mimeType).toBe("text/plain");
  });

  it("usa fallback de filename quando anexo nao tem filename", async () => {
    const email = {
      id: "e1",
      subject: "No filename",
      from: "a@b.com",
      to: "me@c.com",
      date: "2026-01-01T00:00:00Z",
      attachments: [{ id: "a1", data: "base64" }],
    };

    const result = await handler.execute(makeCtx({ input: email }));
    expect(result.items[0].json.attachments[0].filename).toBe("a1");
    expect(result.items[0].binary!["a1"].fileName).toBe("a1");
  });

  it("usa fallback de mimeType quando ausente", async () => {
    const email = {
      id: "e1",
      subject: "No mime",
      from: "a@b.com",
      to: "me@c.com",
      date: "2026-01-01T00:00:00Z",
      attachments: [{ filename: "file.txt", data: "abc" }],
    };

    const result = await handler.execute(makeCtx({ input: email }));
    expect(result.items[0].json.attachments[0].mimeType).toBe("application/octet-stream");
  });
});
