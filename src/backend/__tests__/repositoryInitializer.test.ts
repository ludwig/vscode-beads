// src/backend/__tests__/repositoryInitializer.test.ts
// Covers the pure helpers behind the "Initialize Repository" flow (vs-r6a1):
// name validation and verification-output parsing. The impure orchestration
// (mkdir + bd init + verify spawns) needs a real bd binary and is exercised by
// runtime smoke, not these unit tests.
import {
  validateRepoName,
  doltStatusIsRunning,
  metadataModeIsServer,
  listIsHealthy,
} from "../repositoryInitializer";

describe("validateRepoName", () => {
  it("accepts a clean single-segment name", () => {
    expect(validateRepoName("my-project").ok).toBe(true);
    expect(validateRepoName("foo_bar2").ok).toBe(true);
    expect(validateRepoName("  trimmed  ").ok).toBe(true); // trimmed before check
  });

  it("rejects empty / whitespace", () => {
    expect(validateRepoName("").ok).toBe(false);
    expect(validateRepoName("   ").ok).toBe(false);
  });

  it("rejects slashes and dot segments", () => {
    expect(validateRepoName("a/b").ok).toBe(false);
    expect(validateRepoName("a\\b").ok).toBe(false);
    expect(validateRepoName(".").ok).toBe(false);
    expect(validateRepoName("..").ok).toBe(false);
  });

  it("rejects names not starting with a letter or with bad chars", () => {
    expect(validateRepoName("1abc").ok).toBe(false);
    expect(validateRepoName("-abc").ok).toBe(false);
    expect(validateRepoName("a b").ok).toBe(false);
    expect(validateRepoName("a.b").ok).toBe(false);
  });

  it("supplies a reason on failure", () => {
    const result = validateRepoName("a/b");
    expect(result.ok).toBe(false);
    expect(typeof result.reason).toBe("string");
    expect(result.reason && result.reason.length).toBeGreaterThan(0);
  });
});

describe("doltStatusIsRunning", () => {
  it("is true only with both a running line and a port", () => {
    expect(
      doltStatusIsRunning("Dolt server: running\n  PID:  67512\n  Port: 63926\n")
    ).toBe(true);
  });

  it("is false when stopped or port missing", () => {
    expect(doltStatusIsRunning("Dolt server: stopped")).toBe(false);
    expect(doltStatusIsRunning("Dolt server: running")).toBe(false); // no port
    expect(doltStatusIsRunning("Port: 1234")).toBe(false); // no running line
    expect(doltStatusIsRunning("")).toBe(false);
  });
});

describe("metadataModeIsServer", () => {
  it("is true when dolt_mode is server", () => {
    expect(metadataModeIsServer('{"dolt_mode":"server"}')).toBe(true);
    expect(
      metadataModeIsServer('{ "backend": "dolt", "dolt_mode": "server" }')
    ).toBe(true);
  });

  it("is false for embedded, missing, or malformed", () => {
    expect(metadataModeIsServer('{"dolt_mode":"embedded"}')).toBe(false);
    expect(metadataModeIsServer('{"backend":"dolt"}')).toBe(false);
    expect(metadataModeIsServer("not json")).toBe(false);
    expect(metadataModeIsServer("")).toBe(false);
  });
});

describe("listIsHealthy", () => {
  it("treats a fresh board's empty listing as healthy", () => {
    expect(listIsHealthy("No issues found.")).toBe(true);
  });

  it("treats a normal non-error listing as healthy", () => {
    expect(listIsHealthy("vs-1 [open] Something\nvs-2 [done] Else")).toBe(true);
  });

  it("flags obvious error / uninitialized output", () => {
    expect(listIsHealthy("Error: not initialized")).toBe(false);
    expect(listIsHealthy("command failed")).toBe(false);
  });
});
