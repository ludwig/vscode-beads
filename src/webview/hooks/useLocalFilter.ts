/**
 * useLocalFilter — the reusable brain behind a hosted FilterBar (unified filter
 * bar, Phase 2). Owns a per-surface `FilterSnapshot` (persisted in this
 * webview's state under `persistKey`), binds the pure snapshot transforms to
 * an editable `FilterOps` surface, computes the "+ Filter" facets, lazily asks
 * for the dependency graph when a predicate needs edges, and resolves the
 * snapshot to an id-set via the same pure `resolveScope` the host uses.
 *
 * Hosts (App's editor-tab chrome, TreeView, …) render a `<FilterBar>` from the
 * returned state and compose `localScope` onto whatever parent scope they
 * inherit. The component itself stays presentational; this hook is the state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Bead, FilterSnapshot } from "../types";
import { vscode } from "../types";
import type { Edge } from "../../backend/resolveScope";
import { resolveScope } from "../../backend/resolveScope";
import { computeFacets, type FacetData } from "../facets";
import {
  emptyFilterSnapshot,
  applyPreset,
  addStatus,
  removeStatus,
  clearStatus,
  addPriority,
  removePriority,
  addType,
  removeType,
  addLabel,
  removeLabel,
  addAssignee,
  removeAssignee,
  toggleReady,
  toggleFavoritesOnly,
  clearAll,
  type FilterOps,
} from "../filterSnapshotOps";

/** Value equality for two filter snapshots (used to reconcile the optimistic
 *  overlay against the authoritative broadcast). Field-wise so it's robust to
 *  top-level key order; columnFilters compare structurally. */
function sameSnapshot(a: FilterSnapshot, b: FilterSnapshot): boolean {
  return (
    a.activePreset === b.activePreset &&
    a.readyOnly === b.readyOnly &&
    a.favoritesOnly === b.favoritesOnly &&
    a.globalFilter === b.globalFilter &&
    JSON.stringify(a.columnFilters) === JSON.stringify(b.columnFilters)
  );
}

/**
 * Controls for the shared (panel) filter surface: the broadcast snapshot to
 * render, and a publisher to push edits to the host. Passed to a panel follower
 * view (Kanban/Tree/Graph) so its FilterBar common controls read/write the
 * shared spec (linked across all panel views). Omitted for editor tabs (which
 * keep a self-owned local filter).
 */
export interface SharedFilterControl {
  snapshot: FilterSnapshot;
  onPublish: (next: FilterSnapshot) => void;
}

interface UseLocalFilterArgs {
  /** State key for this surface's snapshot (collapse uses `${persistKey}Collapsed`). */
  persistKey: string;
  beads: Bead[];
  edges: Edge[];
  favoriteIds: string[];
  maskedIds: string[];
  /** Whether the dependency graph is loaded (Ready/Favorites need its edges). */
  hasGraph: boolean;
  onRequestGraph?: () => void;
  /**
   * When provided, the common filter surface is CONTROLLED by a shared snapshot
   * (panel follower views): the snapshot comes from here and every edit publishes
   * via `onPublish` instead of mutating local state, and `localScope` is `null`
   * (the shared spec is already applied host-side as the parent scope, so the
   * view must not re-apply it). Omit for a self-owned local filter (editor tabs),
   * which resolve their own `localScope` and persist it.
   */
  shared?: SharedFilterControl;
}

interface UseLocalFilterResult {
  snapshot: FilterSnapshot;
  ops: FilterOps;
  facets: FacetData;
  /** Matching id-set for the local filter, or null when it narrows nothing. */
  localScope: string[] | null;
  collapsed: boolean;
  toggleCollapsed: () => void;
}

