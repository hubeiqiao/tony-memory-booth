// Exponential backoff with jitter. Sleep is injectable so retries are
// instantaneous (and deterministic) in tests.

export interface RetryOptions {
  retries: number; // additional attempts after the first
  baseMs: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  jitter?: () => number; // 0..1 multiplier source; default Math.random
  onRetry?: (attempt: number, err: unknown, delay: number) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions
): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  const maxMs = opts.maxMs ?? 30_000;
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      attempt++;
      if (attempt > opts.retries) throw err;
      const expo = opts.baseMs * 2 ** (attempt - 1);
      const jitter = 0.5 + (opts.jitter ? opts.jitter() : Math.random()) * 0.5;
      const delay = Math.min(maxMs, Math.round(expo * jitter));
      opts.onRetry?.(attempt, err, delay);
      await sleep(delay);
    }
  }
}
