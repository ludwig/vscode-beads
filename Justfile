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
