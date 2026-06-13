#!/usr/bin/env bash
# Entrypoint for the vscode-beads dev image.
#
# Symlinks the read-only mounted extension source (/ext-src, the repo root) into
# a writable extensions dir, then launches openvscode-server. The repo's built
# dist/extension.js (produced by host `bun run watch`) is picked up on reload —
# same fast-iteration story as the old code-server symlink, just inside Linux.
set -euo pipefail

# Server-mode repos need a Dolt identity: `bd dolt start` calls ensureDoltIdentity,
# which seeds dolt's global user.name/email from git config. A fresh container has
# none, so set defaults here (overridable via BEADS_ACTOR/BEADS_EMAIL). Harmless
# for embedded repos, which never start a server.
git config --global user.name "${BEADS_ACTOR:-vscode-beads-dev}" 2>/dev/null || true
git config --global user.email "${BEADS_EMAIL:-dev@vscode-beads.local}" 2>/dev/null || true

ext_dir="${EXT_DIR:-/home/workspace/.dev-exts}"
mkdir -p "$ext_dir"

if [[ -d /ext-src ]]; then
  ln -sfn /ext-src "$ext_dir/planet57.vscode-beads-dev"
fi

# Generate the multi-root workspace from whatever beads repos are mounted under
# /home/workspace/projects, so every one shows up in the extension's project
# switcher. Open the printed ?workspace= URL to load it. Best-effort: a failure
# here must not stop the server from launching.
/usr/local/bin/gen-workspace.sh || echo "[entrypoint] gen-workspace failed; continuing"

exec "${OPENVSCODE_SERVER_ROOT}/bin/openvscode-server" \
  --host 0.0.0.0 \
  --port "${OVS_PORT:-3000}" \
  --without-connection-token \
  --extensions-dir "$ext_dir" \
  ${OVS_EXTRA_ARGS:-} "$@"
