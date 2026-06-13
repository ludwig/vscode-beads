# Start Action

Start the openvscode-server (Docker) development environment for testing the
vscode-beads extension. The orchestration lives in `just` recipes (the `dev`
module); this action just drives them.

## Step 1: Bring the harness up

```bash
just dev up
```

Use `run_in_background: true` (first run builds the golang+bd image and the
openvscode image — minutes). This chains: build `bd` (CGO, in a container) →
build the image → compile the extension → start host watch → run the container
(`--force-recreate`, so it always picks up a fresh build).

Optional config overrides (or edit `.agent/skills/vscode-server/docker/.env`):

```bash
BEADS_PROJECTS_DIR=~/beads OVS_HOST_PORT=3010 just dev up
```

`BEADS_PROJECTS_DIR` is the **parent directory** of beads repos (defaults to
`$HOME/beads`). The entrypoint scans it for `*/.beads` and generates a multi-root
workspace, so every repo under it — **embedded or server mode** — shows up in the
extension's project switcher. Drop several repos in to test switching between
modes. (Server mode works in-container: the image bakes in `dolt` + a pre-seeded
Dolt identity.)

## Step 2: Confirm it came up

```bash
just dev status     # container running? bd version?
just dev verify     # bd version + bd list --json inside the container
```

If `just dev verify` returns issues as JSON, embedded `bd` works in-container.
If it errors, run `just dev doctor` (checks the bd/CGO build chain) and report.

## Step 3: Open the browser with Chrome DevTools MCP

The `up` recipe prints the URL. Open it (the `?workspace=` opens the generated
multi-root workspace, so all mounted projects are present):

- URL: `http://127.0.0.1:{PORT}/?workspace=/home/workspace/beads-dev.code-workspace`
  (`{PORT}` = `just dev port`, default 3000)

If the workspace doesn't auto-open from the query param, open it from the UI:
**File → Open Workspace from File…** → `/home/workspace/beads-dev.code-workspace`
(or open the `?folder=/home/workspace/projects` parent and the projects still
resolve via the generated `beads.projects` setting once that workspace loads).

Then hard-reload to bypass cache: `mcp__chrome-devtools__navigate_page` with
`type: "reload"`, `ignoreCache: true`.

## Step 4: Report status

Tell the user the URL, container status, and the `bd version` line from `verify`.
Remind them: after editing extension code, watch mode rebuilds `dist/` — just
reload the browser (`/vscode-server:reload`). No image rebuild needed for
extension changes.
