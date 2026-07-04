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
import { Bead, BeadDependency, isClosedStatus, BeadType } from "../types";
import { TypeIcon } from "./TypeIcon";
import { StatusPriorityPill } from "./StatusPriorityPill";
import { Timestamp } from "./Timestamp";
import { getLabelColorStyle } from "../utils/label-colors";

interface BeadSummaryProps {
  bead: Bead;
  /** Gray the title when the bead is closed (beads.muteClosedIssues). */
  muteClosed?: boolean;
  /** Double-click the readout to open the full Details takeover. */
  onOpen?: (beadId: string) => void;
  /** Single-click to (passively) select. Makes the readout interactive. */
  onSelect?: (beadId: string) => void;
  /** Right-click (e.g. the shared bead context menu). */
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Max label chips before collapsing the rest into a "+N". */
  maxLabels?: number;
}

/** Collapse a markdown-ish description to a short single-paragraph excerpt. */
function excerpt(text: string, max = 420): string {
  const stripped = text
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/[#>*_`~]/g, "") // inline markdown punctuation
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > max ? `${stripped.slice(0, max).trimEnd()}…` : stripped;
}

/** Human estimate: "1h 30m", "45m", "2h". */
function formatEstimate(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Count a dependency array by relationship type. */
function countByType(deps: BeadDependency[] | undefined, dependencyType: string): number {
  return (deps ?? []).filter((d) => (d.dependencyType || "blocks") === dependencyType).length;
}

/**
 * A compact relationships readout: the non-zero relationship counts, in the
 * same reading order the Details view groups them (hierarchy → workflow →
 * provenance → related). `dependsOn` = things this bead depends on;
 * `blocks` = things depending on this bead.
 */
function relationshipSummary(bead: Bead): string[] {
  const { dependsOn, blocks } = bead;
  const parts: { label: string; n: number }[] = [
    { label: "parent", n: countByType(dependsOn, "parent-child") },
    { label: "children", n: countByType(blocks, "parent-child") },
    { label: "blocked by", n: countByType(dependsOn, "blocks") },
    { label: "blocks", n: countByType(blocks, "blocks") },
    { label: "discovered from", n: countByType(dependsOn, "discovered-from") },
    { label: "spawned", n: countByType(blocks, "discovered-from") },
    { label: "related", n: countByType(dependsOn, "related") + countByType(blocks, "related") },
  ];
  return parts.filter((p) => p.n > 0).map((p) => `${p.n} ${p.label}`);
}

export function BeadSummary({
  bead,
  muteClosed = false,
  onOpen,
  onSelect,
  onContextMenu,
  maxLabels = 6,
}: BeadSummaryProps): React.ReactElement {
  const interactive = !!(onOpen || onSelect);
  const labels = bead.labels ?? [];
  const shownLabels = labels.slice(0, maxLabels);
  const extraLabels = labels.length - shownLabels.length;
  const desc = bead.description ? excerpt(bead.description, 600) : "";
  const acceptance = bead.acceptanceCriteria ? excerpt(bead.acceptanceCriteria, 400) : "";
  const closedMuted = muteClosed && isClosedStatus(bead.status);
  const relationships = relationshipSummary(bead);
  const commentCount = bead.comments?.length ?? 0;

  return (
    <div
      className={`bead-readout${interactive ? " bead-readout-clickable" : ""}`}
      onClick={onSelect ? () => onSelect(bead.id) : undefined}
      onDoubleClick={onOpen ? () => onOpen(bead.id) : undefined}
      onContextMenu={onContextMenu}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={onOpen ? "Click to select · double-click to open details" : undefined}
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
        {bead.estimatedMinutes !== undefined && bead.estimatedMinutes > 0 && (
          <div className="bead-readout-row">
            <dt>Estimate</dt>
            <dd>{formatEstimate(bead.estimatedMinutes)}</dd>
          </div>
        )}
        {bead.externalRef && (
          <div className="bead-readout-row">
            <dt>External</dt>
            <dd>{bead.externalRef}</dd>
          </div>
        )}
        {relationships.length > 0 && (
          <div className="bead-readout-row">
            <dt>Links</dt>
            <dd>{relationships.join(" · ")}</dd>
          </div>
        )}
        {commentCount > 0 && (
          <div className="bead-readout-row">
            <dt>Comments</dt>
            <dd>{commentCount}</dd>
          </div>
        )}
      </dl>

      {desc && (
        <div className="bead-readout-section">
          <span className="bead-readout-section-label">Description</span>
          <p className="bead-readout-desc">{desc}</p>
        </div>
      )}

      {acceptance && (
        <div className="bead-readout-section">
          <span className="bead-readout-section-label">Acceptance Criteria</span>
          <p className="bead-readout-desc">{acceptance}</p>
        </div>
      )}

      {(bead.createdAt || bead.updatedAt) && (
        <div className="bead-readout-foot">
          {bead.createdAt && (
            <span>
              Created <Timestamp value={bead.createdAt} format="relative" />
            </span>
          )}
          {bead.updatedAt && (
            <span>
              Updated <Timestamp value={bead.updatedAt} format="relative" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
