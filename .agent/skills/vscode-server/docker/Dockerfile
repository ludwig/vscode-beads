# Custom openvscode-server image for testing the vscode-beads extension.
#
# openvscode-server ships Linux-only, so the extension host runs in Linux. We
# bake the Gas Town `bd` CLI into the image (cross-compiled by build-bd.sh) so
# BeadsBackend can spawn `bd` exactly as it would on macOS.
#
# Pinned to 1.105.1 (>= the extension's engines.vscode ^1.85.0). NOTE: the
# Docker image tags lag the GitHub release tags (releases reach 1.109.x, but the
# newest published image is 1.105.1). The base image is multi-arch; on Apple
# Silicon Docker pulls linux/arm64, which is why build-bd.sh defaults to arm64.
FROM gitpod/openvscode-server:1.105.1

ARG BD_ARCH=arm64

USER root

# Gas Town `bd`, cross-compiled from ~/repos/beads — see build-bd.sh.
COPY bd-linux-${BD_ARCH} /usr/local/bin/bd
RUN chmod +x /usr/local/bin/bd && bd version || true

# Dolt sql-server binary — required only for SERVER-mode repos: `bd dolt start`
# execs an external `dolt` (doltserver.go LookPath("dolt")), whereas embedded
# mode uses bd's in-process engine and needs no `dolt`. Official prebuilt
# release (no build step). Pinned to match the host dolt that creates our
# server repos — parity over newest.
ARG DOLT_VERSION=2.1.5
RUN set -eux; \
    url="https://github.com/dolthub/dolt/releases/download/v${DOLT_VERSION}/dolt-linux-${BD_ARCH}.tar.gz"; \
    curl -fsSL "$url" -o /tmp/dolt.tar.gz; \
    tar -xzf /tmp/dolt.tar.gz -C /tmp; \
    install -m 0755 "/tmp/dolt-linux-${BD_ARCH}/bin/dolt" /usr/local/bin/dolt; \
    rm -rf /tmp/dolt.tar.gz "/tmp/dolt-linux-${BD_ARCH}"; \
    HOME=/tmp dolt version
# NOTE: validate with HOME=/tmp so root doesn't create a root-owned
# /home/workspace/.dolt that uid-1000 can't write to at runtime.

COPY entrypoint.sh /usr/local/bin/dev-entrypoint.sh
RUN chmod +x /usr/local/bin/dev-entrypoint.sh

USER openvscode-server

# Pre-seed Dolt's global identity AS THE RUNTIME USER, so `bd dolt start`'s
# ensureDoltIdentity finds it already set (`dolt config --global --get`) and
# never attempts a runtime `dolt config --global` write. This also creates
# ~/.dolt owned by uid 1000 (HOME=/home/workspace), fixing the root-owned-dir
# write failure. Overridable at runtime via the entrypoint's git identity.
RUN HOME=/home/workspace dolt config --global --add user.name "vscode-beads-dev" \
 && HOME=/home/workspace dolt config --global --add user.email "dev@vscode-beads.local" \
 && HOME=/home/workspace dolt config --global --list

ENTRYPOINT ["/usr/local/bin/dev-entrypoint.sh"]
