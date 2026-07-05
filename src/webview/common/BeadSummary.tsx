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
import { Icon } from "./Icon";
import { StatusPriorityPill, PillFieldPatch } from "./StatusPriorityPill";
import { Timestamp } from "./Timestamp";
import { getLabelColorStyle } from "../utils/label-colors";

interface BeadSummaryProps {
  bead: Bead;
  /** Gray the title when the bead is closed (beads.muteClosedIssues). */
  muteClosed?: boolean;
  /** When provided, the title becomes a link that opens the full Details view.
   *  Kept off the card body so the readout text stays selectable. */
  onOpen?: (beadId: string) => void;
  /** Right-click (e.g. the shared bead context menu). */
  onContextMenu?: (e: React.MouseEvent) => void;
  /** When provided, the type/status/priority pill becomes inline click-to-edit;
   *  a pick commits the patch immediately. */
  onFieldChange?: (patch: PillFieldPatch) => void;
  /** When provided, the ID renders as a clickable chip that copies the ID. */
  onCopyId?: (beadId: string) => void;
  /** Current favorite state — drives the star fill (with onToggleFavorite). */
  isFavorite?: boolean;
  /** When provided, a star toggle rides after the ID chip to (un)favorite. */
  onToggleFavorite?: (beadId: string) => void;
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
  onContextMenu,
  onFieldChange,
  onCopyId,
  isFavorite,
  onToggleFavorite,
  maxLabels = 6,
}: BeadSummaryProps): React.ReactElement {
  const labels = bead.labels ?? [];
  const shownLabels = labels.slice(0, maxLabels);
  const extraLabels = labels.length - shownLabels.length;
  const desc = bead.description ? excerpt(bead.description, 600) : "";
  const acceptance = bead.acceptanceCriteria ? excerpt(bead.acceptanceCriteria, 400) : "";
  const closedMuted = muteClosed && isClosedStatus(bead.status);
  const relationships = relationshipSummary(bead);
  const commentCount = bead.comments?.length ?? 0;

  return (
    <div className="bead-readout" onContextMenu={onContextMenu}>
      <div className="bead-readout-head">
        <TypeIcon type={bead.type || "task"} size={14} />
        {onCopyId ? (
          <span
            className="bead-id-badge clickable fb-tip"
            role="button"
            tabIndex={0}
            data-tip="Click to copy ID"
            onClick={() => onCopyId(bead.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onCopyId(bead.id);
              }
            }}
          >
            {bead.id}
          </span>
        ) : (
          <span className="bead-readout-id">{bead.id}</span>
        )}
        {onToggleFavorite && (
          <button
            className={`icon-btn header-icon-btn fb-tip${isFavorite ? " is-favorite" : ""}`}
            data-tip={isFavorite ? "Unstar (remove from Favorites)" : "Star (add to Favorites)"}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={isFavorite}
            onClick={() => onToggleFavorite(bead.id)}
          >
            <Icon name={isFavorite ? "star" : "star-outline"} size={12} />
          </button>
        )}
        <span className="bead-readout-head-spacer" />
        <StatusPriorityPill
          type={(bead.type || "task") as BeadType}
          status={bead.status}
          priority={bead.priority}
          onChange={onFieldChange}
          menuAlign="end"
        />
      </div>

      <div className={`bead-readout-title${closedMuted ? " muted-closed" : ""}`}>
        {onOpen ? (
          <span
            className="bead-readout-title-link"
            role="button"
            tabIndex={0}
            title="Open details"
            onClick={() => onOpen(bead.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(bead.id);
              }
            }}
          >
            {bead.title}
          </span>
        ) : (
          bead.title
        )}
      </div>

      {/* Assignee + labels — icon-keyed to match the Details view's badges row
          (user icon → assignee, tag icon → labels), not verbose text headings.
          Labels right-align beside the assignee on a wide card and drop to their
          own row on a narrow one (see the .bead-readout-badges @container rule). */}
      {(bead.assignee || shownLabels.length > 0) && (
        <div className="bead-readout-badges">
          {bead.assignee && (
            <span className="bead-readout-assignee">
              <Icon name="user" size={11} className="bead-readout-meta-icon" title="Assignee" />
              <span className="bead-readout-assignee-name">{bead.assignee}</span>
            </span>
          )}
          {shownLabels.length > 0 && (
            <span className="bead-readout-labelset">
              <Icon name="tag" size={11} className="bead-readout-meta-icon" title="Labels" />
              {shownLabels.map((l) => (
                <span key={l} className="bead-readout-label" style={getLabelColorStyle(l)}>
                  {l}
                </span>
              ))}
              {extraLabels > 0 && <span className="bead-readout-label-more">+{extraLabels}</span>}
            </span>
          )}
        </div>
      )}

      {((bead.estimatedMinutes !== undefined && bead.estimatedMinutes > 0) || bead.externalRef) && (
        <dl className="bead-readout-meta">
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
        </dl>
      )}

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

      {/* Relationships + comments live below the content, mirroring the full
          Details view (deps/comments follow the body). */}
      {(relationships.length > 0 || commentCount > 0) && (
        <dl className="bead-readout-meta">
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
