import assert from "node:assert/strict";
import test from "node:test";

delete process.env.DATABASE_URL;
Object.defineProperty(process.env, "NODE_ENV", {
  value: "test",
  configurable: true,
  writable: true,
  enumerable: true,
});
process.env.ALLOW_MEMORY_DB = "1";
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
process.env.MASTER_KEY = "super-secret-master-key";
process.env.API_KEY = "sk-proj-123456";
process.env.AWS_SECRET_ACCESS_KEY = "aws-secret-test-key";
process.env.OPENAI_API_KEY = "sk-openai-key";
process.env.STRIPE_SECRET_KEY = "sk_live_12345";
process.env.SAFE_CUSTOM_VAR = "hello-world-safe";
process.env.APP_NAME = "AgentFlowTest";

const [
  { buildApp },
  { resetStore },
  { prisma },
  { sanitizeEnv, buildExpressionContext, evaluateExpression },
] = await Promise.all([
  import("../src/server.js"),
  import("../src/lib/store.js"),
  import("../src/lib/prisma.js"),
  import("../src/services/expressions.js"),
]);

const app = await buildApp({ logger: false });

test.beforeEach(() => {
  resetStore();
});

test("Security Fix 1: Expressions $env object sanitization", () => {
  const customEnv = {
    JWT_SECRET: "my-jwt-secret",
    DATABASE_URL: "postgres://...",
    MASTER_KEY: "master-key-xyz",
    API_KEY: "api-key-123",
    AWS_ACCESS_KEY_ID: "AKIA...",
    AWS_SECRET_ACCESS_KEY: "secret...",
    OPENAI_API_KEY: "sk-...",
    STRIPE_SECRET: "stripe_sec...",
    REDIS_PASSWORD: "redis-password",
    USER_PASSWORD: "secret-password",
    PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----",
    SAFE_PUBLIC_VAR: "public_value",
    APP_PORT: "3000",
    NODE_ENV: "production",
  };

  const sanitized = sanitizeEnv(customEnv);

  // Assert sensitive keys are removed
  assert.equal(sanitized.JWT_SECRET, undefined);
  assert.equal(sanitized.DATABASE_URL, undefined);
  assert.equal(sanitized.MASTER_KEY, undefined);
  assert.equal(sanitized.API_KEY, undefined);
  assert.equal(sanitized.AWS_ACCESS_KEY_ID, undefined);
  assert.equal(sanitized.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(sanitized.OPENAI_API_KEY, undefined);
  assert.equal(sanitized.STRIPE_SECRET, undefined);
  assert.equal(sanitized.REDIS_PASSWORD, undefined);
  assert.equal(sanitized.USER_PASSWORD, undefined);
  assert.equal(sanitized.PRIVATE_KEY, undefined);

  // Assert non-sensitive keys remain intact
  assert.equal(sanitized.SAFE_PUBLIC_VAR, "public_value");
  assert.equal(sanitized.APP_PORT, "3000");
  assert.equal(sanitized.NODE_ENV, "production");

  // Verify expression evaluation in context
  const context = buildExpressionContext({
    item: { json: { name: "AgentFlow" } },
  });

  assert.equal(context.$env?.JWT_SECRET, undefined);
  assert.equal(context.$env?.DATABASE_URL, undefined);
  assert.equal(context.$env?.MASTER_KEY, undefined);
  assert.equal(context.$env?.API_KEY, undefined);
  assert.equal(context.$env?.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(context.$env?.OPENAI_API_KEY, undefined);
  assert.equal(context.$env?.SAFE_CUSTOM_VAR, "hello-world-safe");
  assert.equal(context.$env?.APP_NAME, "AgentFlowTest");

  // Evaluating {{ $env.SAFE_CUSTOM_VAR }} succeeds, while {{ $env.JWT_SECRET }} evaluates to empty
  const evalSafe = evaluateExpression("Value: {{ $env.SAFE_CUSTOM_VAR }}", context);
  assert.equal(evalSafe, "Value: hello-world-safe");

  const evalSecret = evaluateExpression("Secret: {{ $env.JWT_SECRET }}", context);
  assert.equal(evalSecret, "Secret: ");
});

test("Security Fix 2: BullBoard routes require authentication and ADMIN role", async () => {
  // 1. Unauthenticated request -> 401
  const unauthRes = await app.inject({
    method: "GET",
    url: "/admin/queues/stats",
  });
  assert.equal(unauthRes.statusCode, 401);

  const unauthHtmlRes = await app.inject({
    method: "GET",
    url: "/admin/queues",
  });
  assert.equal(unauthHtmlRes.statusCode, 401);

  // 2. Regular user (MEMBER role) -> 403 Forbidden
  const regularUser = await prisma.user.create({
    data: {
      email: "member@example.com",
      passwordHash: "hash123",
      memberships: {
        create: {
          role: "MEMBER",
          org: {
            create: {
              name: "Member Org",
              slug: `member-org-${Date.now()}`,
            },
          },
        },
      },
    },
  });
  const memberToken = (app as any).jwt.sign({ sub: regularUser.id, email: regularUser.email });

  const memberRes = await app.inject({
    method: "GET",
    url: "/admin/queues/stats",
    headers: { authorization: `Bearer ${memberToken}` },
  });
  assert.equal(memberRes.statusCode, 403);
  assert.equal(JSON.parse(memberRes.body).code, "FORBIDDEN");

  // 3. Admin user (ADMIN role) -> 200 OK
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@example.com",
      passwordHash: "hash123",
      memberships: {
        create: {
          role: "ADMIN",
          org: {
            create: {
              name: "Admin Org",
              slug: `admin-org-${Date.now()}`,
            },
          },
        },
      },
    },
  });
  const adminToken = (app as any).jwt.sign({ sub: adminUser.id, email: adminUser.email });

  const adminRes = await app.inject({
    method: "GET",
    url: "/admin/queues/stats",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(adminRes.statusCode, 200);

  const adminQueuesRes = await app.inject({
    method: "GET",
    url: "/admin/queues/api/queues",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(adminQueuesRes.statusCode, 200);
});

test("Security Fix 2: DLQ routes require authentication and ADMIN role", async () => {
  // 1. Unauthenticated request -> 401
  const unauthRes = await app.inject({
    method: "GET",
    url: "/api/admin/dlq/metrics",
  });
  assert.equal(unauthRes.statusCode, 401);

  // 2. Regular user (MEMBER role) -> 403 Forbidden
  const regularUser = await prisma.user.create({
    data: {
      email: "dlq-member@example.com",
      passwordHash: "hash123",
      memberships: {
        create: {
          role: "MEMBER",
          org: {
            create: {
              name: "DLQ Member Org",
              slug: `dlq-member-org-${Date.now()}`,
            },
          },
        },
      },
    },
  });
  const memberToken = (app as any).jwt.sign({ sub: regularUser.id, email: regularUser.email });

  const memberRes = await app.inject({
    method: "GET",
    url: "/api/admin/dlq/metrics",
    headers: { authorization: `Bearer ${memberToken}` },
  });
  assert.equal(memberRes.statusCode, 403);
  assert.equal(JSON.parse(memberRes.body).code, "FORBIDDEN");

  // 3. Admin user (ADMIN role) -> 200 OK
  const adminUser = await prisma.user.create({
    data: {
      email: "dlq-admin@example.com",
      passwordHash: "hash123",
      memberships: {
        create: {
          role: "ADMIN",
          org: {
            create: {
              name: "DLQ Admin Org",
              slug: `dlq-admin-org-${Date.now()}`,
            },
          },
        },
      },
    },
  });
  const adminToken = (app as any).jwt.sign({ sub: adminUser.id, email: adminUser.email });

  const adminRes = await app.inject({
    method: "GET",
    url: "/api/admin/dlq/metrics",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(adminRes.statusCode, 200);
});

test("Security Fix 3: Executions routes validate x-org-id membership against user", async () => {
  // Create Org 1 and User 1 (Member of Org 1)
  const user1 = await prisma.user.create({
    data: {
      email: "user1-exec@example.com",
      passwordHash: "hash123",
      memberships: {
        create: {
          role: "MEMBER",
          org: {
            create: {
              name: "Org 1",
              slug: `org-1-${Date.now()}`,
            },
          },
        },
      },
    },
  });

  const member1 = await prisma.organizationMember.findFirst({ where: { userId: user1.id } });
  const user1OrgId = member1!.orgId;
  const user1Token = (app as any).jwt.sign({ sub: user1.id, email: user1.email, orgId: user1OrgId });

  // Create Org 2 (User 1 is NOT a member)
  const org2 = await prisma.organization.create({
    data: {
      name: "Org 2 Secret",
      slug: `org-2-${Date.now()}`,
    },
  });

  // 1. Requesting executions with own orgId -> 200 OK
  const ownOrgRes = await app.inject({
    method: "GET",
    url: "/api/executions",
    headers: {
      authorization: `Bearer ${user1Token}`,
      "x-org-id": user1OrgId,
    },
  });
  assert.equal(ownOrgRes.statusCode, 200);

  // 2. Requesting executions with unassociated orgId (IDOR attempt) -> 403 FORBIDDEN_ORG
  const idorRes = await app.inject({
    method: "GET",
    url: "/api/executions",
    headers: {
      authorization: `Bearer ${user1Token}`,
      "x-org-id": org2.id,
    },
  });
  assert.equal(idorRes.statusCode, 403);
  const idorBody = JSON.parse(idorRes.body);
  assert.equal(idorBody.code, "FORBIDDEN_ORG");
  assert.equal(idorBody.error, "Not a member of this organization");

  // 3. Triggering workflow with unassociated x-org-id -> 403 FORBIDDEN_ORG
  const triggerRes = await app.inject({
    method: "POST",
    url: "/api/executions/trigger",
    headers: {
      authorization: `Bearer ${user1Token}`,
      "x-org-id": org2.id,
      "content-type": "application/json",
    },
    payload: JSON.stringify({ workflowId: "nonexistent-wf" }),
  });
  assert.equal(triggerRes.statusCode, 403);
  const triggerBody = JSON.parse(triggerRes.body);
  assert.equal(triggerBody.code, "FORBIDDEN_ORG");
});
