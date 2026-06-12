# Embedded-mode Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the extension open Beads repos that use embedded (server-less) Dolt by routing them through the existing CLI backend, with single-writer lock resilience — fixing issue #77.

**Architecture:** Detect each project's `dolt_mode` and select the backend: confirmed `server` → `BeadsDoltBackend` (mysql2/SQL); everything else → `BeadsCommandRunner` (CLI, no server). The CLI backend already implements the full `BeadsBackend` interface and never starts a server, so embedded lifecycle works for free. Add a generic lock-retry wrapper around CLI invocations for embedded Dolt's single-writer constraint, and a defensive guard so the "Start Dolt Server" command no-ops on embedded projects.

**Tech Stack:** TypeScript, VS Code extension API, Jest + ts-jest (`bun run test`), esbuild (`bun run compile`).

**Spec:** `docs/superpowers/specs/2026-06-12-embedded-mode-support-design.md`

**Branch:** `feat/embedded-mode-support` (already created off `develop`).

---

## File Structure

- **Create** `src/backend/doltMode.ts` — mode detection (`detectDoltMode`), backend-kind mapping (`backendKindForMode`), and a fs/CLI-backed probe factory (`createDoltModeProbe`). One responsibility: "what storage mode is this repo, and which backend serves it."
- **Create** `src/backend/doltErrors.ts` — `isEmbeddedLockError`, a pure error classifier.
- **Create** `src/backend/retry.ts` — `withLockRetry`, a generic retry-on-retryable-error wrapper.
- **Modify** `src/backend/BeadsCommandRunner.ts` — wrap `runJson`'s exec in `withLockRetry`; surface a friendly message on persistent lock errors.
- **Modify** `src/backend/types.ts` — add `doltMode?: DoltMode` to `BeadsProject`.
- **Modify** `src/backend/BeadsProjectManager.ts` — detect mode and select backend in `activateProject`; store mode on the project.
- **Modify** `src/extension.ts` — guard `beads.startDoltServer` against embedded projects.
- **Create** tests under `src/backend/__tests__/`.

Tasks 1–4 are pure logic and fully unit-tested (TDD). Tasks 5–6 are wiring into VS Code–coupled classes; they are verified by `bun run compile` + the manual checklist in Task 7 (the decision logic they call is already unit-tested in Tasks 1–4).

---

## Task 1: Dolt mode detection helper

**Files:**
- Create: `src/backend/doltMode.ts`
- Test: `src/backend/__tests__/doltMode.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/backend/__tests__/doltMode.test.ts
import { backendKindForMode, detectDoltMode, DoltModeProbe } from "../doltMode";

function probe(over: Partial<DoltModeProbe>): DoltModeProbe {
  return {
    readMetadata: over.readMetadata ?? (async () => null),
    doltShow: over.doltShow ?? (async () => ""),
  };
}

describe("detectDoltMode", () => {
  it("returns server when metadata.json dolt_mode is server", async () => {
    const mode = await detectDoltMode(probe({ readMetadata: async () => JSON.stringify({ dolt_mode: "server" }) }));
    expect(mode).toBe("server");
  });

  it("returns embedded when metadata.json dolt_mode is embedded", async () => {
    const mode = await detectDoltMode(probe({ readMetadata: async () => JSON.stringify({ dolt_mode: "embedded" }) }));
    expect(mode).toBe("embedded");
  });

  it("falls back to bd dolt show when metadata lacks dolt_mode", async () => {
    const mode = await detectDoltMode(
      probe({
        readMetadata: async () => JSON.stringify({ backend: "dolt" }),
        doltShow: async () => "  Mode:     server\n",
      })
    );
    expect(mode).toBe("server");
  });

  it("falls back to bd dolt show when metadata JSON is malformed", async () => {
    const mode = await detectDoltMode(
      probe({
        readMetadata: async () => "{not json",
        doltShow: async () => "  Mode:     embedded (in-process Dolt engine)\n",
      })
    );
    expect(mode).toBe("embedded");
  });

  it("detects server from a running-server line in bd dolt show", async () => {
    const mode = await detectDoltMode(probe({ doltShow: async () => "Dolt server: running\n  Port: 61597\n" }));
    expect(mode).toBe("server");
  });

  it("defaults to embedded (CLI-safe) when nothing is determinable", async () => {
    const mode = await detectDoltMode(
      probe({
        readMetadata: async () => null,
        doltShow: async () => {
          throw new Error("bd not found");
        },
      })
    );
    expect(mode).toBe("embedded");
  });
});

describe("backendKindForMode", () => {
  it("maps server to sql and embedded to cli", () => {
    expect(backendKindForMode("server")).toBe("sql");
    expect(backendKindForMode("embedded")).toBe("cli");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/backend/__tests__/doltMode.test.ts`
