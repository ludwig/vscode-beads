/**
 * Pure parser for the edge section of `bd list --format dot` (Graphviz) output.
 *
 * The CLI backend has no JSON form for the whole dependency graph, but
 * `bd list --format dot` emits every edge in one call. Edge lines look like:
 *
 *   "vs-fvc" -> "vs-b4e" [label="blocks", color=red, style=bold];
 *
 * where the left node is the dependent issue and the right node is what it
 * depends on (matching our `{ from, to, type }` convention). Node-declaration
 * lines (`"vs-x" [label=...]`) and the digraph wrapper are ignored.
 *
 * Kept dependency-free and React-free so it can be unit-tested directly.
 */

import type { DependencyType } from "../shared/contract";

export interface GraphEdge {
  from: string;
  to: string;
  type: DependencyType;
}

const DEPENDENCY_TYPES: ReadonlySet<string> = new Set<DependencyType>([
  "blocks",
  "parent-child",
  "related",
  "discovered-from",
]);

// "<from>" -> "<to>" [label="<type>", ...]
const EDGE_LINE = /^\s*"([^"]+)"\s*->\s*"([^"]+)"\s*\[label="([^"]+)"/;

function normalizeType(raw: string): DependencyType {
  return DEPENDENCY_TYPES.has(raw) ? (raw as DependencyType) : "related";
}

/**
 * Extract dependency edges from `bd list --format dot` output. Lines that are
 * not edge declarations are skipped, so passing stray stderr noise is safe.
 */
export function parseDotEdges(dot: string): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const line of dot.split("\n")) {
    const match = EDGE_LINE.exec(line);
    if (!match) continue;
    const [, from, to, type] = match;
    edges.push({ from, to, type: normalizeType(type) });
  }
  return edges;
}
