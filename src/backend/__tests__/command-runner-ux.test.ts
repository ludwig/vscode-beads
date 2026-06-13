// src/backend/__tests__/command-runner-ux.test.ts
// Covers the ux-rework backend behaviors: vs-0bq (list shows everything),
// vs-266 (no second spawn when there are no comments), vs-mxq (writes drop
// the read cache).
import { BeadsCommandRunner } from "../BeadsCommandRunner";
import { Logger } from "../../utils/logger";

type ExecResult = { stdout: string; stderr: string };

function makeRunner(handler: (args: string[]) => ExecResult) {
  const stubLog = {
    child: () => stubLog,
    info() {}, debug() {}, trace() {}, warn() {}, error() {},
    errorNotify: async () => {},
  } as unknown as Logger;
  const runner = new BeadsCommandRunner({ bdPath: "bd", cwd: "/x", beadsDir: "/x/.beads", log: stubLog });
  (runner as unknown as { checkCompatibility: () => Promise<unknown> }).checkCompatibility = async () => ({
    supported: true,
    minimumVersion: "0.51.0",
    message: "ok",
  });
  const calls: string[][] = [];
  (runner as unknown as { execBd: (a: string[]) => Promise<ExecResult> }).execBd = async (args: string[]) => {
    calls.push(args);
    return handler(args);
  };
  return { runner, calls };
}

const ISSUE = { id: "x", title: "t", status: "open", priority: 2, issue_type: "task" };

describe("BeadsCommandRunner list (vs-0bq)", () => {
  it("requests unlimited results including closed issues", async () => {
    const { runner, calls } = makeRunner(() => ({ stdout: "[]", stderr: "" }));
    await runner.list();
    const listCall = calls.find((a) => a[0] === "list");
    expect(listCall).toBeDefined();
    expect(listCall).toEqual(expect.arrayContaining(["--all", "-n", "0"]));
  });
});

describe("BeadsCommandRunner show comment loading (vs-266)", () => {
  it("does not fetch comments when comment_count is 0", async () => {
    const { runner, calls } = makeRunner((args) =>
      args[0] === "show"
        ? { stdout: JSON.stringify({ ...ISSUE, comment_count: 0 }), stderr: "" }
        : { stdout: "[]", stderr: "" }
    );
    const issue = await runner.show("x");
    expect(issue?.comment_count).toBe(0);
    expect(calls.filter((a) => a[0] === "comments")).toHaveLength(0);
  });

  it("fetches comments only when comment_count > 0", async () => {
    const comments = [{ id: "1", author: "a", text: "hi", created_at: "2026-01-01" }];
    const { runner, calls } = makeRunner((args) =>
      args[0] === "show"
        ? { stdout: JSON.stringify({ ...ISSUE, comment_count: 1 }), stderr: "" }
        : { stdout: JSON.stringify(comments), stderr: "" }
    );
    const issue = await runner.show("x");
    expect(calls.filter((a) => a[0] === "comments")).toHaveLength(1);
    expect(issue?.comments).toHaveLength(1);
  });
});

describe("BeadsCommandRunner write cache invalidation (vs-mxq)", () => {
  it("re-runs list after a write instead of serving stale cache", async () => {
    const { runner, calls } = makeRunner((args) =>
      args[0] === "update"
        ? { stdout: JSON.stringify(ISSUE), stderr: "" }
        : { stdout: "[]", stderr: "" }
    );
    await runner.list();
    await runner.list(); // within 750ms TTL -> served from cache, no exec
    expect(calls.filter((a) => a[0] === "list")).toHaveLength(1);

    await runner.update({ id: "x", status: "closed" });
    await runner.list(); // cache invalidated by the write -> fresh exec
    expect(calls.filter((a) => a[0] === "list")).toHaveLength(2);
  });
});