Expected: FAIL — `Cannot find module '../doltMode'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/backend/doltMode.ts
import * as fs from "fs";
import * as path from "path";

export type DoltMode = "embedded" | "server";
export type BackendKind = "sql" | "cli";

/** Pluggable inputs so detection is unit-testable without fs or the CLI. */
export interface DoltModeProbe {
  /** Raw contents of .beads/metadata.json, or null if absent/unreadable. */
  readMetadata(): Promise<string | null>;
  /** Output of `bd dolt show`, used only as a fallback. */
  doltShow(): Promise<string>;
}

/**
 * Detect a repo's Dolt mode. Rule: only a confirmed "server" routes to the SQL
 * backend; everything else (including the undetermined default) is the
 * CLI-safe "embedded" path. This makes the safe path the default.
 */
export async function detectDoltMode(probe: DoltModeProbe): Promise<DoltMode> {
  const raw = await probe.readMetadata();
  if (raw) {
    try {
      const meta = JSON.parse(raw) as { dolt_mode?: unknown };
      if (meta.dolt_mode === "server") return "server";
      if (meta.dolt_mode === "embedded") return "embedded";
    } catch {
      // malformed metadata → fall through to the CLI probe
    }
  }

  try {
    const show = await probe.doltShow();
    if (/mode:\s*server/i.test(show) || /dolt server:\s*running/i.test(show)) {
      return "server";
    }
    if (/embedded/i.test(show)) return "embedded";
  } catch {
    // bd unavailable → safe default below
  }

  return "embedded";
}

/** SQL backend only for confirmed server mode; embedded uses the CLI backend. */
export function backendKindForMode(mode: DoltMode): BackendKind {
  return mode === "server" ? "sql" : "cli";
}

/** Build a filesystem/CLI-backed probe for a real project. */
export function createDoltModeProbe(params: {
  beadsDir: string;
  doltShow: () => Promise<string>;
}): DoltModeProbe {
  return {
    async readMetadata() {
      try {
        return await fs.promises.readFile(path.join(params.beadsDir, "metadata.json"), "utf8");
      } catch {
        return null;
      }
    },
    doltShow: params.doltShow,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/backend/__tests__/doltMode.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/doltMode.ts src/backend/__tests__/doltMode.test.ts
git commit -m "feat: add Dolt mode detection and backend-kind mapping (#77)"
```

---

## Task 2: Embedded lock-error classifier

**Files:**
- Create: `src/backend/doltErrors.ts`
- Test: `src/backend/__tests__/doltErrors.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/backend/__tests__/doltErrors.test.ts`
Expected: FAIL — `Cannot find module '../doltErrors'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/backend/doltErrors.ts

/** True when a bd error indicates embedded Dolt's single-writer lock is held. */
export function isEmbeddedLockError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("exclusive lock") ||
    m.includes("supports only one writer") ||
    m.includes("another process holds")
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/backend/__tests__/doltErrors.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/doltErrors.ts src/backend/__tests__/doltErrors.test.ts
git commit -m "feat: add embedded Dolt lock-error classifier (#77)"
```

---

## Task 3: Generic lock-retry wrapper

**Files:**
- Create: `src/backend/retry.ts`
- Test: `src/backend/__tests__/retry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/backend/__tests__/retry.test.ts`
Expected: FAIL — `Cannot find module '../retry'`.

