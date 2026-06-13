// src/backend/retry.ts

export interface LockRetryOptions {
  /** Given an error message, return true if the call should be retried. */
  isRetryable: (message: string) => boolean;
  /** Delay before each retry. delaysMs.length === max retry count. */
  delaysMs: number[];
  /** Injectable for tests; defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying when it throws a retryable error. Waits delaysMs[i] before
 * retry i. After the delays are exhausted (or on a non-retryable error),
 * rethrows the last error.
 */
export async function withLockRetry<T>(fn: () => Promise<T>, opts: LockRetryOptions): Promise<T> {
  const sleep = opts.sleep ?? realSleep;
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.delaysMs.length; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= opts.delaysMs.length || !opts.isRetryable(message)) {
        throw error;
      }
      await sleep(opts.delaysMs[attempt]);
    }
  }
  throw lastError;
}
