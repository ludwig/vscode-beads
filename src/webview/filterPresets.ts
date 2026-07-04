/**
 * Shared Issues-filter presets (unified filter bar, Phase 2).
 *
 * Lifted verbatim out of `IssuesView` so both the Issues table and the new
 * reusable `FilterBar` draw from ONE preset list instead of duplicating it.
 * A preset sets the `status` column to a fixed list; the symbolic ¬closed
 * preset uses the `NOT_CLOSED` sentinel (a true exclusion evaluated per-row by
 * the shared `matchStatus`), so it renders as a single chip and never drifts as
 * the status set grows.
 */

import type { BeadStatus } from "../shared/contract";
import { NOT_CLOSED } from "../backend/filterPredicates";

export interface FilterPreset {
  id: string;
  label: string;
  statuses: BeadStatus[];
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: "all", label: "All", statuses: [] },
  { id: "not-closed", label: "Not Closed", statuses: [NOT_CLOSED] },
  { id: "active", label: "Active", statuses: ["in_progress", "blocked"] },
  { id: "blocked", label: "Blocked", statuses: ["blocked"] },
  { id: "closed", label: "Closed", statuses: ["closed"] },
];

/**
 * Resolve which preset a status selection corresponds to — derived PURELY from
 * the status column, never a stored preset id. This is what the filter bar's
 * dropdown label reads from: a follower tab can inherit a foreign/stale preset
 * id (e.g. the "custom" sentinel from an empty shared spec) which must NOT leave
 * the dropdown stuck on "Custom" when nothing narrows the status. An empty
 * status set matches the "all" preset (its `statuses` is `[]`); an exact set
 * match returns that preset; anything else returns `undefined` (⇒ "Custom").
 */
export function matchStatusPreset(statuses: BeadStatus[]): FilterPreset | undefined {
  return FILTER_PRESETS.find(
    (p) => p.statuses.length === statuses.length && p.statuses.every((s) => statuses.includes(s)),
  );
}
