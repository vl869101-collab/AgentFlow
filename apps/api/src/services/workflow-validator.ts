/**
 * Workflow Validator: Static Cycle Detection & Anti-Recursion
 *
 * Implements WF-ENG Item 6:
 * - Detects direct self-recursion (A -> A)
 * - Detects transitive cyclic dependencies (A -> B -> A, A -> B -> C -> A)
 * - Resolves subworkflow references by ID, name, or slug within tenant boundary
 * - Throws CyclicSubworkflowError with HTTP 400 and code CYCLIC_SUBWORKFLOW_REFERENCE
 */

import { prisma } from "../lib/prisma.js";

export class CyclicSubworkflowError extends Error {
  code = "CYCLIC_SUBWORKFLOW_REFERENCE";
  statusCode = 400;
  cyclePath?: string[];

  constructor(message: string, cyclePath?: string[]) {
    super(message);
    this.name = "CyclicSubworkflowError";
    this.code = "CYCLIC_SUBWORKFLOW_REFERENCE";
    this.statusCode = 400;
    this.cyclePath = cyclePath;
  }
}

const SUBWORKFLOW_NODE_TYPES = new Set([
  "subworkflow",
  "sub_workflow",
  "executeWorkflow",
  "execute_workflow",
]);

/**
 * Extracts the target workflow identifier from a node definition.
 * Inspects both top-level config and nested parameters for workflowId, workflow,
 * workflowName, workflowSlug, alias, or targetWorkflowId.
 */
export function extractSubworkflowTarget(node: any): string | null {
  if (!node) return null;
  const nodeType = String(node.type ?? node.data?.type ?? "").trim();
  if (!SUBWORKFLOW_NODE_TYPES.has(nodeType)) {
    return null;
  }

  const cfg = (node.config && typeof node.config === "object" ? node.config : {}) as Record<string, unknown>;
  const params = (cfg.parameters && typeof cfg.parameters === "object" ? cfg.parameters : {}) as Record<string, unknown>;
  const dataConfig = (node.data?.config && typeof node.data.config === "object" ? node.data.config : {}) as Record<string, unknown>;
  const dataParams = (dataConfig.parameters && typeof dataConfig.parameters === "object" ? dataConfig.parameters : {}) as Record<string, unknown>;

  const candidate =
    cfg.workflowId ??
    params.workflowId ??
    dataConfig.workflowId ??
    dataParams.workflowId ??
    cfg.workflow ??
    params.workflow ??
    dataConfig.workflow ??
    dataParams.workflow ??
    cfg.workflowName ??
    params.workflowName ??
    dataConfig.workflowName ??
    dataParams.workflowName ??
    cfg.workflowSlug ??
    params.workflowSlug ??
    dataConfig.workflowSlug ??
    dataParams.workflowSlug ??
    cfg.alias ??
    params.alias ??
    dataConfig.alias ??
    dataParams.alias ??
    cfg.targetWorkflowId ??
    params.targetWorkflowId ??
    dataConfig.targetWorkflowId ??
    dataParams.targetWorkflowId ??
    null;

  if (candidate === null || candidate === undefined) return null;
  const str = String(candidate).trim();
  return str.length > 0 ? str : null;
}

function resolveTargetId(targetRaw: string, identifierMap: Map<string, string>): string {
  const trimmed = targetRaw.trim();
  if (identifierMap.has(trimmed)) return identifierMap.get(trimmed)!;

  const lower = trimmed.toLowerCase();
  if (identifierMap.has(lower)) return identifierMap.get(lower)!;

  const normalized = lower.replace(/[\s_-]+/g, "-");
  if (identifierMap.has(normalized)) return identifierMap.get(normalized)!;

  return trimmed;
}

