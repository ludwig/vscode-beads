# notes/

Fork-local working notes, runbooks, and hard-won gotchas for
**`ludwig/vscode-beads`**. Not upstream — this directory is ours.

These are the terse, operational counterpart to the reference docs in
[`../docs/`](../docs/): quick command tables, recovery procedures, and a running
log of decisions/incidents. When something here matures into stable reference
material, promote it into `docs/`.

## Index

- [openvscode-harness-runbook.md](openvscode-harness-runbook.md) — running the
  openvscode-server (Docker) test harness: lifecycle commands, the `~/beads`
  layout, and Dolt server gotchas (incl. recovering a jammed server-mode repo).
- [extension-install-runbook.md](extension-install-runbook.md) — packaging the
  `.vsix` and installing/verifying it in local VS Code (`just package` →
  `code --install-extension`).
