/**
 * ProjectDropdown Component
 *
 * Custom dropdown for selecting projects.
 * Uses generic Dropdown component for consistent behavior.
 */

import React from "react";
import { Folder, FolderPlus } from "lucide-react";
import { BeadsProject } from "../types";
import { Dropdown, DropdownItem } from "./Dropdown";
import { sharedPrefixWidthCh } from "./prefixWidth";

interface ProjectDropdownProps {
  projects: BeadsProject[];
  activeProject: BeadsProject | null;
  onSelectProject: (project: BeadsProject) => void;
  /** Launch the Initialize Repository flow from a pinned footer item (vs-r6a1.7). */
  onCreateBoard?: () => void;
  /** Swap the projects root via a folder picker (vs-r6a1.10). */
  onChangeRoot?: () => void;
  /** The resolved projects root, shown in the header for context (vs-r6a1.10). */
  projectsRoot?: string;
}

export function ProjectDropdown({
  projects,
  activeProject,
  onSelectProject,
  onCreateBoard,
  onChangeRoot,
  projectsRoot,
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

  // Size every prefix badge to the widest prefix in the set so the name column
  // starts at a common x rather than reading as ragged (vs-od3). `ch` is exact
  // because the badges use a monospace font.
  const prefixWidthCh = sharedPrefixWidthCh(projects.map((p) => p.prefix));
  const prefixStyle: React.CSSProperties | undefined =
    prefixWidthCh != null ? { minWidth: `${prefixWidthCh}ch` } : undefined;

  const activePath =
    activeProject?.displayPath ??
    activeProject?.rootPath ??
    activeProject?.name ??
    projects[0]?.name ??
    "Select project";
  const triggerContent = (
    <>
      <Folder size={13} strokeWidth={2} className="project-dropdown-trigger-icon" />
      <span className="project-dropdown-path">{activePath}</span>
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
      <div className="project-dropdown-header">
        <span>Projects root</span>
        {onChangeRoot && (
          <button
            type="button"
            className="project-dropdown-header-action"
            onClick={(e) => {
              e.stopPropagation();
              onChangeRoot();
            }}
            title="Change the projects root (folder picker)"
          >
            Change…
          </button>
        )}
      </div>
      {projectsRoot && (
        <div className="project-dropdown-root" title={projectsRoot}>
          {projectsRoot}
        </div>
      )}
      {projects.map((project) => (
        <DropdownItem
          key={`${project.id}:${project.rootPath}`}
          className="project-dropdown-item"
          active={project.id === activeProject?.id}
          onClick={() => handleSelect(project)}
          title={project.rootPath}
        >
          {project.prefix && (
            <span
              className="project-dropdown-item-prefix"
              style={prefixStyle}
              title={`Issue prefix — IDs look like ${project.prefix}-123`}
            >
              {project.prefix}-
            </span>
          )}
          <span className="project-dropdown-item-text">
            <span className="project-dropdown-item-name">{project.name}</span>
            <span className="project-dropdown-item-path">{project.displayPath ?? project.rootPath}</span>
          </span>
        </DropdownItem>
      ))}
      {onCreateBoard && (
        <DropdownItem className="project-dropdown-new-board" onClick={onCreateBoard}>
          <FolderPlus size={13} strokeWidth={2} className="project-dropdown-item-prefix" />
          <span className="project-dropdown-item-text">
            <span className="project-dropdown-item-name">New board…</span>
          </span>
        </DropdownItem>
      )}
    </Dropdown>
  );
}
