/**
 * BeadSummary — a flat, medium-LOD readout of a single bead's payload.
 *
 * NOT a card: it drops the bead's fields (type · id · status · priority, title,
 * type / assignee / labels, a short description excerpt) into plain flowing
 * content for a host section to frame. Sits between the low-LOD list rows
 * (id + title) and the full Details view (description, deps, comments, edit).
 * Presentational + reusable — part of unifying the codebase's several ad-hoc
 * bead renderings into a shared LOD family.
 */

import React from "react";
import { Bead, isClosedStatus, TYPE_LABELS, BeadType } from "../types";
import { TypeIcon } from "./TypeIcon";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { getLabelColorStyle } from "../utils/label-colors";

interface BeadSummaryProps {
  bead: Bead;
  /** Gray the title when the bead is closed (beads.muteClosedIssues). */
  muteClosed?: boolean;
  /** Right-click (e.g. the shared bead context menu). */
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Max label chips before collapsing the rest into a "+N". */
  maxLabels?: number;
}

/** Collapse a markdown-ish description to a short single-paragraph excerpt. */
function excerpt(text: string, max = 200): string {
  const stripped = text
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/[#>*_`~]/g, "") // inline markdown punctuation
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > max ? `${stripped.slice(0, max).trimEnd()}…` : stripped;
}

export function BeadSummary({
  bead,
  muteClosed = false,
  onContextMenu,
  maxLabels = 6,
}: BeadSummaryProps): React.ReactElement {
  const labels = bead.labels ?? [];
  const shownLabels = labels.slice(0, maxLabels);
  const extraLabels = labels.length - shownLabels.length;
  const desc = bead.description ? excerpt(bead.description) : "";
  const closedMuted = muteClosed && isClosedStatus(bead.status);
  const typeLabel = bead.type ? TYPE_LABELS[bead.type as BeadType] ?? bead.type : null;

  return (
    <div className="bead-readout" onContextMenu={onContextMenu}>
      <div className="bead-readout-head">
        <TypeIcon type={bead.type || "task"} size={14} />
        <span className="bead-readout-id">{bead.id}</span>
        <StatusBadge status={bead.status} size="small" />
        {bead.priority !== undefined && <PriorityBadge priority={bead.priority} size="small" />}
      </div>

      <div className={`bead-readout-title${closedMuted ? " muted-closed" : ""}`}>{bead.title}</div>

      <dl className="bead-readout-meta">
        {typeLabel && (
          <div className="bead-readout-row">
            <dt>Type</dt>
            <dd>{typeLabel}</dd>
          </div>
        )}
        {bead.assignee && (
          <div className="bead-readout-row">
            <dt>Assignee</dt>
            <dd>{bead.assignee}</dd>
          </div>
        )}
        {shownLabels.length > 0 && (
          <div className="bead-readout-row">
            <dt>Labels</dt>
            <dd className="bead-readout-labels">
              {shownLabels.map((l) => (
                <span key={l} className="bead-readout-label" style={getLabelColorStyle(l)}>
                  {l}
                </span>
              ))}
              {extraLabels > 0 && <span className="bead-readout-label-more">+{extraLabels}</span>}
            </dd>
          </div>
        )}
      </dl>

      {desc && <p className="bead-readout-desc">{desc}</p>}
    </div>
  );
}
