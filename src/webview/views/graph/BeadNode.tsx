/**
 * Custom React Flow node for the dependency Graph view: a compact bead card
 * with a status-colored left rail, type icon, id, title, and priority dot.
 * Reuses the extension's shared color maps so it matches the Issues/Dashboard
 * cards. Edges attach via a target handle on top and a source handle on bottom
 * (matching the layered top→bottom dependency direction).
 */

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Bead,
  STATUS_COLORS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  UNKNOWN_PRIORITY_COLOR,
  BeadPriority,
} from "../../types";
import { TypeIcon } from "../../common/TypeIcon";

export interface BeadNodeData {
  bead: Bead;
  dimmed: boolean;
  [key: string]: unknown;
}

export function BeadNode({ data, selected }: NodeProps): React.ReactElement {
  const { bead, dimmed } = data as BeadNodeData;
  const statusColor = STATUS_COLORS[bead.status] || "#888888";
  const priority = bead.priority;
  const priorityColor =
    priority === undefined ? UNKNOWN_PRIORITY_COLOR : PRIORITY_COLORS[priority as BeadPriority];
  const priorityLabel =
    priority === undefined ? "P?" : `P${priority} ${PRIORITY_LABELS[priority as BeadPriority]}`;

  return (
    <div
      className={`graph-node${selected ? " selected" : ""}${dimmed ? " dimmed" : ""}`}
      style={{ borderLeftColor: statusColor }}
      title={`${bead.id} · ${bead.title}`}
    >
      <Handle type="target" position={Position.Top} className="graph-node-handle" />
      <div className="graph-node-head">
        {bead.type ? <TypeIcon type={bead.type} size={13} /> : null}
        <span className="graph-node-id">{bead.id}</span>
        <span
          className="graph-node-priority"
          style={{ backgroundColor: priorityColor }}
          title={priorityLabel}
        />
      </div>
      <div className="graph-node-title">{bead.title}</div>
      <Handle type="source" position={Position.Bottom} className="graph-node-handle" />
    </div>
  );
}
