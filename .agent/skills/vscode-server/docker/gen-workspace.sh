#!/usr/bin/env bash
# Generate a multi-root .code-workspace from the beads repos found under the
# projects root, so the vscode-beads extension discovers every one as a project.
#
# Discovery is belt-and-suspenders and ADDITIVE: each repo is added BOTH as a
# workspace folder AND to the `beads.projects` setting. The extension unions all
# discovery sources (workspace folders + beads.projects + BEADS_DIR) and dedupes
# by resolved .beads path, so listing a repo twice is harmless — it just makes
# discovery robust regardless of which mechanism the extension prefers.
#
# Re-run any time the set of repos changes (the `rescan` recipe does this in the
# running container); reload the browser afterward.
set -euo pipefail

projects_root="${BEADS_PROJECTS_ROOT:-/home/workspace/projects}"
out="${WORKSPACE_FILE:-/home/workspace/beads-dev.code-workspace}"

repos=()
if [[ -d "$projects_root" ]]; then
  for d in "$projects_root"/*/; do
    d="${d%/}"
    [[ -d "$d/.beads" ]] && repos+=("$d")
  done
fi

folders_json=""
projects_json=""
if [[ ${#repos[@]} -gt 0 ]]; then
  for i in "${!repos[@]}"; do
    sep=','; [[ $i -eq $((${#repos[@]} - 1)) ]] && sep=''
    folders_json+=$(printf '\n    { "path": "%s" }%s' "${repos[$i]}" "$sep")
    projects_json+=$(printf '\n      "%s/.beads"%s' "${repos[$i]}" "$sep")
  done
else
  # No beads repos found — open the parent dir so the window still loads.
  folders_json=$(printf '\n    { "path": "%s" }' "$projects_root")
fi

cat > "$out" <<EOF
{
  "folders": [${folders_json}
  ],
  "settings": {
    "beads.projects": [${projects_json}
    ]
  }
}
EOF

echo "[gen-workspace] wrote $out with ${#repos[@]} project(s): ${repos[*]:-(none)}"
