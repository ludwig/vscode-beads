/**
 * Derive "ready to work" beads from the loaded list + dependency edges (vs-ih1).
 *
 * Mode-agnostic (works for both the CLI and Dolt backends) because it computes
 * readiness from data both already provide, rather than relying on a `bd ready`
 * subcommand. A bead is ready when it is OPEN and has no open blocker.
 *
 * Blocks-edge convention matches the rest of the app: {from, to} means "from is
 * blocked by to" (from depends on to). So `from` is blocked while any such `to`
 * is not yet closed.
 */

import type { Bead, BeadStatus } from "../shared/contract";

interface BlocksEdge {
  from: string;
  to: string;
}

type ReadyBead = Pick<Bead, "id" | "status" | "priority">;

/**
 * Ordered ids of ready beads: open, with no open blocker, sorted by priority
 * (P0 first; missing priority last) then id for stable output.
 */
export function readyBeadIds(beads: ReadyBead[], blocksEdges: BlocksEdge[]): string[] {
  const statusById = new Map<string, BeadStatus>(beads.map((b) => [b.id, b.status]));

  const blocked = new Set<string>();
  for (const e of blocksEdges) {
    const blockerStatus = statusById.get(e.to);
    // Unknown blocker (not in the loaded set) is treated as still-open, to be safe.
    if (blockerStatus !== "closed") blocked.add(e.from);
  }

  const PRIORITY_LAST = 99;
  return beads
    .filter((b) => b.status === "open" && !blocked.has(b.id))
    .sort((a, b) => {
      const pa = a.priority ?? PRIORITY_LAST;
      const pb = b.priority ?? PRIORITY_LAST;
      if (pa !== pb) return pa - pb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((b) => b.id);
}

/**
 * Pick the next ready bead after `afterId` (cycles to the start), or the first
 * ready bead when `afterId` is absent or no longer ready. Returns null when
 * nothing is ready.
 */
export function nextReadyBead(
  beads: ReadyBead[],
  blocksEdges: BlocksEdge[],
  afterId?: string | null,
): string | null {
  const ids = readyBeadIds(beads, blocksEdges);
  if (ids.length === 0) return null;
  if (!afterId) return ids[0];
  const idx = ids.indexOf(afterId);
  if (idx === -1) return ids[0];
  return ids[(idx + 1) % ids.length];
}
