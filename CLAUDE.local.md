# CLAUDE.local.md (fork-local)

Fork-specific guidance. Auto-loaded by Claude alongside the upstream-tracked
`CLAUDE.md` at the repo root. Keep fork-only conventions here so we never
clobber the upstream root file when syncing.

## This is a fork

- **`origin`** → `ludwig/vscode-beads` (our fork — push here)
- **`upstream`** → `jdillon/vscode-beads` (the original — pull from, don't push)

When syncing from upstream, the root `CLAUDE.md` may change. Do not move
fork-only notes into it; they live here.

## Active branch: `develop`

We work in **`develop` mode** from now on. `develop` is our fork's active
integration branch and tracks `origin/develop`.

- Branch feature/fix work off `develop` (e.g. `fix/...`, `feat/...`) and merge back into `develop`.
- `main` stays clean and aligned with upstream for clean merges/rebases.
- Open PRs against `develop` on our fork, not against upstream `main`.

## Working on this fork

- Default base branch for new work is `develop`, not `main`.
- Keep the upstream sync path easy: avoid editing the root `CLAUDE.md` for
  fork-only concerns; put them here instead.

## SDLC / working rhythm (learned the hard way — 2026-06-14)

A long session piled ~12 beads of unrelated work onto one grab-bag branch
(`fix/title-action-order-vs-qi5`) with nothing committed until the end. Don't
do that. Rules:

- **Branch per bead (or one tight cluster of closely-related beads)**, off
  `develop`. Do NOT pile unrelated work onto an existing feature branch just
  because it's checked out. The branch name should describe the work, not the
  first bead that happened to land there.
- **Commit the moment a unit is green** — build + lint + `tsc --noEmit` pass.
  Don't accumulate. Small atomic commits over one end-of-session blob.
- **One bead per solved issue, then close it** with a reason. The user relies
  on these as a record — keep making them even for small fixes.
- **Add tests, don't just compile.** The repo has Jest (`bun run test`).
  build + lint + tsc prove it *compiles*, not that it *works*. Cover testable
  logic (filter/preset mapping, state persistence, discovery/branching logic)
  with unit tests. Compile-green is not "done".
- **Verify behavior, not just types.** "Please reload and check" is not
  verification. Per the root `CLAUDE.md`, the human drives the reload/test
  loop — so explicitly call out what still needs a runtime smoke and why.
- **Always run `tsc --noEmit` before claiming done.** esbuild transpiles
  without type-checking, so the build can pass with type errors.

## Architecture gotchas in this codebase

- **Message-type unions are duplicated**: `src/backend/types.ts`
  (`ExtensionToWebviewMessage` / `WebviewToExtensionMessage`) and
  `src/webview/types.ts` (`ExtensionMessage` / `WebviewMessage`) are maintained
  *by hand* and must stay in sync. Adding a message variant means editing BOTH;
  drift compiles cleanly on each side and only breaks at runtime. A shared
  types module is the real fix — prefer that over adding to both again.
- **Editing a base/shared CSS class? Grep its usages first.** `.bead-id` /
  `.bead-title` are shared by the Issues table AND the Dashboard cards; a global
  change there regressed the Dashboard. When changing default behavior of a
  shared class, scope the new behavior under a modifier (e.g.
  `.beads-table.compact`) and leave the base untouched.
- **Cross-view webview messaging is fire-and-forget with a timing race.**
  Views are separate webviews; to push state (e.g. a Dashboard click filtering
  the Issues list) you focus the target view then post to its provider, which
  must hold the payload (`pendingFilter`) until the webview signals `ready`
  (`initializeView`). Don't clear the pending payload on an optimistic
  pre-`ready` post — always (re)flush on `initializeView` and dedupe on the
  webview side with a monotonic `seq`.

## Distribution: private fork, no public publishing

- This is a **private fork developed in the open on GitHub but unannounced** —
  we are **not** publishing a public extension.
- Ignore the upstream publishing docs (`docs/publishing/vscode-marketplace.md`,
  `docs/publishing/open-vsx.md`) and the `publisher: planet57` field in
  `package.json` — those are upstream (jdillon's) identity/channels, not ours.
- The installable artifact is just a **`.vsix`**: `bun run package` →
  `vscode-beads-<version>.vsix`, distributed/installed privately
  (`code --install-extension <file>.vsix` or drag into the editor).
  **No `vsce publish` / `ovsx publish`.**

## The `bd` binary we run

- The `bd` CLI on PATH (`~/go/bin/bd`) is **compiled from `~/repos/beads/`**,
  whose `origin` is **`gastownhall/beads`** (the Gas Town fork) — NOT
  `steveyegge/beads`. Current build: `1.0.5 (9a1c88b63)`.
- This matters: the root `CLAUDE.md` "Upstream Sync" section points
  `~/ws/reference/beads` at `steveyegge/beads`. For CLI/daemon behavior of the
  binary we actually run, check `~/repos/beads/` instead.
- Gas Town divergence to watch: **embedded Dolt is the default backend** there
  (`bd init` → in-process engine, no sql-server, no port).
- **The extension supports BOTH modes** (don't trust older notes saying
  otherwise). `src/backend/doltMode.ts` detects the mode and routes the backend:
  `server` → `BeadsDoltBackend` (SQL via `mysql2` to a `host:port`); everything
  else → `BeadsCommandRunner`, the CLI-safe path that spawns the `bd` binary.
  Embedded is the *default* safe path, so embedded-mode repos open fine via the
  CLI backend. `bd init --server` is only needed when you specifically want the
  SQL/Dolt-server backend. See `~/repos/agent-beads/docs/` for the canonical
  repo-creation recipe.
