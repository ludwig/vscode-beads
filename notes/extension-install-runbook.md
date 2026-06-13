# Installing the .vsix locally — runbook

How to package, install, and verify the extension in **local VS Code** (desktop).
For the Docker test environment instead, see
[`openvscode-harness-runbook.md`](openvscode-harness-runbook.md).

Per fork policy we do **not** publish to the Marketplace / Open VSX — the `.vsix`
is the distributable, installed privately. See `CLAUDE.local.md`.

## 1. Package

```bash
just package          # = bun run package (vsce package); builds dist/ first
# → vscode-beads-pm-<version>.vsix at the repo root (version matches package.json)
```

The `.vsix` is gitignored, so it won't be committed; rebuild it whenever needed.
Requires `@vscode/vsce` (a devDependency — `bun install` provides it; vs-6uy).

## 2. Install

```bash
code --install-extension vscode-beads-pm-<version>.vsix
# verify it registered (extension id = <publisher>.<name>):
code --list-extensions --show-versions | grep -i beads
# → ludwig.vscode-beads-pm@<version>
```

The id is `ludwig.vscode-beads-pm` (`publisher` = `ludwig`, `name` =
`vscode-beads-pm`). This deliberately differs from upstream's
`planet57.vscode-beads` so the fork can coexist with — and never be confused
for — jdillon's build (vs-m6k).

Alternative: drag the `.vsix` onto the VS Code window, or
Extensions view → `…` menu → **Install from VSIX…**.

### Reinstalling / upgrading

`--install-extension` overwrites an in-place install of the same id. If a build
seems stale after reinstall, fully reload (Cmd+Shift+P → **Developer: Reload
Window**) or quit and reopen VS Code. To remove:

```bash
code --uninstall-extension ludwig.vscode-beads-pm
```

Note: don't run a symlinked dev install (`~/.vscode/extensions/vscode-beads`)
and a VSIX install of the same id at once — uninstall/remove one first.

## 3. Verify it activates

1. Reload the window (Cmd+Shift+P → **Developer: Reload Window**) or restart VS Code.
2. Open a folder/workspace that contains a Beads project (a `.beads/` dir). For a
   server-mode board: `~/beads/vs` (see the harness runbook for the `~/beads`
   layout). The extension only activates when a `.beads` project is present.
3. Open the **Beads** activity-bar container and confirm the views load:
   - **Dashboard**, **Issues**, **Details**, plus the ready/blocked views.
   - The Issues list populates from `bd list --json` (no error toast).
   - Selecting an issue paints the Details pane.
4. Sanity-check the `bd` binary the extension shells out to is reachable on PATH
   (`which bd`). If the board is server-mode and won't load, the Dolt server may
   be jammed — recover with `just dolt-restart vs` (see the harness runbook).

If activation fails, check the Output panel → **Beads** channel and the
Extension Host log (Cmd+Shift+P → **Developer: Show Logs… → Extension Host**).

## Session / incident log

### 2026-06-13
- vs-6uy made `bun run package` work locally (`@vscode/vsce` devDep) → PR #8, merged.
- Added `just build/watch/lint/test/package` wrappers → PR #9, merged.
- vs-cuc: packaged via `just package`, installed into local VS Code (1.124.2)
  with `code --install-extension`. First install verified registered as
  `planet57.vscode-beads@0.13.0` (pre-rebrand).
- vs-m6k: rebranded the fork identity — `publisher` `planet57`→`ludwig`,
  `name` `vscode-beads`→`vscode-beads-pm`, `displayName` `Beads`→`Beads (ludwig)`,
  and fixed `repository.url` (pointed at jdillon's upstream). Centralized the
  in-code `beads` config namespace + log prefix into `src/constants.ts`.
  Repackaged as `vscode-beads-pm-0.13.0.vsix`; uninstalled the old
  `planet57.vscode-beads`, installed `ludwig.vscode-beads-pm`.
