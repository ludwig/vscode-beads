/**
 * ProjectSwitcherView - the slimmed sidebar's context view.
 *
 * Two sections: "Active Project" (switcher + basic info) and "Active Bead"
 * (the currently-selected bead, pinned as a reference with a quick-open
 * button — and a future seed root for the Graph view). Falls back to friendly
 * empty states.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X, Rocket, ListTodo } from "lucide-react";
import { Bead, BeadsProject, FavoriteBead, STATUS_COLORS } from "../types";
import { ProjectDropdown } from "../common/ProjectDropdown";
import { Dropdown, DropdownItem } from "../common/Dropdown";
import { TypeIcon } from "../common/TypeIcon";

interface ProjectSwitcherViewProps {
  projects: BeadsProject[];
  activeProject: BeadsProject | null;
  activeBead: Bead | null;
  /** The active project's favorites, in curated order (vs-sd5.1). */
  favorites: FavoriteBead[];
  onSelectProject: (project: BeadsProject) => void;
  onOpenProjectFolder: () => void;
  onOpenBead: (beadId: string) => void;
  onOpenBeadInTab: (beadId: string) => void;
  onClearBead: () => void;
  /** Unstar a favorite from the section's per-row control. */
  onUnfavorite: (beadId: string) => void;
  onPickReady: () => void;
  onShowIssues: () => void;
  onShowStatus: () => void;
  onStartDolt: () => void;
  onStopDolt: () => void;
  onOpenDoltLog: () => void;
  version?: string;
  buildSha?: string;
  buildDirty?: boolean;
  /** Extension-host RSS in bytes (0 = not yet sampled). */
  memoryBytes?: number;
  /** On-disk size of our built bundle in bytes (0 = unknown). */
  bundleBytes?: number;
}

/** Auto-scaled binary size, e.g. 248 MB / 1.5 GB. */
function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

const BACKEND_LABELS: Record<string, string> = {
  running: "Running",
  stopped: "Stopped",
  unknown: "Unknown",
};

