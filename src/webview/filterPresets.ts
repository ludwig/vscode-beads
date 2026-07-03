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
