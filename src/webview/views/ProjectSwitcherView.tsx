/**
 * ProjectSwitcherView - the slimmed sidebar's context view.
 *
 * Two sections: "Active Project" (switcher + basic info) and "Active Bead"
 * (the currently-selected bead, pinned as a reference with a quick-open
 * button — and a future seed root for the Graph view). Falls back to friendly
 * empty states.
 */

import React from "react";
import { Bead, BeadsProject } from "../types";
import { ProjectDropdown } from "../common/ProjectDropdown";

interface ProjectSwitcherViewProps {
  projects: BeadsProject[];
  activeProject: BeadsProject | null;
  activeBead: Bead | null;
  onSelectProject: (project: BeadsProject) => void;
  onOpenProjectFolder: () => void;
  onOpenBead: (beadId: string) => void;
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
  version,
  buildSha,
  buildDirty,
}: ProjectSwitcherViewProps): React.ReactElement {
  const backendState = activeProject?.backendStatus ?? "unknown";

  return (
    <div className="project-switcher-view">
      <section className="context-section">
        <h2 className="context-heading">Active Project</h2>

        <ProjectDropdown
          projects={projects}
          activeProject={activeProject}
          prefix={activeProject?.prefix}
          onSelectProject={onSelectProject}
        />

        {activeProject ? (
          <>
            <button
              type="button"
              className="project-switcher-path"
              title={`${activeProject.rootPath}\nClick to reveal in Explorer`}
              onClick={onOpenProjectFolder}
            >
              {activeProject.displayPath ?? activeProject.rootPath}
            </button>

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
      </section>

      <section className="context-section">
        <h2 className="context-heading">Active Bead</h2>
        {activeBead ? (
          <button
            type="button"
            className="active-bead"
            title={`${activeBead.id} — ${activeBead.title}\nClick to open in Details`}
            onClick={() => onOpenBead(activeBead.id)}
          >
            <span className="active-bead-id">{activeBead.id}</span>
            <span className="active-bead-title">{activeBead.title}</span>
          </button>
        ) : (
          <div className="context-empty">
            <p>No active bead — select one from the Issues list to pin it here.</p>
          </div>
        )}
      </section>

      {version && (
        <footer
          className="project-switcher-footer"
          title={`Beads v${version}${
            buildSha && buildSha !== "unknown" ? ` · commit ${buildSha}` : ""
          }${buildDirty ? " · built with uncommitted changes" : ""}`}
        >
          v{version}
          {buildSha && buildSha !== "unknown" ? ` · ${buildSha}` : ""}
          {buildDirty ? "✦" : ""}
        </footer>
      )}
    </div>
  );
}
