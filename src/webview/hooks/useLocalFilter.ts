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

import { useCallback, useEffect, useMemo, useState } from "react";
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

/**
 * Controls for the shared (panel) filter surface: the broadcast snapshot to
 * render, and a publisher to push edits to the host. Passed to a panel view so
 * its FilterBar's common controls read/write the shared spec (linked across all
 * panel views). Omitted for editor tabs (self-owned local filter).
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
   * (panel views): the snapshot comes from here and every edit publishes via
   * `onPublish` instead of mutating local state, and `localScope` is `null` (the
   * shared spec is already applied host-side as the parent scope, so the view
   * must not re-apply it). Omit for a self-owned local filter (editor tabs),
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
  // In shared mode the snapshot is the broadcast shared spec (controlled);
  // otherwise it's this surface's own persisted local snapshot.
  const snapshot = shared ? shared.snapshot : localSnapshot;
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
    // Shared mode: publish the edited snapshot upstream (the host recomputes the
    // scope + echoes the new spec to every panel view). Local mode: mutate our
    // own state.
    const edit = (fn: (s: FilterSnapshot) => FilterSnapshot) =>
      shared ? shared.onPublish(fn(shared.snapshot)) : setLocalSnapshot((s) => fn(s));
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
