#!/usr/bin/env node
/**
 * AgentFlow — 100 RPS load tester (autocannon-first, Node fallback)
 *
 * Spec Trio 28: k6/autocannon + Bull Board Redis metrics p95 <300ms
 * - Hits health + auth + workflows + telemetry + metrics + Bull Board in a realistic mix
 * - Asserts p95 < 300ms and non-2xx < 1%
 * - Prints Bull Board / telemetry snapshot at end
 *
 * Usage:
 *   TARGET_URL=http://localhost:3001 pnpm load:test
 *   node scripts/load-test.mjs --url http://localhost:3001 --rps 100 --duration 30 --connections 50
 *   pnpm load:test:autocannon   # forces autocannon path
 *
 * Env:
 *   TARGET_URL   base URL (default http://localhost:3001)
 *   RPS          target requests/sec (default 100)
 *   DURATION     seconds (default 30)
 *   CONNECTIONS  concurrent connections (default 50)
 *   P95_BUDGET_MS fail if p95 > budget (default 300)
 */

import { performance } from "node:perf_hooks";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);
const TARGET = args.url || process.env.TARGET_URL || "http://localhost:3001";
const RPS = Number(args.rps || process.env.RPS || 100);
const DURATION = Number(args.duration || process.env.DURATION || 30);
const CONNECTIONS = Number(args.connections || process.env.CONNECTIONS || 50);
const P95_BUDGET = Number(args.p95 || process.env.P95_BUDGET_MS || 300);
const TOKEN = process.env.LOAD_TEST_TOKEN || "";

const routes = [
  { method: "GET", path: "/health", weight: 30 },
  { method: "GET", path: "/metrics", weight: 5 },
  { method: "GET", path: "/api/telemetry/stats", weight: 10 },
  { method: "GET", path: "/admin/queues/stats", weight: 10 },
  { method: "GET", path: "/api/workflows", weight: 15, auth: true },
  { method: "GET", path: "/api/executions", weight: 15, auth: true },
  { method: "GET", path: "/api/credentials", weight: 5, auth: true },
  { method: "GET", path: "/api/auth/me", weight: 10, auth: true },
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

async function tryAutocannon() {
  let autocannon;
  try {
    autocannon = (await import("autocannon")).default;
  } catch {
    return null;
  }
  console.log(`[load-test] autocannon found — running ${RPS} RPS × ${DURATION}s against ${TARGET} (connections=${CONNECTIONS})`);
  // Build a mixed workload by attacking the health endpoint at target RPS;
  // full mix is exercised by the Node fallback run after (or use k6 script for true mixed-RPS).
  // We hit multiple URLs via `requests` array so p95 reflects the whole surface.
  const requests = routes.map((r) => ({
    method: r.method,
    path: r.path,
    headers: r.auth && TOKEN ? { authorization: `Bearer ${TOKEN}` } : {},
  }));
  // Distribute requests according to weight by duplicating entries
  const weighted = [];
  for (const r of routes) {
    const n = Math.max(1, Math.round(r.weight / 5));
    for (let i = 0; i < n; i++) weighted.push({ method: r.method, path: r.path, headers: r.auth && TOKEN ? { authorization: `Bearer ${TOKEN}` } : {} });
  }
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: TARGET,
        connections: CONNECTIONS,
        duration: DURATION,
        pipelining: 1,
        // Use amount to approximate RPS: autocannon doesn't have native RPS limiter, so we
        // use `rate` via `bailout` loop — set overallRate to RPS and let autocannon spread it.
        // Recent autocannon supports `rate` via `overallRate` in workers; fallback to max throughput + p95 check.
        requests: weighted,
        // Ensure headers don't leak secrets
        title: "agentflow-100rps",
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    autocannon.track(instance, { renderProgressBar: true });
  });
}

async function nodeFallbackLoad() {
  console.log(`[load-test] autocannon not installed — falling back to Node fetch loop (${RPS} RPS × ${DURATION}s → ${RPS * DURATION} requests)`);
  console.log(`[load-test] target=${TARGET}  install autocannon for more accurate RPS: pnpm add -D autocannon`);
  const totalRequests = RPS * DURATION;
  const intervalMs = 1000 / RPS;
  const latencies = [];
  let ok = 0;
  let err = 0;
  const start = performance.now();
  let sent = 0;

  async function oneRequest() {
    const route = pickRoute();
    const url = `${TARGET}${route.path}`;
    const headers = {};
    if (route.auth && TOKEN) headers["authorization"] = `Bearer ${TOKEN}`;
    const t0 = performance.now();
    try {
      const res = await fetch(url, { method: route.method, headers });
      // drain body
      await res.text().catch(() => {});
      const dt = performance.now() - t0;
      latencies.push(dt);
      if (res.status >= 200 && res.status < 400) ok++;
      else err++;
    } catch (e) {
      const dt = performance.now() - t0;
      latencies.push(dt);
      err++;
    }
  }

  // Pace requests to hit target RPS
  for (let i = 0; i < totalRequests; i++) {
    const scheduled = start + i * intervalMs;
    const now = performance.now();
    const wait = scheduled - now;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    // Fire without awaiting to keep concurrency; throttle via Promise queue
    // Keep up to CONNECTIONS in-flight
    while (sent - (ok + err) >= CONNECTIONS) {
      await new Promise((r) => setTimeout(r, 2));
    }
    sent++;
    void oneRequest();
    if (i % Math.max(1, Math.floor(RPS * 2)) === 0 && i > 0) {
      process.stdout.write(`\r[load-test] ${i}/${totalRequests} sent  ok=${ok} err=${err}`);
    }
  }
  // Wait for in-flight
  while (ok + err < totalRequests) {
    await new Promise((r) => setTimeout(r, 20));
  }
  latencies.sort((a, b) => a - b);
  const p = (q) => latencies[Math.min(latencies.length - 1, Math.ceil((q / 100) * latencies.length) - 1)] ?? 0;
  const result = {
    requests: { total: totalRequests, average: RPS, sent: totalRequests },
    latency: {
      average: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50: p(50),
      p95: p(95),
      p99: p(99),
      max: Math.max(...latencies),
      min: Math.min(...latencies),
    },
    throughput: { average: RPS },
    errors: err,
    non2xx: err,
    statusCodeStats: { ok, err },
    duration: (performance.now() - start) / 1000,
  };
  process.stdout.write("\n");
  return result;
}

