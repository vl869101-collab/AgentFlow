import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";

// ═══════════════════════════════════════════
// W3C Trace Context & OpenTelemetry Types
// ═══════════════════════════════════════════

export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: string;
  traceState?: string;
}

export type SpanStatusCode = "UNSET" | "OK" | "ERROR";

export interface SpanData {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  attributes: Record<string, string | number | boolean>;
  status: { code: SpanStatusCode; description?: string };
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
}

export class Span {
  private data: SpanData;
  private ended = false;

  constructor(
    name: string,
    traceId: string,
    spanId: string,
    parentSpanId?: string,
    attributes: Record<string, string | number | boolean> = {}
  ) {
    this.data = {
      name,
      traceId,
      spanId,
      parentSpanId,
      startTime: performance.now(),
      attributes: { ...attributes },
      status: { code: "UNSET" },
      events: [],
    };
  }

  get traceId(): string {
    return this.data.traceId;
  }

  get spanId(): string {
    return this.data.spanId;
  }

  get parentSpanId(): string | undefined {
    return this.data.parentSpanId;
  }

  get name(): string {
    return this.data.name;
  }

  get status(): { code: SpanStatusCode; description?: string } {
    return this.data.status;
  }

  get attributes(): Record<string, string | number | boolean> {
    return this.data.attributes;
  }

  get events(): Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }> {
    return this.data.events;
  }

  get durationMs(): number | undefined {
    return this.data.durationMs;
  }

  get startTime(): number {
    return this.data.startTime;
  }

  get endTime(): number | undefined {
    return this.data.endTime;
  }

  setAttribute(key: string, value: string | number | boolean): this {
    if (!this.ended) {
      this.data.attributes[key] = value;
    }
    return this;
  }

  setAttributes(attrs: Record<string, string | number | boolean>): this {
    if (!this.ended) {
      Object.assign(this.data.attributes, attrs);
    }
    return this;
  }

  setStatus(code: SpanStatusCode, description?: string): this {
    if (!this.ended) {
      this.data.status = { code, description };
    }
    return this;
  }

  recordException(err: Error | unknown): this {
    if (!this.ended) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setStatus("ERROR", error.message);
      this.addEvent("exception", {
        "exception.type": error.name,
        "exception.message": error.message,
        "exception.stacktrace": error.stack || "",
      });
    }
    return this;
  }

  addEvent(name: string, attributes?: Record<string, unknown>): this {
    if (!this.ended) {
      this.data.events.push({
        name,
        timestamp: performance.now(),
        attributes,
      });
    }
    return this;
  }

  end(): SpanData {
    if (!this.ended) {
      this.ended = true;
      this.data.endTime = performance.now();
      this.data.durationMs = Math.round((this.data.endTime - this.data.startTime) * 100) / 100;
      if (this.data.status.code === "UNSET") {
        this.data.status.code = "OK";
      }
      telemetry.recordSpan(this.data);
    }
    return this.data;
  }

  toJSON(): SpanData {
    return { ...this.data };
  }
}

// ═══════════════════════════════════════════
// Telemetry Registry & Metrics Collector
// ═══════════════════════════════════════════

class TelemetryManager {
  private completedSpans: SpanData[] = [];
  private readonly maxSpansToRetain = 1000;

  // Prometheus Metrics Storage
  private httpRequestsTotal = new Map<string, number>();
  private httpRequestDurations = new Map<string, number[]>();
  private workflowExecutionsTotal = new Map<string, number>();
  private workflowExecutionDurations = new Map<string, number[]>();
  private aiGenerationsTotal = new Map<string, number>();
  private quotaExceededTotal = new Map<string, number>();
  private activeExecutions = 0;

  generateTraceId(): string {
    return randomBytes(16).toString("hex");
  }

  generateSpanId(): string {
    return randomBytes(8).toString("hex");
  }

  parseTraceParent(header?: string | null): TraceContext | null {
    if (!header || typeof header !== "string") return null;
    const parts = header.trim().split("-");
    if (parts.length < 4) return null;
    const [version, traceId, spanId, traceFlags] = parts;
    if (version !== "00" || traceId.length !== 32 || spanId.length !== 16) return null;
    return { traceId, spanId, traceFlags };
  }