export function useLocalFilter({
  persistKey,
  beads,
  edges,
  favoriteIds,
  maskedIds,
  hasGraph,
  onRequestGraph,
  shared,
}: UseLocalFilterArgs): UseLocalFilterResult {
  const [localSnapshot, setLocalSnapshot] = useState<FilterSnapshot>(() => {
    const saved = (vscode.getState() as Record<string, FilterSnapshot | undefined> | undefined)?.[persistKey];
    return saved ?? emptyFilterSnapshot();
  });
  // Optimistic overlay for shared (controlled) mode: an edit is applied to this
  // local overlay INSTANTLY so the toggle/chip flips without waiting for the
  // host round-trip, then reconciled away once the authoritative broadcast
  // catches up (see the reconcile effect below). Null = no pending optimism.
  const [optimistic, setOptimistic] = useState<FilterSnapshot | null>(null);
  const optimisticRef = useRef<FilterSnapshot | null>(null);
  optimisticRef.current = optimistic;
  // What we last published, so we can tell "the echo of my own edit arrived"
  // (→ drop the overlay) from an unrelated broadcast.
  const lastPublishedRef = useRef<FilterSnapshot | null>(null);

  // In shared mode the snapshot is the optimistic overlay if one is pending,
  // else the broadcast shared spec (controlled). Otherwise it's this surface's
  // own persisted local snapshot.
  const snapshot = shared ? (optimistic ?? shared.snapshot) : localSnapshot;

  // Reconcile the optimistic overlay: once the authoritative broadcast matches
  // what we optimistically applied (or what we last published), drop the overlay
  // so the host stays the single source of truth. Guarding on lastPublished as
  // well means a rapid double-toggle won't briefly revert when the FIRST echo
  // (an older value) arrives — we keep the overlay until the latest echo lands.
  useEffect(() => {
    if (!shared || optimistic == null) return;
    const auth = shared.snapshot;
    if (sameSnapshot(auth, optimistic) || (lastPublishedRef.current && sameSnapshot(auth, lastPublishedRef.current))) {
      setOptimistic(null);
    }
  }, [shared, optimistic]);

  useEffect(() => {
    if (shared) return; // shared surface is owned host-side, not persisted here
    const prev = (vscode.getState() as Record<string, unknown> | undefined) ?? {};
    vscode.setState({ ...prev, [persistKey]: localSnapshot });
  }, [persistKey, localSnapshot, shared]);

  const collapsedKey = `${persistKey}Collapsed`;
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    Boolean((vscode.getState() as Record<string, unknown> | undefined)?.[collapsedKey]),
  );
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      const prev = (vscode.getState() as Record<string, unknown> | undefined) ?? {};
      vscode.setState({ ...prev, [collapsedKey]: next });
      return next;
    });
  }, [collapsedKey]);

  const ops: FilterOps = useMemo(() => {
    // Shared mode: apply the edit to the optimistic overlay INSTANTLY (so the
    // control flips with no perceived lag), remember it as last-published, and
    // publish upstream (the host recomputes the scope + echoes the new spec to
    // every panel view, which then reconciles the overlay away). Local mode:
    // mutate our own state. The base for the edit is the pending overlay if one
    // exists, else the current broadcast — so consecutive edits compose.
    const edit = (fn: (s: FilterSnapshot) => FilterSnapshot) => {
      if (shared) {
        const next = fn(optimisticRef.current ?? shared.snapshot);
        optimisticRef.current = next;
        lastPublishedRef.current = next;
        setOptimistic(next);
        shared.onPublish(next);
      } else {
        setLocalSnapshot((s) => fn(s));
      }
    };
    return {
      applyPreset: (id) => edit((s) => applyPreset(s, id)),
      addStatus: (v) => edit((s) => addStatus(s, v)),
      removeStatus: (v) => edit((s) => removeStatus(s, v)),
      clearStatus: () => edit((s) => clearStatus(s)),
      addPriority: (v) => edit((s) => addPriority(s, v)),
      removePriority: (v) => edit((s) => removePriority(s, v)),
      addType: (v) => edit((s) => addType(s, v)),
      removeType: (v) => edit((s) => removeType(s, v)),
      addLabel: (v) => edit((s) => addLabel(s, v)),
      removeLabel: (v) => edit((s) => removeLabel(s, v)),
      addAssignee: (v) => edit((s) => addAssignee(s, v)),
      removeAssignee: (v) => edit((s) => removeAssignee(s, v)),
      toggleReady: () => edit((s) => toggleReady(s)),
      toggleFavoritesOnly: () => edit((s) => toggleFavoritesOnly(s)),
      clearAll: () => edit((s) => clearAll(s)),
    };
  }, [shared]);

  const facets = useMemo(() => computeFacets(beads), [beads]);

  useEffect(() => {
    if ((snapshot.readyOnly || snapshot.favoritesOnly) && !hasGraph) onRequestGraph?.();
  }, [snapshot.readyOnly, snapshot.favoritesOnly, hasGraph, onRequestGraph]);

  // Shared mode: the host already resolves the shared spec into the parent
  // scope this view inherits, so return null (no extra local narrowing) — the
  // view composes `inheritedScope ∩ null = inheritedScope`. Local mode: resolve
  // our own snapshot.
  const localScope = useMemo(
    () => (shared ? null : resolveScope({ beads, edges, favoriteIds, maskedIds, spec: localSnapshot })),
    [shared, beads, edges, favoriteIds, maskedIds, localSnapshot],
  );

  return { snapshot, ops, facets, localScope, collapsed, toggleCollapsed };
}
