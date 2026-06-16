/**
 * Pure helpers for the Tree view (vs-bw9): build a parent/child forest from the
 * dependency graph and prune it to a filter query. No React/DOM — unit-testable.
 *
 * Hierarchy comes from `parent-child` edges. The graph draws edges
 * dependent→dependency, and a parent-child dependency reads "child depends on
 * parent" — so for an edge {from, to, type:'parent-child'}, `from` is the CHILD
 * and `to` is the PARENT (consistent with the Details view's labelling).
 */

import type { Bead, DependencyType } from "../../types";

export interface TreeNode {
  bead: Bead;
  children: TreeNode[];
}

interface GraphEdgeLike {
  from: string;
  to: string;
  type: DependencyType;
}

/**
 * Build a forest of beads keyed on parent-child edges. Roots are beads with no
 * parent (including standalone beads). Guards against multi-parent (first parent
 * wins) and cycles (a node is never expanded twice along one branch).
 *
 * Ordering at every level: by `typeRank` (lower first — callers pass the type
 * sort order so epics cluster at the top), then by id. `typeRank` is injected
 * rather than imported so this module stays free of the webview's
 * window-touching `types` side-effects (and unit-testable). Defaults to id-only.
 */
export function buildForest(
  nodes: Bead[],
  edges: GraphEdgeLike[],
  typeRank: (type: string | undefined) => number = () => 0,
): TreeNode[] {
  const byId = new Map(nodes.map((b) => [b.id, b]));
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();

  for (const e of edges) {
    if (e.type !== "parent-child") continue;
    const child = e.from;
    const parent = e.to;
    if (child === parent) continue;
    if (!byId.has(child) || !byId.has(parent)) continue; // ignore dangling edges
    if (parentOf.has(child)) continue; // first parent wins
    parentOf.set(child, parent);
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent)!.push(child);
  }

  // Sort by type rank (epics first) then id, so the structural containers that
  // usually hold children cluster at the top of each level.
  const sortIds = (ids: string[]): string[] =>
    [...ids].sort((a, b) => {
      const ta = typeRank(byId.get(a)?.type);
      const tb = typeRank(byId.get(b)?.type);
      if (ta !== tb) return ta - tb;
      return a < b ? -1 : a > b ? 1 : 0;
    });

  const build = (id: string, ancestry: Set<string>): TreeNode => {
    const kidIds = sortIds((childrenOf.get(id) ?? []).filter((c) => !ancestry.has(c))); // cycle guard
    const nextAncestry = new Set(ancestry).add(id);
    return {
      bead: byId.get(id)!,
      children: kidIds.map((c) => build(c, nextAncestry)),
    };
  };

  return sortIds(nodes.filter((b) => !parentOf.has(b.id)).map((b) => b.id)).map((id) =>
    build(id, new Set()),
  );
}

/**
 * Prune a forest to a filter query. A node that matches keeps its FULL subtree
 * (so filtering to a parent shows its children contextually); a non-matching
 * node is kept only if a descendant matches, retaining just the path to it
 * (folder-filter behavior). Empty/whitespace query returns the forest unchanged.
 */
export function filterForest(forest: TreeNode[], query: string): TreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return forest;

  const matches = (b: Bead) =>
    b.id.toLowerCase().includes(q) || b.title.toLowerCase().includes(q);

  const prune = (node: TreeNode): TreeNode | null => {
    if (matches(node.bead)) return node; // keep the whole subtree under a match
    const kids = node.children.map(prune).filter((n): n is TreeNode => n !== null);
    return kids.length > 0 ? { bead: node.bead, children: kids } : null;
  };

  return forest.map(prune).filter((n): n is TreeNode => n !== null);
}
