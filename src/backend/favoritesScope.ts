/**
 * Favorites + relatives scope (vs-sd5.7). Pure helper, shared by the Issues
 * "Favorites" filter: given the starred bead ids and the dependency edges,
 * returns the favorites plus their 1-hop neighbors (relatives) over ANY edge
 * type — so a favorite shows up with its immediate context, not stripped bare.
 *
 * Edge direction is irrelevant here: a neighbor on either end of an edge
 * touching a favorite is a relative. DOM-/vscode-free so it's unit-testable.
 */
export function favoritesWithRelatives(
  favoriteIds: string[],
  edges: { from: string; to: string }[],
): Set<string> {
  const favorites = new Set(favoriteIds);
  const scope = new Set(favorites);
  for (const edge of edges) {
    if (favorites.has(edge.from)) scope.add(edge.to);
    if (favorites.has(edge.to)) scope.add(edge.from);
  }
  return scope;
}
