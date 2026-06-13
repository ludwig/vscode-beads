// src/backend/__tests__/doltErrors.test.ts
import { isEmbeddedLockError } from "../doltErrors";

describe("isEmbeddedLockError", () => {
  it("matches the exclusive-lock message", () => {
    expect(isEmbeddedLockError("embeddeddolt: another process holds the exclusive lock on /x")).toBe(true);
  });

  it("matches the single-writer message", () => {
    expect(isEmbeddedLockError("the embedded backend supports only one writer at a time")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isEmbeddedLockError("ANOTHER PROCESS HOLDS the lock")).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isEmbeddedLockError("bd: project not initialized")).toBe(false);
  });

  it("returns false for an empty message", () => {
    expect(isEmbeddedLockError("")).toBe(false);
  });
});
