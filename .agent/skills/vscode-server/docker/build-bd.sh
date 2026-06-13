#!/usr/bin/env bash
# Build the Gas Town `bd` CLI for the dev image — natively inside a Linux
# container, NOT cross-compiled on the host.
#
# Why a container build: embedded Dolt requires CGO (Makefile: `export
# CGO_ENABLED := 1`, "Dolt backend requires CGO for embedded database support").
# Cross-compiling Go *with CGO* from macOS needs a C cross-toolchain we don't
# have. Building inside golang:<ver>-bookworm (Debian, ships gcc) on Apple
# Silicon is a NATIVE linux/arm64 CGO build — no cross-toolchain, no zig.
#
# Source:  ~/repos/beads (gastownhall fork) — override with BEADS_SRC.
# Target:  linux/arm64 by default (Apple Silicon) — override with GOARCH=amd64.
# Recipe:  mirrors the beads Makefile `build` target:
#            CGO_ENABLED=1  -tags gms_pure_go  -ldflags "-X main.Build=<short-sha>"
#          (Version is hardcoded "1.0.5" in cmd/bd/version.go.)
set -euo pipefail

BEADS_SRC="${BEADS_SRC:-$HOME/repos/beads}"
GOARCH="${GOARCH:-arm64}"
GO_IMAGE="${GO_IMAGE:-golang:1.26-bookworm}"
out_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$out_dir/bd-linux-${GOARCH}"

if [[ ! -d "$BEADS_SRC" ]]; then
  echo "ERROR:beads source not found at $BEADS_SRC (set BEADS_SRC)" >&2
  exit 1
fi
if ! command -v docker &>/dev/null; then
  echo "ERROR:docker not found (needed to build bd in a linux container)" >&2
  exit 1
fi
if ! docker info &>/dev/null; then
  echo "ERROR:docker daemon not reachable (is Docker Desktop running?)" >&2
  exit 1
fi

git_build="$(cd "$BEADS_SRC" && git rev-parse --short HEAD)"
echo "Building bd (linux/$GOARCH, CGO) from $BEADS_SRC @ $git_build in $GO_IMAGE ..."

# Native build inside the container:
#   -u so the output binary is owned by the host user, not root
#   GOCACHE/GOMODCACHE under /tmp (world-writable) since HOME is unset with -u
#   -buildvcs=false: .git in the ro mount + non-root user trips git's ownership
#     check; we pass the commit via ldflags anyway
docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e CGO_ENABLED=1 \
  -e GOOS=linux \
  -e GOARCH="$GOARCH" \
  -e GOCACHE=/tmp/gocache \
  -e GOMODCACHE=/tmp/gomodcache \
  -e GOFLAGS=-buildvcs=false \
  -v "$BEADS_SRC":/src:ro \
  -v "$out_dir":/out \
  -w /src \
  "$GO_IMAGE" \
  go build -tags gms_pure_go -ldflags "-X main.Build=$git_build" -o "/out/bd-linux-${GOARCH}" ./cmd/bd

echo "BD_BUILD:$git_build"
echo "Wrote $out"
file "$out" 2>/dev/null || true
