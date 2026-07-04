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
import { Bead, isClosedStatus, BeadType } from "../types";
import { TypeIcon } from "./TypeIcon";
import { StatusPriorityPill } from "./StatusPriorityPill";
import { getLabelColorStyle } from "../utils/label-colors";

interface BeadSummaryProps {
  bead: Bead;
  /** Gray the title when the bead is closed (beads.muteClosedIssues). */
  muteClosed?: boolean;
  /** Click the readout (e.g. open the full Details takeover). Makes it clickable. */
  onOpen?: (beadId: string) => void;
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
  onOpen,
  onContextMenu,
  maxLabels = 6,
}: BeadSummaryProps): React.ReactElement {
  const labels = bead.labels ?? [];
  const shownLabels = labels.slice(0, maxLabels);
  const extraLabels = labels.length - shownLabels.length;
  const desc = bead.description ? excerpt(bead.description) : "";
  const closedMuted = muteClosed && isClosedStatus(bead.status);

  return (
    <div
      className={`bead-readout${onOpen ? " bead-readout-clickable" : ""}`}
      onClick={onOpen ? () => onOpen(bead.id) : undefined}
      onContextMenu={onContextMenu}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      title={onOpen ? "Show full details" : undefined}
    >
      <div className="bead-readout-head">
        <TypeIcon type={bead.type || "task"} size={14} />
        <span className="bead-readout-id">{bead.id}</span>
        <span className="bead-readout-head-spacer" />
        <StatusPriorityPill
          type={(bead.type || "task") as BeadType}
          status={bead.status}
          priority={bead.priority}
        />
      </div>

      <div className={`bead-readout-title${closedMuted ? " muted-closed" : ""}`}>{bead.title}</div>

      <dl className="bead-readout-meta">
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
