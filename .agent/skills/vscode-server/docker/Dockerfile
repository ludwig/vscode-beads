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

COPY entrypoint.sh /usr/local/bin/dev-entrypoint.sh
RUN chmod +x /usr/local/bin/dev-entrypoint.sh

USER openvscode-server
ENTRYPOINT ["/usr/local/bin/dev-entrypoint.sh"]
