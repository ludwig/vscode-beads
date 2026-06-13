# vscode-beads — project task runner.
#
# Dev-harness recipes (openvscode-server in Docker) live in the vscode-server
# skill and are exposed here as the `dev` module:
#
#   just dev            # list harness recipes
#   just dev up         # build + run the test environment
#   just dev verify     # check embedded bd works in the container
#   just dev doctor     # diagnose the bd/CGO build chain
#   just dev down       # tear it down
mod dev '.agent/skills/vscode-server/dev.just'

# --- Extension build (thin wrappers over the bun scripts in package.json) ------
# These exist only so `just` is a consistent entrypoint; package.json remains
# the source of truth. Run `bun install` first if node_modules is missing.

# List the recipes (default when you run bare `just`).
default:
    @just --list

# Build the extension + webview bundles (dist/).
build:
    bun run compile

# Watch mode: rebuild extension + webview on change.
watch:
    bun run watch

# Lint src/**/*.{ts,tsx}.
lint:
    bun run lint

# Run the Jest test suite.
test:
    bun run test

# Build, then package the installable artifact -> vscode-beads-<version>.vsix.
package:
    bun run package

# --- Dolt server recovery (host-side) -----------------------------------------
# Server-mode beads repos are each served by exactly one `dolt sql-server`
# (exclusive noms/LOCK). When one is left orphaned — bd lost the recorded port
# (connect target shows 127.0.0.1:0) so it can neither connect nor auto-start a
# replacement ("database is locked") — recovery is: find the lock holder, kill
# it, then `bd dolt start` to re-record the port. These wrap that dance.
# See notes/openvscode-harness-runbook.md.

# Where the beads test repos live (mirrors the dev harness default).
beads_projects := env_var_or_default('BEADS_PROJECTS_DIR', join(home_directory(), 'beads'))

# Show which dolt sql-server (pid/port) holds each repo under BEADS_PROJECTS_DIR.
dolt-ps:
    #!/usr/bin/env bash
    set -uo pipefail
    projects="{{beads_projects}}"
    shopt -s nullglob
    printf "%-20s %-18s %-8s %-7s %s\n" REPO MODE PID PORT STATE
    found=0
    for d in "$projects"/*/; do
      d="${d%/}"
      [ -d "$d/.beads" ] || continue
      found=1
      name="$(basename "$d")"
      mode=$(sed -n 's/.*"dolt_mode"[[:space:]]*:[[:space:]]*"\([a-z]*\)".*/\1/p' "$d/.beads/metadata.json" 2>/dev/null | head -1)
      [ -z "$mode" ] && mode="embedded"
      lock="$d/.beads/dolt/.dolt/noms/LOCK"
      pid="" port="" state="-"
      [ -f "$lock" ] && pid=$(lsof -t "$lock" 2>/dev/null | head -1)
      if [ -n "$pid" ]; then
        # Prefer the port the server was actually launched with (-P <port>);
        # fall back to whatever TCP port it is listening on.
        port=$(ps -ww -o command= -p "$pid" 2>/dev/null | sed -n 's/.*-P[[:space:]]\{1,\}\([0-9]\{1,\}\).*/\1/p')
        [ -z "$port" ] && port=$(lsof -nP -p "$pid" -a -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $9}' | sed 's/.*://' | head -1)
        state="up"
      elif [ "$mode" = "server" ]; then
        state="DOWN"
      fi
      printf "%-20s %-18s %-8s %-7s %s\n" "$name" "$mode" "${pid:--}" "${port:--}" "$state"
    done
    if [ "$found" = 0 ]; then echo "(no beads repos under $projects)"; fi

# REPO may be a bare name under BEADS_PROJECTS_DIR (e.g. `vs`) or a path.
# Idempotent: safe to run whether the repo is jammed, healthy, or stopped.
# Recover a jammed server-mode repo: kill the lock holder, then `bd dolt start`.
dolt-restart repo:
    #!/usr/bin/env bash
    set -uo pipefail
    projects="{{beads_projects}}"
    repo="{{repo}}"
    if [ -d "$repo/.beads" ]; then dir="$repo"; else dir="$projects/$repo"; fi
    if [ ! -d "$dir/.beads" ]; then
      echo "no beads repo at '$dir' (.beads not found)" >&2
      exit 1
    fi
    dir="$(cd "$dir" && pwd)"
    lock="$dir/.beads/dolt/.dolt/noms/LOCK"
    echo "repo: $dir"
    if [ -f "$lock" ] && pid=$(lsof -t "$lock" 2>/dev/null | head -1) && [ -n "$pid" ]; then
      echo "killing dolt server holding the lock (pid $pid) …"
      kill "$pid" 2>/dev/null || true
      for _ in $(seq 1 25); do          # wait up to ~5s for a clean shutdown flush
        lsof -t "$lock" >/dev/null 2>&1 || break
        sleep 0.2
      done
      if lsof -t "$lock" >/dev/null 2>&1; then
        echo "lock still held after SIGTERM — escalating to SIGKILL …"
        kill -9 "$pid" 2>/dev/null || true
        sleep 0.5
      fi
    else
      echo "no process holding the lock (nothing to kill)"
    fi
    echo "starting dolt the intended way (bd dolt start) …"
    ( cd "$dir" && bd dolt start )
    if ( cd "$dir" && bd list >/dev/null 2>&1 ); then
      echo "OK — '$repo' reachable"
    else
      echo "WARN — bd list still failing; inspect with 'just dolt-ps'" >&2
      exit 1
    fi