export function ProjectSwitcherView({
  projects,
  activeProject,
  activeBead,
  favorites,
  onSelectProject,
  onOpenProjectFolder,
  onOpenBead,
  onOpenBeadInTab,
  onClearBead,
  onUnfavorite,
  onPickReady,
  onShowIssues,
  onShowStatus,
  onStartDolt,
  onStopDolt,
  onOpenDoltLog,
  version,
  buildSha,
  buildDirty,
  memoryBytes = 0,
  bundleBytes = 0,
}: ProjectSwitcherViewProps): React.ReactElement {
  const backendState = activeProject?.backendStatus ?? "unknown";
  const [projectCollapsed, setProjectCollapsed] = useState(false);
  const [beadCollapsed, setBeadCollapsed] = useState(false);
  const [favoritesCollapsed, setFavoritesCollapsed] = useState(false);

  // Click-count router on the Active Bead card (mirrors the Graph/Tree): 1/2
  // clicks open it in the sidebar Details, 3 clicks open it in an editor tab.
  const clickRef = useRef<{ count: number; timer: ReturnType<typeof setTimeout> | null }>({
    count: 0,
    timer: null,
  });
  const activateBead = useCallback(
    (id: string) => {
      onOpenBead(id);
      const c = clickRef.current;
      c.count += 1;
      if (c.timer) clearTimeout(c.timer);
      c.timer = setTimeout(() => {
        const n = c.count;
        c.count = 0;
        c.timer = null;
        if (n >= 3) onOpenBeadInTab(id);
      }, 320);
    },
    [onOpenBead, onOpenBeadInTab],
  );
  useEffect(
    () => () => {
      if (clickRef.current.timer) clearTimeout(clickRef.current.timer);
    },
    [],
  );

  return (
    <div className="project-switcher-view">
      <section className="context-section">
        <div className="context-section-head">
          <button
            type="button"
            className="context-heading context-heading-toggle"
            aria-expanded={!projectCollapsed}
            onClick={() => setProjectCollapsed((v) => !v)}
          >
            {projectCollapsed ? (
              <ChevronRight size={13} strokeWidth={2} className="context-heading-chevron" />
            ) : (
              <ChevronDown size={13} strokeWidth={2} className="context-heading-chevron" />
            )}
            <span>Active Project</span>
          </button>
          {activeProject && (
            <Dropdown
              trigger={<span className="context-menu-trigger">⋮</span>}
              className="context-actions-dropdown"
              triggerClassName="context-menu-btn"
              menuClassName="context-actions-menu"
              title="Project actions"
              showChevron={false}
              menuPlacement="bottom-end"
            >
              <DropdownItem onClick={onOpenProjectFolder}>Open Folder</DropdownItem>
              <DropdownItem onClick={onShowStatus}>Show Dolt Status</DropdownItem>
              <DropdownItem onClick={onStartDolt}>Start Dolt</DropdownItem>
              <DropdownItem onClick={onStopDolt}>Stop Dolt</DropdownItem>
              <DropdownItem onClick={onOpenDoltLog}>Open Dolt Log</DropdownItem>
            </Dropdown>
          )}
        </div>

        {!projectCollapsed && (
        <>
        <ProjectDropdown
          projects={projects}
          activeProject={activeProject}
          onSelectProject={onSelectProject}
        />

        {activeProject ? (
          <>
            <dl className="project-switcher-meta">
              {activeProject.prefix && (
                <div className="project-switcher-meta-row">
                  <dt>Prefix</dt>
                  <dd><code>{activeProject.prefix}-</code></dd>
                </div>
              )}
              <div className="project-switcher-meta-row">
                <dt>Backend</dt>
                <dd>
                  <span className={`project-switcher-backend ${backendState}`}>
                    {BACKEND_LABELS[backendState] ?? backendState}
                    {activeProject.doltMode ? ` · ${activeProject.doltMode}` : ""}
                  </span>
                </dd>
              </div>
              {activeProject.bdVersion && (
                <div className="project-switcher-meta-row">
                  <dt>bd</dt>
                  <dd>{activeProject.bdVersion}</dd>
                </div>
              )}
              {version && (
                <div className="project-switcher-meta-row">
                  <dt>Extension</dt>
                  <dd
                    title={`Beads v${version}${
                      buildSha && buildSha !== "unknown" ? ` · commit ${buildSha}` : ""
                    }${buildDirty ? " · built with uncommitted changes" : ""}`}
                  >
                    v{version}
                    {buildDirty ? "✦" : ""}
                  </dd>
                </div>
              )}
              <div className="project-switcher-meta-row">
                <dt>Projects</dt>
                <dd>{projects.length}</dd>
              </div>
              {bundleBytes > 0 && (
                <div className="project-switcher-meta-row">
                  <dt>Bundle</dt>
                  <dd
                    className="mono-figure"
                    title="On-disk size of the Beads extension bundle (dist/extension.js + webview main.js/css) — an attributable 'this is Beads' figure (code on disk, not runtime RAM)."
                  >
                    {formatBytes(bundleBytes)}
                  </dd>
                </div>
              )}
              {memoryBytes > 0 && (
                <div className="project-switcher-meta-row">
                  <dt>Host RAM</dt>
                  <dd
                    className="mono-figure"
                    title="Resident memory (RSS) of the whole VS Code extension-host process — shared by ALL installed extensions plus the Node/V8 runtime, not just Beads. There's no per-extension figure; this is a superset. Read from the OS via process.memoryUsage().rss, sampled periodically."
                  >
                    {formatBytes(memoryBytes)}
                  </dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <div className="context-empty">
            <p>No Beads project found.</p>
            <p>
              Run <code>bd init</code> in a folder, or point the{" "}
              <code>beads.projects</code> setting at one.
            </p>
          </div>
        )}
        </>
        )}
      </section>

      <section className="context-section">
        <div className="context-section-head">
          <button
            type="button"
            className="context-heading context-heading-toggle"
            aria-expanded={!beadCollapsed}
            onClick={() => setBeadCollapsed((v) => !v)}
          >
            {beadCollapsed ? (
              <ChevronRight size={13} strokeWidth={2} className="context-heading-chevron" />
            ) : (
              <ChevronDown size={13} strokeWidth={2} className="context-heading-chevron" />
            )}
            <span>Active Bead</span>
          </button>
          {activeBead && (
            <button
              type="button"
              className="context-menu-btn"
              title="Clear the pinned bead"
              aria-label="Clear active bead"
              onClick={onClearBead}
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>
        {!beadCollapsed && (activeBead ? (
          <button
            type="button"
            className="active-bead"
            title={`${activeBead.id} — ${activeBead.title}\nClick to open in Details · triple-click to open in an editor tab`}
            onClick={() => activateBead(activeBead.id)}
          >
            <div className="active-bead-main">
              <div className="active-bead-head">
                {activeBead.type && <TypeIcon type={activeBead.type} size={13} />}
                <span className="active-bead-id">{activeBead.id}</span>
                <span
                  className="active-bead-status"
                  style={{ backgroundColor: STATUS_COLORS[activeBead.status] || "#888888" }}
                  title={activeBead.status}
                />
              </div>
              <span className="active-bead-title">{activeBead.title}</span>
            </div>
          </button>
        ) : (
          <div className="context-empty">
            <p>No active bead — select one from the Issues list to pin it here.</p>
          </div>
        ))}
      </section>

      <section className="context-section">
        <div className="context-section-head">
          <button
            type="button"
            className="context-heading context-heading-toggle"
            aria-expanded={!favoritesCollapsed}
            onClick={() => setFavoritesCollapsed((v) => !v)}
          >
            {favoritesCollapsed ? (
              <ChevronRight size={13} strokeWidth={2} className="context-heading-chevron" />
            ) : (
              <ChevronDown size={13} strokeWidth={2} className="context-heading-chevron" />
            )}
            <span>Favorites</span>
            {favorites.length > 0 && (
              <span className="context-heading-count">{favorites.length}</span>
            )}
          </button>
        </div>
        {!favoritesCollapsed && (favorites.length > 0 ? (
          <div className="favorites-list">
            {favorites.map((fav) => (
              <div key={fav.id} className="favorite-row">
                <button
                  type="button"
                  className="active-bead favorite-open"
                  title={`${fav.id}${fav.title ? ` — ${fav.title}` : ""}\nClick to open in Details · triple-click to open in an editor tab`}
                  onClick={() => activateBead(fav.id)}
                >
                  <div className="active-bead-main">
                    <div className="active-bead-head">
                      {fav.type && <TypeIcon type={fav.type} size={13} />}
                      <span className="active-bead-id">{fav.id}</span>
                      {fav.status && (
                        <span
                          className="active-bead-status"
                          style={{ backgroundColor: STATUS_COLORS[fav.status] || "#888888" }}
                          title={fav.status}
                        />
                      )}
                    </div>
                    {fav.title && <span className="active-bead-title">{fav.title}</span>}
                  </div>
                </button>
                <button
                  type="button"
                  className="favorite-unstar"
                  title="Unstar this bead"
                  aria-label={`Unstar ${fav.id}`}
                  onClick={() => onUnfavorite(fav.id)}
                >
                  <X size={13} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="context-empty">
            <p>No favorites yet — star a bead to pin it here.</p>
          </div>
        ))}
      </section>

      <div className="context-actions">
        <button
          type="button"
          className="btn context-action-btn pick-ready"
          onClick={onPickReady}
          disabled={!activeProject}
          title="Pick a ready-to-work bead (open, no open blocker) and make it the active bead"
        >
          <Rocket size={14} strokeWidth={2} />
          <span>Pick Ready Bead</span>
        </button>
        <button
          type="button"
          className="btn context-action-btn show-issues"
          onClick={onShowIssues}
          title="Show the Issues panel"
        >
          <ListTodo size={14} strokeWidth={2} />
          <span>Show Issues</span>
        </button>
      </div>
    </div>
  );
}
