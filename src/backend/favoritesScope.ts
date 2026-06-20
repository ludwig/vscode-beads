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

/**
 * Row-modifier class for the Issues table favorites highlight (vs-lu8f). Returns
 * "favorite" when the bead is starred AND the highlight is enabled, else "".
 * Pure/DOM-free so it's unit-testable. In the Favorites filter the tag-along
 * relatives are NOT starred, so they get "" — the subtle dark/light contrast
 * the user described falls out for free.
 */
export function favoriteRowClass(
  beadId: string,
  favoriteIds: Set<string>,
  highlightFavorites: boolean,
): string {
  return highlightFavorites && favoriteIds.has(beadId) ? "favorite" : "";
}
