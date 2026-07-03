# Unified Filter Bar (Phase 2) — Design

**Goal:** A reusable `FilterBar` component, driven by a `FilterSnapshot`, hosted as a
tab-local sidecar filter on editor-tab Kanban / Tree / Graph views — composed on top
of the panel's inherited live parent scope as `(Filtered ? parentScope : all) ∩ resolve(localSpec)`.

**Status:** approved (Section 1, 2026-07-03). First cut is deliberately narrow.

---

## Scope (first cut)

- **In:** a fresh reusable `FilterBar`; tab-local structured filtering on **editor-tab**
  Kanban, Tree, and Graph; webview-side resolution + composition; the inherited-scope
  ribbon extracted into a reusable segment rendered inside the bar.
- **Out (deferred):** migrating IssuesView onto the shared component (it keeps its own
  bar — the two coexist); adding local filters to **panel subtabs** (they stay
  inherit-only, as today); a search box in the FilterBar (views keep their own search;
  `globalFilter` stays `""` and is a no-op in resolve).

Rationale for "don't touch IssuesView": avoid refactoring the 60 KB working file now;
prove the component + composition rule with minimal blast radius, migrate later.

---

## Architecture

The editor-tab views already intersect their beads with a supplied `filteredBeadIds`
id-set (App.tsx `withEditorTabChrome` → each view). So **composition happens in the
chrome wrapper**; the views are unchanged in their scoping logic — they just receive a
composed id-set instead of the inherited-only one.

```
                 ┌─────────────── withEditorTabChrome (App.tsx) ───────────────┐
 parentScope ───▶│  inherited = (Filtered ? parentScope : all)   [ribbon toggle] │
 (host, live)    │                                                              │
 localSnapshot ─▶│  local = resolveLocal(localSnapshot)   [pure resolveScope]    │
 (per-tab state) │                                                              │
                 │  composed = intersect(inherited, local)   [pure composeScope] │──▶ view.filteredBeadIds
                 └──────────────────────────────────────────────────────────────┘
```

- **Inherited scope** = the existing host-authoritative `parentScope` (unchanged),
  gated by the ribbon's Show-all/Show-filtered toggle (`seedFilterCleared`).
- **Local scope** = `resolveScope({ beads, edges, favoriteIds, maskedIds, spec: localSnapshot })`,
  the SAME pure resolver the host uses. `null` when the local spec is empty (no-op).
- **Composition** = set intersection; `null` on either side means "no constraint from
  that side" (identity for intersection).

### Resolution needs edges

`resolveScope` needs dependency edges for the `readyOnly` / `favoritesOnly` predicates.
The tab lazily fetches the graph (`onRequestGraph`, exactly as IssuesView already does)
when the local spec activates a predicate that needs edges. Until edges arrive, those
predicates are treated as pending (match-all) — same posture as IssuesView today.

---

## Component inventory

| Unit | Kind | Responsibility |
|---|---|---|
| `src/webview/common/FilterBar.tsx` | new, presentational | One bar: preset dropdown, Ready toggle, Favorites toggle, active-filter chips (status/priority/type/assignee/labels), "+ Filter" faceted menu, and the inherited-scope segment in the leading slot. Consumes `snapshot`, `facets`, `ops`, and an optional `inherited` descriptor; emits changes via `ops`. |
| `src/webview/common/FilterSnapshotRibbon.tsx` | keep, reused | The inherited-scope segment ("Filtered — N of M · Show all"), rendered inside FilterBar's leading slot instead of App-inlined. |
| `src/webview/filterSnapshotOps.ts` | new, **pure (tested)** | Reducer-style transforms on a `FilterSnapshot`: `applyPreset`, `addStatus/removeStatus`, `addPriority/removePriority`, `addType/removeType`, `addLabel/removeLabel`, `addAssignee/removeAssignee`, `toggleReady`, `toggleFavoritesOnly`, `clearAll`. Each returns a new snapshot; no React. |
| `src/webview/facets.ts` | new, **pure (tested)** | `computeFacets(beads): FacetData` — distinct labels/types/assignees/statuses with counts, plus `__unlabeled__`/`__unassigned__` counts, for the "+ Filter" menu. |
| `src/webview/composeScope.ts` | new, **pure (tested)** | `intersect(a: string[] \| null, b: string[] \| null): string[] \| null` — null is identity; two lists → intersection. |
| `src/backend/resolveScope.ts`, `filterPredicates.ts` | reuse | Imported by the webview for `resolveLocal`. Already pure and leaf-safe. |
| `src/webview/App.tsx` (`withEditorTabChrome`) | modified | Own per-tab `localSnapshot` (persisted via `setState`), render `FilterBar` in the editor-tab toolbar, compute `composed` scope, pass it as `filteredBeadIds` to the view. Trigger `onRequestGraph` when the local spec needs edges. |

