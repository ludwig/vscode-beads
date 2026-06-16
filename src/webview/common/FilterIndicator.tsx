/**
 * FilterIndicator — a small chip that makes it unmistakable a view is acting on
 * a filtered SUBSET of tickets (the slice defined by the Issues tab), not the
 * whole board. Shown on the views that display filtered data immediately (Tree,
 * Kanban), where there's no explicit "Filtered" toggle to signal scoping.
 */

import React from "react";
import { Filter } from "lucide-react";

interface FilterIndicatorProps {
  /** Tickets matching the current Issues filter. */
  count: number;
  /** Total tickets on the board. */
  total: number;
  className?: string;
}

export function FilterIndicator({ count, total, className }: FilterIndicatorProps): React.ReactElement {
  return (
    <span
      className={`filter-indicator${className ? ` ${className}` : ""}`}
      title={`Acting on a filtered subset — ${count} of ${total} tickets match the current Issues filter`}
    >
      <Filter size={11} strokeWidth={2.5} />
      <span className="filter-indicator-count">
        {count} of {total}
      </span>
    </span>
  );
}
