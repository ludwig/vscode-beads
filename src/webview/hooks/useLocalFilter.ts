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
}: UseLocalFilterArgs): UseLocalFilterResult {
  const [snapshot, setSnapshot] = useState<FilterSnapshot>(() => {
    const saved = (vscode.getState() as Record<string, FilterSnapshot | undefined> | undefined)?.[persistKey];
    return saved ?? emptyFilterSnapshot();
  });
  useEffect(() => {
    const prev = (vscode.getState() as Record<string, unknown> | undefined) ?? {};
    vscode.setState({ ...prev, [persistKey]: snapshot });
  }, [persistKey, snapshot]);

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
    const edit = (fn: (s: FilterSnapshot) => FilterSnapshot) => setSnapshot((s) => fn(s));
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
  }, []);

  const facets = useMemo(() => computeFacets(beads), [beads]);

  useEffect(() => {
    if ((snapshot.readyOnly || snapshot.favoritesOnly) && !hasGraph) onRequestGraph?.();
  }, [snapshot.readyOnly, snapshot.favoritesOnly, hasGraph, onRequestGraph]);

  const localScope = useMemo(
    () => resolveScope({ beads, edges, favoriteIds, maskedIds, spec: snapshot }),
    [beads, edges, favoriteIds, maskedIds, snapshot],
  );

  return { snapshot, ops, facets, localScope, collapsed, toggleCollapsed };
}
