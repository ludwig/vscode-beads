/**
 * Pure id-set composition for tab-local sidecar filters (unified filter bar,
 * Phase 2). A tab's final scope is the inherited parent scope intersected with
 * its locally-resolved filter:
 *
 *   composed = intersect( (Filtered ? parentScope : all),  resolveLocal(localSpec) )
 *
 * `null` on either side means "no constraint from that side" — the identity for
 * intersection (⇒ "all beads"), distinct from an active-but-empty scope (`[]`).
 * DOM-/React-free so it's unit-testable in isolation.
 */

/** Intersect two id-sets, treating `null` as the unconstrained identity. */
export function intersect(a: string[] | null, b: string[] | null): string[] | null {
  if (a == null) return b;
  if (b == null) return a;
  const bset = new Set(b);
  return a.filter((id) => bset.has(id)); // preserve `a`'s order
}
