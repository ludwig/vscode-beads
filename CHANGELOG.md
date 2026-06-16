# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Dashboard summary cards (Total / Open / Doing / Blocked) are now clickable — each opens the Issues view pre-filtered to the matching status (Total shows all) (vs-i06)
- Dashboard **By Status** and **By Label** breakdown rows are clickable too — drilling into the Issues list filtered to that status or label (vs-gnb)
- Double-click a column separator in the Issues table to auto-fit that column to its contents (vs-4rt)
- Compact-rows toggle on the Issues table — a toolbar button packs the bead ID and title onto one line and tightens cell padding for a denser list; the default (ID stacked above title) is unchanged, and the choice persists across reloads (vs-6od)
- Dashboard now has a header band showing **Beads Directory** + the active project's `~`-abbreviated path (click to open the folder; replaces the old "Project Dir" row), and the **By Status** / **By Label** breakdowns are collapsible — giving the project dropdown breathing room from the section bars (vs-d6g, vs-omk, vs-dys)
- Open a bead's Details as an editor tab — `beads.openBeadInTab` and a Details-view title action open the bead in the editor area (alongside code, multiple beads at once), de-duped so reopening the same bead focuses its tab (vs-ask)
- Open the Issues list as an editor tab — `beads.openIssuesInTab` and an Issues-view title action open the filterable list in the editor area, de-duped to a single tab (vs-fx4)
- Open the Dashboard as an editor tab — `beads.openDashboardInTab` and a Dashboard-view title action open the overview in the editor area, de-duped to a single tab (vs-s56)
- Dashboard now shows build identity — `v<version> · <short-sha>✦` (✦ = built with uncommitted changes), stamped into `dist/build-info.json` at compile time and read at activation, so it's clear exactly which build is installed (vs-c9z)
- Auto-discover Beads projects under `~/beads/` (each child dir with a `.beads/`), additively alongside workspace folders, the `beads.projects` setting, and `$BEADS_DIR` (vs-3r2)
- Project switcher menu now labels each entry as a bead directory, showing its home-abbreviated path and an issue-prefix badge (rendered as `prefix-` to read like an issue ID); prefix resolved cheaply during discovery from `.beads/config.yaml`, else the dir name (vs-3r2)
- Declared the `beads.projects` setting in the configuration schema so it appears in the Settings UI with validation (vs-b7o)
- Create issues from the UI: a "New Issue" button on the Issues/Dashboard views and a `beads.createIssue` command open a create form in the Details view (vs-69z)
- Surface the active issue prefix (e.g. `vs`), derived from the loaded issue IDs, in the project dropdown trigger and the status bar so it's always clear which root is active (vs-kmt)
- Issues list is now also available as a tab in the bottom panel (next to Terminal/Problems), as an independent view that stays in sync with the sidebar Issues list

### Changed

- Refresh is now a title-bar action on every Beads view (Dashboard, both Issues lists, and Details, which previously had none); removed the redundant in-webview "Refresh" item from the Dashboard's actions menu so reload consistently lives in the view chrome
- Issues table column header row is shorter (trimmed vertical padding) (vs-4rt)
- Issues table dates (Updated/Created) render smaller and muted (10px) so they read as secondary metadata instead of out-sizing the title (vs-xe1)
- Explicitly-configured Beads projects (`beads.projects`, `$BEADS_DIR`, workspace folders) that don't exist or aren't a Beads project are now logged as warnings instead of silently skipped; the `~/beads` auto-scan stays quiet (vs-jse)
- Reordered Dashboard/Issues view title actions so the share-link (open-in-editor-tab) sits in the middle and Refresh moves to the rightmost edge, matching the Details view where the common op (Copy ID) sits at the edge (vs-qi5)
- Details-view markdown is now sanitized with DOMPurify before rendering (defense-in-depth atop the webview CSP), and links are routed through the extension: workspace paths open in the editor, http(s)/mailto open in the system handler, and unsafe schemes (`javascript:`, `file:`, …) are dropped (vs-9xx)
- Rebranded the fork's extension identity: id is now `ludwig.vscode-beads-pm` (`publisher` `planet57`→`ludwig`, `name` `vscode-beads`→`vscode-beads-pm`, `displayName` `Beads`→`Beads (ludwig)`), so this private fork coexists with upstream's build; also corrected `repository.url` (vs-m6k)
- Issues list now shows all beads (open and closed) instead of the newest 50 — the CLI backend no longer inherits bd's default `--limit 50` (vs-0bq)
- Dashboard header label now reads "Active Beads Directory" (slightly larger), and the project-switcher dropdown header reads "Beads directory" (was "Bead directory") (vs-d7s)
- Task type icon changed from a checked box (which read as "done") to a list (`list-ul`), in the Issues list, Kanban cards, and Details header (vs-3x0)

