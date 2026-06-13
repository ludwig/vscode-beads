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
| `just dev verify` | `bd version` + `bd list --json` inside the container |
| `just dev doctor` | diagnose the bd/CGO build chain (host vs in-image linkage) |
| `just dev rebuild` | clean `--no-cache` rebuild when layers go stale |
| `just dev port` / `logs` / `shell` | port, container logs, container shell |

## Config & Primitives (`docker/`)

- `.env` - config: `BEADS_WORKSPACE`, `OVS_HOST_PORT`, `BD_ARCH`, `GO_IMAGE`
  (override per-invocation with shell env — `BEADS_WORKSPACE=… just dev up`)
- `Dockerfile` - `FROM gitpod/openvscode-server` + baked-in Linux `bd`
- `entrypoint.sh` - symlinks the mounted extension, launches the server
- `build-bd.sh` - builds `bd` natively (CGO) in a `golang` container
- `docker-compose.yml` - service, volumes, port mapping
- `bd-linux-*` - the built binary (gitignored, ~85MB)

## DevTools Note

Chrome only allows one DevTools client at a time. If you manually open DevTools (F12) while chrome-devtools-mcp is connected, the MCP will crash/disconnect.

**Workaround**: Configure MCP with `--devtools` flag to launch Chrome with DevTools already open.
