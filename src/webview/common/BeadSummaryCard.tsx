/**
 * BeadSummaryCard — a reusable, medium-LOD rendering of a single bead.
 *
 * Sits between the low-LOD list rows (favorites/`active-bead`: id + title) and
 * the full Details view (description, deps, comments, edit). It shows the
 * essentials at a glance — type, id, priority, status, title, assignee, labels,
 * and a short description excerpt — in a stylish card.
 *
 * Presentational + reusable: it owns no state and takes only a `bead` plus
 * optional click/context handlers, so the left sidebar's "Details" section, an
 * editor-tab preview, a hover popover, etc. can all reuse it. Part of unifying
 * the codebase's several ad-hoc bead renderings into a shared LOD family.
 */

import React from "react";
import { User } from "lucide-react";
import { Bead, statusColor, isClosedStatus } from "../types";
import { TypeIcon } from "./TypeIcon";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { getLabelColorStyle } from "../utils/label-colors";

interface BeadSummaryCardProps {
  bead: Bead;
  /** Gray the title when the bead is closed (beads.muteClosedIssues). */
  muteClosed?: boolean;
  /** Click the card (e.g. open the full Details view). */
  onOpen?: (beadId: string) => void;
  /** Right-click the card (e.g. the shared bead context menu). */
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Max label chips before collapsing the rest into a "+N". */
  maxLabels?: number;
  /**
   * Drop the card's own frame (border / background / shadow) so the content
   * flows directly into a host that already provides the frame — e.g. the
   * sidebar "Details" section. Still clickable; the status accent moves to a
   * thin left rule on the title block.
   */
  flat?: boolean;
}

/** Collapse a markdown-ish description to a short single-paragraph excerpt. */
function excerpt(text: string, max = 160): string {
  const stripped = text
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/[#>*_`~]/g, "") // inline markdown punctuation
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > max ? `${stripped.slice(0, max).trimEnd()}…` : stripped;
}

export function BeadSummaryCard({
  bead,
  muteClosed = false,
  onOpen,
  onContextMenu,
  maxLabels = 3,
  flat = false,
}: BeadSummaryCardProps): React.ReactElement {
  const labels = bead.labels ?? [];
  const shownLabels = labels.slice(0, maxLabels);
  const extraLabels = labels.length - shownLabels.length;
  const desc = bead.description ? excerpt(bead.description) : "";
  const closedMuted = muteClosed && isClosedStatus(bead.status);

  return (
    <button
      type="button"
      className={`bead-summary-card${flat ? " bsc-flat" : ""}`}
      style={{ borderLeftColor: statusColor(bead.status) }}
      title={`${bead.id} — ${bead.title}\nClick to open the full Details view`}
      onClick={() => onOpen?.(bead.id)}
      onContextMenu={onContextMenu}
    >
      <div className="bsc-top">
        <TypeIcon type={bead.type || "task"} size={14} />
        <span className="bsc-id">{bead.id}</span>
        {bead.priority !== undefined && (
          <PriorityBadge priority={bead.priority} size="small" className="bsc-priority" />
        )}
        <span className="bsc-status">
          <StatusBadge status={bead.status} size="small" />
        </span>
      </div>

      <div className={`bsc-title${closedMuted ? " muted-closed" : ""}`}>{bead.title}</div>

      {(bead.assignee || shownLabels.length > 0) && (
        <div className="bsc-meta">
          {bead.assignee && (
            <span className="bsc-assignee" title={`Assignee: ${bead.assignee}`}>
              <User size={11} strokeWidth={2} />
              {bead.assignee}
            </span>
          )}
          {shownLabels.map((l) => (
            <span key={l} className="bsc-label" style={getLabelColorStyle(l)}>
              {l}
            </span>
          ))}
          {extraLabels > 0 && <span className="bsc-label-more">+{extraLabels}</span>}
        </div>
      )}

      {desc && <p className="bsc-desc">{desc}</p>}
    </button>
  );
}
