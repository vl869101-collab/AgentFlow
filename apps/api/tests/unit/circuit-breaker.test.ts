import { describe, it, expect, beforeEach } from "vitest";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from "../../src/services/executor/circuit-breaker.js";

describe("CircuitBreaker", () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 100, // short cooldown for tests
      halfOpenSuccessThreshold: 2,
    });
  });

  it("starts in CLOSED state and allows successful calls", async () => {
    const result = await cb.execute("service-a", async () => "ok");
    expect(result).toBe("ok");
    expect(cb.getState("service-a")).toBe("CLOSED");
  });

  it("transitions to OPEN when failureThreshold is reached", async () => {
    const failingCall = async () => {
      throw new Error("Network error");
    };

    // 1st failure
    await expect(cb.execute("service-b", failingCall)).rejects.toThrow("Network error");
    expect(cb.getState("service-b")).toBe("CLOSED");

    // 2nd failure
    await expect(cb.execute("service-b", failingCall)).rejects.toThrow("Network error");
    expect(cb.getState("service-b")).toBe("CLOSED");

    // 3rd failure -> trips circuit to OPEN
    await expect(cb.execute("service-b", failingCall)).rejects.toThrow("Network error");
    expect(cb.getState("service-b")).toBe("OPEN");
    expect(cb.isOpen("service-b")).toBe(true);

    // Immediate next call should fail with CircuitBreakerOpenError without executing fn
    await expect(cb.execute("service-b", async () => "should not run")).rejects.toThrow(
      CircuitBreakerOpenError,
    );
  });

  it("transitions from OPEN to HALF_OPEN after cooldown and closes after success threshold", async () => {
    // Trip to OPEN
    for (let i = 0; i < 3; i++) {
      await expect(
        cb.execute("service-c", async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow();
    }
    expect(cb.getState("service-c")).toBe("OPEN");

    // Wait for resetTimeoutMs
    await new Promise((r) => setTimeout(r, 120));

    expect(cb.getState("service-c")).toBe("HALF_OPEN");

    // 1st success in HALF_OPEN
    const r1 = await cb.execute("service-c", async () => "trial-1");
    expect(r1).toBe("trial-1");
    expect(cb.getState("service-c")).toBe("HALF_OPEN");

    // 2nd success in HALF_OPEN -> closes circuit
    const r2 = await cb.execute("service-c", async () => "trial-2");
    expect(r2).toBe("trial-2");
    expect(cb.getState("service-c")).toBe("CLOSED");
  });

  it("transitions from HALF_OPEN back to OPEN immediately if trial call fails", async () => {
    for (let i = 0; i < 3; i++) {
      await expect(
        cb.execute("service-d", async () => {
          throw new Error("fail");
        }),
      ).rejects.toThrow();
    }
    expect(cb.getState("service-d")).toBe("OPEN");

    await new Promise((r) => setTimeout(r, 120));
    expect(cb.getState("service-d")).toBe("HALF_OPEN");

    // Trial call fails -> trips back to OPEN immediately
    await expect(
      cb.execute("service-d", async () => {
        throw new Error("trial failed");
      }),
    ).rejects.toThrow("trial failed");

    expect(cb.getState("service-d")).toBe("OPEN");
  });

  it("can get metrics and reset circuit", async () => {
    cb.recordFailure("service-e");
    const metrics = cb.getMetrics("service-e");
    expect(metrics.failureCount).toBe(1);
    expect(metrics.state).toBe("CLOSED");

    cb.reset("service-e");
    expect(cb.getMetrics("service-e").failureCount).toBe(0);
  });
});
