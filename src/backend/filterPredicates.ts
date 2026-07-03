/**
 * Pure per-field filter-match predicates (vs-live-parent-scope Phase 1, Task 1).
 *
 * Single source of truth for "does this bead match this filter value" — ported
 * verbatim from the Issues table's tanstack `filterFn`s so the webview table
 * and the host's `resolveScope` (Task 2) always agree. DOM-/vscode-free so
 * it's unit-testable and safe to run host-side, exactly like
 * `favoritesScope.ts` / `readyBeads.ts`.
 */

import type { Bead, BeadStatus, BeadPriority } from "../shared/contract";
import { isClosedStatus } from "../shared/contract";

export const NOT_CLOSED = "__not-closed__";
export const UNLABELED = "__unlabeled__";
export const UNASSIGNED = "__unassigned__";

export function matchType(bead: Bead, values: string[]): boolean {
  if (!values.length) return true;
  return bead.type !== undefined && values.includes(bead.type);
}

export function matchStatus(bead: Bead, values: BeadStatus[]): boolean {
  if (!values.length) return true;
  if (values.includes(NOT_CLOSED as BeadStatus)) return !isClosedStatus(bead.status);
  return values.includes(bead.status);
}

export function matchPriority(bead: Bead, values: BeadPriority[]): boolean {
  if (!values.length) return true;
  return bead.priority !== undefined && values.includes(bead.priority);
}

export function matchLabels(bead: Bead, values: string[]): boolean {
  if (!values.length) return true;
  const labels = bead.labels;
  if (!labels || labels.length === 0) return values.includes(UNLABELED);
  return labels.some((l) => values.includes(l));
}

export function matchAssignee(bead: Bead, values: string[]): boolean {
  if (!values.length) return true;
  if (values.includes(UNASSIGNED) && !bead.assignee) return true;
  return bead.assignee !== undefined && values.includes(bead.assignee);
}

export function matchSearch(bead: Bead, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    bead.id.toLowerCase().includes(q) ||
    bead.title.toLowerCase().includes(q) ||
    (bead.description?.toLowerCase().includes(q) ?? false) ||
    (bead.labels?.some((l) => l.toLowerCase().includes(q)) ?? false)
  );
}
