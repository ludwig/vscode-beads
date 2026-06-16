/**
 * ProjectSwitcherView - the slimmed sidebar's project surface.
 *
 * Leads with a header, lets you switch projects, and surfaces basic context
 * (issue prefix, backend status, project count, build) so the left side reads
 * as intentional rather than empty. Falls back to a friendly empty state when
 * no Beads project is found.
 */

import React from "react";
import { BeadsProject } from "../types";
import { ProjectDropdown } from "../common/ProjectDropdown";

interface ProjectSwitcherViewProps {
  projects: BeadsProject[];
  activeProject: BeadsProject | null;
  onSelectProject: (project: BeadsProject) => void;
  onOpenProjectFolder: () => void;
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
  onSelectProject,
  onOpenProjectFolder,
  version,
  buildSha,
  buildDirty,
}: ProjectSwitcherViewProps): React.ReactElement {
  const backendState = activeProject?.backendStatus ?? "unknown";

  return (
    <div className="project-switcher-view">
      <header className="project-switcher-head">
        <span className="project-switcher-eyebrow">Beads</span>
        <h1 className="project-switcher-title">
          {activeProject?.name ?? "No project"}
        </h1>
      </header>

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
        <div className="project-switcher-empty">
          <p>No Beads project found.</p>
          <p>
            Run <code>bd init</code> in a folder, or point the{" "}
            <code>beads.projects</code> setting at one.
          </p>
        </div>
      )}

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
