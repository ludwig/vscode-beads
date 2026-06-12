# Embedded-mode support (#77) — Design

- **Date:** 2026-06-12
- **Status:** Approved (design); pending implementation plan
- **Issue:** [#77 — Extension tries to run `bd dolt start` in embedded mode](https://github.com/ludwig/vscode-beads/issues/77)
- **Branch:** `feat/embedded-mode-support`

## Problem

Recent `bd` versions default `bd init` to an **embedded** Dolt backend: an
in-process engine with **no sql-server and no port** (data in
`.beads/embeddeddolt/`, `dolt_mode: "embedded"` in `.beads/metadata.json`).

The extension's `BeadsProjectManager` hardcodes `new BeadsDoltBackend(...)` for
every project. `BeadsDoltBackend` connects via a `mysql2` pool to a `host:port`
it scrapes from `bd dolt status`, and when no server is running it calls
`bd dolt start`. In embedded mode that command errors:

```
Error: 'bd dolt start' is not supported in embedded mode (no Dolt server)
```

So any repo created with a default `bd init` (the common case now) **cannot be
opened by the extension**. This is a confirmed in-the-wild report (#77: user
"kopilko", `bd` 1.0.4, embedded mode), not a theoretical gap.

## Goal & success bar

**Parity + lock resilience.** Detect embedded repos and route them so that *all*
existing extension features work, with no `bd dolt start` errors, and embedded
Dolt's single-writer lock contention is handled gracefully. Server-mode repos
keep their current behavior with zero regression.

## Key insight

A complete CLI-driven backend already exists. `BeadsCommandRunner implements
BeadsBackend` and provides the full interface (`list` / `show` / `create` /
`update` / `close` / `addDependency` / `removeDependency` / `listComments` /
`addComment`, plus compatibility checks and read caching) entirely via
`bd … --json`. It needs **no server**. `BeadsDoltBackend` already uses it
internally for CLI bits.

So this is a **backend-selection** problem, not a build-from-scratch problem.

## Chosen approach: mode detection + backend selection (Approach A)

Considered and rejected:
- **B — embedded-aware `BeadsDoltBackend`:** an internal `if (embedded)` branch
  delegating to the CLI helper. Bloats the SQL backend with two modes, leaves
  its SQL methods dead in embedded, scatters conditionals. Worse separation for
  no benefit.
- **C — unify everything on the CLI backend:** drop the SQL backend. Simplest
  model, but regresses server-mode users off the SQL path with a large blast
  radius. Reasonable *future* direction, not the fix for #77.

Approach A is the smallest change that fully fixes #77, reuses a tested backend,
and isolates risk away from server-mode users.

## Design

### 1. Mode detection

New isolated, unit-testable helper — `src/backend/doltMode.ts`:

```
detectDoltMode(beadsDir, bdPath, cli): Promise<"embedded" | "server">
```

- **Primary:** read `<beadsDir>/metadata.json` → `dolt_mode`
  (verified values: `"embedded"`, `"server"`).
- **Fallback** (file/field missing or malformed): parse `bd dolt show` —
  `"embedded (in-process"` → embedded; `"Mode: server"` / a running server →
  server.
- **Guiding rule:** the CLI backend works for *both* modes; the SQL backend is a
  server-mode optimization. **Opt into the SQL backend only on confirmed
  `server`; everything else routes to the CLI backend.** The safe path is the
  default, which inherently eliminates the #77 crash.
- **Edge modes:** shared-server / external / proxied-server repos report a
  server → SQL path. Any undetermined combination falls to the CLI-safe path.

### 2. Backend selection

At `BeadsProjectManager.activateProject` (currently
`src/backend/BeadsProjectManager.ts:392`), replace the hardcoded constructor:

```
const mode = await detectDoltMode(project.beadsDir, bdPath, /* cli */);
this.backend = mode === "server"
  ? new BeadsDoltBackend({ bdPath, cwd: project.rootPath, beadsDir: project.beadsDir, log: this.log, minSupportedVersion: "0.51.0" })
  : new BeadsCommandRunner({ bdPath, cwd: project.rootPath, beadsDir: project.beadsDir, log: this.log, minSupportedVersion: "0.51.0" });
```

Both classes share that exact constructor shape and both `implement
BeadsBackend`, so nothing downstream changes.

### 3. Embedded status & lifecycle

Today the manager models server states
(`running`/`stopped`/`zombie`/`not_initialized`/`unknown`) and polls/starts a
server. For embedded there is no server:

- The manager becomes mode-aware: for embedded it **never calls
  `startDoltServer` / `stopDoltServer`** and never enters server-polling.
  Status = `running` (ready) when the CLI is compatible and the repo is
  initialized; otherwise `not_initialized`.
- **No command gating needed.** The 5 contributed commands
  (`switchProject`, `openBeadsPanel`, `openBeadDetails`, `refresh`,
  `copyBeadId`) are none of them server-lifecycle, so there is no user-facing
  "start/stop server" affordance to hide. The server lifecycle is driven
  *internally* by the manager — the embedded fix is therefore internal only.
- This is the direct #77 fix: the error originated from the manager driving
  `BeadsDoltBackend.ensureServerRunning → bd dolt start`; embedded repos never
  instantiate that backend.

### 4. Lock resilience (single-writer)

Embedded Dolt is single-writer (`"another process holds the exclusive lock …
supports only one writer at a time"`). The extension's short-lived `bd` calls
can collide with the user's terminal `bd`. Building on the existing classifier
spine in `BeadsCommandRunner.runJson` / `runText`:

- Add `isEmbeddedLockError(msg)` — matches "exclusive lock" / "supports only one
  writer" / "another process holds".
- On lock error: **bounded exponential backoff retry** (~3 attempts,
  100 → 300 → 600 ms) — short enough to keep the UI responsive.
- On persistent failure: a clear, actionable message — *"Beads database is busy
  — another `bd` process holds the lock. Please retry."*

## Components / files touched

- `src/backend/doltMode.ts` — **new**, isolated detection helper.
- `src/backend/BeadsProjectManager.ts` — mode-driven backend selection;
  embedded-aware status & lifecycle (skip server polling/start/stop).
- `src/backend/BeadsCommandRunner.ts` — `isEmbeddedLockError` classifier +
  retry/backoff in the existing error path.
- Tests (see below).

## Testing

- **Unit:**
  - `detectDoltMode` across metadata variants: embedded, server, missing field,
    missing file, malformed → fallback path (mock `bd dolt show`).
  - Backend selection picks the correct class per mode.
  - `isEmbeddedLockError` + retry/backoff: mock `execBd` to fail N times then
    succeed; assert retry count and final error message.
- **Manual / integration:**
  - Server repo (`~/beads/vs`) → SQL backend; existing features work.
  - Fresh default `bd init` (embedded) → CLI backend; full CRUD + dependencies +
    comments; **no #77 error**.
  - Lock drill: a terminal `bd` write loop during extension writes → graceful
    retry, no hard failure.

## Non-goals

- No embedded↔server conversion command (separate feature).
- Not removing the SQL backend (that is the future Approach C).
- No new views — only accurate embedded status reporting.