### Presets, shared

`FILTER_PRESETS` currently lives inside `IssuesView.tsx`. Lift it (and the `NOT_CLOSED`
handling it relies on — already in `filterPredicates.ts`) into a small shared module
`src/webview/filterPresets.ts` and have IssuesView re-import it. This is a mechanical
move + one import line in IssuesView (no behavior change), so both bars share one preset
list instead of duplicating it.

---

## Data flow (per editor tab)

1. Tab mounts. `localSnapshot` initializes from `getState()` (empty snapshot if none).
2. User edits filters in the FilterBar → `ops` produce a new `localSnapshot` →
   `setState()` persists it for this tab.
3. `resolveLocal(localSnapshot)` runs (webview-side, memoized on
   beads/edges/favorites/masked/snapshot). If it needs edges and none are loaded,
   fire `onRequestGraph`; treat edge-dependent predicates as match-all until edges land.
4. `composed = intersect(inherited, local)` where
   `inherited = seedFilterCleared ? null : parentScope`.
5. `composed` is passed to the view as `filteredBeadIds`. View intersects its beads —
   unchanged.
6. `parentScope` updates (host broadcast) re-flow through step 4 live; local edits and
   inherited edits are independent.

### FilterBar API (sketch)

```ts
interface FilterBarProps {
  snapshot: FilterSnapshot;
  facets: FacetData;
  ops: FilterOps;                 // the bound reducer ops (see filterSnapshotOps)
  inherited?: {                   // omitted → no inherited segment rendered
    filteredCount: number;
    totalCount: number;
    cleared: boolean;
    onToggle: () => void;
  };
}
```

`FilterBar` is presentational: it renders state and calls `ops`/`inherited.onToggle`.
It owns no filter state itself (the host owns `snapshot`), which keeps it reusable at
both the tab-local level now and the panel/Issues level in a later migration.

---

## Testing (lightweight posture)

Durable unit tests for the pure modules only:

- `filterSnapshotOps.test.ts` — each op produces the expected snapshot (add is
  idempotent, remove is a no-op when absent, `applyPreset` sets status + preset id,
  toggles flip flags, `clearAll` empties).
- `facets.test.ts` — counts, `__unlabeled__`/`__unassigned__` buckets, distinct sets.
- `composeScope.test.ts` — null identity both sides; intersection; empty-intersection
  → `[]` (not null).

`resolveScope`/`filterPredicates` already have tests. Everything else (FilterBar
rendering, App wiring, per-tab persistence, edge lazy-fetch) is verified by F5 in the
Extension Dev Host — Luis drives that loop.

---

## Risks / notes

- **Edge lazy-fetch timing:** first activation of Ready/Favorites in a local filter may
  briefly match-all until the graph arrives (identical to IssuesView's current behavior).
- **Empty-state messaging:** Kanban/Tree carry `filterActive/filteredCount/totalCount`
  props for their empty states; these must reflect the *composed* set, not inherited-only.
- **Graph's own `filterEnabled`:** Graph has a local enable toggle for the inherited
  filter; confirm it composes sensibly with the new local bar during F5 (may fold into
  the ribbon segment).
