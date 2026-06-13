// src/backend/__tests__/command-runner-lock.test.ts
import { BeadsCommandRunner } from "../BeadsCommandRunner";
import { Logger } from "../../utils/logger";

function makeRunner() {
  const stubLog = {
    child: () => stubLog,
    info() {}, debug() {}, trace() {}, warn() {}, error() {},
    errorNotify: async () => {},
  } as unknown as Logger;
  const runner = new BeadsCommandRunner({ bdPath: "bd", cwd: "/x", beadsDir: "/x/.beads", log: stubLog });
  // bypass the version/compat gate
  (runner as unknown as { checkCompatibility: () => Promise<unknown> }).checkCompatibility = async () => ({
    supported: true,
    minimumVersion: "0.51.0",
    message: "ok",
  });
  return runner;
}

function lockError(): Error & { stderr: string } {
  const e = new Error("Command failed") as Error & { stderr: string };
  e.stderr = "embeddeddolt: another process holds the exclusive lock on /x";
  return e;
}

describe("BeadsCommandRunner lock handling", () => {
  it("retries an embedded lock error then succeeds", async () => {
    const runner = makeRunner();
    let calls = 0;
    (runner as unknown as { execBd: (a: string[], n: number) => Promise<unknown> }).execBd = async () => {
      calls++;
      if (calls < 3) throw lockError();
      return { stdout: "[]", stderr: "" };
    };
    const result = await (runner as unknown as { runJson: (a: string[]) => Promise<unknown> }).runJson(["list", "--json"]);
    expect(result).toEqual([]);
    expect(calls).toBe(3);
  }, 10000);

  it("surfaces a friendly message when the lock persists", async () => {
    const runner = makeRunner();
    let calls = 0;
    (runner as unknown as { execBd: (a: string[], n: number) => Promise<unknown> }).execBd = async () => {
      calls++;
      throw lockError();
    };
    await expect(
      (runner as unknown as { runJson: (a: string[]) => Promise<unknown> }).runJson(["list", "--json"])
    ).rejects.toThrow(/database is busy/i);
    expect(calls).toBe(4); // initial + 3 retries
  }, 10000);
});
