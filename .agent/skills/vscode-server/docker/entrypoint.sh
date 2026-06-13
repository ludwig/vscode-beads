#!/usr/bin/env bash
# Entrypoint for the vscode-beads dev image.
#
# Symlinks the read-only mounted extension source (/ext-src, the repo root) into
# a writable extensions dir, then launches openvscode-server. The repo's built
# dist/extension.js (produced by host `bun run watch`) is picked up on reload —
# same fast-iteration story as the old code-server symlink, just inside Linux.
set -euo pipefail

ext_dir="${EXT_DIR:-/home/workspace/.dev-exts}"
mkdir -p "$ext_dir"

if [[ -d /ext-src ]]; then
  ln -sfn /ext-src "$ext_dir/planet57.vscode-beads-dev"
fi

exec "${OPENVSCODE_SERVER_ROOT}/bin/openvscode-server" \
  --host 0.0.0.0 \
  --port "${OVS_PORT:-3000}" \
  --without-connection-token \
  --extensions-dir "$ext_dir" \
  ${OVS_EXTRA_ARGS:-} "$@"
