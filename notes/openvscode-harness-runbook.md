# openvscode-server dev harness — runbook

Operational quick-reference for testing this extension in the openvscode-server
(Docker) harness. The detailed living doc is
[`../docs/openvscode-docker-testing.md`](../docs/openvscode-docker-testing.md);
this is the terse command table + gotchas + a session/incident log.

## Commands (`just dev …`)

| Action | Command | Notes |
| --- | --- | --- |
| Bring up | `just dev up` | bd build → image → compile → host watch → run container (`--force-recreate`). First run = minutes. |
| Bring down | `just dev down` | Stops + removes container & network, kills host `bun run watch`. |
| Reload after code edit | `/vscode-server:reload` (or Cmd+R) | Host watch rebuilds `dist/`; just reload the browser. No image rebuild. |
| Status | `just dev status` | container + watch running? |
| Snapshot | `just dev info` | host build time + container + **each mounted project's Dolt mode** (no `docker inspect`). |
| Add/remove a repo | `just dev rescan` + reload | Regenerates the multi-root workspace; no container recreate. |
| Verify bd in container | `just dev verify` | `bd version` + `bd list --json` (first project). |
| Diagnose bd/CGO | `just dev doctor` | host vs in-image linkage. |
| Clean rebuild | `just dev rebuild` | `--no-cache` when image layers go stale. |

Skill wrappers: `/vscode-server:start|reload|status|stop`.

## Layout

- **Mount:** `BEADS_PROJECTS_DIR` (default `$HOME/beads`) → `/home/workspace/projects`.
  Entrypoint scans `*/.beads`, generates `/home/workspace/beads-dev.code-workspace`
  (multi-root + `beads.projects`), so every repo shows in the project switcher.
- **Open URL:** `http://127.0.0.1:<port>/?workspace=/home/workspace/beads-dev.code-workspace`
  (`<port>` = `just dev port`, default 3000). Fallback: File → Open Workspace from File.
- **Test repos under `~/beads/`:** `vs` (server mode — real board) and `foo`
  (embedded — disposable fixture; see `~/beads/foo/README.md`).

## Rebuild triggers

- **Extension code change** → reload the browser (watch already rebuilt `dist/`).
- **Dockerfile / entrypoint.sh / gen-workspace.sh / bd source** → `just dev up`
  (rebuilds image). Delete `docker/bd-linux-*` to force a fresh bd cross-build.

## Gotcha: one Dolt server per server-mode repo

A **server-mode** repo's Dolt data dir can be served by **exactly one
`dolt sql-server` at a time** (exclusive `noms/LOCK`). Both host `bd` and the
container auto-start their own server on the same data dir, so:

- Using `vs` **in the container** and **on the host** at the same time → whoever
  is second is locked out.
- A server left running with its **port not recorded in `.beads/config.yaml`**
  becomes an *orphan*: `bd` can't connect (`unreachable at 127.0.0.1:0`) and
  can't start a new one (`database "dolt" is locked by another dolt process`).

**Rule of thumb:** pick one context at a time. Before `just dev up` on a repo
you've been using locally, stop the host server; before using a repo locally
that the container had open, bring the container down.

### Recovering a jammed server-mode repo

Symptom: `bd <anything>` errors with `Dolt server unreachable at 127.0.0.1:0`
and repeated `auto-start failed … database "dolt" is locked`.

One-liner (host-side `just` recipes — wrap the dance below):

```bash
just dolt-ps              # which pid/port holds each repo under ~/beads (server=up/DOWN)
just dolt-restart vs      # kill the lock holder → bd dolt start → verify (idempotent)
```

`dolt-restart` accepts a bare repo name under `BEADS_PROJECTS_DIR` (`vs`, `foo`)
or a path. It finds the holder via the noms `LOCK` (not via bd's recorded port,
which is exactly what's lost in the orphan case), so it recovers the jam that
`bd dolt stop` can't ("server is not running").

Manual equivalent, if you need to do it by hand:

```bash
cd <repo>
# 1. Find the orphan holding the lock (note the PID):
lsof <repo>/.beads/dolt/.dolt/noms/LOCK
# 2. bd dolt stop won't help if bd lost track of it ("server is not running").
#    SIGTERM the PID directly (dolt flushes on shutdown):
kill <PID>
# 3. Start it the intended way (records the port for subsequent commands):
bd dolt start
bd list   # should work now
```

## Session / incident log

### 2026-06-13
- Shipped **vs-7s7** (optimistic details render) → PR #4, merged to `develop`.
- Shipped dev-harness **multi-project mounting + `just dev info`** → PR #5, merged.
- Created `~/beads/foo` (embedded) to verify vs-7s7 — confirmed live: no loading
  flash, content transitions, deps/comments reconcile, list picks up edits.
- Brought the container down (`just dev down`).
- **Incident:** after teardown, host `bd` couldn't open `vs` — an orphaned
  `dolt sql-server` (PID 39082, port 61597) held the lock while config showed
  port 0. `bd dolt stop` reported "not running." Fixed by `kill 39082` →
  `bd dolt start` (new PID on a recorded port) → `bd list` worked. Closed
  vs-7s7. Captured the recovery steps above. (`vs` server now running locally;
  stop it before the next `just dev up`.)
- Wrapped the recovery dance as host-side recipes **`just dolt-ps`** and
  **`just dolt-restart <repo>`** (vs-rs6). Verified against `vs`: ps shows
  pid/port per repo; restart kills the lock holder and re-starts via
  `bd dolt start` (idempotent; clear error on unknown repo).