- [ ] **Step 3: Write the implementation**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/backend/__tests__/retry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/retry.ts src/backend/__tests__/retry.test.ts
git commit -m "feat: add generic lock-retry wrapper (#77)"
```

---

## Task 4: Wire lock retry into the CLI backend

**Files:**
- Modify: `src/backend/BeadsCommandRunner.ts` (imports + `runJson`, currently lines 239–276)
- Test: `src/backend/__tests__/command-runner-lock.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/backend/__tests__/command-runner-lock.test.ts`
Expected: FAIL — the lock error is not retried (calls === 1) and the thrown message is the raw stderr, not "database is busy".

- [ ] **Step 3: Add imports near the top of `src/backend/BeadsCommandRunner.ts`**

After the existing import block (after line 13, the import from `./BeadsBackend`), add:

```typescript
import { isEmbeddedLockError } from "./doltErrors";
import { withLockRetry } from "./retry";
```

- [ ] **Step 4: Replace the `runJson` method body**

Replace the entire current `runJson` method (lines 239–276) with:

```typescript
  private async runJson(args: string[], recoveryAttempted = false): Promise<unknown> {
    const compatibility = await this.checkCompatibility();
    if (!compatibility.supported) {
      throw new Error(compatibility.message);
    }

    try {
      return await withLockRetry(
        async () => {
          try {
            const { stdout } = await this.execBd(args, 10 * 1024 * 1024);
            const trimmed = stdout.trim();
            if (!trimmed) return [];
            return JSON.parse(trimmed);
          } catch (error) {
            // Normalize so the retry/classifier see bd's stderr in `.message`,
            // while preserving the original stderr/stdout for the outer handler.
            const err = error as Error & { stderr?: string; stdout?: string };
            const raw = (err.stderr?.trim() || err.stdout?.trim() || err.message || "").trim();
            throw Object.assign(new Error(raw), { stderr: err.stderr, stdout: err.stdout });
          }
        },
        { isRetryable: isEmbeddedLockError, delaysMs: [100, 300, 600] }
      );
    } catch (error) {
      const err = error as Error & { stderr?: string; stdout?: string };
      const stderr = err.stderr?.trim() ?? "";
      const stdout = err.stdout?.trim() ?? "";
      const rawMessage = stderr || stdout || err.message;
      this.log.trace(`bd command failed: ${args.join(" ")} :: ${rawMessage}`);

      if (isEmbeddedLockError(rawMessage)) {
        throw new Error(
          "Beads database is busy — another `bd` process holds the embedded database lock. Please retry. See Output > Beads for details."
        );
      }

      if (this.isDoltConnectionError(rawMessage)) {
        if (!recoveryAttempted) {
          const recovered = await this.tryRecoverDolt(rawMessage);
          if (recovered) {
            return this.runJson(args, true);
          }
        }

        throw new Error(
          "Beads cannot connect to the Dolt server for this project. Run `bd dolt start` and retry. See Output > Beads for details."
        );
      }

      if (this.isProjectNotInitializedError(rawMessage)) {
        throw new Error("Beads project is not initialized. Run `bd init` in this project. See Output > Beads for details.");
      }

      throw new Error(rawMessage);
    }
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test src/backend/__tests__/command-runner-lock.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full suite and build to confirm no regressions**

Run: `bun run test && bun run compile:quiet`
Expected: all tests pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/backend/BeadsCommandRunner.ts src/backend/__tests__/command-runner-lock.test.ts
git commit -m "feat: retry embedded Dolt lock contention in CLI backend (#77)"
```

---

## Task 5: Select the backend by detected mode

**Files:**
- Modify: `src/backend/types.ts` (add `doltMode` to `BeadsProject`, currently lines 106–115)
- Modify: `src/backend/BeadsProjectManager.ts` (imports; `activateProject`, currently around lines 390–398; add a `runBdDoltShow` helper)

- [ ] **Step 1: Add `doltMode` to the `BeadsProject` type**

In `src/backend/types.ts`, add an import at the top of the file:

```typescript
import type { DoltMode } from "./doltMode";
```

Then add a field to the `BeadsProject` interface (after `backendPid?: number;`):

```typescript
  doltMode?: DoltMode; // Detected on activation: "embedded" | "server"
```

- [ ] **Step 2: Add imports to `BeadsProjectManager.ts`**

In `src/backend/BeadsProjectManager.ts`, replace the existing line:

```typescript
import { BeadsDoltBackend } from "./BeadsDoltBackend";
```

with:

```typescript
import { BeadsDoltBackend } from "./BeadsDoltBackend";
import { BeadsCommandRunner } from "./BeadsCommandRunner";
import { backendKindForMode, createDoltModeProbe, detectDoltMode } from "./doltMode";
```

- [ ] **Step 3: Replace the hardcoded backend construction in `activateProject`**

Replace this block (currently lines 390–398):

```typescript
    const bdPath = this.getBdPath();

    this.backend = new BeadsDoltBackend({
      bdPath,
      cwd: project.rootPath,
      beadsDir: project.beadsDir,
      log: this.log,
      minSupportedVersion: "0.51.0",
    });
```

with:

```typescript
    const bdPath = this.getBdPath();

    const probe = createDoltModeProbe({
      beadsDir: project.beadsDir,
      doltShow: () => this.runBdDoltShow(bdPath, project.rootPath),
    });
    const mode = await detectDoltMode(probe);
    project.doltMode = mode;
    this.log.info(`Project ${project.name} uses ${mode} Dolt mode`);

    const backendParams = {
      bdPath,
      cwd: project.rootPath,
      beadsDir: project.beadsDir,
      log: this.log,
      minSupportedVersion: "0.51.0",
    };
    this.backend =
      backendKindForMode(mode) === "sql"
        ? new BeadsDoltBackend(backendParams)
        : new BeadsCommandRunner(backendParams);
```

- [ ] **Step 4: Add the `runBdDoltShow` helper**

In `src/backend/BeadsProjectManager.ts`, add this private method next to the other private helpers (e.g., directly above `private async tryStat(` near line 367):

```typescript
  private async runBdDoltShow(bdPath: string, cwd: string): Promise<string> {
    const { stdout } = await execFileAsync(bdPath, ["dolt", "show"], { cwd });
    return stdout;
  }
```

(`execFileAsync` is already defined at the top of this file.)

- [ ] **Step 5: Build and run the suite**

Run: `bun run compile:quiet && bun run test`
Expected: build succeeds; all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/backend/types.ts src/backend/BeadsProjectManager.ts
git commit -m "feat: select CLI backend for embedded Dolt repos (#77)"
```

---

## Task 6: Guard the Start-Dolt-Server command for embedded projects

**Files:**
- Modify: `src/extension.ts` (the `beads.startDoltServer` command, currently lines 141–147)

- [ ] **Step 1: Add the embedded guard**

In `src/extension.ts`, inside the `beads.startDoltServer` command handler, immediately after this existing block (currently lines 144–147):

```typescript
      if (!client || !project) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }
```

add:

```typescript
      if (project.doltMode === "embedded") {
        vscode.window.showInformationMessage(
          `${project.name} uses embedded Dolt — there is no server to start.`
        );
        return;
      }
```

- [ ] **Step 2: Build to confirm it compiles**

Run: `bun run compile:quiet`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat: no-op Start Dolt Server on embedded projects (#77)"
```

---

## Task 7: Manual / integration verification

**Files:** none (verification only). Build first: `bun run compile`.

- [ ] **Step 1: Server-mode repo still works (no regression)**

Open `~/beads/vs` (server mode) as a VS Code workspace folder, reload the window, and open the Beads panel.
Expected: issues load; create/update/close work. Output > Beads log shows `uses server Dolt mode` and a connection line from `BeadsDoltBackend`.

- [ ] **Step 2: Embedded repo now opens (the #77 fix)**

Create a fresh embedded repo and open it:

```bash
mkdir -p /tmp/embedded-demo && cd /tmp/embedded-demo && bd init --non-interactive
bd dolt show   # confirms: Mode: embedded (in-process Dolt engine)
```

Open `/tmp/embedded-demo` as a workspace folder and reload.
Expected: **no** `'bd dolt start' is not supported in embedded mode` error. Output > Beads shows `uses embedded Dolt mode`. The panel loads (empty list). Create an issue from the UI, edit it, close it, add a dependency and a comment — all succeed.

- [ ] **Step 3: Start-Dolt-Server is a safe no-op on embedded**

With the embedded project active, run the `beads.startDoltServer` command (or trigger its webview button if shown).
Expected: an information message "…uses embedded Dolt — there is no server to start." and **no** error.

- [ ] **Step 4: Lock resilience under contention**

With the embedded project open in the extension, in a terminal run a tight write loop against the same repo:

```bash
cd /tmp/embedded-demo
for i in $(seq 1 30); do bd create "lock drill $i" -t task >/dev/null 2>&1; done
```

While that runs, create/refresh issues from the extension.
Expected: operations occasionally pause briefly (retry/backoff) but succeed; if a write truly cannot get the lock, the UI shows "Beads database is busy — …Please retry." rather than a raw stderr dump or a crash.

- [ ] **Step 5: Clean up**

```bash
rm -rf /tmp/embedded-demo
```

- [ ] **Step 6: Final full check**

Run: `bun run lint && bun run test && bun run compile`
Expected: all clean.

---

## Self-Review (completed by plan author)

- **Spec coverage:** mode detection → Task 1; backend selection → Task 5; embedded status/lifecycle → free via CLI backend (Task 5) + Start-server guard → Task 6; lock resilience → Tasks 2–4; testing → Tasks 1–4 (unit) + Task 7 (manual). Edge modes (shared/external/proxied) → `detectDoltMode` server-detection + `backendKindForMode` (Task 1).
- **Placeholder scan:** none — every code step has complete code; every command has expected output.
- **Type consistency:** `DoltMode`/`BackendKind`/`DoltModeProbe`/`detectDoltMode`/`backendKindForMode`/`createDoltModeProbe` (Task 1) are used consistently in Tasks 5–6; `isEmbeddedLockError` (Task 2) and `withLockRetry`/`LockRetryOptions` (Task 3) match their use in Task 4; `BeadsProject.doltMode` (Task 5) matches the guard read in Task 6.
