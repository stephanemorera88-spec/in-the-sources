/**
 * Concurrency limiter: at most `max` tasks run at once, the rest wait in
 * arrival order. Hand-written so the run orchestration needs no dependency.
 */
export function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  if (!Number.isInteger(max) || max < 1) throw new Error("concurrency must be a positive integer");
  let active = 0;
  const waiters: Array<() => void> = [];
  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) {
      // A finishing task hands its slot straight to the next waiter, so
      // `active` stays as it is and the cap can never be overshot.
      await new Promise<void>((resolve) => waiters.push(resolve));
    } else {
      active += 1;
    }
    try {
      return await task();
    } finally {
      const next = waiters.shift();
      if (next) next();
      else active -= 1;
    }
  };
}