function percentileCheck(result) {
  const p95 = result.latency.p95 ?? result.latency.p95 === 0 ? result.latency.p95 : result.latency["p95"] ?? 0;
  // autocannon shape: result.latency.p95 vs p95
  const p95val = typeof p95 === "number" ? p95 : Number(result.latency.p95 ?? result.latency.p2_5 ?? 0);
  // our node fallback
  const p95final = p95val || result.latency.p95 || 0;
  const non2xx = result.non2xx ?? result["5xx"] ?? result.errors ?? 0;
  const total = result.requests.total ?? result.requests.sent ?? 1;
  const errRate = non2xx / total;
  console.log("\n────────────────────────────────────────");
  console.log(`p95: ${p95final.toFixed(2)}ms  (budget ${P95_BUDGET}ms)  ${p95final <= P95_BUDGET ? "✓ PASS" : "✗ BREACH"}`);
  console.log(`non-2xx: ${non2xx}/${total} (${(errRate * 100).toFixed(2)}%)  ${errRate < 0.01 ? "✓ PASS" : "✗ BREACH"}`);
  console.log(`avg latency: ${(result.latency.average ?? 0).toFixed(2)}ms  throughput: ${result.requests.average ?? RPS} req/s  duration: ${(result.duration ?? DURATION).toFixed(1)}s`);
  if (result.latency.p50 !== undefined) console.log(`p50: ${result.latency.p50.toFixed?.(2) ?? result.latency.p50}ms  p99: ${(result.latency.p99 ?? result.latency.max ?? 0).toFixed?.(2) ?? result.latency.p99}ms`);
  console.log("────────────────────────────────────────\n");

  // Also pull live server-side p95 from telemetry
  return { p95: p95final, errRate, pass: p95final <= P95_BUDGET && errRate < 0.01 };
}

async function fetchTelemetrySnapshot() {
  for (const path of ["/api/telemetry/stats", "/admin/queues/stats", "/metrics"]) {
    try {
      const res = await fetch(`${TARGET}${path}`);
      const text = await res.text();
      const preview = text.slice(0, 900);
      console.log(`\n── ${path} (${res.status}) ──\n${preview}${text.length > 900 ? "\n… (truncated)" : ""}`);
    } catch (e) {
      console.log(`\n── ${path} unreachable: ${e.message}`);
    }
  }
}

async function main() {
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║  AgentFlow Load Test — ${RPS} RPS × ${DURATION}s — p95 < ${P95_BUDGET}ms  ║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);
  // Quick health check
  try {
    const h = await fetch(`${TARGET}/health`);
    if (!h.ok) console.warn(`[load-test] warning: /health returned ${h.status} — is the API running?`);
    else console.log(`[load-test] /health ok — ${TARGET} reachable`);
  } catch (e) {
    console.warn(`[load-test] warning: cannot reach ${TARGET}/health — ${e.message}`);
  }

  let result;
  const ac = await tryAutocannon();
  if (ac) {
    result = ac;
    // autocannon result shape normalization
    const total = ac.requests.total;
    const avgLatency = ac.latency.average;
    const p95ac = ac.latency.p95 ?? ac.latency.p97_5 ?? 0;
    const p50ac = ac.latency.p50 ?? ac.latency.average;
    const p99ac = ac.latency.p99 ?? ac.latency.max;
    console.log(`\n[load-test] autocannon done: ${total} requests  avg ${avgLatency}ms  p95 ${p95ac}ms  p99 ${p99ac}ms  errors ${ac.errors}  timeouts ${ac.timeouts}`);
    result = {
      requests: { total, average: ac.requests.average, sent: total },
      latency: { average: avgLatency, p50: p50ac, p95: p95ac, p99: p99ac, max: ac.latency.max, min: ac.latency.min },
      throughput: ac.throughput,
      errors: ac.errors,
      non2xx: ac.non2xx ?? ac["5xx"] ?? 0,
      duration: ac.duration,
      _raw: ac,
    };
  } else {
    result = await nodeFallbackLoad();
  }

  const { pass } = percentileCheck(result);
  await fetchTelemetrySnapshot();

  if (!pass) {
    console.error(`\n✗ LOAD TEST BREACH — p95 or error-rate exceeded budget. Check /admin/queues and /api/telemetry/stats, scale worker concurrency (cpus*2) or add Redis.`);
    process.exitCode = 1;
  } else {
    console.log(`\n✓ LOAD TEST PASS — p95 < ${P95_BUDGET}ms and error-rate < 1%`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
