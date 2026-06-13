/**
 * ProjectDropdown Component
 *
 * Custom dropdown for selecting projects.
 * Uses generic Dropdown component for consistent behavior.
 */

import React from "react";
import { BeadsProject } from "../types";
import { Dropdown, DropdownItem } from "./Dropdown";

interface ProjectDropdownProps {
  projects: BeadsProject[];
  activeProject: BeadsProject | null;
  onSelectProject: (project: BeadsProject) => void;
  /** Active issue prefix (e.g. "vs"), derived from the loaded issue IDs. */
  prefix?: string | null;
}

export function ProjectDropdown({
  projects,
  activeProject,
  onSelectProject,
  prefix,
}: ProjectDropdownProps): React.ReactElement {
  if (projects.length === 0) {
    return (
      <div className="project-dropdown">
        <span className="project-dropdown-label">No projects</span>
      </div>
    );
  }

  const handleSelect = (project: BeadsProject) => {
    onSelectProject(project);
  };

  const triggerContent = (
    <>
      {prefix && (
        <span className="project-dropdown-prefix" title={`Active issue prefix: ${prefix}`}>
          {prefix}
        </span>
      )}
      <span className="project-dropdown-name">
        {activeProject?.name || projects[0]?.name || "Select project"}
      </span>
    </>
  );

  return (
    <Dropdown
      trigger={triggerContent}
      className="project-dropdown"
      triggerClassName="project-dropdown-trigger"
      menuClassName="project-dropdown-menu"
      title={activeProject?.rootPath}
    >
      {projects.map((project) => (
        <DropdownItem
          key={`${project.id}:${project.rootPath}`}
          className="project-dropdown-item"
          active={project.id === activeProject?.id}
          onClick={() => handleSelect(project)}
          title={project.rootPath}
        >
          <span className="project-dropdown-item-name">{project.name}</span>
        </DropdownItem>
      ))}
    </Dropdown>
  );
}