  formatTraceParent(ctx: TraceContext | Span): string {
    const traceId = ctx instanceof Span ? ctx.traceId : ctx.traceId;
    const spanId = ctx instanceof Span ? ctx.spanId : ctx.spanId;
    const traceFlags = ctx instanceof Span ? "01" : ctx.traceFlags || "01";
    return `00-${traceId}-${spanId}-${traceFlags}`;
  }

  injectTraceContext(carrier: Record<string, any>, context?: TraceContext | Span | null): Record<string, any> {
    if (!carrier) carrier = {};
    const ctx: TraceContext = context
      ? (context instanceof Span
          ? { traceId: context.traceId, spanId: context.spanId, traceFlags: "01" }
          : context)
      : {
          traceId: this.generateTraceId(),
          spanId: this.generateSpanId(),
          traceFlags: "01",
        };

    if (ctx && ctx.traceId && ctx.spanId) {
      carrier["traceparent"] = this.formatTraceParent(ctx);
      if (ctx.traceState) {
        carrier["tracestate"] = ctx.traceState;
      }
    }
    return carrier;
  }

  extractTraceContext(carrier?: Record<string, any> | null): TraceContext | null {
    if (!carrier || typeof carrier !== "object") return null;
    const header =
      carrier["traceparent"] ||
      carrier["Traceparent"] ||
      carrier["TRACEPARENT"] ||
      carrier["traceParent"] ||
      carrier["x-traceparent"] ||
      (typeof (carrier as any).get === "function" ? (carrier as any).get("traceparent") || (carrier as any).get("Traceparent") : undefined);

    const traceState =
      carrier["tracestate"] ||
      carrier["Tracestate"] ||
      carrier["TRACESTATE"] ||
      carrier["traceState"] ||
      (typeof (carrier as any).get === "function" ? (carrier as any).get("tracestate") || (carrier as any).get("Tracestate") : undefined);

    const parsed = this.parseTraceParent(typeof header === "string" ? header : undefined);
    if (parsed && typeof traceState === "string") {
      parsed.traceState = traceState;
    }
    return parsed;
  }

  startSpan(
    name: string,
    attributes: Record<string, string | number | boolean> = {},
    parentContext?: TraceContext | null
  ): Span {
    const traceId = parentContext?.traceId || this.generateTraceId();
    const spanId = this.generateSpanId();
    const parentSpanId = parentContext?.spanId;
    return new Span(name, traceId, spanId, parentSpanId, attributes);
  }

  startNodeSpan(
    nodeType: string,
    nodeId: string,
    workflowId: string,
    executionId: string,
    orgId: string,
    attributes: Record<string, string | number | boolean> = {},
    parentContext?: TraceContext | null
  ): Span {
    const spanName = `agentflow.node.${nodeType}`;
    const baseAttrs: Record<string, string | number | boolean> = {
      "workflow.id": workflowId,
      "execution.id": executionId,
      "node.id": nodeId,
      "node.type": nodeType,
      "org.id": orgId,
      ...attributes,
    };
    return this.startSpan(spanName, baseAttrs, parentContext);
  }

  recordSpan(span: SpanData): void {
    this.completedSpans.push(span);
    if (this.completedSpans.length > this.maxSpansToRetain) {
      this.completedSpans.splice(0, this.completedSpans.length - this.maxSpansToRetain);
    }
  }

  getRecentSpans(limit = 100): SpanData[] {
    return this.completedSpans.slice(-limit);
  }

  getSpansByTraceId(traceId: string): SpanData[] {
    return this.completedSpans.filter((s) => s.traceId === traceId);
  }

  getSpansByExecutionId(executionId: string): SpanData[] {
    return this.completedSpans.filter((s) => s.attributes["execution.id"] === executionId);
  }

  // ── OTLP Exporter Representation ────────────

