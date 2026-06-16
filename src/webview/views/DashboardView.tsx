/**
 * DashboardView
 *
 * High-level overview with:
 * - Summary cards (total, by status, by priority)
 * - Ready/blocked/in-progress sections
 * - Quick access to important beads
 */

import React, { useState } from "react";
import {
  Bead,
  BeadsSummary,
  BeadStatus,
  IssuesFilter,
  STATUS_COLORS,
  STATUS_LABELS,
  TYPE_COLORS,
  getTypeSortOrder,
} from "../types";
import { ChevronIcon } from "../common/ChevronIcon";
import { ErrorMessage } from "../common/ErrorMessage";
import { Loading } from "../common/Loading";
import { StatusBadge } from "../common/StatusBadge";
import { PriorityBadge } from "../common/PriorityBadge";
import { LabelBadge } from "../common/LabelBadge";
import { TypeBadge } from "../common/TypeBadge";
import { getLabelColorStyle } from "../utils/label-colors";

interface DashboardViewProps {
  summary: BeadsSummary | null;
  beads: Bead[];
  loading: boolean;
  error: string | null;
  onSelectBead: (beadId: string) => void;
  onOpenIssues: (filter: IssuesFilter) => void;
  onRetry: () => void;
  version?: string;
  buildSha?: string;
  buildDirty?: boolean;
}

