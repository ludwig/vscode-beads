/**
 * Issue prefix derivation
 *
 * Beads issue IDs are formatted `<prefix>-<suffix>` (e.g. "vs-kmt"), where the
 * suffix is a base32 token that may carry a dotted child segment ("vs-kmt.1").
 * The prefix is everything before the final hyphen, which also handles
 * multi-segment prefixes like "agent-beads-x1y2" -> "agent-beads".
 *
 * We derive the active prefix from the issue IDs that are already loaded rather
 * than issuing a separate `bd info` call, so the surfaced prefix always matches
 * what the user is actually looking at.
 */

/**
 * Derives the active issue prefix from a collection of bead IDs.
 *
 * Returns the most frequently occurring prefix (robust against the odd
 * cross-repo reference sneaking into a list), or null when no ID yields one.
 */
export function deriveIssuePrefix(ids: Iterable<string>): string | null {
  const counts = new Map<string, number>();

  for (const id of ids) {
    const idx = id.lastIndexOf("-");
    if (idx <= 0) {
      continue;
    }
    const prefix = id.slice(0, idx);
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [prefix, count] of counts) {
    if (count > bestCount) {
      best = prefix;
      bestCount = count;
    }
  }

  return best;
}
