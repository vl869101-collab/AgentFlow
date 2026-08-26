import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  getQueueMetrics,
  retryFailedJobs,
  retryJob,
  getQueueJobs,
  cleanQueue,
  pauseQueue,
  resumeQueue,
} from "../services/queue.js";
import { telemetry } from "../lib/otel.js";
import { getRedisClient } from "../lib/redis.js";
import os from "node:os";

export async function bullBoardRoutes(app: FastifyInstance) {
  // HTML dashboard — full Bull Board monitoring with Redis + Otel metrics + Queue actions
  app.get("/", async (_request: FastifyRequest, reply: FastifyReply) => {
    const cpus = os.cpus().length || 1;
    const concurrency = Math.max(2, cpus * 2);
    const queues = await getQueueMetrics();
    const latency = telemetry.getLatencySummary().slice(0, 10);
    const summary = (telemetry.getMetricsSummary() as any) ?? {
      slo: { status: "ok", violations: 0, violatingRoutes: [] },
      counters: { httpRequests: 0, workflowExecutions: 0 },
      activeExecutions: 0,
      spansRecorded: 0,
    };

    const queueRows = `
      <tr><td><strong>workflows</strong> active</td><td><span class="badge ${queues.workflows.active > 0 ? "ok" : ""}">${queues.workflows.active}</span></td></tr>
      <tr><td><strong>workflows</strong> waiting</td><td>${queues.workflows.waiting}</td></tr>
      <tr><td><strong>workflows</strong> completed</td><td>${queues.workflows.completed}</td></tr>
      <tr><td><strong>workflows</strong> failed</td><td><span class="badge ${queues.workflows.failed > 0 ? "breach" : ""}">${queues.workflows.failed}</span></td></tr>
      <tr><td><strong>workflows</strong> delayed</td><td>${queues.workflows.delayed}</td></tr>
      <tr><td><strong>workflows-dlq</strong> failed</td><td><span class="badge ${queues.dlq.failed > 0 ? "breach" : ""}">${queues.dlq.failed}</span></td></tr>
      <tr><td><strong>workflows-dlq</strong> waiting</td><td>${queues.dlq.waiting}</td></tr>
    `;
    const latencyRows =
      latency.length > 0
        ? latency
            .map(
              (l) =>
                `<tr><td>${l.route}</td><td>${l.count}</td><td>${l.avg}</td><td style="color:${l.p95 > 300 ? "#ef4444" : "#22c55e"}">${l.p95}</td><td>${l.p99}</td><td>${l.max}</td></tr>`
            )
            .join("")
        : `<tr><td colspan="6" style="color:#94a3b8">No samples yet — run the load tester</td></tr>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AgentFlow Queue Dashboard — Bull Board + Redis + DLQ</title>
  <style>
    :root { --bg:#0f172a; --card:#1e293b; --border:#334155; --accent:#8b5cf6; --muted:#94a3b8; }
    *{box-sizing:border-box} body{font-family:Inter,system-ui,sans-serif;margin:0;padding:2rem;background:var(--bg);color:#f8fafc}
    h1{margin:0 0 .25rem;font-size:1.5rem} .sub{color:var(--muted);margin-bottom:1.5rem}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem;margin-bottom:1.5rem}
    .card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:1rem}
    .card h2{font-size:.95rem;margin:0 0 .75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
    table{width:100%;border-collapse:collapse;font-size:.85rem}
    th{color:var(--muted);font-weight:600;text-align:left;border-bottom:1px solid var(--border);padding:.4rem .5rem}
    td{border-bottom:1px solid #1e293b;padding:.4rem .5rem}
    .badge{display:inline-block;padding:.15rem .5rem;border-radius:999px;font-size:.7rem;font-weight:700}
    .ok{background:#22c55e20;color:#22c55e;border:1px solid #22c55e40}
    .breach{background:#ef444420;color:#ef4444;border:1px solid #ef444440}
    .btn{background:var(--accent);color:#fff;border:none;padding:.4rem .8rem;border-radius:6px;font-size:.8rem;font-weight:600;cursor:pointer;margin-right:.5rem;margin-bottom:.5rem}
    .btn:hover{opacity:.9} .btn-danger{background:#ef4444} .btn-secondary{background:#475569}
    a{color:var(--accent)} code{background:#0b1220;padding:.2rem .4rem;border-radius:6px;border:1px solid var(--border)}
    .kpi{font-size:1.6rem;font-weight:800} .kpi small{font-size:.7rem;color:var(--muted);font-weight:600}
  </style>
</head>
<body>
  <h1>AgentFlow Queue Dashboard (Bull Board)</h1>
  <div class="sub">BullMQ · DLQ Retry 3x · Redis Idempotency · CPU*2 Concurrency · <a href="/admin/queues/stats">JSON stats</a> · <a href="/metrics">Prometheus /metrics</a></div>
  <div class="grid">
    <div class="card">
      <h2>Worker Configuration</h2>
      <div class="kpi">${concurrency} <small>concurrency (CPU ${cpus} × 2)</small></div>
      <div style="margin-top:.6rem;color:var(--muted);font-size:.8rem">Graceful SIGTERM/SIGINT: Enabled</div>
      <div style="margin-top:.4rem;color:var(--muted);font-size:.8rem">Retry Strategy: 3x attempts + exponential backoff</div>
      <div style="margin-top:.6rem"><span class="badge ${summary.slo?.status === "ok" ? "ok" : "breach"}">SLO p95 ${summary.slo?.status === "ok" ? "OK" : "BREACH"}</span></div>
    </div>
    <div class="card">
      <h2>Throughput & Execution</h2>
      <div class="kpi">${summary.counters?.httpRequests ?? 0} <small>HTTP requests</small></div>
      <div class="kpi" style="margin-top:.4rem">${summary.counters?.workflowExecutions ?? 0} <small>executions</small></div>
      <div style="margin-top:.4rem;color:var(--muted);font-size:.8rem">Active executions: ${summary.activeExecutions ?? 0}</div>
    </div>
    <div class="card">
      <h2>Queue Controls</h2>
      <div style="margin-top:.5rem">
        <button class="btn" onclick="retryQueue('workflows')">Retry Failed Workflows</button>
        <button class="btn btn-secondary" onclick="cleanCompleted('workflows')">Clean Completed</button>
        <button class="btn btn-danger" onclick="retryQueue('workflows-dlq')">Retry DLQ Jobs</button>
      </div>
      <div id="actionResult" style="margin-top:.5rem;font-size:.8rem;color:var(--accent)"></div>
    </div>
  </div>
  <div class="grid">
    <div class="card">
      <h2>Queues (BullMQ + DLQ)</h2>
      <table><thead><tr><th>Queue / Metric</th><th>Count</th></tr></thead><tbody>${queueRows}</tbody></table>
      <div style="margin-top:.75rem;color:var(--muted);font-size:.75rem">Redis: <code>${process.env.REDIS_URL || "redis://localhost:6379"}</code></div>
    </div>
    <div class="card" style="grid-column: span 2">
      <h2>Latency — p50 / p95 / p99 per route (ms)</h2>
      <table><thead><tr><th>Route</th><th>Count</th><th>Avg</th><th>p95</th><th>p99</th><th>Max</th></tr></thead><tbody>${latencyRows}</tbody></table>
      <div style="margin-top:.75rem;color:var(--muted);font-size:.75rem">Window: last 500 samples per route</div>
    </div>
  </div>
  <script>
    async function retryQueue(name) {
      document.getElementById('actionResult').innerText = 'Retrying failed jobs in ' + name + '...';
      try {
        const res = await fetch('/admin/queues/api/' + name + '/retry-all', { method: 'POST' });
        const data = await res.json();
        document.getElementById('actionResult').innerText = 'Retried ' + (data.retried ?? 0) + ' jobs in ' + name;
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        document.getElementById('actionResult').innerText = 'Error: ' + err.message;
      }
    }
    async function cleanCompleted(name) {
      document.getElementById('actionResult').innerText = 'Cleaning ' + name + '...';
      try {
        const res = await fetch('/admin/queues/api/' + name + '/clean', { method: 'POST' });
        const data = await res.json();
        document.getElementById('actionResult').innerText = 'Cleaned ' + (data.cleaned?.length ?? 0) + ' completed jobs';
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        document.getElementById('actionResult').innerText = 'Error: ' + err.message;
      }
    }
  </script>
</body>
</html>`;
    return reply.type("text/html").send(html);
  });

  app.get("/stats", async (_request: FastifyRequest, reply: FastifyReply) => {
    const cpus = os.cpus().length || 1;
    const concurrency = Math.max(2, cpus * 2);
    const queues = await getQueueMetrics();
    const summary = (telemetry.getMetricsSummary() as any) ?? {};
    const redis = getRedisClient();
    let redisInfo: Record<string, unknown> = { connected: false };
    if (redis) {
      try {
        const info = await redis.info("memory");
        const connected = redis.status === "ready" || redis.status === "connecting";
        redisInfo = { connected, status: redis.status, memoryInfo: info.split("\n").slice(0, 5).join(" ").trim() };
      } catch {
        redisInfo = { connected: false, status: redis?.status ?? "unknown" };
      }
    }
    return reply.send({
      queues,
      latency: summary.latency,
      slo: summary.slo,
      counters: summary.counters,
      activeExecutions: summary.activeExecutions,
      concurrency,
      cpus,
      redis: redisInfo,
      status: summary.slo?.status === "ok" ? "ok" : "breach",
      enabled: process.env.QUEUE_ENABLED === "true" || process.env.NODE_ENV === "production",
    });
  });

  // REST API endpoints for Bull Board integrations
  app.get("/api/queues", async (_request, reply) => {
    const metrics = await getQueueMetrics();
    return reply.send({
      queues: [
        { name: "workflows", counts: metrics.workflows },
        { name: "workflows-dlq", counts: metrics.dlq },
      ],
    });
  });

  app.get("/api/:queueName/jobs", async (request, reply) => {
    const { queueName } = request.params as { queueName: string };
    const query = (request.query ?? {}) as { status?: string; start?: string; end?: string };
    const types = query.status ? [query.status as any] : ["failed", "active", "waiting"];
    const start = Number(query.start || 0);
    const end = Number(query.end || 50);
    const jobs = await getQueueJobs(queueName, types, start, end);
    return reply.send({ queue: queueName, jobs });
  });

  app.post("/api/:queueName/retry-all", async (request, reply) => {
    const { queueName } = request.params as { queueName: string };
    const retried = await retryFailedJobs(queueName);
    return reply.send({ ok: true, queue: queueName, retried });
  });

  app.post("/api/:queueName/jobs/:jobId/retry", async (request, reply) => {
    const { queueName, jobId } = request.params as { queueName: string; jobId: string };
    const success = await retryJob(queueName, jobId);
    if (!success) return reply.code(404).send({ error: "Job not found or retry failed", code: "NOT_FOUND" });
    return reply.send({ ok: true, queue: queueName, jobId });
  });

  app.post("/api/:queueName/clean", async (request, reply) => {
    const { queueName } = request.params as { queueName: string };
    const cleaned = await cleanQueue(queueName, 0, 1000, "completed");
    return reply.send({ ok: true, queue: queueName, cleaned });
  });

  app.post("/api/:queueName/pause", async (request, reply) => {
    const { queueName } = request.params as { queueName: string };
    const ok = await pauseQueue(queueName);
    return reply.send({ ok, queue: queueName, status: "paused" });
  });

  app.post("/api/:queueName/resume", async (request, reply) => {
    const { queueName } = request.params as { queueName: string };
    const ok = await resumeQueue(queueName);
    return reply.send({ ok, queue: queueName, status: "resumed" });
  });
}
