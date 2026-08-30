/**
 * AgentFlow — k6 load test (100 RPS, p95 < 300ms)
 *
 * Spec Trio 28 alternative to autocannon.
 * Requires k6 binary: https://k6.io/docs/getting-started/installation/
 *
 * Usage:
 *   k6 run scripts/k6-load-test.js
 *   TARGET_URL=http://localhost:3001 k6 run scripts/k6-load-test.js
 *   k6 run --vus 50 --duration 30s scripts/k6-load-test.js
 *
 * Env:
 *   TARGET_URL  base URL (default http://localhost:3001)
 *   LOAD_TEST_TOKEN  optional Bearer token for authed routes
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE = __ENV.TARGET_URL || "http://localhost:3001";
const TOKEN = __ENV.LOAD_TEST_TOKEN || "";
const P95_BUDGET = Number(__ENV.P95_BUDGET_MS || 300);

export const options = {
  scenarios: {
    rps100: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${P95_BUDGET}`, "p(99)<600"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

const latencyTrend = new Trend("agentflow_latency_ms", true);
const errorRate = new Rate("agentflow_errors");

const routes = [
  { method: "GET", path: "/health", weight: 30 },
  { method: "GET", path: "/metrics", weight: 5 },
  { method: "GET", path: "/api/telemetry/stats", weight: 10 },
  { method: "GET", path: "/admin/queues/stats", weight: 10 },
  { method: "GET", path: "/api/workflows", weight: 15, auth: true },
  { method: "GET", path: "/api/executions", weight: 15, auth: true },
  { method: "GET", path: "/api/credentials", weight: 5, auth: true },
];

function pickRoute() {
  const total = routes.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of routes) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return routes[0];
}

export default function () {
  const route = pickRoute();
  const url = `${BASE}${route.path}`;
  const headers = {};
  if (route.auth && TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;

  const res = http.request(route.method, url, null, { headers, tags: { route: route.path } });

  const ok = check(res, {
    "status 2xx/3xx": (r) => r.status >= 200 && r.status < 400,
    "p95 budget": (r) => r.timings.duration < P95_BUDGET,
  });

  latencyTrend.add(res.timings.duration);
  errorRate.add(!ok);

  // tiny jitter so arrival-rate stays honest
  // no sleep needed — constant-arrival-rate paces iterations
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration.values["p(95)"] ?? 0;
  const p50 = data.metrics.http_req_duration.values["med"] ?? 0;
  const p99 = data.metrics.http_req_duration.values["p(99)"] ?? 0;
  const avg = data.metrics.http_req_duration.values.avg ?? 0;
  const failed = data.metrics.http_req_failed.values.rate ?? 0;
  const checksRate = data.metrics.checks.values.rate ?? 0;
  const pass = p95 < P95_BUDGET && failed < 0.01;
  return {
    stdout: `
╔══════════════════════════════════════════════╗
║  AgentFlow k6 — 100 RPS p95 < ${P95_BUDGET}ms  ${pass ? "✓ PASS" : "✗ BREACH"}  ║
╚══════════════════════════════════════════════╝
p50: ${p50.toFixed(2)}ms  p95: ${p95.toFixed(2)}ms  p99: ${p99.toFixed(2)}ms  avg: ${avg.toFixed(2)}ms
failed: ${(failed * 100).toFixed(2)}%  checks: ${(checksRate * 100).toFixed(2)}%
Tail of /admin/queues/stats and /api/telemetry/stats printed by k6 thresholds above.
Run: curl ${BASE}/admin/queues/stats | jq .slo
`,
    "k6-summary.json": JSON.stringify(data, null, 2),
  };
}
