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
  statusLabel,
  statusColor,
  PRIORITY_COLORS,
  PRIORITY_TEXT_COLORS,
  UNKNOWN_PRIORITY_COLOR,
  UNKNOWN_PRIORITY_TEXT_COLOR,
} from "../types";

interface StatusPriorityPillProps {
  status?: BeadStatus;
  priority?: BeadPriority;
}

export function StatusPriorityPill({
  status,
  priority,
}: StatusPriorityPillProps): React.ReactElement | null {
  // Need at least one value to render
  if (!status && priority === undefined) return null;

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
      {status && (
        <span
          className="pill-status"
          style={{ backgroundColor: statusBg || undefined }}
        >
          {statusText}
        </span>
      )}
      <span
        className="pill-priority"
        style={{
          backgroundColor: priorityBgColor,
          color: priorityTextColor,
          borderRadius: status ? undefined : "var(--border-radius)",
        }}
      >
        {priorityLabel}
      </span>
    </span>
  );
}
