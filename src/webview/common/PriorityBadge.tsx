/**
 * PriorityBadge Component
 *
 * Displays bead priority as a colored badge
 */

import React from "react";
import { BeadPriority, PRIORITY_LABELS, PRIORITY_COLORS, PRIORITY_TEXT_COLORS } from "../types";

interface PriorityBadgeProps {
  priority: BeadPriority;
  size?: "small" | "medium" | "large";
  /** Extra class for context-specific placement/sizing (e.g. a card's corner). */
  className?: string;
}

export function PriorityBadge({
  priority,
  size = "medium",
  className,
}: PriorityBadgeProps): React.ReactElement {
  const label = PRIORITY_LABELS[priority] || `P${priority}`;
  const bgColor = PRIORITY_COLORS[priority] || "#888888";
  const textColor = PRIORITY_TEXT_COLORS[priority] || "#ffffff";

  return (
    <span
      className={`priority-badge priority-badge-${size}${className ? ` ${className}` : ""}`}
      style={{ backgroundColor: bgColor, color: textColor }}
      title={`Priority: ${label}`}
    >
      p{priority}
    </span>
  );
}
