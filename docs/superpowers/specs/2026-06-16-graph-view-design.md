# Dependency Graph view (vs-xlf) — design

**Date:** 2026-06-16
**Bead:** vs-xlf (P3, feature)
**Branch:** `feat/issues-bottom-panel-and-footer`

## Goal

Add a **dependency-graph view** to the bottom `PanelShell`, alongside Issues and
Dashboard. Nodes are bead cards (status-colored, with type icon + priority);
edges are dependency relationships (`blocks` / `parent-child` / `related` /
`discovered-from`). Two layouts, switchable via an in-view toggle:

- **Layered DAG** (dagre) with spline edges — the "tree" shape from the
  beast-bd reference screenshot.
- **Force-directed** (d3-force) — freeform.

Visual reference only: `~/repos/beast-bd/docs/images/Screenshot1.png`. We match
the *shape* of the experience, not its code.

## Scope (v1)

- Both layouts + a layered↔force toggle in the Graph tab.
- Click node → select bead (drives Active Bead pin + Details via `selectBead`).
- Double-click node → open full details (`openBeadDetails`).
- Pan / zoom / fit-to-view / minimap (mostly free with React Flow).
- Focus-on-root: seed the graph from the selected / Active Bead's dependency
  neighborhood, with a "show whole board" toggle. `viewInGraph` (already posted
  by other views) focuses that node and switches to the Graph tab.
- Edge color/style encodes `DependencyType`, with a legend.
- Hover highlights a node's neighbors + incident edges.

## Out of scope (follow-up beads)

- Editing dependencies by drawing edges on the canvas (add/remove deps).
- Persisted manual node positions.
- Tree view (vs-bw9) — separate 4th PanelShell tab.
- Large-graph clustering / perf tuning.

## Rendering library

`@xyflow/react` (React Flow) for the canvas + `dagre` (layered) + `d3-force`
(force). Rationale: nodes are real React components, so graph cards reuse the
extension's existing status colors / type icons / CSS variables (consistent with
Issues & Dashboard, honoring the "components over markup" convention). Pan /
zoom / minimap / selection are built in. Spline edges are React Flow's default
bezier (`smoothstep` as an option). Three browser-target, tree-shakeable runtime
deps — fine for the webview IIFE bundle.

## Data flow

Mode-routed backend (`doltMode.ts`): server → `BeadsDoltBackend` (SQL via
mysql2), else → `BeadsCommandRunner` (`bd` CLI). `backend.list()` returns nodes
but **no edges** in either mode (CLI returns only `dependency_count`; SQL
hydrates labels only). So edges need one additional, mode-native fetch:

- New `BeadsBackend.getDependencyGraph()`:
  - **SQL** → one bulk query on the `dependencies` table → `{from,to,type}[]`.
  - **CLI** → one `bd list --format dot` spawn → parse edge lines.
- `ProjectManager` assembles `DependencyGraph { nodes: <beads already loaded>,
  edges: <the one fetch> }` and broadcasts via the already-stubbed `setGraph`
  message.
- **Lazy:** edges fetched only when the Graph tab is active (webview signals via
  a new `requestGraph` message). Issues/Dashboard pay nothing; stays aligned
  with vs-3pp's "one load per refresh" goal.

## Components

- `src/webview/views/GraphView.tsx` — React Flow canvas, layout toggle, focus
  state, legend. Pure renderer; props mirror `IssuesView`/`DashboardView`.
- `src/webview/views/graph/BeadNode.tsx` — custom node card (id, title, status
  rail, type icon, priority).
- `src/webview/views/graph/layout.ts` — pure functions `layeredLayout()`
  (dagre) and `forceLayout()` (d3-force) returning node positions. No React;
  unit-testable.
- `PanelShell.tsx` — add `"graph"` to `PanelTab`, tab button (lucide icon, to
  match the existing nav), body branch. Active Bead seeds the focus root.
- `src/backend/*` — `getDependencyGraph()` on the interface + both backends;
  dot-edge parser as a pure helper.

## Contract changes

Edit `src/shared/contract.ts` only (both sides re-export; parity guard breaks
tsc on drift). `DependencyGraph` and `setGraph`/`viewInGraph` already exist. Add:

- `requestGraph` (webview → extension) — signals the Graph tab is active so the
  provider fetches edges lazily.

## Testing

Unit tests (no webview runtime needed):

- `layout.ts` — deterministic positions; handles cycles, orphans, empty graph.
- dot-edge parser — edge lines, types, ignores node-decl lines.
- `getDependencyGraph` edge assembly per mode (where mockable).

Layout/interaction polish gets an explicit F5 smoke (project convention — chrome
can't be self-verified).

## Risks / notes

- `bd list --format dot` edge syntax must be confirmed against a board that
  actually has dependencies (the live `~/beads/vs` board currently has none).
- PanelShell uses `lucide-react` icons, not FontAwesome — match local
  convention for the tab icon.