export function DashboardView({
  summary,
  beads,
  loading,
  error,
  onSelectBead,
  onOpenIssues,
  onRetry,
  version,
  buildSha,
  buildDirty,
}: DashboardViewProps): React.ReactElement {
  const [byStatusOpen, setByStatusOpen] = useState(true);
  const [byTypeOpen, setByTypeOpen] = useState(false);
  const [byLabelOpen, setByLabelOpen] = useState(false);
  const byType = Array.from(
    beads.reduce((acc, bead) => {
      if (bead.type) acc.set(bead.type, (acc.get(bead.type) ?? 0) + 1);
      return acc;
    }, new Map<string, number>())
  ).sort((a, b) => getTypeSortOrder(a[0]) - getTypeSortOrder(b[0]) || a[0].localeCompare(b[0]));
  const openBeads = beads.filter((b) => b.status === "open").slice(0, 5);
  const blockedBeads = beads.filter((b) => b.status === "blocked").slice(0, 5);
  const inProgressBeads = beads.filter((b) => b.status === "in_progress").slice(0, 5);
  const topLabels = Array.from(
    beads.reduce((acc, bead) => {
      for (const label of bead.labels ?? []) {
        acc.set(label, (acc.get(label) ?? 0) + 1);
      }
      return acc;
    }, new Map<string, number>())
  )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);

  return (
    <div className="dashboard dashboard-compact">
      {error && !loading && <ErrorMessage message={error} onRetry={onRetry} />}

      {loading && !error && <Loading />}

      {summary && !error && (
        <>
          <div className="summary-section compact">
            <button
              type="button"
              className="summary-card total"
              onClick={() => onOpenIssues({})}
              title="Open all issues"
            >
              <div className="card-value">{summary.total || 0}</div>
              <div className="card-label">Total</div>
            </button>
            <button
              type="button"
              className="summary-card ready"
              onClick={() => onOpenIssues({ statuses: ["open"] })}
              title="Open issues with status: open"
            >
              <div className="card-value">{summary.readyCount || 0}</div>
              <div className="card-label">Open</div>
            </button>
            <button
              type="button"
              className="summary-card in-progress"
              onClick={() => onOpenIssues({ statuses: ["in_progress"] })}
              title="Open issues in progress"
            >
              <div className="card-value">{summary.inProgressCount || 0}</div>
              <div className="card-label">Doing</div>
            </button>
            <button
              type="button"
              className="summary-card blocked"
              onClick={() => onOpenIssues({ statuses: ["blocked"] })}
              title="Open blocked issues"
            >
              <div className="card-value">{summary.blockedCount || 0}</div>
              <div className="card-label">Blocked</div>
            </button>
          </div>

          <div className="breakdown-section compact">
            <button
              type="button"
              className="breakdown-toggle"
              onClick={() => setByStatusOpen((o) => !o)}
              aria-expanded={byStatusOpen}
            >
              <ChevronIcon open={byStatusOpen} size={12} />
              <h3>By Status</h3>
            </button>
            {byStatusOpen && (
            <div className="breakdown-bars compact">
              {(Object.keys(summary.byStatus) as BeadStatus[]).map((status) => {
                const count = summary.byStatus[status];
                const percentage = summary.total > 0 ? (count / summary.total) * 100 : 0;
                if (count === 0) return null;
                return (
                  <button
                    key={status}
                    type="button"
                    className="breakdown-bar compact"
                    onClick={() => onOpenIssues({ statuses: [status] })}
                    title={`Open ${STATUS_LABELS[status]} issues`}
                  >
                    <div className="bar-label compact">
                      <StatusBadge status={status} size="small" />
                      <span className="bar-count">{count}</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${percentage}%`, backgroundColor: STATUS_COLORS[status] }} />
                    </div>
                  </button>
                );
              })}
            </div>
            )}
          </div>

          {byType.length > 0 && (
            <div className="breakdown-section compact">
              <button
                type="button"
                className="breakdown-toggle"
                onClick={() => setByTypeOpen((o) => !o)}
                aria-expanded={byTypeOpen}
              >
                <ChevronIcon open={byTypeOpen} size={12} />
                <h3>By Type</h3>
              </button>
              {byTypeOpen && (
              <div className="breakdown-bars compact">
                {byType.map(([type, count]) => {
                  const percentage = summary.total > 0 ? (count / summary.total) * 100 : 0;
                  return (
                    <button
                      key={type}
                      type="button"
                      className="breakdown-bar compact"
                      onClick={() => onOpenIssues({ types: [type] })}
                      title={`Open ${type} issues`}
                    >
                      <div className="bar-label compact">
                        <TypeBadge type={type} size="small" />
                        <span className="bar-count">{count}</span>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ width: `${percentage}%`, backgroundColor: TYPE_COLORS[type as keyof typeof TYPE_COLORS] || "#888888" }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
              )}
            </div>
          )}

          {topLabels.length > 0 && (
            <div className="breakdown-section compact">
              <button
                type="button"
                className="breakdown-toggle"
                onClick={() => setByLabelOpen((o) => !o)}
                aria-expanded={byLabelOpen}
              >
                <ChevronIcon open={byLabelOpen} size={12} />
                <h3>By Label</h3>
              </button>
              {byLabelOpen && (
              <div className="breakdown-bars compact">
                {topLabels.map(([label, count]) => {
                  const percentage = summary.total > 0 ? (count / summary.total) * 100 : 0;
                  return (
                    <button
                      key={label}
                      type="button"
                      className="breakdown-bar compact"
                      onClick={() => onOpenIssues({ labels: [label] })}
                      title={`Open issues labeled ${label}`}
                    >
                      <div className="bar-label compact label">
                        <LabelBadge label={label} />
                        <span className="bar-count">{count}</span>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill label"
                          style={{ width: `${percentage}%`, backgroundColor: getLabelColorStyle(label).backgroundColor }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
              )}
            </div>
          )}

          <div className="work-sections compact">
            {openBeads.length > 0 && (
              <div className="work-section open compact">
                <h3>Open</h3>
                <ul className="bead-list">
                  {openBeads.map((bead) => <BeadListItem key={bead.id} bead={bead} onSelectBead={onSelectBead} />)}
                </ul>
              </div>
            )}
            {inProgressBeads.length > 0 && (
              <div className="work-section in-progress compact">
                <h3>In Progress</h3>
                <ul className="bead-list">
                  {inProgressBeads.map((bead) => <BeadListItem key={bead.id} bead={bead} onSelectBead={onSelectBead} />)}
                </ul>
              </div>
            )}
            {blockedBeads.length > 0 && (
              <div className="work-section blocked compact">
                <h3>Blocked</h3>
                <ul className="bead-list">
                  {blockedBeads.map((bead) => <BeadListItem key={bead.id} bead={bead} onSelectBead={onSelectBead} />)}
                </ul>
              </div>
            )}
          </div>
        </>
      )}

      {version && (
        <div
          className="dashboard-build-info"
          title={`Beads v${version}${buildSha && buildSha !== "unknown" ? ` · commit ${buildSha}` : ""}${
            buildDirty ? " · built with uncommitted changes" : ""
          }`}
        >
          <span className="dashboard-build-version">v{version}</span>
          {buildSha && buildSha !== "unknown" && (
            <span className="dashboard-build-sha">
              {buildSha}
              {buildDirty && (
                <span className="dashboard-build-dirty" aria-label="built with uncommitted changes">
                  ✦
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function BeadListItem({ bead, onSelectBead }: { bead: Bead; onSelectBead: (beadId: string) => void }): React.ReactElement {
  return (
    <li
      className="bead-list-item compact"
      onClick={() => onSelectBead(bead.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectBead(bead.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="bead-info">
        <span className="bead-id">{bead.id}</span>
        <span className="bead-title">{bead.title}</span>
      </div>
      <div className="bead-badges">
        {bead.priority !== undefined && <PriorityBadge priority={bead.priority} size="small" />}
      </div>
    </li>
  );
}
