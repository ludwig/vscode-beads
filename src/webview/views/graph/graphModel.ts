/**
 * Pure helpers for the Graph view: per-relationship edge styling, the legend,
 * and focus-neighborhood computation. No React / DOM — unit-testable.
 */

import type { DependencyType } from "../../types";
import type { LayoutEdge } from "./layout";

export interface EdgeStyle {
  /** Stroke color. */
  color: string;
  /** Dashed line (vs solid). */
  dashed: boolean;
  /** Thicker stroke (blocks edges, to emphasize hard dependencies). */
  bold: boolean;
  label: string;
}

// Mirrors the relationship palette `bd … --format dot` uses, tuned for the
// extension's dark-friendly theme.
export const EDGE_STYLES: Record<DependencyType, EdgeStyle> = {
  blocks: { color: "#ef4444", dashed: false, bold: true, label: "blocks" },
  "parent-child": { color: "#3b82f6", dashed: false, bold: false, label: "parent / child" },
  related: { color: "#9ca3af", dashed: true, bold: false, label: "related" },
  "discovered-from": { color: "#10b981", dashed: true, bold: false, label: "discovered from" },
};

export const EDGE_TYPE_ORDER: DependencyType[] = [
  "blocks",
  "parent-child",
  "related",
  "discovered-from",
];

export function edgeStyle(type: DependencyType): EdgeStyle {
  return EDGE_STYLES[type] ?? EDGE_STYLES.related;
}

/**
 * Relationship choices offered when drawing a new edge on the canvas (vs-caz).
 * The graph draws edges dependent→dependency (an edge A→B means "A depends on
 * B"), so a drag from node A's source handle to node B's target handle is the
 * *forward* direction — A relates to B as described. Labels read "A <label> B".
 */
export interface ConnectDepOption {
  type: DependencyType;
  label: string;
}

export const CONNECT_DEP_OPTIONS: ConnectDepOption[] = [
  { type: "blocks", label: "Blocked by" },
  { type: "parent-child", label: "Child of" },
  { type: "related", label: "Related to" },
  { type: "discovered-from", label: "Discovered from" },
];

/**
 * Map a canvas connection (React Flow gives source→target) to an addDependency
 * payload. The drag direction is the forward direction, so reverse is always
 * false: the provider stores from_id=source, to_id=target, preserving the
 * dependent→dependency arrow the user drew.
 */
export function connectionToAddDependency(
  source: string,
  target: string,
  type: DependencyType,
): { beadId: string; targetId: string; dependencyType: DependencyType; reverse: boolean } {
  return { beadId: source, targetId: target, dependencyType: type, reverse: false };
}

/**
 * The weakly-connected neighborhood of `focusId`: the focus node plus every
 * node reachable by following edges in either direction. Used by focus-on-root
 * mode to show just the dependency chain a bead participates in. Returns an
 * empty set if the focus id is not among the nodes.
 */
export function neighborhood(
  focusId: string,
  nodeIds: string[],
  edges: LayoutEdge[],
): Set<string> {
  const present = new Set(nodeIds);
  if (!present.has(focusId)) return new Set();

  const adjacency = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a)!.push(b);
  };
  for (const e of edges) {
    if (!present.has(e.from) || !present.has(e.to)) continue;
    link(e.from, e.to);
    link(e.to, e.from);
  }

  const seen = new Set<string>([focusId]);
  const queue = [focusId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}
