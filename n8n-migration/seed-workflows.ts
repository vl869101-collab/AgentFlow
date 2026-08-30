#!/usr/bin/env tsx
/**
 * Seed script: import 3 n8n workflows into AgentFlow DB
 *
 * Usage:
 *   npx tsx n8n-migration/seed-workflows.ts
 *
 * Requires DATABASE_URL env var pointing to a running Postgres.
 * Idempotent: skips workflows that already exist (by name).
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { importN8nWorkflow } from "@agentflow/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const WORKFLOW_FILES = [
  "Save_Gmail_Attachments_to_Google_Drive.json",
  "My_workflow.json",
  "My_workflow_2.json",
];

const PLACEHOLDER_ORG_ID = "n8n-seed-org";
const PLACEHOLDER_USER_ID = "n8n-seed-user";

async function main() {
  console.log("n8n workflow seed: starting...\n");

  // Ensure org and user exist
  await prisma.organization.upsert({
    where: { id: PLACEHOLDER_ORG_ID },
    create: { id: PLACEHOLDER_ORG_ID, name: "n8n Migration Org", slug: "n8n-migration" },
    update: {},
  });

  await prisma.user.upsert({
    where: { id: PLACEHOLDER_USER_ID },
    create: {
      id: PLACEHOLDER_USER_ID,
      email: "n8n-seed@agentflow.local",
      name: "n8n Seed User",
      passwordHash: "placeholder-hash-not-real",
    },
    update: {},
  });

  // Ensure membership
  await prisma.organizationMember.upsert({
    where: { userId_orgId: { userId: PLACEHOLDER_USER_ID, orgId: PLACEHOLDER_ORG_ID } },
    create: { userId: PLACEHOLDER_USER_ID, orgId: PLACEHOLDER_ORG_ID, role: "OWNER" },
    update: {},
  });

  for (const fileName of WORKFLOW_FILES) {
    const filePath = join(__dirname, "workflows", fileName);
    console.log(`Processing: ${fileName}`);

    let rawJson: string;
    try {
      rawJson = readFileSync(filePath, "utf-8");
    } catch (err) {
      console.error(`  SKIP: file not found: ${filePath}`);
      continue;
    }

    let result;
    try {
      result = importN8nWorkflow(rawJson);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR parsing: ${msg}`);
      continue;
    }

    // Check for duplicate by name
    const existing = await prisma.workflow.findFirst({
      where: { name: result.workflow.name, orgId: PLACEHOLDER_ORG_ID },
    });
    if (existing) {
      console.log(`  SKIP: workflow "${result.workflow.name}" already exists (id: ${existing.id})`);
      continue;
    }

    // Create workflow
    const workflow = await prisma.workflow.create({
      data: {
        name: result.workflow.name,
        status: result.workflow.status,
        ownerId: PLACEHOLDER_USER_ID,
        orgId: PLACEHOLDER_ORG_ID,
      },
    });

    // Create nodes
    if (result.nodes.length > 0) {
      await prisma.workflowNode.createMany({
        data: result.nodes.map((node) => ({
          id: node.id,
          type: node.type,
          label: node.label,
          config: node.config,
          position: node.position,
          width: node.width ?? null,
          height: node.height ?? null,
          workflowId: workflow.id,
        })),
      });
    }

    // Create edges
    if (result.edges.length > 0) {
      await prisma.workflowEdge.createMany({
        data: result.edges.map((edge) => ({
          id: edge.id,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          sourceHandle: edge.sourceHandle ?? null,
          targetHandle: edge.targetHandle ?? null,
          label: edge.label ?? null,
          workflowId: workflow.id,
        })),
      });
    }

    // Create initial version
    await prisma.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        version: 1,
        snapshot: { nodes: result.nodes, edges: result.edges } as any,
      },
    });

    const nodeSummary = result.nodes.map((n) => `    ${n.label} (${n.type})`).join("\n");
    const edgeSummary = result.edges
      .map((e) => {
        const src = result.nodes.find((n) => n.id === e.sourceNodeId)?.label ?? e.sourceNodeId;
        const tgt = result.nodes.find((n) => n.id === e.targetNodeId)?.label ?? e.targetNodeId;
        return `    ${src} → ${tgt}`;
      })
      .join("\n");

    console.log(`  Created: "${result.workflow.name}" (id: ${workflow.id}, status: ${result.workflow.status})`);
    console.log(`  Nodes (${result.nodes.length}):`);
    console.log(nodeSummary);
    if (result.edges.length > 0) {
      console.log(`  Edges (${result.edges.length}):`);
      console.log(edgeSummary);
    }
    if (result.warnings.length > 0) {
      console.log(`  Warnings: ${result.warnings.join("; ")}`);
    }
    console.log("");
  }

  console.log("n8n workflow seed: done.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  void prisma.$disconnect();
  process.exit(1);
});
