/**
 * RepositoryView — the Repository Details editor-tab page (vs-beoh).
 *
 * A stylish, card-based overview of the active repository and its Dolt backend,
 * decongesting the Repository pane's ⋮ menu (which used to dump Dolt status into
 * the output log). Receives `project` for free (BaseViewProvider posts
 * setProject), plus `summary` and `repositoryInfo` (raw `bd dolt status` + a
 * derived running flag) from RepositoryViewProvider. Posts action messages
 * directly via the existing protocol — no new message types beyond
 * setRepositoryInfo / openRepositoryDetails.
 */

import React from "react";
import {
  Copy,
  Database,
  FolderOpen,
  Gauge,
  Play,
  RefreshCw,
  ScrollText,
  Server,
  Settings,
  Square,
} from "lucide-react";
import { BeadsProject, BeadsSummary, WebviewSettings, statusColor, statusLabel, vscode } from "../types";
import { formatBytes } from "../common/formatBytes";
import { ProjectDropdown } from "../common/ProjectDropdown";
import { Timestamp } from "../common/Timestamp";

interface RepositoryViewProps {
  project: BeadsProject | null;
  /** All discovered projects, for the in-page project (beads-dir) switcher (vs-rxgo). */
  projects: BeadsProject[];
  summary: BeadsSummary | null;
  repositoryInfo: {
    doltStatus: string;
    running: boolean;
    dbSizeBytes?: number;
    lastActivity?: string | null;
  } | null;
  /** Build/runtime metrics relocated from the panel's Active Project card (vs-emyj). */
  settings: WebviewSettings;
  /** Extension-host RSS in bytes (0 = not yet sampled). */
  memoryBytes: number;
}

/** A labeled metric card with a value + caption. */
function MetricCard({
  label,
  value,
  caption,
  title,
}: {
  label: string;
  value: React.ReactNode;
  caption?: string;
  title?: string;
}): React.ReactElement {
  return (
    <div className="repository-metric-card" title={title}>
      <span className="repository-metric-label">{label}</span>
      <span className="repository-metric-value">{value}</span>
      {caption && <span className="repository-metric-caption">{caption}</span>}
    </div>
  );
}

/** A monospace path row with a copy-to-clipboard button. */
function PathRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="repository-path-row">
      <span className="repository-path-label">{label}</span>
      <code className="repository-path-value" title={value}>
        {value}
      </code>
      <button
        type="button"
        className="repository-copy-btn"
        title={`Copy ${label}`}
        aria-label={`Copy ${label}`}
        onClick={() => vscode.postMessage({ type: "copyText", text: value, label, toast: true })}
      >
        <Copy size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

