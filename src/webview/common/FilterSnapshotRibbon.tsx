/**
 * FilterSnapshotRibbon — a prominent, full-width banner shown at the top of a
 * seeded editor-tab Kanban/Tree/Graph view (vs-zq2). Editor tabs open scoped to
 * a one-time snapshot of the Issues filter (vs-nme); the small in-view
 * FilterIndicator chip is easy to miss, so this ribbon makes the scoping
 * unmistakable and offers a reversible Show all / Show filtered toggle (the
 * snapshot is retained, so the user can flip back).
 */

import React from "react";
import { Filter } from "lucide-react";

interface FilterSnapshotRibbonProps {
  /** Beads matching the inherited snapshot. */
  filteredCount: number;
  /** Total beads on the board. */
  totalCount: number;
  /** True when the user has temporarily dropped the scope ("Show all"). */
  cleared: boolean;
  /** Toggle between the scoped snapshot and the full board. */
  onToggle: () => void;
}

export function FilterSnapshotRibbon({
  filteredCount,
  totalCount,
  cleared,
  onToggle,
}: FilterSnapshotRibbonProps): React.ReactElement {
  return (
    <div className={`filter-snapshot-ribbon${cleared ? " cleared" : ""}`} role="status">
      <Filter size={12} strokeWidth={2.5} className="filter-snapshot-ribbon-icon" />
      <span className="filter-snapshot-ribbon-text">
        {cleared ? (
          <>Showing all {totalCount} — inherited Issues filter cleared</>
        ) : (
          <>
            Filtered — showing <strong>{filteredCount}</strong> of {totalCount} from the Issues filter
          </>
        )}
      </span>
      <button type="button" className="filter-snapshot-ribbon-btn" onClick={onToggle}>
        {cleared ? `Show filtered (${filteredCount})` : "Show all"}
      </button>
    </div>
  );
}
