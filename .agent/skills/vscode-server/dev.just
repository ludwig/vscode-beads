# openvscode-server (Docker) dev harness for the vscode-beads extension.
# Imported as the `dev` module by the root Justfile → invoke as `just dev <recipe>`.
# Config lives in docker/.env; primitives are docker/{Dockerfile,docker-compose.yml,build-bd.sh}.

set dotenv-load := true
set dotenv-path := '.agent/skills/vscode-server/docker/.env'

docker_dir := source_directory() / 'docker'
env_file := docker_dir / '.env'
compose_file := docker_dir / 'docker-compose.yml'
compose := 'docker compose --env-file "' + env_file + '" -f "' + compose_file + '"'
container := 'vscode-beads-dev'

# List harness recipes
default:
    @just --list dev

# Build the linux bd binary (native CGO build inside a golang container)
bd:
    GOARCH="${BD_ARCH:-arm64}" GO_IMAGE="${GO_IMAGE:-golang:1.26-bookworm}" "{{docker_dir}}/build-bd.sh"

# Build the openvscode-server image (rebuilds bd first)
build: bd
    REPO_ROOT="$(git rev-parse --show-toplevel)" {{compose}} build

# Clean rebuild from scratch — use when image layers go stale
rebuild:
    rm -f "{{docker_dir}}/bd-linux-${BD_ARCH:-arm64}"
    GOARCH="${BD_ARCH:-arm64}" GO_IMAGE="${GO_IMAGE:-golang:1.26-bookworm}" "{{docker_dir}}/build-bd.sh"
    REPO_ROOT="$(git rev-parse --show-toplevel)" {{compose}} build --no-cache

# Compile the extension once (host, native bun)
compile:
    bun run compile:quiet

# Start host watch mode in the background (rebuilds dist/ on save)
watch:
    #!/usr/bin/env bash
    if pgrep -f "bun run watch" >/dev/null; then
      echo "watch already running (pid $(pgrep -f 'bun run watch' | head -1))"
    else
      nohup bun run watch >/tmp/vscode-beads-watch.log 2>&1 &
      echo "watch started (pid $!), log: /tmp/vscode-beads-watch.log"
    fi

# Bring the harness up: build image + extension, run container, print the URL
up: build compile watch
    REPO_ROOT="$(git rev-parse --show-toplevel)" {{compose}} up -d --force-recreate
    @echo "openvscode-server: http://127.0.0.1:${OVS_HOST_PORT:-3000}/?folder=/home/workspace/project"

# Stop the container and host watch mode
down:
    -pkill -f "bun run watch" 2>/dev/null || true
    REPO_ROOT="$(git rev-parse --show-toplevel)" {{compose}} down

# Show status of the container + host watch
status:
    #!/usr/bin/env bash
    echo "=== host watch ==="
    pgrep -f "bun run watch" >/dev/null && echo "running (pid $(pgrep -f 'bun run watch' | head -1))" || echo "not running"
    echo "=== container ==="
    if [ -n "$(docker ps -q --filter name={{container}})" ]; then
      docker ps --filter name={{container}}
      echo "bd: $(docker exec {{container}} bd version 2>/dev/null | head -1 || echo unavailable)"
    else
      echo "not running"
    fi

# The embedded-bd verification: version + list against the mounted workspace
verify:
    #!/usr/bin/env bash
    set -e
    echo "--- bd version (in container) ---"
    docker exec {{container}} bd version
    echo "--- bd list --json (in container workspace) ---"
    docker exec -w /home/workspace/project {{container}} bd list --json

# Diagnose the CGO chain: linkage of host-side vs in-image bd
doctor:
    #!/usr/bin/env bash
    # `file` exists on the host but NOT in the gitpod image, so for the in-image
    # binary we grep the ELF for the dynamic-linker path (present iff CGO/dynamic).
    host_bd="{{docker_dir}}/bd-linux-${BD_ARCH:-arm64}"
    if [ -f "$host_bd" ]; then
      echo "host bd:  $(file "$host_bd" | grep -o 'dynamically linked\|statically linked' || echo '?')"
    else
      echo "host bd:  (not built — run: just dev bd)"
    fi
    if docker image inspect {{container}}:latest >/dev/null 2>&1; then
      if docker run --rm --entrypoint sh {{container}}:latest -c 'grep -qa "ld-linux" /usr/local/bin/bd'; then
        echo "image bd: dynamically linked"
      else
        echo "image bd: statically linked"
      fi
    else
      echo "image bd: (image not built — run: just dev build)"
    fi
    echo "(want 'dynamically linked' on both = CGO on; 'statically linked' = CGO off → embedded broken)"

# Tail container logs
logs:
    docker logs -f {{container}}

# Open a shell in the container
shell:
    docker exec -it {{container}} bash

# Print the host port
port:
    @echo "${OVS_HOST_PORT:-3000}"
