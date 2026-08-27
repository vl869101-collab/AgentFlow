// ponytail: in-memory store for dev without PostgreSQL
// replace with Prisma when docker/postgres is available

import { randomUUID } from "crypto";

function cuid() {
  return randomUUID().replace(/-/g, "").slice(0, 25);
}
function now() {
  return new Date().toISOString();
}
function toIsoString(val: any): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

// ── Tables ──────────────────────────────────
export const users = new Map<string, any>();
export const orgs = new Map<string, any>();
export const orgMembers = new Map<string, any>();
export const workflows = new Map<string, any>();
export const workflowNodes = new Map<string, any>();
export const workflowEdges = new Map<string, any>();
export const workflowVersions = new Map<string, any>();
export const executions = new Map<string, any>();
export const nodeExecutions = new Map<string, any>();
export const credentials = new Map<string, any>();
export const approvals = new Map<string, any>();
export const apiKeys = new Map<string, any>();
export const webhooks = new Map<string, any>();
export const subscriptions = new Map<string, any>();
export const usageRecords = new Map<string, any>();
export const refreshTokens = new Map<string, any>();
export const auditLogs = new Map<string, any>();

// ── Helpers ─────────────────────────────────
function matches(value: any, where: any): boolean {
  if (!where) return true;
  if (Array.isArray(where.OR)) {
    const orMatches = where.OR.some((subWhere: any) => matches(value, subWhere));
    if (!orMatches) return false;
  }
  for (const [key, expected] of Object.entries(where)) {
    if (key === "OR" || expected === undefined) continue;
    if (expected && typeof expected === "object") {
      const condition = expected as any;
      if (Array.isArray(condition.in) && !condition.in.includes(value[key])) return false;
      if (condition.gte !== undefined && new Date(value[key]) < new Date(condition.gte)) return false;
      if (condition.gt !== undefined && !(value[key] > condition.gt)) return false;
      if (condition.lte !== undefined && new Date(value[key]) > new Date(condition.lte)) return false;
      if (condition.lt !== undefined && !(value[key] < condition.lt)) return false;
      if (condition.not !== undefined && value[key] === condition.not) return false;
      if (condition.contains !== undefined) {
        const valStr = String(value[key] ?? "");
        const searchStr = String(condition.contains);
        if (condition.mode === "insensitive") {
          if (!valStr.toLowerCase().includes(searchStr.toLowerCase())) return false;
        } else {
          if (!valStr.includes(searchStr)) return false;
        }
      }
      if (
        condition.in ||
        condition.gte !== undefined ||
        condition.gt !== undefined ||
        condition.lte !== undefined ||
        condition.lt !== undefined ||
        condition.not !== undefined ||
        condition.contains !== undefined
      )
        continue;
    }
    if (expected === null) {
      if (value[key] !== null && value[key] !== undefined) return false;
      continue;
    }
    if (value[key] !== expected) return false;
  }
  return true;
}

function find(table: Map<string, any>, where: any): any | null {
  for (const value of table.values()) if (matches(value, where)) return value;
  return null;
}

function findMany<T>(table: Map<string, T>, where?: any): T[] {
  let result = Array.from(table.values());
  if (!where) return result;
  return result.filter((v: any) => matches(v, where));
}

function project(value: any, select?: Record<string, boolean>): any {
  if (!select) return value;
  const result: any = {};
  for (const [key, enabled] of Object.entries(select)) if (enabled) result[key] = value[key];
  return result;
}

function withWorkflowRelations(workflow: any, include?: any): any {
  if (!workflow || !include) return workflow;
  const result = { ...workflow };
  if (include.nodes) result.nodes = Array.from(workflowNodes.values()).filter((node) => node.workflowId === workflow.id);
  if (include.edges) result.edges = Array.from(workflowEdges.values()).filter((edge) => edge.workflowId === workflow.id);
  if (include.versions) {
    result.versions = Array.from(workflowVersions.values())
      .filter((version) => version.workflowId === workflow.id)
      .sort((a, b) => b.version - a.version)
      .slice(0, include.versions.take ?? undefined);
  }
  return result;
}