function getWorkflowNodes(w: any): any[] {
  if (Array.isArray(w.nodes) && w.nodes.length > 0) {
    return w.nodes;
  }
  const snapshot = w.versions?.[0]?.snapshot;
  if (!snapshot) return [];
  if (typeof snapshot === "string") {
    try {
      const parsed = JSON.parse(snapshot);
      return Array.isArray(parsed?.nodes) ? parsed.nodes : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
}

/**
 * Detects whether introducing the given canvas `nodes` into `workflowId` would
 * form a cyclic dependency in subworkflow calls within the organization.
 *
 * @returns Array of workflow IDs representing the cycle (e.g. ["wf-1", "wf-2", "wf-1"]) or null if acyclic.
 */
export async function detectSubworkflowCycle(
  workflowId: string,
  nodes: any[],
  orgId: string,
  prismaClient: any = prisma
): Promise<string[] | null> {
  const allWorkflows = await prismaClient.workflow.findMany({
    where: { orgId },
    include: {
      nodes: true,
      versions: { orderBy: { version: "desc" }, take: 1 },
    },
  });

  const identifierToId = new Map<string, string>();
  const allIds = new Set<string>();

  allIds.add(workflowId);
  identifierToId.set(workflowId, workflowId);

  for (const w of allWorkflows) {
    allIds.add(w.id);
    identifierToId.set(w.id, w.id);
    if (w.name) {
      identifierToId.set(w.name, w.id);
      identifierToId.set(w.name.toLowerCase(), w.id);
      identifierToId.set(w.name.toLowerCase().replace(/[\s_-]+/g, "-"), w.id);
    }
    if (w.slug) {
      identifierToId.set(w.slug, w.id);
      identifierToId.set(w.slug.toLowerCase(), w.id);
      identifierToId.set(w.slug.toLowerCase().replace(/[\s_-]+/g, "-"), w.id);
    }
  }

  // Build adjacency list for graph
  const adjacency = new Map<string, string[]>();
  for (const id of allIds) {
    adjacency.set(id, []);
  }

  // 1. Proposed edges for the workflow being saved
  const currentTargets: string[] = [];
  for (const node of nodes || []) {
    const rawTarget = extractSubworkflowTarget(node);
    if (rawTarget) {
      const resolved = resolveTargetId(rawTarget, identifierToId);
      if (resolved) {
        currentTargets.push(resolved);
      }
    }
  }
  adjacency.set(workflowId, currentTargets);

  // 2. Existing edges for all other workflows in the organization
  for (const w of allWorkflows) {
    if (w.id === workflowId) continue;
    const wNodes = getWorkflowNodes(w);
    const targets: string[] = [];
    for (const node of wNodes) {
      const rawTarget = extractSubworkflowTarget(node);
      if (rawTarget) {
        const resolved = resolveTargetId(rawTarget, identifierToId);
        if (resolved) {
          targets.push(resolved);
        }
      }
    }
    adjacency.set(w.id, targets);
  }

  // 3. Directed cycle detection via DFS with recursion stack
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const currentPath: string[] = [];

  function dfs(currentId: string): string[] | null {
    visiting.add(currentId);
    currentPath.push(currentId);

    const neighbors = adjacency.get(currentId) || [];
    for (const neighbor of neighbors) {
      if (visiting.has(neighbor)) {
        const startIndex = currentPath.indexOf(neighbor);
        return currentPath.slice(startIndex).concat(neighbor);
      }
      if (!visited.has(neighbor)) {
        const cycle = dfs(neighbor);
        if (cycle) return cycle;
      }
    }

    visiting.delete(currentId);
    currentPath.pop();
    visited.add(currentId);
    return null;
  }

  return dfs(workflowId);
}

/**
 * Validates that saving the canvas for `workflowId` does not create any circular
 * subworkflow references.
 *
 * Throws `CyclicSubworkflowError` (HTTP 400 / code CYCLIC_SUBWORKFLOW_REFERENCE) on cycle.
 */
export async function validateSubworkflowRecursion(
  workflowId: string,
  nodes: any[],
  orgId: string,
  prismaClient: any = prisma
): Promise<void> {
  const cycle = await detectSubworkflowCycle(workflowId, nodes, orgId, prismaClient);
  if (cycle && cycle.length > 0) {
    const cycleStr = cycle.join(" -> ");
    throw new CyclicSubworkflowError(
      `Cyclic subworkflow reference detected: ${cycleStr}`,
      cycle
    );
  }
}
