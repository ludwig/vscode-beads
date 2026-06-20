/**
 * "Not Closed" status set (vs-x6b). Pure helper for the Issues "Not Closed"
 * preset, which is a symbolic negation (¬closed) rather than a hardcoded
 * OR-list of statuses.
 *
 * The set is derived from the statuses ACTUALLY PRESENT in the data, keeping
 * only those whose category is not "done" (isClosedStatus). This is
 * expansion-proof: any new built-in status (e.g. deferred/pinned/hooked) or
 * user-defined custom status that isn't closed-category is included
 * automatically — nothing silently drops out of "Not Closed" the way a
 * hand-maintained allow-list would. DOM-/vscode-free so it's unit-testable.
 */
import { BeadStatus, isClosedStatus } from "../shared/contract";

/**
 * The distinct, present, non-closed statuses across `beads`, in first-seen
 * order. Beads with no status are ignored.
 */
export function deriveNotClosedStatuses(
  beads: readonly { status?: BeadStatus }[],
): BeadStatus[] {
  return Array.from(
    new Set(
      beads
        .map((b) => b.status)
        .filter((s): s is BeadStatus => !!s && !isClosedStatus(s)),
    ),
  );
}

/**
 * Order-insensitive set equality for status arrays — lets the derived
 * "Not Closed" sync skip no-op updates (avoids re-render/persist churn on
 * every data refresh).
 */
export function sameStatusSet(
  a: readonly BeadStatus[],
  b: readonly BeadStatus[],
): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((s) => set.has(s));
}