export function RepositoryView({
  project,
  projects,
  summary,
  repositoryInfo,
  settings,
  memoryBytes,
}: RepositoryViewProps): React.ReactElement {
  if (!project) {
    return (
      <div className="repository-view">
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <h3>No active repository</h3>
          <p>Open or initialize a Beads board to see its repository details here.</p>
        </div>
      </div>
    );
  }

  const isServer = project.doltMode === "server";
  const running = repositoryInfo?.running ?? false;
  const locationPath = project.displayPath || project.rootPath;

  return (
    <div className="repository-view">
      {/* In-page project switcher (vs-rxgo): this page is a singleton, so the
          dropdown re-points it (and its title/cards) at another board. */}
      {projects.length > 1 && (
        <div className="repository-project-switcher">
          <ProjectDropdown
            projects={projects}
            activeProject={project}
            onSelectProject={(p) =>
              vscode.postMessage({ type: "selectProject", projectId: p.id, projectRootPath: p.rootPath })
            }
          />
        </div>
      )}

      {/* Header */}
      <header className="repository-header">
        <div className="repository-header-title">
          <Database size={22} strokeWidth={2} className="repository-header-icon" />
          <h1>{project.name}</h1>
        </div>
        <div className="repository-chips">
          {project.prefix && (
            <span className="repository-chip repository-chip-prefix" title="Issue prefix">
              {project.prefix}-
            </span>
          )}
          <span
            className={`repository-chip repository-chip-mode ${isServer ? "is-server" : "is-embedded"}`}
            title={`Backend storage mode: ${project.doltMode ?? "unknown"}`}
          >
            {isServer ? <Server size={12} strokeWidth={2} /> : <Database size={12} strokeWidth={2} />}
            <span>{project.doltMode ?? "unknown"}</span>
          </span>
          {project.bdVersion && (
            <span className="repository-chip" title="Detected bd CLI version">
              bd {project.bdVersion}
            </span>
          )}
          {project.source && (
            <span className="repository-chip repository-chip-source" title="How this project was discovered">
              {project.source}
            </span>
          )}
        </div>
      </header>

      {/* Location card */}
      <section className="repository-card">
        <h2 className="repository-card-title">
          <FolderOpen size={15} strokeWidth={2} />
          <span>Location</span>
          <button
            type="button"
            className="repository-btn repository-btn-inline"
            title="Open the repository folder"
            onClick={() => vscode.postMessage({ type: "openProjectFolder" })}
          >
            <FolderOpen size={12} strokeWidth={2} />
            <span>Open Folder</span>
          </button>
        </h2>
        <div className="repository-paths">
          <PathRow label="Root" value={locationPath} />
          <PathRow label=".beads" value={project.beadsDir} />
          {project.dbPath && <PathRow label="Database" value={project.dbPath} />}
        </div>
      </section>

      {/* Backend / Dolt card */}
      <section className="repository-card">
        <h2 className="repository-card-title">
          <Server size={15} strokeWidth={2} />
          <span>Backend</span>
          <span className={`repository-status-pill ${running ? "is-running" : "is-stopped"}`}>
            {running ? "Running" : "Stopped"}
          </span>
        </h2>
        {repositoryInfo && repositoryInfo.doltStatus.trim() ? (
          <pre className="repository-dolt-status">{repositoryInfo.doltStatus}</pre>
        ) : (
          <p className="repository-muted">
            {isServer
              ? "No Dolt status available — the server may be stopped."
              : "Embedded backend — no Dolt server status to report."}
          </p>
        )}
        <div className="repository-actions">
          <button
            type="button"
            className="repository-btn"
            onClick={() => vscode.postMessage({ type: "refresh" })}
          >
            <RefreshCw size={13} strokeWidth={2} />
            <span>Refresh</span>
          </button>
          {isServer && (
            <>
              <button
                type="button"
                className="repository-btn"
                onClick={() => vscode.postMessage({ type: "startDoltServer" })}
              >
                <Play size={13} strokeWidth={2} />
                <span>Start server</span>
              </button>
              <button
                type="button"
                className="repository-btn"
                onClick={() => vscode.postMessage({ type: "stopDoltServer" })}
              >
                <Square size={13} strokeWidth={2} />
                <span>Stop server</span>
              </button>
              <button
                type="button"
                className="repository-btn"
                onClick={() => vscode.postMessage({ type: "openDoltLog" })}
              >
                <ScrollText size={13} strokeWidth={2} />
                <span>Open Dolt Log</span>
              </button>
            </>
          )}
        </div>
      </section>

      {/* Issues card */}
      <section className="repository-card">
        <h2 className="repository-card-title">
          <span>Issues</span>
          {summary && <span className="repository-card-count">{summary.total}</span>}
        </h2>
        {summary ? (
          <div className="repository-stat-tiles">
            {Object.entries(summary.byStatus)
              .filter(([, count]) => count > 0)
              .map(([status, count]) => (
                <div key={status} className="repository-stat-tile">
                  <span
                    className="repository-stat-dot"
                    style={{ backgroundColor: statusColor(status) }}
                    aria-hidden="true"
                  />
                  <span className="repository-stat-count">{count}</span>
                  <span className="repository-stat-label">{statusLabel(status)}</span>
                </div>
              ))}
          </div>
        ) : (
          <p className="repository-muted">No issue counts available.</p>
        )}
      </section>

      {/* Metrics card grid — build/runtime + on-disk figures, the richer set
          relocated here from the panel's Active Project card (vs-emyj). */}
      <section className="repository-card">
        <h2 className="repository-card-title">
          <Gauge size={15} strokeWidth={2} />
          <span>Metrics</span>
        </h2>
        <div className="repository-metric-grid">
          {settings.extensionVersion && (
            <MetricCard
              label="Extension"
              value={`v${settings.extensionVersion}`}
              caption={settings.buildSha && settings.buildSha !== "unknown" ? `commit ${settings.buildSha}${settings.buildDirty ? " ·dirty" : ""}` : undefined}
              title="Installed Beads extension version (and the git commit it was built from)."
            />
          )}
          {settings.bundleBytes > 0 && (
            <MetricCard
              label="Bundle"
              value={formatBytes(settings.bundleBytes)}
              caption="on disk"
              title="On-disk size of the Beads extension bundle (dist/extension.js + webview main.js/css)."
            />
          )}
          <MetricCard
            label="DB on disk"
            value={repositoryInfo?.dbSizeBytes != null ? formatBytes(repositoryInfo.dbSizeBytes) : "—"}
            caption=".beads directory"
            title="Total on-disk size of this board's .beads directory."
          />
          <MetricCard
            label="Last activity"
            value={repositoryInfo?.lastActivity ? <Timestamp value={repositoryInfo.lastActivity} format="relative" /> : "—"}
            caption="most recent update"
            title="The most recent updatedAt across all beads in this board."
          />
          {memoryBytes > 0 && (
            <MetricCard
              label="Host RAM"
              value={formatBytes(memoryBytes)}
              caption="extension host (RSS)"
              title="Resident memory (RSS) of the whole VS Code extension-host process — shared by ALL installed extensions plus the Node/V8 runtime, not just Beads. Sampled periodically via process.memoryUsage().rss."
            />
          )}
        </div>
      </section>

      {/* Footer actions */}
      <div className="repository-footer-actions">
        <button
          type="button"
          className="repository-btn"
          onClick={() => vscode.postMessage({ type: "changeProjectsRoot" })}
        >
          <FolderOpen size={13} strokeWidth={2} />
          <span>Change Projects Root</span>
        </button>
        <button
          type="button"
          className="repository-btn"
          onClick={() => vscode.postMessage({ type: "openSettings" })}
        >
          <Settings size={13} strokeWidth={2} />
          <span>Extension Settings</span>
        </button>
      </div>
    </div>
  );
}
