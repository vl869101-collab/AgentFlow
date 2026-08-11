// ponytail: in-memory store for dev without PostgreSQL
// replace with Prisma when docker/postgres is available

import { randomUUID } from "crypto";

function cuid() {
  return randomUUID().replace(/-/g, "").slice(0, 25);
}
function now() {
  return new Date().toISOString();
}

// ── Tables ──────────────────────────────────
export const users = new Map<string, any>();
export const orgs = new Map<string, any>();
export const orgMembers = new Map<string, any>();
export const workflows = new Map<string, any>();
export const executions = new Map<string, any>();
export const nodeExecutions = new Map<string, any>();
export const credentials = new Map<string, any>();
export const approvals = new Map<string, any>();
export const apiKeys = new Map<string, any>();
export const webhooks = new Map<string, any>();
export const subscriptions = new Map<string, any>();
export const usageRecords = new Map<string, any>();

// ── Helpers ─────────────────────────────────
function find(table: Map<string, any>, where: any): any | null {
  for (const v of table.values()) {
    if (where.id !== undefined && v.id !== where.id) continue;
    if (where.email !== undefined && v.email !== where.email) continue;
    if (where.slug !== undefined && v.slug !== where.slug) continue;
    if (where.path !== undefined && v.path !== where.path) continue;
    if (where.userId !== undefined && v.userId !== where.userId) continue;
    if (where.orgId !== undefined && v.orgId !== where.orgId) continue;
    if (where.workflowId !== undefined && v.workflowId !== where.workflowId) continue;
    return v;
  }
  return null;
}

function findMany<T>(table: Map<string, T>, where?: any): T[] {
  let result = Array.from(table.values());
  if (!where) return result;
  for (const [key, val] of Object.entries(where)) {
    if (val === undefined) continue;
    result = result.filter((v: any) => v[key] === val);
  }
  return result;
}

// ── Mock Prisma Client ──────────────────────
export const store = {
  user: {
    async findUnique({ where }: { where: any }) {
      return find(users, where);
    },
    async findUniqueOrThrow({ where }: { where: any }) {
      const u = find(users, where);
      if (!u) throw new Error("Record not found");
      return u;
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
    async findUnique({ where }: { where: any }) {
      return find(orgs, where);
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
  },

  organizationMember: {
    async findFirst({ where, include }: { where: any; include?: any }) {
      const m = find(orgMembers, where);
      if (m && include?.org) {
        m.org = find(orgs, { id: m.orgId });
      }
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
    async create({ data }: { data: any }) {
      const id = cuid();
      const member = { id, ...data, createdAt: now() };
      orgMembers.set(id, member);
      return member;
    },
  },

  workflow: {
    async findMany({ where, orderBy, include }: { where?: any; orderBy?: any; include?: any } = {}) {
      let result = findMany(workflows, where);
      if (orderBy?.updatedAt === "desc") result.sort((a: any, b: any) => b.updatedAt.localeCompare(a.updatedAt));
      if (include?.owner) {
        result = result.map((w: any) => ({ ...w, owner: find(users, { id: w.ownerId }) }));
      }
      return result;
    },
    async findFirst({ where }: { where: any }) {
      // ponytail: handle nested where like { id, owner: { id } }
      let result = findMany(workflows, { id: where.id });
      if (where.owner?.id) result = result.filter((w: any) => w.ownerId === where.owner.id);
      return result[0] ?? null;
    },
    async create({ data }: { data: any }) {
      const wf = { id: cuid(), ...data, createdAt: now(), updatedAt: now() };
      workflows.set(wf.id, wf);
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
        if (where.id && w.id !== where.id) continue;
        if (where.ownerId && w.ownerId !== where.ownerId) continue;
        Object.assign(w, data, { updatedAt: now() });
        count++;
      }
      return { count };
    },
    async deleteMany({ where }: { where: any }) {
      let count = 0;
      for (const [id, w] of workflows) {
        if (where.id && w.id !== where.id) continue;
        if (where.ownerId && w.ownerId !== where.ownerId) continue;
        workflows.delete(id);
        count++;
      }
      return { count };
    },
  },

  workflowExecution: {
    async create({ data }: { data: any }) {
      const ex = { id: cuid(), ...data, createdAt: now(), updatedAt: now() };
      executions.set(ex.id, ex);
      return ex;
    },
    async findMany({ where, orderBy }: { where?: any; orderBy?: any } = {}) {
      let result = findMany(executions, where);
      if (orderBy?.createdAt === "desc") result.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
      return result;
    },
    async findFirst({ where }: { where: any }) {
      return find(executions, where);
    },
    async findUnique({ where }: { where: any }) {
      return find(executions, where);
    },
    async updateMany({ where, data }: { where: any; data: any }) {
      let count = 0;
      for (const e of executions.values()) {
        if (where.id && e.id !== where.id) continue;
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
  },

  credential: {
    async findMany({ where, orderBy }: { where?: any; orderBy?: any }) {
      let result = findMany(credentials, where);
      if (orderBy?.createdAt === "desc") result.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
      return result;
    },
    async findFirst({ where }: { where: any }) {
      return find(credentials, where);
    },
    async create({ data }: { data: any }) {
      const cred = { id: cuid(), ...data, createdAt: now(), updatedAt: now() };
      credentials.set(cred.id, cred);
      return cred;
    },
    async delete({ where }: { where: any }) {
      credentials.delete(where.id);
      return { count: 1 };
    },
  },

  approval: {
    async findMany({ where, orderBy }: { where?: any; orderBy?: any }) {
      let result = findMany(approvals, where);
      if (orderBy?.createdAt === "desc") result.sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
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
    async create({ data }: { data: any }) {
      const key = { id: cuid(), ...data, createdAt: now() };
      apiKeys.set(key.id, key);
      return key;
    },
    async deleteMany({ where }: { where: any }) {
      let count = 0;
      for (const [id, k] of apiKeys) {
        if (where.id && k.id !== where.id) continue;
        if (where.userId && k.userId !== where.userId) continue;
        apiKeys.delete(id);
        count++;
      }
      return { count };
    },
  },

  webhook: {
    async findMany({ where }: { where?: any }) {
      return findMany(webhooks, where);
    },
    async findFirst({ where }: { where: any }) {
      return find(webhooks, where);
    },
    async findUnique({ where }: { where: any }) {
      return find(webhooks, where);
    },
    async create({ data }: { data: any }) {
      const wh = { id: cuid(), ...data, createdAt: now(), updatedAt: now() };
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
  },

  usageRecord: {
    async findMany({ where }: { where?: any }) {
      return findMany(usageRecords, where);
    },
  },

  $transaction: async (fn: (tx: any) => Promise<any>) => {
    // ponytail: no real transactions, just proxy through
    return fn(store);
  },
};
