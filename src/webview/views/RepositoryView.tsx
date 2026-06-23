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
  Play,
  RefreshCw,
  ScrollText,
  Server,
  Settings,
  Square,
} from "lucide-react";
import { BeadsProject, BeadsSummary, statusColor, statusLabel, vscode } from "../types";

interface RepositoryViewProps {
  project: BeadsProject | null;
  summary: BeadsSummary | null;
  repositoryInfo: { doltStatus: string; running: boolean } | null;
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
  summary,
  repositoryInfo,
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
