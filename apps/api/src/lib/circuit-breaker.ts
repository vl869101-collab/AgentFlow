export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenSuccessThreshold?: number;
  timeoutMs?: number;
}

export class CircuitBreakerOpenError extends Error {
  readonly host: string;
  readonly code = "CIRCUIT_BREAKER_OPEN";
  readonly statusCode = 503;

  constructor(host: string, message?: string) {
    super(message || `Circuit breaker is OPEN for host '${host}'. Outbound requests temporarily blocked.`);
    this.name = "CircuitBreakerOpenError";
    this.host = host;
  }
}

interface CircuitMetrics {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  consecutiveSuccesses: number;
  lastFailureTime?: number;
  nextAttemptTime?: number;
}

export class CircuitBreaker {
  private failureThreshold: number;
  private resetTimeoutMs: number;
  private halfOpenSuccessThreshold: number;
  private timeoutMs: number;
  private circuits: Map<string, CircuitMetrics> = new Map();

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000; // 30 seconds cooldown
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold ?? 2;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  private getOrCreateCircuit(key: string): CircuitMetrics {
    let circuit = this.circuits.get(key);
    if (!circuit) {
      circuit = {
        state: "CLOSED",
        failureCount: 0,
        successCount: 0,
        consecutiveSuccesses: 0,
      };
      this.circuits.set(key, circuit);
    }
    return circuit;
  }

  getState(key: string): CircuitBreakerState {
    const circuit = this.getOrCreateCircuit(key);
    const now = Date.now();

    if (circuit.state === "OPEN" && circuit.nextAttemptTime && now >= circuit.nextAttemptTime) {
      circuit.state = "HALF_OPEN";
      circuit.consecutiveSuccesses = 0;
    }

    return circuit.state;
  }

  isOpen(key: string): boolean {
    return this.getState(key) === "OPEN";
  }

  recordSuccess(key: string): void {
    const circuit = this.getOrCreateCircuit(key);
    circuit.successCount++;

    if (circuit.state === "HALF_OPEN") {
      circuit.consecutiveSuccesses++;
      if (circuit.consecutiveSuccesses >= this.halfOpenSuccessThreshold) {
        circuit.state = "CLOSED";
        circuit.failureCount = 0;
        circuit.consecutiveSuccesses = 0;
        circuit.lastFailureTime = undefined;
        circuit.nextAttemptTime = undefined;
      }
    } else if (circuit.state === "CLOSED") {
      circuit.failureCount = 0;
    }
  }

  recordFailure(key: string): void {
    const circuit = this.getOrCreateCircuit(key);
    const now = Date.now();
    circuit.failureCount++;
    circuit.lastFailureTime = now;

    if (circuit.state === "HALF_OPEN") {
      // Immediate trip back to OPEN upon trial failure
      circuit.state = "OPEN";
      circuit.nextAttemptTime = now + this.resetTimeoutMs;
      circuit.consecutiveSuccesses = 0;
    } else if (circuit.state === "CLOSED" && circuit.failureCount >= this.failureThreshold) {
      circuit.state = "OPEN";
      circuit.nextAttemptTime = now + this.resetTimeoutMs;
    }
  }

  reset(key: string): void {
    this.circuits.delete(key);
  }

  clear(): void {
    this.circuits.clear();
  }

  getMetrics(key: string): CircuitMetrics {
    const circuit = this.getOrCreateCircuit(key);
    return {
      state: this.getState(key),
      failureCount: circuit.failureCount,
      successCount: circuit.successCount,
      consecutiveSuccesses: circuit.consecutiveSuccesses,
      lastFailureTime: circuit.lastFailureTime,
      nextAttemptTime: circuit.nextAttemptTime,
    };
  }

  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const state = this.getState(key);
    if (state === "OPEN") {
      throw new CircuitBreakerOpenError(key);
    }

    try {
      const result = await fn();
      this.recordSuccess(key);
      return result;
    } catch (err: any) {
      this.recordFailure(key);
      throw err;
    }
  }
}

export const httpCircuitBreaker = new CircuitBreaker();
