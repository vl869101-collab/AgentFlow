export interface ConcurrencyPool {
  <T>(fn: () => Promise<T>): Promise<T>;
  run<T>(fn: () => Promise<T>): Promise<T>;
  readonly activeCount: number;
  readonly pendingCount: number;
  readonly concurrency: number;
  clearQueue(reason?: Error): void;
}

/**
 * Creates an asynchronous concurrency pool / semaphore.
 * Restricts the number of concurrent asynchronous operations to `concurrency`.
 *
 * @param concurrency Maximum number of concurrent tasks (default: 8)
 */
export function createConcurrencyPool(concurrency: number = 8): ConcurrencyPool {
  const limit = Math.max(1, Math.floor(concurrency || 8));
  let active = 0;
  const queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  const next = () => {
    active--;
    if (queue.length > 0) {
      const item = queue.shift()!;
      active++;
      item.resolve();
    }
  };

  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    let acquired = false;
    if (active >= limit) {
      await new Promise<void>((resolve, reject) => queue.push({ resolve, reject }));
      acquired = true;
    } else {
      active++;
      acquired = true;
    }
    try {
      return await fn();
    } finally {
      if (acquired) {
        next();
      }
    }
  };

  Object.defineProperties(run, {
    run: { value: run, writable: true, configurable: true },
    activeCount: {
      get() {
        return active;
      },
      configurable: true,
    },
    pendingCount: {
      get() {
        return queue.length;
      },
      configurable: true,
    },
    concurrency: {
      get() {
        return limit;
      },
      configurable: true,
    },
    clearQueue: {
      value: (reason?: Error) => {
        const error = reason ?? new Error("Concurrency pool queue cleared");
        while (queue.length > 0) {
          const item = queue.shift()!;
          item.reject(error);
        }
      },
      writable: true,
      configurable: true,
    },
  });

  return run as ConcurrencyPool;
}
