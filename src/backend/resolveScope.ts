/**
 * Pure `resolveScope` (vs-live-parent-scope Phase 1, Task 2).
 *
 * Composes the shared filter predicates (Task 1) + `readyBeadIds` +
 * `favoritesWithRelatives` into the single "parent scope" id set that both
 * the host (`ScopeService`) and, eventually, the Issues table agree on.
 * DOM-/vscode-free so it's unit-testable and safe to run host-side, exactly
 * like `favoritesScope.ts` / `readyBeads.ts`.
 */

import type { Bead, BeadStatus, BeadPriority, FilterSnapshot } from "../shared/contract";
import { matchStatus, matchType, matchPriority, matchLabels, matchAssignee, matchSearch } from "./filterPredicates";
import { favoritesWithRelatives } from "./favoritesScope";
import { readyBeadIds } from "./readyBeads";

export interface Edge {
  from: string;
  to: string;
  type?: string;
}

export interface ScopeInputs {
  beads: Bead[];
  edges: Edge[];
  favoriteIds: string[];
  maskedIds: string[];
  spec: FilterSnapshot;
}

const col = (spec: FilterSnapshot, id: string): unknown[] =>
  (spec.columnFilters.find((f) => f.id === id)?.value as unknown[] | undefined) ?? [];

/**
 * Resolve the matching bead-id set for a `FilterSnapshot`, in `beads` order.
 * Returns `null` when no dimension is active (⇒ "all beads") so callers can
 * treat `null` as no scoping, distinct from an active-but-empty scope (`[]`).
 */
export function resolveScope({ beads, edges, favoriteIds, maskedIds, spec }: ScopeInputs): string[] | null {
  const statuses = col(spec, "status") as BeadStatus[];
  const types = col(spec, "type") as string[];
  const priorities = col(spec, "priority") as BeadPriority[];
  const labels = col(spec, "labels") as string[];
  const assignees = col(spec, "assignee") as string[];
  const search = spec.globalFilter ?? "";

  const anyColumn = statuses.length || types.length || priorities.length || labels.length || assignees.length;
  const active = Boolean(anyColumn) || search.trim().length > 0 || spec.readyOnly || spec.favoritesOnly;
  if (!active) return null; // nothing narrows → all beads

  let rows = beads;
  if (statuses.length) rows = rows.filter((b) => matchStatus(b, statuses));
  if (types.length) rows = rows.filter((b) => matchType(b, types));
  if (priorities.length) rows = rows.filter((b) => matchPriority(b, priorities));
  if (labels.length) rows = rows.filter((b) => matchLabels(b, labels));
  if (assignees.length) rows = rows.filter((b) => matchAssignee(b, assignees));
  if (search.trim()) rows = rows.filter((b) => matchSearch(b, search));

  if (spec.readyOnly) {
    const blocks = edges.filter((e) => e.type === "blocks");
    const ready = new Set(readyBeadIds(beads, blocks));
    rows = rows.filter((b) => ready.has(b.id));
  }
  if (spec.favoritesOnly) {
    const seed = favoriteIds.filter((id) => !maskedIds.includes(id));
    const scope = favoritesWithRelatives(seed, edges);
    rows = rows.filter((b) => scope.has(b.id));
  }
  return rows.map((b) => b.id);
}
