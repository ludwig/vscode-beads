/**
 * ProjectSwitcherView - compact sidebar view holding just the project switcher.
 *
 * The project dropdown used to live inside the Dashboard/Issues toolbars. Those
 * surfaces moved to the bottom Panel, so this dedicated view keeps the switcher
 * on the left alongside Details (the slimmed sidebar = switcher + Details).
 */

import React from "react";
import { BeadsProject } from "../types";
import { ProjectDropdown } from "../common/ProjectDropdown";

interface ProjectSwitcherViewProps {
  projects: BeadsProject[];
  activeProject: BeadsProject | null;
  onSelectProject: (project: BeadsProject) => void;
  onOpenProjectFolder: () => void;
}

export function ProjectSwitcherView({
  projects,
  activeProject,
  onSelectProject,
  onOpenProjectFolder,
}: ProjectSwitcherViewProps): React.ReactElement {
  return (
    <div className="project-switcher-view">
      <ProjectDropdown
        projects={projects}
        activeProject={activeProject}
        prefix={activeProject?.prefix}
        onSelectProject={onSelectProject}
      />
      {activeProject && (
        <button
          type="button"
          className="project-switcher-path"
          title={activeProject.rootPath}
          onClick={onOpenProjectFolder}
        >
          {activeProject.displayPath ?? activeProject.rootPath}
        </button>
      )}
    </div>
  );
}
