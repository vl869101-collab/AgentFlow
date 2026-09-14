import { EventEmitter } from "node:events";
import { getRedisClient } from "../lib/redis.js";
import type { Redis as RedisInstance } from "ioredis";

export interface ExecutionTelemetryEvent {
  id: string;
  seq: number;
  executionId: string;
  nodeId?: string;
  eventType: "execution_started" | "node_started" | "node_finished" | "execution_finished";
  status: string;
  duration?: number;
  timestamp: string;
  output?: unknown;
  error?: string;
}

export interface PublishTelemetryEventInput {
  executionId: string;
  nodeId?: string;
  eventType: "execution_started" | "node_started" | "node_finished" | "execution_finished";
  status: string;
  duration?: number;
  output?: unknown;
  error?: string;
}

const SENSITIVE_KEY_PATTERN = /(password|token|secret|authorization|credential|api[-_]?key|private[-_]?key)/i;

/**
 * Recursively masks sensitive credentials in output payloads before telemetry emission.
 */
export function maskSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;
  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item));
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = "***";
    } else if (typeof value === "object" && value !== null) {
      result[key] = maskSensitiveData(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

const MAX_BUFFERED_EVENTS_PER_EXECUTION = 100;
const executionEventBuffer = new Map<string, ExecutionTelemetryEvent[]>();
const executionSeqCounters = new Map<string, number>();

// In-memory fallback EventEmitter
const telemetryEmitter = new EventEmitter();
telemetryEmitter.setMaxListeners(250);

export function getTelemetryChannel(executionId: string): string {
  return `execution:events:${executionId}`;
}

/**
 * Publishes a telemetry event to both in-memory emitter and Redis Pub/Sub if configured.
 * Stores event in a sliding buffer for replay support via Last-Event-ID.
 */
export async function publishTelemetryEvent(
  input: PublishTelemetryEventInput
): Promise<ExecutionTelemetryEvent> {
  const { executionId, nodeId, eventType, status, duration, output, error } = input;
  const currentSeq = (executionSeqCounters.get(executionId) ?? 0) + 1;
  executionSeqCounters.set(executionId, currentSeq);

  const event: ExecutionTelemetryEvent = {
    id: `${executionId}:${currentSeq}`,
    seq: currentSeq,
    executionId,
    ...(nodeId ? { nodeId } : {}),
    eventType,
    status,
    ...(duration !== undefined ? { duration } : {}),
    timestamp: new Date().toISOString(),
    ...(output !== undefined ? { output: maskSensitiveData(output) } : {}),
    ...(error !== undefined ? { error } : {}),
  };

  // 1. Store in sliding buffer
  const buffer = executionEventBuffer.get(executionId) ?? [];
  buffer.push(event);
  if (buffer.length > MAX_BUFFERED_EVENTS_PER_EXECUTION) {
    executionEventBuffer.set(executionId, buffer.slice(-MAX_BUFFERED_EVENTS_PER_EXECUTION));
  } else {
    executionEventBuffer.set(executionId, buffer);
  }

  // 2. Emit via in-memory EventEmitter
  telemetryEmitter.emit(getTelemetryChannel(executionId), event);

  // 3. Publish to Redis Pub/Sub if client is connected
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.publish(getTelemetryChannel(executionId), JSON.stringify(event));
    } catch (err) {
      console.warn(`[Telemetry] Redis publish warning for ${executionId}:`, (err as Error).message);
    }
  }

  return event;
}

/**
 * Replays missed events after `lastEventId` from the sliding buffer.
 */
export function getEventsAfter(
  executionId: string,
  lastEventId?: string
): ExecutionTelemetryEvent[] {
  const buffer = executionEventBuffer.get(executionId) ?? [];
  if (!lastEventId) {
    return [...buffer];
  }

  let lastSeq: number | null = null;
  const parts = lastEventId.split(":");
  if (parts.length === 2 && parts[0] === executionId) {
    const parsed = Number.parseInt(parts[1], 10);
    if (!Number.isNaN(parsed)) {
      lastSeq = parsed;
    }
  }

  if (lastSeq !== null) {
    return buffer.filter((e) => e.seq > lastSeq!);
  }

  const index = buffer.findIndex((e) => e.id === lastEventId);
  if (index >= 0) {
    return buffer.slice(index + 1);
  }

  return [...buffer];
}

/**
 * Subscribes to real-time telemetry events for an execution.
 * Uses Redis Pub/Sub with automatic in-memory fallback.
 * Returns an asynchronous cleanup/unsubscribe function.
 */
export async function subscribeToExecutionTelemetry(
  executionId: string,
  onEvent: (event: ExecutionTelemetryEvent) => void
): Promise<() => Promise<void>> {
  const channel = getTelemetryChannel(executionId);
  const redis = getRedisClient();
  let subscriberClient: RedisInstance | null = null;
  let isUsingRedis = false;

  const memoryListener = (event: ExecutionTelemetryEvent) => {
    onEvent(event);
  };

  if (redis) {
    try {
      subscriberClient = (redis as any).duplicate();
      if (subscriberClient) {
        await subscriberClient.subscribe(channel);
        subscriberClient.on("message", (chan: string, message: string) => {
          if (chan === channel) {
            try {
              const parsed = JSON.parse(message) as ExecutionTelemetryEvent;
              onEvent(parsed);
            } catch (err) {
              console.warn("[Telemetry] Failed to parse Redis message:", err);
            }
          }
        });
        isUsingRedis = true;
      }
    } catch (err) {
      console.warn(`[Telemetry] Redis subscription fallback to in-memory for ${channel}:`, (err as Error).message);
      if (subscriberClient) {
        try {
          subscriberClient.disconnect();
        } catch {}
        subscriberClient = null;
      }
      isUsingRedis = false;
    }
  }

  if (!isUsingRedis) {
    telemetryEmitter.on(channel, memoryListener);
  }

  return async () => {
    if (isUsingRedis && subscriberClient) {
      try {
        await subscriberClient.unsubscribe(channel);
        subscriberClient.disconnect();
      } catch (err) {
        console.warn("[Telemetry] Cleanup error on Redis unsubscribe:", (err as Error).message);
      }
    } else {
      telemetryEmitter.off(channel, memoryListener);
    }
  };
}

/**
 * Resets buffer and in-memory listeners (primarily for test cleanup).
 */
export function resetTelemetryStore(): void {
  executionEventBuffer.clear();
  executionSeqCounters.clear();
  telemetryEmitter.removeAllListeners();
}
