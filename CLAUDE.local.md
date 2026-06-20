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

- **Message-type unions live in ONE place now**: the webview↔extension
  protocol and its payload shapes are a single source of truth in
  `src/shared/contract.ts`. Both `src/backend/types.ts`
  (`ExtensionToWebviewMessage` / `WebviewToExtensionMessage`) and
  `src/webview/types.ts` (`ExtensionMessage` / `WebviewMessage`) just *re-export*
  from it. Add a new message/payload variant ONCE in `contract.ts` — never
  hand-edit both sides again. A compile-time parity test
  (`src/shared/contract-parity.type-test.ts`) guards the two sides.
  (Historical note: these unions used to be duplicated and hand-maintained,
  which drifted silently; the shared module fixed that.)
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

## Distribution & "publish": private fork, `.vsix` only

**What "publish" / "release" means here — read this before touching the release
flow, so we stop relearning it:**

- This is a **private fork developed in the open on GitHub but unannounced**. We
  are **NOT** a public extension. For us, **"publish" NEVER means a registry** —
  there is **no VS Code Marketplace and no Open VSX publish, ever**
  (`vsce publish` / `ovsx publish` are forbidden; we have no `VSCE_PAT`/`OVSX_PAT`
  and `publisher: planet57` is jdillon's identity, not ours).
- **The deliverable is the `.vsix`.** "Do a release build" = produce
  `vscode-beads-pm-<version>.vsix` and install/distribute it privately
  (`code --install-extension <file>.vsix`, or drag into the editor).
- **Canonical commands (use the Justfile — see below):**
  - `just package` → build + package → `vscode-beads-pm-<version>.vsix`
    (equivalent to `bun run package`; note the artifact is `vscode-beads-pm-*`,
    NOT `vscode-beads-*`).
  - `just install` (alias `just update`) → package + (re)install into local VS
    Code + prompt reload. This is the everyday "ship it to my editor" path.
- **A "release"** (when we want a tagged version) = bump `package.json` version
  + finalize the `CHANGELOG.md` `[Unreleased]` section into `## [x.y.z] - date`
  + commit `chore: release vX.Y.Z` + tag `vX.Y.Z`. We release from **`develop`**
  (our integration branch), minor-bumping — NOT from `main` (the upstream
  `project-release` skill assumes `main`; ignore that part).
- **⚠️ `/.github/workflows/release.yml` is broken-by-inheritance for us.** On a
  `v*` tag it runs `Package VSIX → publish to Marketplace → publish to Open VSX
  → Create GitHub Release`. The two publish steps **fail by design**
  (`TF400813: not authorized`) and kill the run **before** the GitHub Release
  step, so CI produces **no artifact** (this is why v0.17.1's release "failed").
  Until that workflow is fixed (drop both publish steps; keep package +
  `softprops/action-gh-release`; fix the body URL from `jdillon` → `ludwig`),
  **don't rely on CI for the artifact** — build it locally with `just package`
  and, if you want a GitHub Release, attach the `.vsix` yourself
  (`gh release create vX.Y.Z <file>.vsix`).
- Ignore the upstream publishing docs (`docs/publishing/vscode-marketplace.md`,
  `docs/publishing/open-vsx.md`) — upstream channels, not ours.

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
