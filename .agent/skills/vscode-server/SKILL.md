---
name: vscode-server
description: "USE THIS SKILL for all /vscode-server:* commands"
allowed-tools: Bash, Read, TaskOutput, mcp__chrome-devtools__new_page, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__close_page
---

# VS Code Server Skill

Manage the openvscode-server (Docker) development environment for testing the
vscode-beads extension.

Because openvscode-server ships Linux-only, the extension host runs inside a
container with a baked-in Linux `bd` CLI (cross-compiled from `~/repos/beads`).
The extension itself is built on the host with native `bun` and mounted into the
container read-only; host watch mode rebuilds `dist/`, and reloading the browser
picks up changes.

The harness mounts a **parent directory of beads repos** (`BEADS_PROJECTS_DIR`,
default `$HOME/beads`) at `/home/workspace/projects`. On launch the entrypoint
scans it for `*/.beads` and generates a multi-root `.code-workspace` that lists
each repo as a folder and in the `beads.projects` setting, so every repo —
embedded or server mode — appears in the extension's project switcher. Open the
`?workspace=…` URL the `up` recipe prints. After adding/removing a repo, run
`just dev rescan` and reload.

## Action Routing

| Action     | File        |
| ---------- | ----------- |
| **start**  | `start.md`  |
| **stop**   | `stop.md`   |
| **reload** | `reload.md` |
| **status** | `status.md` |

Read the file, then follow its instructions.

## Commands

| Command                              | Action |
| ------------------------------------ | ------ |
| `/vscode-server:start`               | start  |
| `/vscode-server:stop`                | stop   |
| `/vscode-server:reload [--devtools]` | reload |
| `/vscode-server:status`              | status |

## Orchestration: `just dev` recipes

All harness logic lives in `just` recipes — the root `Justfile` exposes them as
the `dev` module (`dev.just`). The skill actions above just drive them.

| Recipe | Does |
| ------ | ---- |
| `just dev up` | bd → image build → compile → watch → run container (`--force-recreate`) |
| `just dev down` | stop container + host watch |
| `just dev status` | container + watch status |
| `just dev info` | agent-friendly snapshot: host build state + container + every mounted project's Dolt mode (no `docker inspect` needed) |
| `just dev verify` | `bd version` + `bd list --json` against the first mounted project |
| `just dev rescan` | regenerate the multi-root workspace after adding/removing a repo (then reload the browser; no recreate) |
| `just dev doctor` | diagnose the bd/CGO build chain (host vs in-image linkage) |
| `just dev rebuild` | clean `--no-cache` rebuild when layers go stale |
| `just dev port` / `logs` / `shell` | port, container logs, container shell |

## Config & Primitives (`docker/`)

- `.env` - config: `BEADS_PROJECTS_DIR`, `OVS_HOST_PORT`, `BD_ARCH`, `GO_IMAGE`
  (override per-invocation with shell env — `BEADS_PROJECTS_DIR=… just dev up`)
- `Dockerfile` - `FROM gitpod/openvscode-server` + baked-in Linux `bd` + `dolt`
- `entrypoint.sh` - symlinks the mounted extension, generates the workspace, launches the server
- `gen-workspace.sh` - scans `/home/workspace/projects/*/.beads`, writes the multi-root `.code-workspace`
- `build-bd.sh` - builds `bd` natively (CGO) in a `golang` container
- `docker-compose.yml` - service, volumes, port mapping
- `bd-linux-*` - the built binary (gitignored, ~85MB)

## DevTools Note

Chrome only allows one DevTools client at a time. If you manually open DevTools (F12) while chrome-devtools-mcp is connected, the MCP will crash/disconnect.

**Workaround**: Configure MCP with `--devtools` flag to launch Chrome with DevTools already open.
