import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Loads the native AgentFlow workflow fixture for WF3 ("My workflow 2").
 */
export function loadWorkflowFixture(): WorkflowFixture {
  const fixturePath = resolve(__dirname, "fixtures/workflow.json");
  return JSON.parse(readFileSync(fixturePath, "utf-8")) as WorkflowFixture;
}

export interface WorkflowFixture {
  workflow: {
    name: string;
    description?: string;
    originalN8nId?: string;
    versionId?: string;
    settings?: Record<string, unknown>;
    tags?: string[];
  };
  nodes: Array<{
    id: string;
    type: string;
    label?: string;
    config: Record<string, unknown>;
    position: { x: number; y: number };
    width?: number;
    height?: number;
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string;
    condition?: unknown;
  }>;
  webhook: {
    path: string;
    method: string;
    description?: string;
  };
  credentials: Record<string, {
    name: string;
    type: string;
    provider: string;
    data: Record<string, unknown>;
  }>;
}

/**
 * Seeds the WF3 workflow ("My workflow 2") into the AgentFlow instance
 * via its REST API. Creates the workflow, nodes, edges, credentials,
 * and webhook.
 *
 * @param app    Fastify instance (with in-memory store or real DB).
 * @param token  JWT token for an authenticated user/org.
 * @returns      Object with ids of created resources.
 */
export async function seedWf3(
  app: FastifyInstance,
  token: string,
): Promise<{
  workflowId: string;
  imapCredentialId: string;
  gmailCredentialId: string;
  webhookId: string;
  orgSlug: string;
}> {
  const fixture = loadWorkflowFixture();

  // 1. Create the workflow
  const createRes = await app.inject({
    method: "POST",
    url: "/api/workflows",
    headers: { Authorization: `Bearer ${token}` },
    payload: {
      name: fixture.workflow.name,
      description: fixture.workflow.description ?? "",
      settings: fixture.workflow.settings ?? {},
    },
  });
  if (createRes.statusCode !== 201) {
    throw new Error(
      `Failed to create workflow: ${createRes.statusCode} ${createRes.body}`,
    );
  }
  const workflow = JSON.parse(createRes.body as string) as {
    id: string;
    orgId: string;
    org: { slug: string };
  };
  const workflowId = workflow.id;
  const orgSlug = workflow.org?.slug ?? "test";

  // 2. Save the canvas (nodes + edges)
  const canvasRes = await app.inject({
    method: "PATCH",
    url: `/api/workflows/${workflowId}`,
    headers: { Authorization: `Bearer ${token}` },
    payload: {
      name: fixture.workflow.name,
      nodes: fixture.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        data: {
          type: n.type,
          label: n.label ?? n.type,
          config: n.config,
        },
        position: n.position,
        width: n.width,
        height: n.height,
      })),
      edges: fixture.edges.map((e) => ({
        id: e.id,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        sourceHandle: e.sourceHandle ?? "main",
        targetHandle: e.targetHandle ?? "main",
        label: e.label ?? "",
      })),
      settings: fixture.workflow.settings ?? {},
      originalN8nId: fixture.workflow.originalN8nId ?? null,
      versionId: fixture.workflow.versionId ?? null,
      tags: fixture.workflow.tags ?? [],
    },
  });
  if (canvasRes.statusCode !== 200) {
    throw new Error(
      `Failed to save canvas: ${canvasRes.statusCode} ${canvasRes.body}`,
    );
  }

  // 3. Create credentials (encrypted via the API)
  const imapCredName = Object.keys(fixture.credentials)[0];
  const gmailCredName = Object.keys(fixture.credentials)[1];

  const imapRes = await app.inject({
    method: "POST",
    url: "/api/credentials",
    headers: { Authorization: `Bearer ${token}` },
    payload: {
      name: fixture.credentials[imapCredName].name,
      type: fixture.credentials[imapCredName].type,
      provider: fixture.credentials[imapCredName].provider,
      data: fixture.credentials[imapCredName].data,
    },
  });
  if (imapRes.statusCode !== 201) {
    throw new Error(
      `Failed to create IMAP credential: ${imapRes.statusCode} ${imapRes.body}`,
    );
  }
  const imapCredentialId = JSON.parse(imapRes.body as string).id as string;

  const gmailRes = await app.inject({
    method: "POST",
    url: "/api/credentials",
    headers: { Authorization: `Bearer ${token}` },
    payload: {
      name: fixture.credentials[gmailCredName].name,
      type: fixture.credentials[gmailCredName].type,
      provider: fixture.credentials[gmailCredName].provider,
      data: fixture.credentials[gmailCredName].data,
    },
  });
  if (gmailRes.statusCode !== 201) {
    throw new Error(
      `Failed to create Gmail credential: ${gmailRes.statusCode} ${gmailRes.body}`,
    );
  }
  const gmailCredentialId = JSON.parse(gmailRes.body as string).id as string;

  // 4. Update node configs to reference credential IDs by name → ID mapping
  //    (The executor resolves credential references at runtime via lookup)
  //    We store the credential name reference in config.credentials for now.

  // 5. Create the webhook linked to the workflow
  const webhookRes = await app.inject({
    method: "POST",
    url: "/api/webhooks",
    headers: { Authorization: `Bearer ${token}` },
    payload: {
      path: fixture.webhook.path,
      method: fixture.webhook.method,
      workflowId: workflowId,
      description: fixture.webhook.description ?? "",
    },
  });
  if (webhookRes.statusCode !== 201) {
    throw new Error(
      `Failed to create webhook: ${webhookRes.statusCode} ${webhookRes.body}`,
    );
  }
  const webhook = JSON.parse(webhookRes.body as string) as {
    id: string;
    secret: string;
    path: string;
  };
  const webhookId = webhook.id;

  return {
    workflowId,
    imapCredentialId,
    gmailCredentialId,
    webhookId,
    orgSlug,
  };
}
