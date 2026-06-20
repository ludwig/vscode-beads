/**
 * StatusBadge Component
 *
 * Displays bead status as a colored badge
 */

import React from "react";
import { BeadStatus, statusLabel, statusColor } from "../types";

interface StatusBadgeProps {
  status: BeadStatus;
  size?: "small" | "medium" | "large";
}

export function StatusBadge({
  status,
  size = "medium",
}: StatusBadgeProps): React.ReactElement {
  const label = statusLabel(status);
  const color = statusColor(status);

  return (
    <span
      className={`status-badge status-badge-${size}`}
      style={{ backgroundColor: color }}
      title={label}
    >
      {label}
    </span>
  );
}
