/**
 * Gate for the lazy dependency-graph fetch (vs-mbqc).
 *
 * The Issues list's "Ready" and "Favorites" filters both need the dependency
 * graph — Ready to find unblocked beads, Favorites to pull in each starred
 * bead's 1-hop relatives. The graph is fetched lazily, so any code path that
 * makes such a filter *active* must request it if it isn't loaded yet.
 *
 * This predicate is the single source of truth for that decision, shared by the
 * toggle handlers (user enables a filter) and the mount effect (a filter was
 * restored as active from persisted state — the bug that left favorites
 * stripped of their relatives until the user toggled the filter off and on).
 */
export function needsDependencyGraph(filterActive: boolean, hasGraph: boolean): boolean {
  return filterActive && !hasGraph;
}
