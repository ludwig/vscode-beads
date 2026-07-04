/**
 * StatusPriorityPill Component
 *
 * Displays status and priority as a joined pill badge.
 * Used in dependency lists for consistent rendering.
 */

import React from "react";
import {
  BeadStatus,
  BeadPriority,
  BeadType,
  statusLabel,
  statusColor,
  TYPE_COLORS,
  TYPE_LABELS,
  PRIORITY_COLORS,
  PRIORITY_TEXT_COLORS,
  UNKNOWN_PRIORITY_COLOR,
  UNKNOWN_PRIORITY_TEXT_COLOR,
} from "../types";

interface StatusPriorityPillProps {
  /** Optional leading type segment (e.g. the header/Selection pill: [type|status|priority]). */
  type?: BeadType;
  status?: BeadStatus;
  priority?: BeadPriority;
}

/**
 * A joined pill of a bead's type/status/priority. The dependency lists render
 * [status|priority]; the Details header and the Selection card also lead with a
 * type segment. Outer corners are rounded generically (first/last/only-child)
 * so any subset renders correctly.
 */
export function StatusPriorityPill({
  type,
  status,
  priority,
}: StatusPriorityPillProps): React.ReactElement | null {
  // Need at least one value to render
  if (!type && !status && priority === undefined) return null;

  const statusText = status ? statusLabel(status) : null;
  const statusBg = status ? statusColor(status) : null;

  const priorityLabel = priority !== undefined ? `P${priority}` : "P?";
  const priorityBgColor = priority !== undefined
    ? PRIORITY_COLORS[priority]
    : UNKNOWN_PRIORITY_COLOR;
  const priorityTextColor = priority !== undefined
    ? PRIORITY_TEXT_COLORS[priority]
    : UNKNOWN_PRIORITY_TEXT_COLOR;

  return (
    <span className="status-priority-pill">
      {type && (
        <span className="pill-type" style={{ backgroundColor: TYPE_COLORS[type] }}>
          {TYPE_LABELS[type] ?? type}
        </span>
      )}
      {status && (
        <span className="pill-status" style={{ backgroundColor: statusBg || undefined }}>
          {statusText}
        </span>
      )}
      {priority !== undefined && (
        <span
          className="pill-priority"
          style={{ backgroundColor: priorityBgColor, color: priorityTextColor }}
        >
          {priorityLabel}
        </span>
      )}
    </span>
  );
}