// ── Mock Prisma Client ──────────────────────
export const store = {
  user: {
    async findUnique({ where, select }: { where: any; select?: Record<string, boolean> }) {
      const user = find(users, where);
      return project(user, select);
    },
    async findUniqueOrThrow({ where, select }: { where: any; select?: Record<string, boolean> }) {
      const u = find(users, where);
      if (!u) throw new Error("Record not found");
      return project(u, select);
    },
    async create({ data }: { data: any }) {
      const user = { id: cuid(), ...data, createdAt: now(), updatedAt: now() };
      users.set(user.id, user);
      return user;
    },
    async update({ where, data }: { where: any; data: any }) {
      const u = find(users, where);
      if (!u) throw new Error("Record not found");
      Object.assign(u, data, { updatedAt: now() });
      return u;
    },
  },

  organization: {
    async findUnique({ where, include }: { where: any; include?: any }) {
      const org = find(orgs, where);
      if (!org || !include) return org;
      const result = { ...org };
      if (include.members) result.members = Array.from(orgMembers.values()).filter((member) => member.orgId === org.id);
      return result;
    },
    async create({ data }: { data: any }) {
      const { members, ...rest } = data;
      const org = { id: cuid(), ...rest, createdAt: now(), updatedAt: now() };
      orgs.set(org.id, org);
      if (members?.create) {
        const m = members.create;
        const memberId = cuid();
        orgMembers.set(memberId, { id: memberId, userId: m.userId, orgId: org.id, role: m.role, createdAt: now() });
      }
      return org;
    },
    async update({ where, data }: { where: any; data: any }) {
      const o = find(orgs, where);
      if (!o) throw new Error("Record not found");
      Object.assign(o, data, { updatedAt: now() });
      return o;
    },
    async updateMany({ where, data }: { where?: any; data: any }) {
      let count = 0;
      for (const org of orgs.values()) {
        if (where && !matches(org, where)) continue;
        Object.assign(org, data, { updatedAt: now() });
        count++;
      }
      return { count };
    },
  },

  organizationMember: {
    async findFirst({ where, include }: { where: any; include?: any }) {
      const m = find(orgMembers, where);
      if (m && include?.org) {
        m.org = find(orgs, { id: m.orgId });
      }
      if (m && include?.user) m.user = project(find(users, { id: m.userId }), include.user.select);
      return m;
    },
    async findUnique({ where }: { where: any }) {
      if (where.userId_orgId) {
        const { userId, orgId } = where.userId_orgId;
        return find(orgMembers, { userId, orgId });
      }
      return find(orgMembers, where);
    },
    async findMany({ where }: { where?: any } = {}) {
      return findMany(orgMembers, where);
    },
    async count({ where }: { where?: any } = {}) {
      return findMany(orgMembers, where).length;
    },
    async create({ data }: { data: any }) {
      const id = cuid();
      const member = { id, ...data, createdAt: now() };
      orgMembers.set(id, member);
      return member;
    },
  },

  workflow: {
    async count({ where }: { where?: any } = {}) {
      return findMany(workflows, where).length;
    },
    async findMany({
      where,
      orderBy,
      include,
      cursor,
      skip = 0,
      take,
    }: {
      where?: any;
      orderBy?: any;
      include?: any;
      cursor?: { id?: string };
      skip?: number;
      take?: number;
    } = {}) {
      let result = findMany(workflows, where);
      const isDesc = Array.isArray(orderBy)
        ? orderBy[0]?.updatedAt === "desc" || orderBy[0]?.createdAt === "desc"
        : orderBy?.updatedAt === "desc" || orderBy?.createdAt === "desc";
      if (isDesc) {
        result.sort((a: any, b: any) => toIsoString(b.updatedAt || b.createdAt).localeCompare(toIsoString(a.updatedAt || a.createdAt)));
      } else {
        result.sort((a: any, b: any) => toIsoString(a.updatedAt || a.createdAt).localeCompare(toIsoString(b.updatedAt || b.createdAt)));
      }

      let startIndex = 0;
      if (cursor?.id) {
        const cursorIdx = result.findIndex((item: any) => item.id === cursor.id);
        if (cursorIdx !== -1) {
          startIndex = cursorIdx + skip;
        } else {
          startIndex = skip;
        }
      } else {
        startIndex = skip;
      }

      if (take !== undefined) {
        result = result.slice(startIndex, startIndex + take);
      } else if (startIndex > 0) {
        result = result.slice(startIndex);
      }

      result = result.map((workflow) => withWorkflowRelations(workflow, include));
      if (include?.owner) {
        result = result.map((w: any) => ({ ...w, owner: find(users, { id: w.ownerId }) }));
      }
      return result;
    },
    async findFirst({ where, include }: { where: any; include?: any }) {
      // ponytail: handle nested where like { id, owner: { id } }
      const scalarWhere = { ...where };
      delete scalarWhere.owner;
      let result = findMany(workflows, scalarWhere);
      if (where.owner?.id) result = result.filter((w: any) => w.ownerId === where.owner.id);
      return withWorkflowRelations(result[0], include);
    },
    async findUnique({ where, include }: { where: any; include?: any }) {
      return this.findFirst({ where, include });
    },
    async create({ data }: { data: any }) {
      const { nodes, edges, versions, ...scalarData } = data;
      const wf = { id: cuid(), ...scalarData, createdAt: now(), updatedAt: now() };
      workflows.set(wf.id, wf);
      const nodeList = Array.isArray(nodes) ? nodes : Array.isArray(nodes?.create) ? nodes.create : [];
      for (const n of nodeList) {
        const nodeObj = { id: n.id ?? cuid(), workflowId: wf.id, ...n };
        workflowNodes.set(nodeObj.id, nodeObj);
      }
      const edgeList = Array.isArray(edges) ? edges : Array.isArray(edges?.create) ? edges.create : [];
      for (const e of edgeList) {
        const edgeObj = { id: e.id ?? cuid(), workflowId: wf.id, ...e };
        workflowEdges.set(edgeObj.id, edgeObj);
      }
      return wf;
    },
    async update({ where, data }: { where: any; data: any }) {
      const w = find(workflows, where);
      if (!w) throw new Error("Record not found");
      Object.assign(w, data, { updatedAt: now() });
      return w;
    },
    async updateMany({ where, data }: { where: any; data: any }) {
      let count = 0;
      for (const w of workflows.values()) {
        if (!matches(w, where)) continue;
        Object.assign(w, data, { updatedAt: now() });
        count++;
      }
      return { count };
    },
    async deleteMany({ where }: { where: any }) {
      let count = 0;
      for (const [id, w] of workflows) {
        if (!matches(w, where)) continue;
        workflows.delete(id);
        for (const [nodeId, node] of workflowNodes) if (node.workflowId === id) workflowNodes.delete(nodeId);
        for (const [edgeId, edge] of workflowEdges) if (edge.workflowId === id) workflowEdges.delete(edgeId);
        for (const [versionId, version] of workflowVersions) if (version.workflowId === id) workflowVersions.delete(versionId);
        count++;
      }
      return { count };
    },
  },

  workflowNode: {
    async findMany({ where }: { where?: any } = {}) {
      return findMany(workflowNodes, where);
    },
    async create({ data }: { data: any }) {
      const node = { id: data.id ?? cuid(), ...data };
      workflowNodes.set(node.id, node);
      return node;
    },
    async createMany({ data }: { data: any[] }) {
      for (const item of data) {
        const node = { id: item.id ?? cuid(), ...item };
        workflowNodes.set(node.id, node);
      }
      return { count: data.length };
    },
    async deleteMany({ where }: { where: any }) {
      let count = 0;
      for (const [id, node] of workflowNodes) {
        if (!matches(node, where)) continue;
        workflowNodes.delete(id);
        count++;
      }
      return { count };
    },
  },

  workflowEdge: {
    async findMany({ where }: { where?: any } = {}) {
      return findMany(workflowEdges, where);
    },
    async create({ data }: { data: any }) {
      const edge = { id: data.id ?? cuid(), ...data };
      workflowEdges.set(edge.id, edge);
      return edge;
    },
    async createMany({ data }: { data: any[] }) {
      for (const item of data) {
        const edge = { id: item.id ?? cuid(), ...item };
        workflowEdges.set(edge.id, edge);
      }
      return { count: data.length };
    },
    async deleteMany({ where }: { where: any }) {
      let count = 0;
      for (const [id, edge] of workflowEdges) {
        if (!matches(edge, where)) continue;
        workflowEdges.delete(id);
        count++;
      }
      return { count };
    },
  },

  workflowVersion: {
    async findFirst({ where, orderBy }: { where?: any; orderBy?: any } = {}) {
      const values = findMany(workflowVersions, where);
      if (orderBy?.version === "desc") values.sort((a: any, b: any) => b.version - a.version);
      return values[0] ?? null;
    },
    async findMany({ where, orderBy, take }: { where?: any; orderBy?: any; take?: number } = {}) {
      let values = findMany(workflowVersions, where);
      if (orderBy?.version === "desc") values.sort((a: any, b: any) => b.version - a.version);
      if (take !== undefined) values = values.slice(0, take);
      return values;
    },
    async create({ data }: { data: any }) {
      const version = { id: cuid(), ...data, createdAt: now() };
      workflowVersions.set(version.id, version);
      return version;
    },
  },

  workflowExecution: {
    async create({ data }: { data: any }) {
      const ex = { id: cuid(), ...data, createdAt: now(), updatedAt: now() };
      executions.set(ex.id, ex);
      return ex;
    },
    async count({ where }: { where?: any } = {}) {
      return findMany(executions, where).length;
    },
    async findMany({ where, orderBy, include, skip = 0, take, cursor }: { where?: any; orderBy?: any; include?: any; skip?: number; take?: number; cursor?: { id?: string } } = {}) {
      let result = findMany(executions, where);
      if (orderBy?.startedAt === "desc" || orderBy?.createdAt === "desc") {
        result.sort((a: any, b: any) => {
          const aTime = toIsoString(a.startedAt || a.createdAt);
          const bTime = toIsoString(b.startedAt || b.createdAt);
          return bTime.localeCompare(aTime) || String(b.id ?? "").localeCompare(String(a.id ?? ""));
        });
      }
      if (cursor?.id) {
        const idx = result.findIndex((e: any) => e.id === cursor.id);
        if (idx !== -1) {
          result = result.slice(idx + (skip ?? 0));
        }
      } else if (skip > 0) {
        result = result.slice(skip);
      }
      if (take !== undefined) {
        result = result.slice(0, take);
      }
      if (include?.workflow) {
        result = result.map((execution: any) => ({ ...execution, workflow: find(workflows, { id: execution.workflowId }) }));
      }
      return result;
    },
    async findFirst({ where }: { where: any }) {
      return find(executions, where);
    },
    async findUnique({ where }: { where: any }) {
      return find(executions, where);
    },
    async update({ where, data }: { where: any; data: any }) {
      const execution = find(executions, where);
      if (!execution) throw new Error("Record not found");
      Object.assign(execution, data, { updatedAt: now() });
      return execution;
    },
    async updateMany({ where, data }: { where: any; data: any }) {
      let count = 0;
      for (const e of executions.values()) {
        if (!matches(e, where)) continue;
        Object.assign(e, data, { updatedAt: now() });
        count++;
      }
      return { count };
    },
  },

  nodeExecution: {
    async findMany({ where }: { where?: any }) {
      return findMany(nodeExecutions, where);
    },
    async create({ data }: { data: any }) {
      const nodeExecution = { id: cuid(), ...data, createdAt: now(), updatedAt: now() };
      nodeExecutions.set(nodeExecution.id, nodeExecution);
      return nodeExecution;
    },
    async update({ where, data }: { where: any; data: any }) {
      const nodeExecution = find(nodeExecutions, where);
      if (!nodeExecution) throw new Error("Record not found");
      Object.assign(nodeExecution, data, { updatedAt: now() });
      return nodeExecution;
    },
  },

  credential: {
    async findMany({ where, orderBy, skip = 0, take }: { where?: any; orderBy?: any; skip?: number; take?: number }) {
      let result = findMany(credentials, where);
      if (orderBy?.createdAt === "desc") result.sort((a: any, b: any) => toIsoString(b.createdAt).localeCompare(toIsoString(a.createdAt)));
      if (take !== undefined) result = result.slice(skip, skip + take);
      return result;
    },
    async findFirst({ where }: { where: any }) {
      return find(credentials, where);
    },
    async findUnique({ where }: { where: any }) {
      return find(credentials, where);
    },
    async create({ data }: { data: any }) {
      const cred = { id: cuid(), ...data, createdAt: now(), updatedAt: now() };
      credentials.set(cred.id, cred);
      return cred;
    },
    async update({ where, data }: { where: any; data: any }) {
      const cred = find(credentials, where);
      if (!cred) throw new Error("Record not found");
      Object.assign(cred, data, { updatedAt: now() });
      return cred;
    },
    async updateMany({ where, data }: { where: any; data: any }) {
      let count = 0;
      for (const cred of credentials.values()) {
        if (!matches(cred, where)) continue;
        Object.assign(cred, data, { updatedAt: now() });
        count++;
      }
      return { count };
    },
    async delete({ where }: { where: any }) {
      credentials.delete(where.id);
      return { count: 1 };
    },
  },

  approval: {
    async findMany({ where, orderBy, skip = 0, take }: { where?: any; orderBy?: any; skip?: number; take?: number }) {
      let result = findMany(approvals, where);
      if (orderBy?.createdAt === "desc") result.sort((a: any, b: any) => toIsoString(b.createdAt).localeCompare(toIsoString(a.createdAt)));
      if (take !== undefined) result = result.slice(skip, skip + take);
      return result;
    },
    async updateMany({ where, data }: { where: any; data: any }) {
      let count = 0;
      for (const a of approvals.values()) {
        if (where.id && a.id !== where.id) continue;
        Object.assign(a, data, { updatedAt: now() });
        count++;
      }
      return { count };
    },
  },

  apiKey: {
    async findMany({ where }: { where?: any }) {
      return findMany(apiKeys, where);
    },
    async findUnique({ where }: { where: any }) {
      return find(apiKeys, where);
    },
    async create({ data }: { data: any }) {
      const key = { id: cuid(), ...data, createdAt: now() };
      apiKeys.set(key.id, key);
      return key;
    },
    async deleteMany({ where }: { where: any }) {
      let count = 0;
      for (const [id, k] of apiKeys) {
        if (!matches(k, where)) continue;
        apiKeys.delete(id);
        count++;
      }
      return { count };
    },
    async update({ where, data }: { where: any; data: any }) {
      const key = find(apiKeys, where);
      if (!key) throw new Error("Record not found");
      Object.assign(key, data);
      return key;
    },
  },

  webhook: {
    async findMany({ where, include, orderBy, skip = 0, take }: { where?: any; include?: any; orderBy?: any; skip?: number; take?: number }) {
      let result = findMany(webhooks, where);
      if (orderBy?.createdAt === "desc") result.sort((a: any, b: any) => toIsoString(b.createdAt).localeCompare(toIsoString(a.createdAt)));
      if (take !== undefined) result = result.slice(skip, skip + take);
      if (include?.workflow) result = result.map((webhook: any) => ({ ...webhook, workflow: find(workflows, { id: webhook.workflowId }) }));
      return result;
    },
    async findFirst({ where, include }: { where: any; include?: any }) {
      const wh = find(webhooks, where);
      if (!wh) return null;
      if (include?.workflow) {
        return { ...wh, workflow: find(workflows, { id: wh.workflowId }) };
      }
      return wh;
    },
    async findUnique({ where, include }: { where: any; include?: any }) {
      const wh = find(webhooks, where);
      if (!wh) return null;
      if (include?.workflow) {
        return { ...wh, workflow: find(workflows, { id: wh.workflowId }) };
      }
      return wh;
    },
    async create({ data }: { data: any }) {
      const wh = { id: cuid(), active: true, method: "POST", ...data, createdAt: now(), updatedAt: now() };
      webhooks.set(wh.id, wh);
      return wh;
    },
    async delete({ where }: { where: any }) {
      webhooks.delete(where.id);
      return { count: 1 };
    },
  },

  subscription: {
    async findFirst({ where }: { where: any }) {
      return find(subscriptions, where);
    },
    async create({ data }: { data: any }) {
      const subscription = { id: cuid(), ...data, createdAt: now(), updatedAt: now() };
      subscriptions.set(subscription.id, subscription);
      return subscription;
    },
    async update({ where, data }: { where: any; data: any }) {
      const subscription = find(subscriptions, where);
      if (!subscription) throw new Error("Record not found");
      Object.assign(subscription, data, { updatedAt: now() });
      return subscription;
    },
    async delete({ where }: { where: any }) {
      subscriptions.delete(where.id);
      return { count: 1 };
    },
  },

  usageRecord: {
    async findMany({ where, orderBy, skip = 0, take }: { where?: any; orderBy?: any; skip?: number; take?: number } = {}) {
      const result = findMany(usageRecords, where);
      if (orderBy?.createdAt === "desc") result.sort((a: any, b: any) => toIsoString(b.createdAt).localeCompare(toIsoString(a.createdAt)));
      return take === undefined ? result : result.slice(skip, skip + take);
    },
    async findUnique({ where }: { where: any }) {
      return find(usageRecords, where);
    },
    async findFirst({ where }: { where: any }) {
      return find(usageRecords, where);
    },
    async count({ where }: { where?: any } = {}) {
      return findMany(usageRecords, where).length;
    },
    async create({ data }: { data: any }) {
      const record = { id: cuid(), ...data, createdAt: data.createdAt ?? now() };
      usageRecords.set(record.id, record);
      return record;
    },
  },

  refreshToken: {
    async findUnique({ where }: { where: any }) {
      return find(refreshTokens, where);
    },
    async create({ data }: { data: any }) {
      const token = { id: cuid(), ...data, createdAt: now() };
      refreshTokens.set(token.id, token);
      return token;
    },
    async updateMany({ where, data }: { where: any; data: any }) {
      let count = 0;
      for (const token of refreshTokens.values()) {
        if (!matches(token, where)) continue;
        Object.assign(token, data);
        count++;
      }
      return { count };
    },
  },

  auditLog: {
    async findMany({ where, orderBy, skip = 0, take }: { where?: any; orderBy?: any; skip?: number; take?: number }) {
      let result = findMany(auditLogs, where);
      if (orderBy?.createdAt === "desc") {
        result.sort((a: any, b: any) => toIsoString(b.createdAt).localeCompare(toIsoString(a.createdAt)));
      } else if (orderBy?.createdAt === "asc") {
        result.sort((a: any, b: any) => toIsoString(a.createdAt).localeCompare(toIsoString(b.createdAt)));
      }
      if (take !== undefined) result = result.slice(skip, skip + take);
      return result;
    },
    async findFirst({ where, orderBy }: { where?: any; orderBy?: any }) {
      let result = findMany(auditLogs, where);
      if (orderBy?.createdAt === "desc") {
        result.sort((a: any, b: any) => toIsoString(b.createdAt).localeCompare(toIsoString(a.createdAt)));
      } else if (orderBy?.createdAt === "asc") {
        result.sort((a: any, b: any) => toIsoString(a.createdAt).localeCompare(toIsoString(b.createdAt)));
      }
      return result[0] ?? null;
    },
    async findUnique({ where }: { where: any }) {
      return find(auditLogs, where);
    },
    async count({ where }: { where?: any } = {}) {
      return findMany(auditLogs, where).length;
    },
    async create({ data }: { data: any }) {
      const entry = { id: cuid(), ...data, createdAt: data.createdAt ?? now() };
      auditLogs.set(entry.id, entry);
      return entry;
    },
  },

  $queryRaw: async () => [{ ok: 1 }],
  $disconnect: async () => undefined,

  $transaction: async (fn: (tx: any) => Promise<any>) => {
    // ponytail: no real transactions, just proxy through
    return fn(store);
  },
};

export function resetStore() {
  for (const table of [users, orgs, orgMembers, workflows, workflowNodes, workflowEdges, workflowVersions, executions, nodeExecutions, credentials, approvals, apiKeys, webhooks, subscriptions, usageRecords, refreshTokens, auditLogs]) {
    table.clear();
  }
}
