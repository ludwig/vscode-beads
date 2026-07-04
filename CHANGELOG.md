# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Unified FilterBar across Kanban, Tree, and Graph** — all three now self-host the same `FilterBar` (preset, Ready, Favorites, status/priority/type/assignee/label chips with faceted counts) in the panel subtab *and* the editor tab, composing their local filter on top of the inherited scope as `(Filtered ? parentScope : all) ∩ resolve(localSpec)`, resolved webview-side by the same pure `resolveScope`/predicates the host uses. One affordance everywhere: a **funnel icon** that collapses the bar to a compact **ribbon** (reclaiming space during active work) and **glows blue** when filters are set; the ribbon lists the active filters concisely (or a muted "Add a filter…") with a right-aligned "N of M" count and the inherited Show-all/Show-filtered toggle. Graph keeps its layout/Focus/Auto-Layout controls in the bar's extra row (which now collapses with the funnel). **Issues is now migrated onto the same `FilterBar` too** — all four views are unified; the funnel is the master collapse everywhere (folds search + filters together), the active free-text search shows as an **x-able pill** (so a folded-away term stays visible), and the inherited-scope toggle is a demure right-aligned **"Filtered" pill**
- **Full-duplex Favorites star on the dashboard card** — a star on the Favorites card both reflects (filled = on) and drives the panel Issues Favorites filter, routed through the host so no view touches another; also the first slice of host-broadcast shared-filter state
- **"Reset visibility" on a hidden favorite's card menu** — un-hide a masked favorite straight from its right-click menu
- **Result count shows units** — the bar's count reads "251 issues" / "cards" / "beads" / "nodes" per view instead of a bare number
- **Tree column show/hide menu moved into the table header** (right edge, like the Issues table); the Tree's expand/collapse-all is now a single toggle button
- **Refresh icon spins while data loads** — the panel + editor-tab refresh reflects load progress (e.g. after toggling a favorite's eye/mask)
- **Right-click a panel tab to open it in an editor tab** — the Issues/Kanban/Tree/Graph tabs now have a context menu mirroring the toolbar's open-in-tab action, seeded with the panel's active filter
- **Drag-resize Tree columns** — the Tree's fixed columns are drag-resizable (persisted); the Title column absorbs the delta. Double-click a divider to reset both adjacent columns to their default widths
- **Editor-tab view heading** — a standalone editor-tab view shows a "<View> view for <project>" heading in its toolbar
- **Keyboard navigation in the Tree** — ↑/↓ move a roving row selection (without scrolling the pane), →/← expand/collapse the focused row (⇧ = whole subtree) or step to first-child/parent, Home/End jump to ends, Enter selects

### Changed

- **Issues density toggle sits right of the search box** — the compact/comfortable toggle moved from the trailing group into the search row (right of the textbox), mirroring the Tree's fold-toggle placement
- **"Filtered" toggle placement is consistent across views** — the inherited-scope "Filtered" toggle sits rightmost on the second row in every view (Kanban/Tree/Graph), styled as a peer of the Ready/Favorites toggles (funnel icon + label)
- **Collapsed-ribbon filter pills restyled** — active-filter pills in the collapsed ribbon are now a muted pastel blue (echoing the funnel's active-filter glow) with a hover outline; the Favorites pill shows its ★ icon
- **Issues filter/density toggles moved to the left** of the search input (far less pointer travel than the old far-right placement)
- **Filter icon shows a blue glow instead of a count badge** — the funnel/filter icon glows when filters are set (we care *that* it's set, not how many); the old count badge and its aggressive blue are gone
- **Compact rows are the default; the toggle is inverted** — OFF (default) = compact, ON = comfortable; the toggle's active blue is softened
- **Tree priority header shows "P"** instead of "Priority" (the full label overflowed the narrow column and inflated the header row); the Tree columns are tighter and their headers align to the cells; resizing a column no longer also toggles the sort
- **Mask favorites in the Favorites filter group** — Favorites is modeled as a seed-based filter group: the starred beads are a seed list that expands into relatives, and each seed has an eye toggle (Photoshop-layers metaphor) to mask it out of that expansion. Masked favorites recede (gray left edge + muted card) and drop from the favorites→relatives scope; the mask is per-project, persisted in workspace state, and owned by the Favorites container (not individual cards). New reusable `FilterGroup` component

### Changed

- **Selection card removed from the Repository panel** — the Repository panel is being rearranged; the Selection section is pulled from the view (the code is retained for possible relocation)

### Fixed

- **Tree header/column misalignment fixed** — the header sat outside the scrolling body, so a vertical scrollbar narrowed the rows but not the header, shifting every value column left by ~a scrollbar width. The header is now a sticky header inside the scroll container (with a reserved scrollbar gutter), so header and cells line up exactly
- **Tree expand/collapse-all toggle icons are now distinct** — the near-identical `FoldVertical`/`UnfoldVertical` pair became `ChevronsDownUp` (collapse) / `ChevronsUpDown` (expand), so the two states read unambiguously
- **Tree column-menu icon matches the Issues list** — the Tree's show/hide-columns button now uses the same `⋮` glyph the Issues table uses (was a `Columns3` icon); the default Updated/Created column width widened (88→104px) so dates no longer truncate
- **Tree column resize divider is now grabbable at every boundary** — the resize handles moved to each fixed column's left edge, so the Title|Status divider (previously handle-less) can be dragged to widen Status; a faint rule appears on header hover for discoverability
- **Filter scope propagates live to every view** — masking a favorite (or editing the panel filter) now updates Kanban/Tree/Graph instantly, on both the panel subtabs and standalone editor tabs, instead of leaving them on a frozen snapshot. The shared filter is resolved host-side by one pure `resolveScope` (shared with the Issues table so they can't diverge) and broadcast live, so a view no longer needs the Issues view mounted to re-scope. Refresh is no longer needed to pick up a filter change

## [0.25.0] - 2026-06-23

### Added

- **Export Issues as JSONL** — an "Export Issues as JSONL…" action (Active Project ⋮ menu and the **Beads: Export Issues as JSONL…** command) runs `bd export` for the active board and writes a `<prefix>-issues-<date>.jsonl` file via a save dialog, then offers Reveal in Finder / Open File. Works in both embedded and server modes — in embedded/Dolt mode there's no `issues.jsonl` on disk until you export (vs-ln7e.1)
- **"Show in view" selector on a bead** — the Details header's reveal button is a split button (Issues / Tree / Kanban / Graph) that remembers your last pick; each reveals the bead in the panel's matching tab — Kanban and Issues reveals scroll the card/row into view, joining the existing Tree/Graph reveals (vs-wbrz, vs-zj9g)
- **Contextual refresh on editor-tab views** — a data view opened standalone in an editor tab (Issues / Kanban / Tree / Graph) now has its own Refresh button in a thin tab toolbar; the inherited-filter snapshot ribbon shares that toolbar on filter-seeded tabs (vs-fzy3)
- **Tree view honors favorites + closed muting** — the Tree accents favorited rows and grays out closed-row titles, like the Issues table and Kanban (vs-or31)
- **Favorites highlight color is configurable** — a new `beads.favoritesHighlightColor` setting (Appearance) drives the favorites accent across the Issues row, Tree row, and toggle star; default nudged slightly yellower (vs-bvk7)
- **Refresh pulses the view** — a manual refresh flashes the confirmation ring so it reads as registered (vs-y1vz)
- **Switch projects from the Repository page** — a project (beads-directory) dropdown at the top of the Repository Details page re-points it at any discovered board, so it works as a singleton hub: the tab title and all its cards follow the switch (vs-rxgo)
- **Repository Details metrics** — the Repository page now carries a Metrics card grid (extension version + build commit, bundle size, **DB-on-disk size** of the `.beads` directory, **Last activity**, and extension-host RAM), and the panel's Active Project card is trimmed to the basics (prefix, backend, bd version, extension version, bundle size) — the heavier figures live on the page (vs-emyj)
- **Repository Details page** — a new "Repository Details…" entry (Project Switcher ⋮ menu and the **Beads: Repository Details…** command) opens a stylish editor-tab page with rich repository + Dolt backend info: name, prefix, backend mode (embedded/server), `bd` version, location paths (copyable, with Open Folder), live `bd dolt status` with running/stopped state and Start/Stop server + Open Dolt Log actions, and issue counts by status. Dolt status no longer has to be dug out of the output log (vs-beoh)
- **Mute closed issues** — a new `beads.muteClosedIssues` setting (default on) grays out the titles of closed issues in table views so they recede when shown alongside open work. Grouped with markdown rendering and favorite highlighting under a new **Appearance** section in the extension settings (vs-on5g)
- **"Show in tree view" from a bead's details** — a new tree icon in the bead Details header (between the favorite star and Refresh) flips the Beads panel to its Tree tab and reveals the bead: it expands the bead's collapsed ancestors and scrolls it into view. Mirrors the existing "View in graph" action (vs-kp67)

### Removed

- **`beads.autoSeedActiveBead` setting** — auto-seeding a bead into your LLM context is now triggered manually via the LLM badge in the bead Details header, so the experimental focus-follows setting (and its dead auto-seed-on-focus path) is gone (vs-3ssy)

### Changed

- **Closed cards are muted too** — `beads.muteClosedIssues` now also grays out closed-issue titles on Kanban cards and in the Favorites/Active-bead cards (vs-b0ga)
- **Roomier Kanban cards** — card titles show up to 3 lines instead of 2 (vs-t12r)
- **Filter chips are filled, not just outlined** — each active filter chip now carries a light wash of its own accent color (e.g. Blocked shows a faint red fill behind its red outline). The default "not closed" status chip reads as an exclusion with a stronger fill + bold label, and is palette-green (the active-work color) rather than echoing the gray of the "closed" state it excludes (vs-th4z)
- **Ready toggle shows the 🚀 emoji when active** — toggling the Ready filter on swaps its line-art rocket for the colored 🚀 (in a fixed-width slot so the button doesn't resize) (vs-th4z follow-up)
- **Active Project ⋮ menu grouped with separators** — the menu now uses dividers to separate project/data actions from the Dolt server actions and from Extension Settings; "Open Folder" reads "Open Folder in Finder" (vs-x49g)
- **Details "+" create stays a plain button** — the create control is a single New-issue button again (the editor-tab create path is reachable from the command palette); the brief split-button version is dropped (vs-3ynn)
- **Details header actions are ordered per surface** — sidebar reads `[favorite] [refresh] | [new] [edit] | [show-in-view] [open-in-tab]`; the editor tab reads `[favorite] [LLM] [show-in-view] [edit] | [back] [forward]`. Refresh is a standalone button again (no longer inside the show-in-view split menu) (vs-hskp)

### Fixed

- **Editor-tab title tracks the shown bead** — navigating from one bead to another within the same editor tab now retitles the tab to the bead you're viewing, instead of staying stuck on the bead it was opened with (vs-q0e2)
- **"Open Folder" opens the OS file manager** — it now reveals the board in Finder/Explorer/Files instead of the VS Code Explorer (a no-op for boards outside the workspace) (vs-cn01)

## [0.24.0] - 2026-06-23

### Added

- **Initialize a Beads board from the extension** — a new "Beads: Initialize Repository…" command (and a "Create your first board" CTA in the empty Project Switcher / no-projects prompts) opens a polished wizard in an editor tab: name → derived prefix preview → location → storage mode, then an inline progress/verify screen. It creates the board under your projects root, runs `bd init` (server mode by default), verifies it came up healthy, then activates it — no terminal required. A native QuickPick version is also available as "Beads: Initialize Repository (Quick)…". If the `bd` CLI isn't installed, it points you at `brew install beads` (with a copy action) instead of failing silently (vs-r6a1, vs-r6a1.8)
- **`beads.projectsRoot` setting** — the root directory scanned for boards (and where the new Initialize Repository command creates them) is now configurable, instead of being hardcoded to `~/beads`. Supports a leading `~` and `${env:VAR}` placeholders; changes take effect without a reload (vs-2re, vs-r6a1.6)
- **Always-available "New Board" entry points** — adding a board is no longer limited to the empty state: a database icon in the Project Switcher title bar, an "Initialize New Board…" item in the Active Project ⋮ menu, and a "New board…" footer in the project dropdown all launch the Initialize Repository flow (vs-r6a1.7)
- **Switch projects root from the UI** — a "Change Projects Root…" action in the Active Project ⋮ menu opens a folder picker and points Beads at a different root. Switching to an already-initialized root loads that whole collection of boards automatically; an empty root shows the create CTA (vs-r6a1.10)
- **Extension settings shortcut** — a gear icon in the Project Switcher title bar (and "Extension Settings" in the ⋮ menu) opens Settings filtered to Beads (vs-r6a1.9)
- **Init + switching are logged** — the Beads output channel now records the exact `bd init` / verification commands and their results, plus project discovery counts and activations, so creating/switching boards is traceable (vs-r6a1.11)

## [0.23.0] - 2026-06-20

### Added

- **Highlight favorites in the Issues table** — favorited (starred) beads now get a subtle yellow tint (matching the favorite star) + thin left accent stripe so they read as the primary set; in the Favorites filter this also distinguishes starred beads from the relatives that tag along. The Favorites toggle shows a full gold star when active. Toggle the row highlight with `beads.highlightFavorites` (default on) (vs-sd5.3)
- **Copy Markdown** — a "Copy Markdown" entry alongside "Copy JSON" in the bead context menus (Issues, Kanban, Tree, Graph). Copies the same markdown the LLM companion document uses, so the clipboard matches what Claude Code sees (vs-3pb5)

### Changed

- **"Active Bead" card renamed to "Selection"** — the sidebar context card reflects what it actually shows (the currently-selected bead); a richer Active Bead concept is deferred (vs-xmlv)

## [0.22.0] - 2026-06-20

### Added

- **"LLM" context toggle on a bead editor tab** — a stylish sparkle pill in the Details header (editor tabs only) opens this bead's contents as a companion `bead:` document beside the view, so an LLM session (e.g. Claude Code) picks it up as context; a second click tucks it away. The pill lights up while the companion is open and stays in sync if you close the doc by hand. A webview can't be a text editor, so this on-demand companion is how a rich bead gets into an LLM's context — you choose when, with one click. (Hidden in the narrow sidebar Details, where the companion would open far away in the editor area.) (vs-nr3d)
- **Auto-seed on focus (experimental, off by default)** — `beads.autoSeedActiveBead` makes a bead opened as an editor tab open its companion document automatically on focus (swapping as you switch beads, closing when the tab closes). Off by default since it adds a second tab passively; the Details toggle above is the recommended, on-demand path (vs-nr3d)

### Changed

- **Bead Details toolbar regrouped** — header actions now read left-to-right as quick state (favorite · LLM · refresh) → create/primary (New + Edit) → navigation/context (Back/Forward in an editor tab; Open-in-tab in the sidebar), so navigation stays visually anchored at the end away from the other actions (vs-nr3d)

## [0.21.2] - 2026-06-20

### Fixed

- **Favorites filter shows relatives on first load** — when the Issues "Favorites" filter is restored as active from a previous session, the dependency graph is now fetched on mount, so each favorite appears with its 1-hop relatives instead of stripped bare; previously you had to toggle the filter off and on to populate them (same fix restores a restored-active "Ready" filter) (vs-mbqc)

## [0.21.1] - 2026-06-20

### Fixed

- **"Show Details" pulses the view** — selecting the "Show Details" context-menu item now flashes the Details view's confirmation ring on reveal, like the editor-tab reveal pulse and the "Show Issues" panel ring, so the action is visible even when the Details view is already showing (vs-1vxq)

## [0.21.0] - 2026-06-20

### Added

- **Issues editor tab inherits the filter** — opening Issues in an editor tab now seeds it with the panel's full filter (preset, chips, search, Ready/Favorites) instead of opening unfiltered; it then works as an independent list (vs-tle)
- **Apply to all views** — an Issues editor tab can broadcast its filter to the panel and every open view tab in one click (the panel's Kanban/Tree/Graph follow, open editor tabs re-scope); a discrete push, not a live sync (vs-dzm)
- **Copy favorites as CSV** — a copy button on the sidebar Favorites section header writes the favorited bead IDs as a single comma-separated line to the clipboard (for pasting into a `bd` command, an agent prompt, or a spreadsheet); hidden when there are no favorites (vs-sd5.2)

## [0.20.1] - 2026-06-20

### Fixed

- **Filters row** — dropped the inline "Filters" label that pushed the preset/toggles/chips to the right; the bordered background and the toggle's count badge already raise the row's profile, and the controls are left-aligned again (vs-7ob)

### Added

- **Editor-tab filter ribbon** — a seeded Kanban/Tree/Graph editor tab now shows a prominent ribbon ("Filtered — showing N of M from the Issues filter") with a reversible **Show all / Show filtered** toggle, so the inherited filter is unmistakable and escapable (vs-zq2)

## [0.20.0] - 2026-06-20

### Added

- **Filters row** now stands out — a "Filters" label leads the row, the row gets a bordered background so it reads as its own zone, and the filter toggle carries an active-filter count badge that's visible even when the bar is collapsed (vs-dd7)

### Fixed

- **Editor tabs inherit the filter** — opening Kanban, Tree, or Graph in an editor tab now seeds the new tab with the panel's active filter (a one-time snapshot) instead of showing every bead; the "X of Y" indicator reflects the inherited scope and Graph auto-enables its Filtered toggle (vs-nme)

## [0.19.1] - 2026-06-20

### Fixed

- **Graph quick-filter** moved to its own full-width top row (mirroring the Kanban/Tree filter bars) — it was squished at the far right of the button toolbar, and the search glyph jumped position when switching between the Kanban/Tree/Graph tabs (vs-v6h)

## [0.19.0] - 2026-06-20

### Added

- **Editor tabs** — Kanban, Tree, and New Issue can each open in an independent editor tab, and every panel sub-view now offers an **Open in Editor** action (vs-2tn.2, vs-xqu.1, vs-xqu.2)
- **Tree view columns** — added **Updated** / **Created** columns plus a column show/hide selector, persisted across reloads (vs-3ie)
- **Graph quick-filter** — an ad-hoc filter on the Graph view, persisted and clearable (vs-v6h)
- **Show Kanban** — the empty Details ("No issue selected") view now offers a secondary action that activates the Beads panel with the Kanban tab focused (vs-6xf)

### Changed

- **New Issue form** — designer pass: aligned fields and scoped styling so it no longer bleeds into other forms (vs-2tn.1)
- **Badge palette** — desaturated the type / priority / status badges for a quieter look (vs-b4e)
- **Issues "Not Closed" filter** — replaced the multi-status approach with a single symbolic **¬closed** negation chip (vs-x6b)

## [0.18.0] - 2026-06-19

### Fixed

- Beads with **deferred**, **pinned**, **hooked**, or any **custom** status silently disappeared from every view — the extension modeled only 4 of bd's 7 built-in statuses, and an unknown status was nulled, which dropped the bead. The status model now covers all 7 built-ins and passes custom statuses through (never dropping a bead), seeded from a single status→category map mirroring bd's `BuiltInStatusCategory` (vs-dz9)

### Added

- Deferred / Pinned / Hooked now have their own labels, colors, Kanban lanes (quiet lanes collapsed by default), and Issues filter chips

### Changed

- The Details view now ends with a crisp **rule & bead** tailpiece below the metadata footer (with a little breathing room) — twin hairlines flanking a center diamond, distinct from the Band used on list-style views. `EndFlourish` now takes a `variant` prop so views can pick their ornament

## [0.17.1] - 2026-06-19

### Fixed

- **Add to Favorites** from the bottom panel (Issues table, Kanban, Graph) silently did nothing — the panel's provider was never given the shared favorites service, so the toggle no-op'd and the Repository view's Favorites card never updated. The panel is now wired to the service, and a missing-service toggle is logged instead of swallowed (vs-94o)

### Changed

- Replaced the triple-dot end-of-view ornament with a faded interwoven **Band** weave that dissolves at both edges — decorative without reading as a drag handle

## [0.17.0] - 2026-06-19

### Added

- Comment cards in the Details view now highlight on hover for better contrast against surrounding dark elements (vs-nxd)

### Changed

- Renamed the sidebar **Context** view to **Repository** — "Project" is overloaded inside a VS Code workspace, so "Beads repository" is the clearer term for the active board

## [0.16.1] - 2026-06-19

### Fixed

- **Favorites filter** showed an empty list in the bottom panel — the favorites set was never wired to the panel's Issues view, so it matched nothing (vs-sd5.6)

### Changed

- The **Favorites filter** now shows favorited beads **and their relatives** (direct dependency neighbors), so a favorite appears with its context rather than alone (vs-sd5.7)

## [0.16.0] - 2026-06-19

### Added

- **Favorites** — star/unstar a bead (Details header) to pin it in a new **Favorites** section in the sidebar context panel. The set is persisted per project (survives reloads) and published to every view (vs-sd5.1)
- **Favorites from right-click** — Add/Remove Favorites in the bead context menu across the Issues table, Graph, Kanban, Tree, and the context-panel Active Bead/Favorites cards (vs-sd5.5)
- **Favorites filter** — a persistent **Favorites** toggle in the Issues filter bar (next to Ready) shows only starred beads; composes with Ready and the other filters (vs-sd5.6)
- **Tree expand/collapse** — Expand All / Collapse All controls in the Tree filter bar; ⇧-click a row's chevron to collapse/expand its whole subtree (vs-fpp)
- **Issues double-click** — double-clicking a row opens that bead in an editor tab (single-click still selects) (vs-sn1)
- A decorative end-of-view ornament closes the context panel so it no longer stops cold at the bottom

### Changed

- **Graph layout modes** (Layered/Force/Tree/Radial) now render as an explicit segmented control, distinct from the Focus/Filtered/Auto-Layout toggles (vs-xnw)
- **Issues filters + search persist** across reloads and Panel-tab switches, alongside the existing sort/column state (vs-1q1)
- Context panel polish — Pick Ready Bead / Show Issues moved above the bead cards; the Active Bead card's clear (×) now sits inline like the Favorites rows (vs-sd5.1)

### Fixed

- Favorites titles no longer go blank after switching projects and back — they re-resolve once the new project's list re-caches (vs-sd5.1)

## [0.15.1] - 2026-06-19

### Added

- Editor-tab navigation history now responds to **⌘←/⌘→** (Ctrl+←/→ on Windows/Linux), alongside the existing Alt+←/→ — each tab walks its own per-tab Back/Forward trail since only the focused tab's webview receives the keystroke (vs-9u8)

## [0.15.0] - 2026-06-19

### Fixed

- **Editor-tab Back/Forward now has per-tab memory** — a Details tab records its own navigation trail as you click through related beads, so Alt+←/Alt+→ walk *that tab's* history instead of moving the sidebar's shared cursor (vs-9u8)
- The dependency **Graph opened in an editor tab** ("Open in Editor") no longer renders empty — the dedicated graph view now pushes nodes + edges proactively instead of relying on a lazy request that raced the tab's first load (vs-e4k)

### Changed

- Polished the sidebar **Active Project** and **Active Bead** sections — each is now an elevated, **collapsible** card; Active Bead reads as a pinned register slot (accent left rail, type icon + status dot); the Active Project meta table now also shows the **bd** CLI version and the **Extension** version (replacing the footer stamp) (vs-si0)

### Added

- Dashboard now has a collapsed **By Type** breakdown card (above By Label) — bead counts per issue type, each row drills into the Issues list filtered to that type (vs-eif)
- Epic-type bead nodes in the **Graph** get a purple outline so structural containers stand out (vs-cop)
- Graph node click gestures — single-click selects, double-click opens Details (sidebar), **triple-click opens the bead in an editor tab** (vs-myc)
- Right-click a bead node in the **Graph** view for a context menu — **Focus** (narrow to its neighborhood), **Open Details** (editor tab), **Show Details** (sidebar), **Copy ID**, **Copy title** (vs-aml)
- Right-click an **Issues table** row for the same context menu — **Open Details** (editor tab), **Show Details**, **Focus on Graph**, **Copy ID**, **Copy title** (vs-7mp, vs-czn)
- **"View in graph" deep-link** — the Details and Issues-table "Focus on Graph" actions now switch the bottom panel to the **Graph** tab and focus that bead's dependency neighborhood (the old standalone-graph command was a dead no-op) (vs-iz8)
- **Graph "Filtered" toggle** — scope the Graph view to the current Issues filter/search slice (whole board ↔ filtered slice); composes with Focus (filter narrows the candidate set, focus narrows to a neighborhood within it) (vs-v07)
- **Create dependencies on the Graph canvas** — drag from one bead node to another to draw a dependency (relationship picker: Blocked by / Child of / Related to / Discovered from), and click an existing edge to remove it (vs-caz)
- **Details view Back/Forward navigation** — browser-style history of viewed beads with title-bar Back/Forward buttons and Alt+←/→; the Active Bead pin follows your traversal instead of staying on the first selection (vs-xzq)
- New **Tree** tab in the bottom Beads panel — a file-explorer-style hierarchical tree of beads keyed on parent-child relationships (expand/collapse, indentation, a Type label, sortable by Type/Title) with a filter line that narrows to matching beads while keeping the path to them, and a right-click context menu (vs-bw9)
- Two new **Graph layouts** — **Tree** (tidy hierarchical) and **Radial** — alongside Layered and Force, driven by the dependency structure (blocks + parent-child edges) (vs-28i)
- **Drag-to-reparent** in the Tree view — drag a bead onto another to make it the parent (drop on empty space to detach to a root); illegal drops onto a node's own descendant are rejected (vs-jb6)
- **Pick Ready Bead** — a rocket action on the sidebar Context view (and command palette) jumps to a ready-to-work bead (open, no open blocker) and makes it the active bead; repeat to cycle through the ready set (vs-ih1)
- The bottom Beads panel now has an **Open in Editor** button in its in-view nav row — pops the active subview (Issues / Dashboard / Graph) out into an editor tab; the Graph gets its own `beads.openGraphInTab` command + standalone editor route (vs-3bp)
- **Auto Layout** button in the Graph toolbar — in force mode it shuffles a fresh layout variant (seeded), in layered mode it re-applies the canonical layout; either way it resets manual drags and fits to view (vs-0wf)
- New **Graph** tab in the bottom Beads panel — visualizes the dependency graph with bead cards (status-colored) and relationship edges (blocks / parent-child / related / discovered-from, each color+style coded, with a legend). Switch between a **layered** (hierarchical, spline edges) and **force-directed** (freeform) layout; click a node to select, double-click to open its details; pan / zoom / fit / minimap; and a **Focus** toggle narrows to the selected bead's dependency neighborhood. Edges are fetched lazily (one backend call) only when the tab is opened (vs-xlf)
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
- New consolidated **Beads** panel in the bottom Panel (next to Terminal/Problems): a single surface that hosts the **Dashboard** and **Issues** subviews behind an in-view nav row — clicking a tab swaps the whole area, and a Dashboard card click flips to Issues with that filter applied. Buttons live in the view (nav row), not the panel tab bar, and the panel loads the bead list once to feed both subviews (vs-b2p, vs-b2p.1)
- Restructured the sidebar: Dashboard and Issues now live in the bottom Panel, and the activity-bar Beads view is slimmed to a dedicated **Project** switcher + **Details** — giving the wide Dashboard/Issues surfaces horizontal room and decluttering the left (vs-b2p, vs-5a8)
- The sidebar Project view now leads with a header and shows basic context (issue prefix, backend status, project count, build/version) with a friendly empty state; the Details view shows a proper empty state (icon + guidance) instead of a bare line (vs-ed2)
- Renamed the sidebar context view to **Active Project** and added an **Active Bead** section that pins the currently-selected bead (id + title) with a quick-open button — a reference anchor (and future seed root for the Graph view) (vs-14e)
- The Dashboard's **By Label** breakdown now starts collapsed (vs-7r5)
- Moved the Dolt actions (Show Status / Start / Stop / Open Log) from the Dashboard's menu into the **Active Project** view, and dropped the redundant directory header from the Dashboard so it leads with its metrics (vs-6mt)
- Polished the Dashboard metric cards (accent rail per metric, larger tabular values, hover lift) and gave the Active Project info a defined key/value table (dividers + zebra) (vs-wgw, vs-293)

### Changed

- Refresh is now a title-bar action on every Beads view (Dashboard, both Issues lists, and Details, which previously had none); removed the redundant in-webview "Refresh" item from the Dashboard's actions menu so reload consistently lives in the view chrome
- Reorganized view title-bar actions: the New Issue (+) action now lives on the Details toolbar (where the create form opens) instead of Dashboard/Issues; each view keeps its own Open-in-Editor action; on Details, Copy ID sits last (vs-73h)
- Issues table column header row is shorter (trimmed vertical padding) (vs-4rt)
- Issues table dates (Updated/Created) render smaller and muted (10px) so they read as secondary metadata instead of out-sizing the title (vs-xe1)
- Issues table now lets only the Title column expand to fill available width; the other columns stay at their compact fixed sizes instead of inflating, while preserving the badge clip-safe widths (vs-gmj)
- Explicitly-configured Beads projects (`beads.projects`, `$BEADS_DIR`, workspace folders) that don't exist or aren't a Beads project are now logged as warnings instead of silently skipped; the `~/beads` auto-scan stays quiet (vs-jse)
- Reordered Dashboard/Issues view title actions so the share-link (open-in-editor-tab) sits in the middle and Refresh moves to the rightmost edge, matching the Details view where the common op (Copy ID) sits at the edge (vs-qi5)
- Details-view markdown is now sanitized with DOMPurify before rendering (defense-in-depth atop the webview CSP), and links are routed through the extension: workspace paths open in the editor, http(s)/mailto open in the system handler, and unsafe schemes (`javascript:`, `file:`, …) are dropped (vs-9xx)
- Rebranded the fork's extension identity: id is now `ludwig.vscode-beads-pm` (`publisher` `planet57`→`ludwig`, `name` `vscode-beads`→`vscode-beads-pm`, `displayName` `Beads`→`Beads (ludwig)`), so this private fork coexists with upstream's build; also corrected `repository.url` (vs-m6k)
- Issues list now shows all beads (open and closed) instead of the newest 50 — the CLI backend no longer inherits bd's default `--limit 50` (vs-0bq)
- Dashboard header label now reads "Active Beads Directory" (slightly larger), and the project-switcher dropdown header reads "Beads directory" (was "Bead directory") (vs-d7s)
- Task type icon changed from a checked box (which read as "done") to a list (`list-ul`), in the Issues list, Kanban cards, and Details header (vs-3x0)

### Fixed
- Timestamps in **server (Dolt) mode** rendered as "just now"/in the future — SQL datetimes lacked a timezone marker and were parsed as local; now normalized to explicit UTC (vs-b9t)

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
