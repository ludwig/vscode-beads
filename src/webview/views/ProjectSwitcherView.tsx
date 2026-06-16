/**
 * ProjectSwitcherView - the slimmed sidebar's context view.
 *
 * Two sections: "Active Project" (switcher + basic info) and "Active Bead"
 * (the currently-selected bead, pinned as a reference with a quick-open
 * button — and a future seed root for the Graph view). Falls back to friendly
 * empty states.
 */

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Bead, BeadsProject, STATUS_COLORS } from "../types";
import { ProjectDropdown } from "../common/ProjectDropdown";
import { Dropdown, DropdownItem } from "../common/Dropdown";
import { TypeIcon } from "../common/TypeIcon";

interface ProjectSwitcherViewProps {
  projects: BeadsProject[];
  activeProject: BeadsProject | null;
  activeBead: Bead | null;
  onSelectProject: (project: BeadsProject) => void;
  onOpenProjectFolder: () => void;
  onOpenBead: (beadId: string) => void;
  onShowStatus: () => void;
  onStartDolt: () => void;
  onStopDolt: () => void;
  onOpenDoltLog: () => void;
  version?: string;
  buildSha?: string;
  buildDirty?: boolean;
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
  onSelectProject,
  onOpenProjectFolder,
  onOpenBead,
  onShowStatus,
  onStartDolt,
  onStopDolt,
  onOpenDoltLog,
  version,
  buildSha,
  buildDirty,
}: ProjectSwitcherViewProps): React.ReactElement {
  const backendState = activeProject?.backendStatus ?? "unknown";
  const [projectCollapsed, setProjectCollapsed] = useState(false);
  const [beadCollapsed, setBeadCollapsed] = useState(false);

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
        {!beadCollapsed && (activeBead ? (
          <button
            type="button"
            className="active-bead"
            title={`${activeBead.id} — ${activeBead.title}\nClick to open in Details`}
            onClick={() => onOpenBead(activeBead.id)}
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
    </div>
  );
}
