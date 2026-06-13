# openvscode-server (Docker) Testing Environment

> **Living document for agents.** Keep updated with working commands, config, and lessons learned.

## Why Docker?

The previous harness used [code-server](https://github.com/coder/code-server),
which runs natively on macOS but pins to an older Node than upstream VS Code.
We switched to [openvscode-server](https://github.com/gitpod-io/openvscode-server),
which bundles its own runtime — but it ships **Linux-only** binaries. So we run
it in Docker.

Consequence: the **extension host runs inside the Linux container**. The
extension's `BeadsBackend` spawns the `bd` CLI via `child_process`, so the
container needs a Linux `bd` on PATH. We cross-compile `bd` from the local
Gas Town source (`~/repos/beads`) and bake it into the image, so the container
`bd` matches the host `bd` commit-for-commit.

```
┌─ macOS host ──────────────────────────────┐
│  bun run watch  ──►  dist/extension.js     │
│  (native, fast rebuilds)                   │
│         │ mounted read-only                │
└─────────┼──────────────────────────────────┘
          ▼
┌─ Docker (linux/arm64) ─────────────────────┐
│  openvscode-server  (extension host)       │
│  /usr/local/bin/bd  (Gas Town, cross-built) │
│  /home/workspace/projects ◄ BEADS_PROJECTS_DIR │
│    ├─ vs/   (server)   each scanned →        │
│    └─ foo/  (embedded) multi-root workspace  │
└────────────────────────────────────────────┘
   ▲ http://127.0.0.1:3000/?workspace=/home/workspace/beads-dev.code-workspace
       browser (Chrome DevTools MCP)
```

## Prerequisites

- **Docker Desktop** running (Apple Silicon → pulls the linux/arm64 base image).
  `bd` is built inside a `golang` container, so **no host Go toolchain is needed**.
- **`~/repos/beads`** present (the Gas Town fork). Override with `BEADS_SRC`.
- A **parent dir of beads repos** to mount (default `~/beads`). Every repo under
  it (`*/.beads`), embedded or server mode, is auto-discovered as a project.

## Quick Start

Driven by `just` recipes (the `dev` module). First run builds the bd + image —
can take a few minutes.

```bash
just dev up          # bd → image build → compile → watch → run container
just dev info        # snapshot: host build + container + each project's Dolt mode
just dev verify      # bd version + bd list --json (first mounted project)
just dev rescan      # regenerate the workspace after adding/removing a repo
just dev doctor      # diagnose the bd/CGO build chain if verify fails
just dev down        # tear down

# override config inline (or edit docker/.env):
BEADS_PROJECTS_DIR=~/beads OVS_HOST_PORT=3010 just dev up
```

The `vscode-server` skill wraps these (`/vscode-server:start|reload|status|stop`).

Then open `http://127.0.0.1:3000/?workspace=/home/workspace/beads-dev.code-workspace`
in the browser — the generated multi-root workspace with every mounted project.

## Configuration

Env overrides for the start script:

| Var | Default | Meaning |
|-----|---------|---------|
| `BEADS_PROJECTS_DIR` | `~/beads` | Parent dir of beads repos; each `*/.beads` under it becomes a project |
| `OVS_HOST_PORT` | `3000` | Host port mapped to the container |
| `BD_ARCH` | `arm64` | Container arch for `bd` (use `amd64` if Docker runs x86) |
| `BEADS_SRC` | `~/repos/beads` | Source tree for the `bd` cross-build |

## How It Works

1. **bd build** (`docker/build-bd.sh`): a NATIVE linux/arm64 build inside
   `golang:1.26-bookworm` with `CGO_ENABLED=1 -tags gms_pure_go -ldflags
   "-X main.Build=<sha>"`. CGO is required for embedded Dolt (the host has no C
   cross-toolchain, hence the container build). Matches `~/repos/beads` HEAD.
   Output `docker/bd-linux-arm64` is gitignored (~85MB).
2. **Image** (`docker/Dockerfile`): `FROM gitpod/openvscode-server:1.105.1` (image
   tags lag the GitHub release tags — newest published image is 1.105.1), copies
   `bd` to `/usr/local/bin/bd`, installs the entrypoint.
3. **Extension mount**: repo root is bind-mounted read-only at `/ext-src`; the
   entrypoint symlinks it into the server's extensions dir. Host `bun run watch`
   rebuilds `dist/`; reload the browser to pick up changes.
4. **Workspace**: `BEADS_PROJECTS_DIR` (parent dir) is mounted at
   `/home/workspace/projects`. The entrypoint runs `gen-workspace.sh`, which
   scans for `*/.beads` and writes `/home/workspace/beads-dev.code-workspace` —
   a multi-root workspace listing each repo as a folder and in the
   `beads.projects` setting, so all of them appear in the project switcher. Dolt
   data is cross-platform, so the container `bd` reads host-created repos
   directly. Server-mode repos work too: the image bakes in `dolt` and a
   pre-seeded Dolt identity, so `bd dolt start` runs the server in-container.
   After adding/removing a repo, `just dev rescan` regenerates the workspace
   (then reload the browser) — no container recreate needed.

## Iteration Loop

1. Edit code on the host — watch mode rebuilds `dist/` (~50ms).
2. `/vscode-server:reload` (or Cmd+R in the browser).
3. No image rebuild needed for extension code changes.

Rebuild the image only when `bd` source changes (delete `docker/bd-linux-arm64`
and re-run start) or the Dockerfile/entrypoint change.

## Troubleshooting

### Container won't start / port in use
- `docker ps` — is `vscode-beads-dev` already running? `/vscode-server:stop` first.
- Change the host port: `OVS_HOST_PORT=3010 just dev up`.

### Extension not loading
- Confirm `dist/extension.js` exists on the host (`bun run compile`).
- `docker exec vscode-beads-dev ls -la /home/workspace/.dev-exts/` — symlink present?
- Reload the browser with cache bypass.

### `bd` errors inside the container
- `docker exec vscode-beads-dev bd version` — should match host `bd version`.
- If arch mismatch (`exec format error`), rebuild with the right `BD_ARCH`.

### Docker not reachable
- Start Docker Desktop. The start script fails fast with a clear error if the
  daemon is down.

## Notes

- `--without-connection-token` disables auth — safe for localhost only.
- openvscode-server has no macOS build; Docker is the supported path on this Mac.
- The container `bd` is rebuilt only on demand, so keep `~/repos/beads` at the
  commit you want to test against.
