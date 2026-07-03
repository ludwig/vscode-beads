/**
 * Pure facet computation for the FilterBar's "+ Filter" menu (unified filter
 * bar, Phase 2). Tallies the distinct filterable values present in a bead list
 * with counts, plus the special `__unlabeled__` / `__unassigned__` buckets.
 *
 * First-cut simplification: counts are over the FULL bead list, not
 * cross-filtered by the other active dimensions (IssuesView uses tanstack's
 * `getFacetedUniqueValues` for that). Global counts are enough to populate the
 * menu; cross-filter faceting is a later refinement.
 *
 * DOM-/React-free so it's unit-testable in isolation.
 */

import type { Bead, BeadPriority } from "../shared/contract";
import { UNLABELED, UNASSIGNED } from "../backend/filterPredicates";

export interface FacetOption {
  value: string;
  count: number;
}

export interface PriorityFacet {
  value: BeadPriority;
  count: number;
}

export interface FacetData {
  statuses: FacetOption[];
  types: FacetOption[];
  assignees: FacetOption[]; // includes `__unassigned__` when any bead is unassigned
  labels: FacetOption[]; // includes `__unlabeled__` when any bead has no labels
  priorities: PriorityFacet[];
}

/** Sort by count descending, then value ascending, for a stable menu order. */
function sortByCount(a: FacetOption, b: FacetOption): number {
  return b.count - a.count || a.value.localeCompare(b.value);
}

export function computeFacets(beads: Bead[]): FacetData {
  const statuses = new Map<string, number>();
  const types = new Map<string, number>();
  const assignees = new Map<string, number>();
  const labels = new Map<string, number>();
  const priorities = new Map<BeadPriority, number>();

  const bump = <K>(m: Map<K, number>, key: K): void => {
    m.set(key, (m.get(key) ?? 0) + 1);
  };

  for (const b of beads) {
    bump(statuses, b.status);
    if (b.type !== undefined) bump(types, b.type);
    if (b.priority !== undefined) bump(priorities, b.priority);
    if (b.assignee) bump(assignees, b.assignee);
    else bump(assignees, UNASSIGNED);
    if (b.labels && b.labels.length > 0) for (const l of b.labels) bump(labels, l);
    else bump(labels, UNLABELED);
  }

  const toOptions = (m: Map<string, number>): FacetOption[] =>
    [...m.entries()].map(([value, count]) => ({ value, count })).sort(sortByCount);

  return {
    statuses: toOptions(statuses),
    types: toOptions(types),
    assignees: toOptions(assignees),
    labels: toOptions(labels),
    priorities: [...priorities.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value - b.value),
  };
}