### Fixed

- Issues table no longer clips the right edge of the Type/Status badges (Type and Status columns widened); the Type badge font is a touch smaller, and the leading type icon + badges now sink onto the title line instead of floating in the 1.75-line rows (vs-xy5)
- Issues-list Type badges now share a width, so the "Type" column and the type filter menu line up instead of reading as ragged (the rare long `merge-request` is an accepted outlier) (vs-b48)
- Project-switcher prefix badges now share a width (sized to the widest prefix in the set), so the project name/path column starts at a common x instead of reading as ragged (vs-od3)
- Dropdown menus no longer render semi-transparent — the menu background falls back through universal surface tokens when `--vscode-dropdown-listBackground` is undefined (vs-k71)
- `beads.userId` and `beads.pathToBd` now expand `${env:VAR}` placeholders (#60)
- Edits now refresh sibling views (panel, dashboard, details) immediately instead of waiting for a manual Refresh (vs-mxq)
- Relative timestamps no longer say "just now" for up to a minute — only the first 10 seconds read "just now", then "Ns ago" — so the Details footer stops over-reporting "now"
- Restored a valid TypeScript `module`/`moduleResolution` pairing so `tsc` type-checks again

### Performance

- Selecting a bead no longer spawns a second concurrent `bd` process for comments when there are none, avoiding embedded-Dolt lock contention (vs-266)
- Details pane now paints the fields already known from the list row (title/status/priority/description/labels/type/assignee) the instant a bead is selected, then reconciles deps/comments when `bd show` returns — no full-pane loading flash on a cold embedded spawn (vs-7s7)

## [0.13.0] - 2026-03-20

### Added

- Direct Dolt-backed backend with bd cli execution to bootstrap config/locations
- Projects panel for project and server management
- Real-time change detection via Dolt change-token polling

### Changed

- Project switching now updates immediately with improved loading feedback
- Removed daemon-era terminology and management surfaces
- Removed "Create Issue" quick command from editor UI

### Removed

- Daemon RPC client and socket management (removed in beads v0.50.0)
- Daemon start/stop commands and status bar lifecycle controls
- Auto-start daemon setting and zombie daemon detection

### Breaking Changes

- Requires beads v0.50.0 or later (daemon removed upstream)

### Fixed

- Dashboard project link hover target now limited to path text only
- Project switching no longer stalls on refresh sequencing
- Backend discovery and loading more stable with reduced refresh churn
- CLI backend properly isolated per project using BEADS_DIR
- Harden Dolt backend lifecycle and restore dashboard drill-down/refresh

## [0.12.0] - 2026-01-31

### Added

- Kanban board view toggle for Issues panel ([#56](https://github.com/jdillon/vscode-beads/pull/56) by [@micahbrich](https://github.com/micahbrich)) (`vsbeads-h5f`)
- Display bead IDs directly on kanban cards for quick reference (`vsbeads-zsz`)
- Display labels on kanban cards with truncation for long label lists (`vsbeads-89u`)
- Make all kanban columns collapsible, including the closed column (`vsbeads-cjh`)
- Use Lucide icons for kanban/table view toggle instead of Font Awesome (`vsbeads-uvh`)
- Improved filter state visibility: show "3/5" count when filters hide items
- Configurable tooltip delay on bead hover (set to 0 to disable) (`vsbeads-uvh`)

### Fixed

- DetailsView crashes when encountering unknown dependency types (`vsbeads-e74`)

## [0.11.0] - 2025-12-30

### Added

- Support for merge-request and molecule bead types (`vsbeads-rt9j`)
- Dependency type selector with direction support when editing (`vsbeads-hw6t`)
- Fallback handling for unknown bead types (`vsbeads-madg`)
- Type sort order for consistent epic-first display (`vsbeads-6d1`)
- Markdown links to relative files open in VS Code editor (`vsbeads-2byn`)

### Fixed

- Labels column empty on fresh VS Code startup (`vsbeads-re92`)
- Details panel children list vanishes when bead is updated (`vsbeads-u5xh`)
- Tooltip content shows raw markdown instead of rendered (`vsbeads-79pr`)
- Dependency display reordered: parent first, then children (`vsbeads-ifcn`)
- Show P? badge for dependencies with undefined priority (`vsbeads-mwr`)

## [0.10.0] - 2025-12-17

### Added

- Update activity bar icon with improved beads artwork (`vsbeads-94s`)

### Fixed

- Eliminate excessive spacing in markdown lists (`vsbeads-l27`)
- Edit mode now supports external_ref and estimate fields (`vsbeads-96o`, `vsbeads-7r2`)
- Improve external_ref display with clickable URL links (`vsbeads-7ba`)
- Normalize control heights to 20px across all panels (`vsbeads-cf6`)
- Add retry resilience for transient daemon errors (database is closed) (`vsbeads-m98`)

## [0.9.0] - 2025-12-11

### Added

- Label filter option for Issues list with autocomplete and counts (`vsbeads-65h`)
- FontAwesome icons for issue types and UI elements
- Tag/label icon to label displays (`vsbeads-qlp`)
- Time display in timestamps in Details panel footer (`vsbeads-ipb`)
- Improved timestamp display formatting (`vsbeads-vq3`)

### Fixed

- Typography inconsistency across dropdown menus (`vsbeads-efp`)

## [0.8.0] - 2025-12-10

### Added

- Assignee column and filter to Issues view with "Assign to me" quick action (`vsbeads-s2c`)
- Move labels inline with type/status/priority badges at top of Details panel (`vsbeads-677`)
- Timestamp component with timezone-aware display and adaptive formatting (`vsbeads-5bz`, `vsbeads-izh`)

### Fixed

- Clicking bead ID in Issues list now selects row and updates Details panel (`vsbeads-qgo`)
- Dropdown menus now close when clicking outside webview panel (`vsbeads-tbq`)
- Timestamp sorting now handles cross-timezone comparisons correctly (`vsbeads-5bz`)

## [0.7.0] - 2025-12-08

### Added

- Windows TCP socket support for daemon connection ([#30](https://github.com/jdillon/vscode-beads/pull/30) by [@cg-shmoop](https://github.com/cg-shmoop))

### Fixed

- Auto-recover from stale daemon socket after system reboot (`vsbeads-ugm`)
- Centralize daemon error notifications to avoid notification spam (`vsbeads-ugm`)

## [0.6.0] - 2025-12-05

### Added

- Error notifications when bd commands fail with output console access (`vsbeads-ycx`)
- Persist sort order, column visibility, and column order across reloads (`vsbeads-4fw`)
- Multi-column sorting with shift+click for secondary sort (`vsbeads-gsb`)

### Fixed

- Dynamic updates from daemon events now properly registered (`vsbeads-7eg`)
- Project list now refreshes when workspace folders are added/removed (`vsbeads-s4i`)
- Button press feedback now visible on webview buttons (`vsbeads-zsy`)
- Browser context menu disabled on Issues table (`vsbeads-zvs`)
- Global search now works correctly with TanStack Table
- Column resize no longer triggers column reorder

### Changed

- Issues view migrated to TanStack Table v8 (`vsbeads-4uw`, `vsbeads-7yz`)
- Updated beads logo SVG in activity bar icon (`vsbeads-94s`)

## [0.5.0] - 2025-12-03

### Added

- Project selector in Dashboard view for consistency (`vsbeads-xbq`)
- "Start Daemon" button on socket connection errors (`vsbeads-xbq`)
- Custom project dropdown with daemon status indicators per project (`vsbeads-d8u`)
- Status bar item showing daemon health with click-to-manage menu (`vsbeads-ly2`)
- Daemon restart command and zombie daemon detection (`vsbeads-ly2`)
- Prompt to init uninitialized projects with terminal helper (`vsbeads-ly2`)

### Fixed

- UI no longer blocked when daemon not running - project switching always available (`vsbeads-xbq`)
- Improved daemon start logging - shows command, cwd, and errors (`vsbeads-868`)
- Project dropdown now updates status indicators on daemon connect/disconnect (`vsbeads-ly2`)

### Changed

- Extracted reusable `Dropdown` and `ChevronIcon` components for consistent dropdown behavior
- Upgraded logging to use VS Code's `LogOutputChannel` for colored output and log levels (`vsbeads-868`)

## [0.4.0] - 2025-12-01

### Added

- Assignee and Estimate columns (hidden by default) (`vsbeads-kz0`)
- Comments render with markdown support (`vsbeads-rtk`)

### Fixed

- Column resize now works properly in Issues list (`vsbeads-oqb`)
- Table fills container width while respecting column minimums (`vsbeads-385`)
- Labels column shows all labels with ellipsis overflow (`vsbeads-8et`)
- Badge cells clip cleanly without ellipsis on overflow
- Column menu closes on click outside (`vsbeads-1nq`)
- Removing labels via X button now persists on save (`vsbeads-7g6`)
- Save button disabled when no pending changes
- Menus close when clicking outside VS Code webview
- Filter preset selector now uses styled dropdown (`vsbeads-cp3`)
- Sort labels alphabetically (case-insensitive) in Issues and Details views (`vsbeads-qtl`)

### Changed

- Removed unused Kanban and Graph view code

## [0.3.0] - 2025-11-30

### Added

- Colored dropdowns for type/status/priority in edit mode (`vsbeads-fwp`)
- TypeBadge and FilterChip components (`vsbeads-fwp`)
- Inline editing from Details view with auto-save (`vsbeads-fwp`)

### Changed

- Badge text normalized to lowercase with small-caps (`vsbeads-fwp`)
- Badge sizing unified with CSS variables (`vsbeads-fwp`)

### Fixed

- Filter count overlay stays fixed when scrolling (`vsbeads-eeg`)
- Filter menu: added submenu indicators and click-outside dismiss (`vsbeads-3zm`)

## [0.2.0] - 2025-11-29

### Added

- Auto-generated label colors from label name with contrast-aware text (`vsbeads-gfr`)
- Version and timestamp logging on extension activation

### Changed

- Dependencies now grouped by relationship type: Parent/Children, Blocked By/Blocks, Discovered From/Spawned, Related (`vsbeads-bci`)

### Fixed

- Daemon client resilience with exponential backoff (1s → 30s) on polling errors (`vsbeads-5nm`)
- CLI syntax for daemon commands: `start/stop` → `--start/--stop`
- Null/undefined API response handling to prevent "Cannot read properties of null" errors

## [0.1.2] - 2025-11-28

### Added

- Click-to-copy bead ID in issues list rows (`vsbeads-fyn`)
- Blocked, Closed, and Epics filter presets (`vsbeads-fb7`)
- Copy ID button in Details panel title bar (`vsbeads-jru`)
- "Blocks" section in Details showing dependent issues with type-colored badges (`vsbeads-jue`)
- Status and priority badges in dependency/dependent lists (`vsbeads-c04`)
- Sort dependency lists by status then priority (blocked→in_progress→open→closed, then P0→P4)
- `compile:quiet` script for reduced build output

## [0.1.1] - 2025-11-27

### Added

- GitHub Actions CI workflow for PR/push validation (`vsbeads-vt6`)
- GitHub Actions release workflow for marketplace publishing (`vsbeads-vt6`)
- VSIX artifact upload on CI runs for manual testing (`vsbeads-vt6`)
- Marketplace icon and README attribution

## [0.1.0] - 2025-11-27

First public release.

### Features

- **Issues Panel** - Sortable, filterable table with search and column customization
- **Details Panel** - View/edit individual issues with markdown rendering
- **Multi-Project** - Auto-detects `.beads` directories, switch between projects
- **Daemon Management** - Auto-start option, status monitoring

### Technical

- React-based webviews with VS Code theming
- Communicates with Beads via `bd` CLI (JSON output)
- esbuild for extension and webview bundling
