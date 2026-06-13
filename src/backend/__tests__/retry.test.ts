// src/backend/__tests__/retry.test.ts
import { withLockRetry } from "../retry";

const alwaysRetryable = () => true;
const noSleep = async () => {};

describe("withLockRetry", () => {
  it("returns immediately when fn succeeds", async () => {
    let calls = 0;
    const result = await withLockRetry(
      async () => {
        calls++;
        return "ok";
      },
      { isRetryable: alwaysRetryable, delaysMs: [1, 1], sleep: noSleep }
    );
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries retryable errors then succeeds, sleeping between attempts", async () => {
    let calls = 0;
    const slept: number[] = [];
    const result = await withLockRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("locked");
        return "ok";
      },
      { isRetryable: alwaysRetryable, delaysMs: [10, 20, 30], sleep: async (ms) => { slept.push(ms); } }
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(slept).toEqual([10, 20]);
  });

  it("rethrows after delays are exhausted", async () => {
    let calls = 0;
    await expect(
      withLockRetry(
        async () => {
          calls++;
          throw new Error("locked");
        },
        { isRetryable: alwaysRetryable, delaysMs: [1, 1], sleep: noSleep }
      )
    ).rejects.toThrow("locked");
    expect(calls).toBe(3); // initial + 2 retries
  });

  it("does not retry non-retryable errors", async () => {
    let calls = 0;
    await expect(
      withLockRetry(
        async () => {
          calls++;
          throw new Error("fatal");
        },
        { isRetryable: () => false, delaysMs: [1, 1], sleep: noSleep }
      )
    ).rejects.toThrow("fatal");
    expect(calls).toBe(1);
  });
});