  exportSpansOTLP(): { resourceSpans: Array<Record<string, any>> } {
    const spans = this.getRecentSpans(500);

    const otlpSpans = spans.map((span) => {
      const attributes = Object.entries(span.attributes).map(([key, value]) => ({
        key,
        value: typeof value === "number"
          ? (Number.isInteger(value) ? { intValue: value } : { doubleValue: value })
          : typeof value === "boolean"
            ? { boolValue: value }
            : { stringValue: String(value) },
      }));

      const events = span.events.map((evt) => ({
        timeUnixNano: String(Math.floor(evt.timestamp * 1_000_000)),
        name: evt.name,
        attributes: evt.attributes
          ? Object.entries(evt.attributes).map(([k, v]) => ({
              key: k,
              value: { stringValue: String(v) },
            }))
          : [],
      }));

      return {
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId || undefined,
        name: span.name,
        kind: 1, // SPAN_KIND_INTERNAL
        startTimeUnixNano: String(Math.floor(span.startTime * 1_000_000)),
        endTimeUnixNano: span.endTime ? String(Math.floor(span.endTime * 1_000_000)) : undefined,
        attributes,
        events,
        status: {
          code: span.status.code === "OK" ? 1 : span.status.code === "ERROR" ? 2 : 0,
          message: span.status.description,
        },
      };
    });

    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "agentflow-api" } },
              { key: "service.version", value: { stringValue: "0.1.0" } },
              { key: "telemetry.sdk.language", value: { stringValue: "nodejs" } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: "@agentflow/api", version: "0.1.0" },
              spans: otlpSpans,
            },
          ],
        },
      ],
    };
  }

  // ── Metrics Recording ───────────────────────

  private computePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
  }

  getP95ForRoute(method: string, route: string): number {
    const key = `method="${method}",route="${route || "unknown"}"`;
    const list = this.httpRequestDurations.get(key) || [];
    return this.computePercentile(list, 95);
  }

  getLatencySummary(): Array<{ route: string; count: number; avg: number; p50: number; p95: number; p99: number; max: number }> {
    const out: Array<{ route: string; count: number; avg: number; p50: number; p95: number; p99: number; max: number }> = [];
    for (const [labels, durs] of this.httpRequestDurations) {
      if (durs.length === 0) continue;
      const sum = durs.reduce((a, b) => a + b, 0);
      out.push({
        route: labels,
        count: durs.length,
        avg: Number((sum / durs.length).toFixed(2)),
        p50: Number(this.computePercentile(durs, 50).toFixed(2)),
        p95: Number(this.computePercentile(durs, 95).toFixed(2)),
        p99: Number(this.computePercentile(durs, 99).toFixed(2)),
        max: Number(Math.max(...durs).toFixed(2)),
      });
    }
    return out.sort((a, b) => b.p95 - a.p95);
  }

  recordHttpRequest(method: string, route: string, statusCode: number, durationMs: number): void {
    const statusCategory = `${Math.floor(statusCode / 100)}xx`;
    const key = `method="${method}",route="${route || "unknown"}",status_code="${statusCode}",status_category="${statusCategory}"`;
    this.httpRequestsTotal.set(key, (this.httpRequestsTotal.get(key) || 0) + 1);

    const durKey = `method="${method}",route="${route || "unknown"}"`;
    const list = this.httpRequestDurations.get(durKey) || [];
    list.push(durationMs);
    if (list.length > 500) list.shift();
    this.httpRequestDurations.set(durKey, list);
  }

  recordWorkflowExecution(status: string, trigger: string, orgId?: string, durationMs?: number): void {
    const key = `status="${status}",trigger="${trigger}",org_id="${orgId || "none"}"`;
    this.workflowExecutionsTotal.set(key, (this.workflowExecutionsTotal.get(key) || 0) + 1);

    if (durationMs !== undefined) {
      const durKey = `status="${status}",trigger="${trigger}"`;
      const list = this.workflowExecutionDurations.get(durKey) || [];
      list.push(durationMs);
      if (list.length > 200) list.shift();
      this.workflowExecutionDurations.set(durKey, list);
    }
  }

  recordAiGeneration(status: string, model: string): void {
    const key = `status="${status}",model="${model}"`;
    this.aiGenerationsTotal.set(key, (this.aiGenerationsTotal.get(key) || 0) + 1);
  }

  recordQuotaExceeded(type: string, orgId?: string): void {
    const key = `type="${type}",org_id="${orgId || "none"}"`;
    this.quotaExceededTotal.set(key, (this.quotaExceededTotal.get(key) || 0) + 1);
  }

  incActiveExecutions(): void {
    this.activeExecutions++;
  }

  decActiveExecutions(): void {
    this.activeExecutions = Math.max(0, this.activeExecutions - 1);
  }

  // ── Export Formatters ───────────────────────

  getPrometheusMetrics(): string {
    const lines: string[] = [];

    lines.push("# HELP http_requests_total Total number of HTTP requests processed");
    lines.push("# TYPE http_requests_total counter");
    for (const [labels, val] of this.httpRequestsTotal) {
      lines.push(`http_requests_total{${labels}} ${val}`);
    }

    lines.push("\n# HELP http_request_duration_ms HTTP request duration in ms (summary with p50/p95/p99)");
    lines.push("# TYPE http_request_duration_ms summary");
    for (const [labels, durs] of this.httpRequestDurations) {
      const sum = durs.reduce((a, b) => a + b, 0);
      const count = durs.length;
      const avg = count ? (sum / count).toFixed(2) : "0";
      const p50 = count ? this.computePercentile(durs, 50).toFixed(2) : "0";
      const p95 = count ? this.computePercentile(durs, 95).toFixed(2) : "0";
      const p99 = count ? this.computePercentile(durs, 99).toFixed(2) : "0";
      lines.push(`http_request_duration_ms_sum{${labels}} ${sum.toFixed(2)}`);
      lines.push(`http_request_duration_ms_count{${labels}} ${count}`);
      lines.push(`http_request_duration_ms_avg{${labels}} ${avg}`);
      lines.push(`http_request_duration_ms{${labels},quantile="0.5"} ${p50}`);
      lines.push(`http_request_duration_ms{${labels},quantile="0.95"} ${p95}`);
      lines.push(`http_request_duration_ms{${labels},quantile="0.99"} ${p99}`);
    }

    lines.push("\n# HELP workflow_executions_total Total workflow executions");
    lines.push("# TYPE workflow_executions_total counter");
    for (const [labels, val] of this.workflowExecutionsTotal) {
      lines.push(`workflow_executions_total{${labels}} ${val}`);
    }

    lines.push("\n# HELP active_workflow_executions Current number of actively running executions");
    lines.push("# TYPE active_workflow_executions gauge");
    lines.push(`active_workflow_executions ${this.activeExecutions}`);

    lines.push("\n# HELP ai_generations_total Total AI workflow generations");
    lines.push("# TYPE ai_generations_total counter");
    for (const [labels, val] of this.aiGenerationsTotal) {
      lines.push(`ai_generations_total{${labels}} ${val}`);
    }

    lines.push("\n# HELP quota_exceeded_total Total quota exceeded rejections");
    lines.push("# TYPE quota_exceeded_total counter");
    for (const [labels, val] of this.quotaExceededTotal) {
      lines.push(`quota_exceeded_total{${labels}} ${val}`);
    }

    return lines.join("\n") + "\n";
  }

  getMetricsSummary() {
    let totalRequests = 0;
    for (const val of this.httpRequestsTotal.values()) totalRequests += val;

    let totalExecutions = 0;
    for (const val of this.workflowExecutionsTotal.values()) totalExecutions += val;

    let totalAi = 0;
    for (const val of this.aiGenerationsTotal.values()) totalAi += val;

    const latency = this.getLatencySummary();
    const violations = latency.filter((l) => l.p95 > 300);

    return {
      service: "agentflow-api",
      timestamp: new Date().toISOString(),
      activeExecutions: this.activeExecutions,
      counters: {
        httpRequests: totalRequests,
        workflowExecutions: totalExecutions,
        aiGenerations: totalAi,
      },
      spansRecorded: this.completedSpans.length,
      latency,
      slo: {
        p95BudgetMs: 300,
        violations: violations.length,
        violatingRoutes: violations.map((v) => ({ route: v.route, p95: v.p95 })),
        status: violations.length === 0 ? "ok" : "breach",
      },
    };
  }

  reset(): void {
    this.completedSpans = [];
    this.httpRequestsTotal.clear();
    this.httpRequestDurations.clear();
    this.workflowExecutionsTotal.clear();
    this.workflowExecutionDurations.clear();
    this.aiGenerationsTotal.clear();
    this.quotaExceededTotal.clear();
    this.activeExecutions = 0;
  }
}

export const telemetry = new TelemetryManager();
