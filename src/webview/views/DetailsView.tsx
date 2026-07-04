/**
 * DetailsView
 *
 * Full view/edit of a single issue with:
 * - Editable fields
 * - Dependency management
 * - Metadata display
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  Bead,
  BeadStatus,
  BuiltInStatus,
  BeadDependency,
  DependencyType,
  BeadType,
  sortLabels,
  isBuiltInStatus,
  vscode,
} from "../types";
import { Timestamp } from "../common/Timestamp";
import { StatusPriorityPill } from "../common/StatusPriorityPill";
import { EndFlourish } from "../common/EndFlourish";

/**
 * Detects if a string looks like a URL
 */
function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Renders external ref - as link if URL, plain text otherwise
 */
function ExternalRefValue({ value }: { value?: string }) {
  if (!value) {
    return <span className="value muted">-</span>;
  }

  if (isUrl(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="external-link"
        title={value}
      >
        <span className="external-link-text">{value}</span>
        <Icon name="external-link" size={10} className="external-link-icon" />
      </a>
    );
  }

  return <span className="value">{value}</span>;
}

// Dependency direction: "forward" = this bead depends on target, "reverse" = target depends on this bead
type DependencyDirection = "forward" | "reverse";

// Options for adding dependencies (type + direction)
const DEPENDENCY_TYPE_OPTIONS: { value: DependencyType; direction: DependencyDirection; label: string }[] = [
  { value: "blocks", direction: "forward", label: "Blocked By" },
  { value: "blocks", direction: "reverse", label: "Blocks" },
  { value: "parent-child", direction: "forward", label: "Parent" },
  { value: "parent-child", direction: "reverse", label: "Child" },
  { value: "related", direction: "forward", label: "Related" },
  { value: "discovered-from", direction: "forward", label: "Discovered From" },
  { value: "discovered-from", direction: "reverse", label: "Spawned" },
];

// Labels for dependency sections based on array (direction) and type
const DEPENDENCY_LABELS: Record<"dependsOn" | "blocks", Record<DependencyType, string>> = {
  dependsOn: {
    "blocks": "Blocked By",
    "parent-child": "Parent",
    "discovered-from": "Discovered From",
    "related": "Related To",
  },
  blocks: {
    "blocks": "Blocks",
    "parent-child": "Children",
    "discovered-from": "Spawned",
    "related": "Related From",
  },
};

// Group dependencies by their relationship type
function groupDependenciesByType(deps: BeadDependency[]): Record<DependencyType, BeadDependency[]> {
  const groups: Record<DependencyType, BeadDependency[]> = {
    "blocks": [],
    "parent-child": [],
    "discovered-from": [],
    "related": [],
  };
  for (const dep of deps) {
    const depType = dep.dependencyType || "blocks"; // fallback to blocks if unknown
    if (groups[depType]) {
      groups[depType].push(dep);
    } else {
      // Unknown dependency type - fallback to related
      groups["related"].push(dep);
    }
  }
  return groups;
}

// Sort order for dependency status: blocked/active first, closed last.
// Custom and missing statuses sort after all built-ins.
const STATUS_SORT_ORDER: Record<BuiltInStatus, number> = {
  blocked: 0,
  in_progress: 1,
  hooked: 1,
  open: 2,
  pinned: 3,
  deferred: 4,
  closed: 5,
};
const STATUS_SORT_FALLBACK = 99;

function statusSortRank(status?: BeadStatus): number {
  return status && isBuiltInStatus(status) ? STATUS_SORT_ORDER[status] : STATUS_SORT_FALLBACK;
}

function sortDependencies(deps: BeadDependency[]): BeadDependency[] {
  return [...deps].sort((a, b) => {
    // Primary: status (blocked first, closed last)
    const aStatusOrder = statusSortRank(a.status);
    const bStatusOrder = statusSortRank(b.status);
    if (aStatusOrder !== bStatusOrder) {
      return aStatusOrder - bStatusOrder;
    }
    // Secondary: priority (P0 first, P4 last)
    const aPriority = a.priority ?? 4;
    const bPriority = b.priority ?? 4;
    return aPriority - bPriority;
  });
}
import { LabelBadge } from "../common/LabelBadge";
import { TypeIcon } from "../common/TypeIcon";
import { Icon } from "../common/Icon";
import { Markdown } from "../common/Markdown";
import { useToast } from "../common/Toast";
import { Dropdown, DropdownItem } from "../common/Dropdown";
import { ListTodo, Kanban, Workflow, ArrowLeft, Crosshair } from "lucide-react";

interface DetailsViewProps {
  bead: Bead | null;
  loading: boolean;
  renderMarkdown?: boolean;
  userId?: string;
  /** True when this view is already an editor tab — hides the Open-in-tab action. */
  isEditorTab?: boolean;
  /** Editor tab only: the active project's display path, for the chrome label. */
  projectLabel?: string;
  knownAssignees?: string[];
  onUpdateBead: (beadId: string, updates: Partial<Bead>) => void;
  onAddDependency: (beadId: string, targetId: string, dependencyType: DependencyType, reverse: boolean) => void;
  onRemoveDependency: (beadId: string, dependsOnId: string) => void;
  onAddComment?: (beadId: string, text: string) => void;
  onViewInGraph: (beadId: string) => void;
  onSelectBead?: (beadId: string) => void;
  onCopyId?: (beadId: string) => void;
  /** Whether the shown bead is a favorite, and a toggle handler (vs-sd5.1). */
  isFavorite?: boolean;
  onToggleFavorite?: (beadId: string) => void;
  /** Per-tab Back/Forward enablement + handlers (editor tabs only, vs-9u8). */
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  /** Whether this bead's companion `bead:` doc is open, + toggle (vs-nr3d). */
  companionOpen?: boolean;
  onToggleCompanion?: (beadId: string) => void;
}

// Helper to render text content - markdown or plain
function TextContent({ content, renderMarkdown }: { content: string; renderMarkdown: boolean }) {
  if (renderMarkdown) {
    return <Markdown content={content} className="description-text" />;
  }
  return <p className="description-text">{content}</p>;
}

export function DetailsView({
  bead,
  loading,
  renderMarkdown = true,
  userId = "",
  isEditorTab = false,
  projectLabel,
  knownAssignees = [],
  onUpdateBead,
  onAddDependency,
  onRemoveDependency,
  onAddComment,
  onViewInGraph: _onViewInGraph,
  onSelectBead,
  onCopyId,
  isFavorite = false,
  onToggleFavorite,
  canNavigateBack = false,
  canNavigateForward = false,
  onNavigateBack,
  onNavigateForward,
  companionOpen = false,
  onToggleCompanion,
}: DetailsViewProps): React.ReactElement {
  // Toast and onViewInGraph kept for potential future use
  const { showToast: _showToast } = useToast();
  void _onViewInGraph;
  void _showToast;
  // Platform-aware label for the history nav shortcut shown in button tooltips.
  const navMod = navigator.platform.toUpperCase().includes("MAC") ? "⌘" : "Ctrl+";
  const [editMode, setEditMode] = useState(false);
  const [editedBead, setEditedBead] = useState<Partial<Bead>>({});
  const [newLabel, setNewLabel] = useState("");
  const [newDependency, setNewDependency] = useState("");
  const [newDepOptionIndex, setNewDepOptionIndex] = useState(0); // Index into DEPENDENCY_TYPE_OPTIONS
  const [newComment, setNewComment] = useState("");
  // Briefly spin the header Refresh icon on click so the action reads as
  // registered (the data swap is otherwise silent).
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    vscode.postMessage({ type: "refresh" });
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  // Reset edit state when bead ID changes
  useEffect(() => {
    setEditMode(false);
    setEditedBead({});
  }, [bead?.id]);

  // Clear pending edits when bead data updates (e.g., after save + mutation)
  useEffect(() => {
    if (!editMode && Object.keys(editedBead).length > 0) {
      setEditedBead({});
    }
  }, [bead?.updatedAt]);

  // Keyboard history navigation: Cmd/Ctrl+← / Cmd/Ctrl+→ (and Alt+←/→) walk the
  // Details back/forward trail (vs-9u8). Because each editor tab is its own
  // webview, only the focused tab receives the keystroke, so it walks that tab's
  // own per-tab trail. Handled webview-side because the webview owns focus and
  // would otherwise swallow the keystrokes before a VS Code keybinding could
  // fire. Ignored while editing or typing in a field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const navModifier = e.metaKey || e.ctrlKey || e.altKey;
      if (!navModifier || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      const target = e.target as HTMLElement | null;
      const typing =
        editMode ||
        (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));
      if (typing) return;
      e.preventDefault();
      vscode.postMessage({ type: e.key === "ArrowLeft" ? "navigateBack" : "navigateForward" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editMode]);

  const handleSave = useCallback(() => {
    if (bead && Object.keys(editedBead).length > 0) {
      onUpdateBead(bead.id, editedBead);
      setEditMode(false);
      // Don't clear editedBead here - keep showing edited values until
      // mutation event updates the bead prop, which triggers the useEffect below
    }
  }, [bead, editedBead, onUpdateBead]);

  // Inline update - saves immediately without entering edit mode
  // Also optimistically updates local state for instant feedback
  const handleInlineUpdate = useCallback(
    (field: keyof Bead, value: unknown) => {
      if (bead) {
        setEditedBead((prev) => ({ ...prev, [field]: value }));
        onUpdateBead(bead.id, { [field]: value });
      }
    },
    [bead, onUpdateBead]
  );

  const handleCancel = useCallback(() => {
    setEditMode(false);
    setEditedBead({});
  }, []);

  const handleFieldChange = useCallback(
    (field: keyof Bead, value: unknown) => {
      setEditedBead((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleAddLabel = useCallback(() => {
    if (newLabel.trim() && bead) {
      const currentLabels = editedBead.labels || bead.labels || [];
      if (!currentLabels.includes(newLabel.trim())) {
        handleFieldChange("labels", [...currentLabels, newLabel.trim()]);
      }
      setNewLabel("");
    }
  }, [newLabel, bead, editedBead.labels, handleFieldChange]);

  const handleRemoveLabel = useCallback(
    (label: string) => {
      if (bead) {
        const currentLabels = editedBead.labels || bead.labels || [];
        handleFieldChange(
          "labels",
          currentLabels.filter((l) => l !== label)
        );
      }
    },
    [bead, editedBead.labels, handleFieldChange]
  );

  const handleAddDependency = useCallback(() => {
    if (newDependency.trim() && bead) {
      const option = DEPENDENCY_TYPE_OPTIONS[newDepOptionIndex];
      onAddDependency(bead.id, newDependency.trim(), option.value, option.direction === "reverse");
      setNewDependency("");
    }
  }, [newDependency, newDepOptionIndex, bead, onAddDependency]);

  if (loading && !bead) {
    return <div className="details-loading">Loading...</div>;
  }

  if (!bead) {
    return (
      <div className="details-empty">
        <p>Select a bead to view details</p>
      </div>
    );
  }

  const displayBead = { ...bead, ...editedBead };
  // During the optimistic paint (vs-7s7) the bead carries only list-row fields;
  // deps/comments aren't loaded yet, so show them as loading rather than "none".
  const partial = !!bead.partial;

  // Header action controls, composed into two layouts below. The sidebar and
  // the editor tab order their action groups differently (vs-hskp):
  //   sidebar Lead:  [+] [edit] | [show group] | [refresh] [open-in-tab]
  //   sidebar Ident: <type> [id] [favorite] … [pill]
  //   editor tab:    [favorite] [llm] [show] [edit] | [back] [forward]
  const favoriteBtn = (
    <button
      className={`icon-btn header-icon-btn fb-tip${isFavorite ? " is-favorite" : ""}`}
      data-tip={isFavorite ? "Unstar (remove from Favorites)" : "Star (add to Favorites)"}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isFavorite}
      onClick={() => onToggleFavorite?.(bead.id)}
    >
      <Icon name={isFavorite ? "star" : "star-outline"} size={13} />
    </button>
  );

  const refreshBtn = (
    <button className="icon-btn header-icon-btn fb-tip fb-tip-end" data-tip="Refresh" aria-label="Refresh" onClick={handleRefresh}>
      <Icon name="refresh" size={13} className={refreshing ? "spinning" : ""} />
    </button>
  );

  // LLM-context toggle — editor tabs only. The companion doc opens BESIDE this
  // view, which only reads sensibly in an editor tab; in the narrow sidebar it
  // would pop open far away in the editor area, so the caller omits the handler.
  const llmToggle = onToggleCompanion ? (
    <button
      className={`companion-toggle fb-tip${companionOpen ? " is-on" : ""}`}
      data-tip={
        companionOpen
          ? "Remove this bead from LLM context (closes the companion document)"
          : "Add this bead to your LLM context — opens its contents as a document beside this view so an LLM session (e.g. Claude Code) reads it"
      }
      aria-label="Toggle LLM context for this bead"
      aria-pressed={companionOpen}
      onClick={() => onToggleCompanion(bead.id)}
    >
      <Icon name="sparkles" size={12} className="companion-toggle-icon" />
      <span className="companion-toggle-label">LLM</span>
    </button>
  ) : null;

  // Panel-tab shortcuts (vs-wbrz): a segmented group of one trigger per tab
  // that simply OPENS that tab in the Beads panel — quick access to each view,
  // not "find this bead there" (that's the focus button's job). Rendered as a
  // unified segmented control (joined, still separate triggers).
  const showTabBtns = (
    <div className="header-show-tabs" role="group" aria-label="Open a panel tab">
      <button
        className="icon-btn header-icon-btn fb-tip"
        data-tip="Show Issues Tab"
        aria-label="Show Issues Tab"
        onClick={() => vscode.postMessage({ type: "showIssues" })}
      >
        <ListTodo size={13} strokeWidth={2} />
      </button>
      <button
        className="icon-btn header-icon-btn fb-tip"
        data-tip="Show Tree Tab"
        aria-label="Show Tree Tab"
        onClick={() => vscode.postMessage({ type: "showTreePanel" })}
      >
        <Icon name="sitemap" size={13} />
      </button>
      <button
        className="icon-btn header-icon-btn fb-tip"
        data-tip="Show Kanban Tab"
        aria-label="Show Kanban Tab"
        onClick={() => vscode.postMessage({ type: "showKanban" })}
      >
        <Kanban size={13} strokeWidth={2} />
      </button>
      <button
        className="icon-btn header-icon-btn fb-tip"
        data-tip="Show Graph Tab"
        aria-label="Show Graph Tab"
        onClick={() => vscode.postMessage({ type: "showGraphPanel" })}
      >
        <Workflow size={13} strokeWidth={2} />
      </button>
    </div>
  );

  // "Focus" — locate THIS bead in whichever panel tab is currently active
  // (analogous to the Graph view's Focus). Rides just before refresh.
  const focusBtn = (
    <button
      className="icon-btn header-icon-btn fb-tip fb-tip-end"
      data-tip="Focus this issue in the active tab"
      aria-label="Focus this issue in the active tab"
      onClick={() => vscode.postMessage({ type: "focusBeadInActiveTab", beadId: bead.id })}
    >
      <Crosshair size={13} strokeWidth={2} />
    </button>
  );

  const createBtn = (
    <button
      className="icon-btn header-icon-btn fb-tip fb-tip-end"
      data-tip="New issue"
      aria-label="New issue"
      onClick={() => vscode.postMessage({ type: "startCreate" })}
    >
      <Icon name="plus" size={13} />
    </button>
  );

  const editControls = editMode ? (
    <>
      <button
        className="btn btn-primary btn-sm"
        onClick={handleSave}
        disabled={Object.keys(editedBead).length === 0}
      >
        Save
      </button>
      <button className="btn btn-sm" onClick={handleCancel}>
        Cancel
      </button>
    </>
  ) : (
    <button className="btn btn-sm" onClick={() => setEditMode(true)}>
      Edit
    </button>
  );

  const openInTabBtn = (
    <button
      className="icon-btn header-icon-btn fb-tip fb-tip-end"
      data-tip="Open in editor tab"
      aria-label="Open in editor tab"
      onClick={() => vscode.postMessage({ type: "openBeadInTab", beadId: bead.id })}
    >
      <Icon name="external-link" size={13} />
    </button>
  );

  const backForwardBtns = (
    <>
      <button
        className="icon-btn header-icon-btn fb-tip fb-tip-end"
        data-tip={`Back (${navMod}←)`}
        aria-label="Back"
        disabled={!canNavigateBack}
        onClick={() => onNavigateBack?.()}
      >
        <svg width={13} height={13} viewBox="0 0 16 16" aria-hidden="true">
          <path fill="currentColor" d="M10.5 3L5.5 8l5 5L9 14.5 2.5 8 9 1.5z" />
        </svg>
      </button>
      <button
        className="icon-btn header-icon-btn fb-tip fb-tip-end"
        data-tip={`Forward (${navMod}→)`}
        aria-label="Forward"
        disabled={!canNavigateForward}
        onClick={() => onNavigateForward?.()}
      >
        <svg width={13} height={13} viewBox="0 0 16 16" aria-hidden="true">
          <path fill="currentColor" d="M5.5 3l5 5-5 5L7 14.5 13.5 8 7 1.5z" />
        </svg>
      </button>
    </>
  );

  // The merged type|status|priority pill — always shown and always inline
  // click-to-edit (each segment opens its picker in place; a pick commits
  // immediately, independent of the title/description Save/Cancel edit flow).
  const pills = (
    <StatusPriorityPill
      type={(displayBead.type || "task") as BeadType}
      status={displayBead.status}
      priority={displayBead.priority ?? 4}
      onChange={(patch) => onUpdateBead(bead.id, patch)}
    />
  );

  return (
    <div className="bead-details">
      {/* Header block — the ID/actions row, title anchor, and metadata
          chiclets, grouped and delimited from the body as one header unit. */}
      <div className="details-headerblock">
      {/* Lead line: context on the left — the sidebar takeover shows a labeled
          "← Project" back button; an editor tab shows an "Issue view for
          <project>" chrome label. On the right, the action cluster (sidebar) or
          the back/forward history nav (editor tab, which has no view-title bar
          to host it). */}
      <div className="details-lead">
        {isEditorTab ? (
          <span
            className="details-lead-chrome"
            title={projectLabel ? `Issue view for ${projectLabel}` : "Issue view"}
          >
            <span className="details-lead-chrome-view">Issue view</span>
            {projectLabel && <span className="details-lead-chrome-for">for</span>}
            {projectLabel && <span className="details-lead-chrome-project">{projectLabel}</span>}
          </span>
        ) : (
          <button
            className="btn btn-sm details-back-btn fb-tip"
            data-tip="Back to the project view"
            aria-label="Back to the project view"
            onClick={() => vscode.postMessage({ type: "backToProject" })}
          >
            <ArrowLeft size={14} strokeWidth={2} />
            <span>Project</span>
          </button>
        )}
        {isEditorTab ? (
          <>
            <span className="details-lead-spacer" />
            <div className="header-actions">{backForwardBtns}</div>
          </>
        ) : (
          // Sidebar Lead: [+] [Edit] on the left, the segmented tab-shortcut
          // group centered between two flex spacers, and the utility cluster
          // (focus, refresh, open-in-tab) on the right.
          <>
            {createBtn}
            {editControls}
            <span className="details-lead-spacer" />
            {showTabBtns}
            <span className="details-lead-spacer" />
            <div className="header-actions">
              {focusBtn}
              {refreshBtn}
              {openInTabBtn}
            </div>
          </>
        )}
      </div>

      {/* Rule between the Lead and the Ident row. */}
      <hr className="details-rule" />

      {/* Ident row: type icon + ID + favorite star on the left; the merged
          type|status|priority pill right-aligned. In the sidebar, refresh +
          open-in-tab follow the pill (separated by a rule); in an editor tab the
          action cluster rides here instead (the Lead there is taken by the nav). */}
      <div className="details-header">
        <TypeIcon type={(displayBead.type || "task") as BeadType} size={20} />
        <span
          className="bead-id-badge clickable fb-tip"
          onClick={() => {
            if (onCopyId) {
              onCopyId(bead.id);
            } else {
              // Fallback: copy directly without feedback
              navigator.clipboard.writeText(bead.id);
            }
          }}
          data-tip="Click to copy ID"
        >
          {bead.id}
        </span>
        {favoriteBtn}
        <span className="details-header-spacer" />
        {isEditorTab ? (
          <>
            <div className="header-actions">
              {llmToggle}
              {showTabBtns}
              {focusBtn}
              {editControls}
            </div>
            {pills}
          </>
        ) : (
          // Ident carries only the merged pill, right-aligned. (The action
          // cluster — refresh + open-in-tab — rides on the Lead line.)
          pills
        )}
      </div>

      {/* Title - full width */}
      <div className="details-title">
        {editMode ? (
          <input
            type="text"
            value={displayBead.title}
            onChange={(e) => handleFieldChange("title", e.target.value)}
            className="title-input"
          />
        ) : (
          <h2>{displayBead.title}</h2>
        )}
      </div>

      {/* Assignee chiclet + Labels. (Type/Status/Priority live in the merged
          pill on the Ident row, which is inline-editable in both modes — so the
          editable badges row only carries assignee + labels now.) */}
      <div className="details-badges">
        {editMode ? (
          <>
            <Dropdown
              trigger={
                <span className="assignee-trigger">
                  <Icon name="user" size={10} className="person-icon" />
                  <span className={`assignee-name ${!displayBead.assignee ? "muted" : ""}`}>
                    {displayBead.assignee || "Unassigned"}
                  </span>
                </span>
              }
              className="assignee-menu"
              triggerClassName="assignee-menu-trigger"
            >
              {userId && displayBead.assignee !== userId && (
                <DropdownItem onClick={() => handleFieldChange("assignee", userId)}>
                  Assign to me
                </DropdownItem>
              )}
              {displayBead.assignee && (
                <DropdownItem onClick={() => handleFieldChange("assignee", "")}>
                  Unassign
                </DropdownItem>
              )}
              {knownAssignees.length > 0 && (userId || displayBead.assignee) && (
                <div className="dropdown-divider" />
              )}
              {knownAssignees
                .filter((a) => a !== displayBead.assignee)
                .map((a) => (
                  <DropdownItem key={a} onClick={() => handleFieldChange("assignee", a)}>
                    {a}
                  </DropdownItem>
                ))}
            </Dropdown>
            {/* Labels in edit mode - pushed to right, input first */}
            <span className="badges-spacer" />
            <Icon name="tag" size={10} className="labels-icon" title="Labels" />
            <div className="add-label-inline">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="+ label"
                onKeyDown={(e) => e.key === "Enter" && handleAddLabel()}
              />
            </div>
            {sortLabels(displayBead.labels).map((label) => (
              <LabelBadge
                key={label}
                label={label}
                onRemove={() => handleRemoveLabel(label)}
              />
            ))}
          </>
        ) : (
          <>
            {/* type/status/priority moved to the header pill; the badges row
                keeps the inline-editable assignee + labels. */}
            <Dropdown
              trigger={
                <span className="assignee-trigger">
                  <Icon name="user" size={10} className="person-icon" />
                  <span className={`assignee-name ${!displayBead.assignee ? "muted" : ""}`}>
                    {displayBead.assignee || "Unassigned"}
                  </span>
                </span>
              }
              className="assignee-menu"
              triggerClassName="assignee-menu-trigger"
              showChevron={false}
            >
              {userId && displayBead.assignee !== userId && (
                <DropdownItem onClick={() => handleInlineUpdate("assignee", userId)}>
                  Assign to me
                </DropdownItem>
              )}
              {displayBead.assignee && (
                <DropdownItem onClick={() => handleInlineUpdate("assignee", "")}>
                  Unassign
                </DropdownItem>
              )}
              {knownAssignees.length > 0 && (userId || displayBead.assignee) && (
                <div className="dropdown-divider" />
              )}
              {knownAssignees
                .filter((a) => a !== displayBead.assignee)
                .map((a) => (
                  <DropdownItem key={a} onClick={() => handleInlineUpdate("assignee", a)}>
                    {a}
                  </DropdownItem>
                ))}
            </Dropdown>
            {/* Labels inline in display mode - pushed to right */}
            {displayBead.labels && displayBead.labels.length > 0 && (
              <>
                <span className="badges-spacer" />
                <Icon name="tag" size={10} className="labels-icon" title="Labels" />
                {sortLabels(displayBead.labels).map((label) => (
                  <LabelBadge key={label} label={label} />
                ))}
              </>
            )}
          </>
        )}
      </div>
      </div>

      {/* Description */}
      <div className="details-section">
        <h4>Description</h4>
        {editMode ? (
          <textarea
            value={displayBead.description || ""}
            onChange={(e) => handleFieldChange("description", e.target.value)}
            className="description-input"
            rows={4}
            placeholder="No description"
          />
        ) : displayBead.description ? (
          <TextContent content={displayBead.description} renderMarkdown={renderMarkdown} />
        ) : (
          <p className="description-text muted">No description</p>
        )}
      </div>

      {/* External Reference */}
      {(displayBead.externalRef || editMode) && (
        <div className="details-section compact">
          <h4>External Reference</h4>
          {editMode ? (
            <input
              type="text"
              value={displayBead.externalRef || ""}
              onChange={(e) => handleFieldChange("externalRef", e.target.value || null)}
              className="text-input"
              placeholder="URL or reference ID"
            />
          ) : (
            <ExternalRefValue value={displayBead.externalRef} />
          )}
        </div>
      )}

      {/* Estimate */}
      {(displayBead.estimatedMinutes || editMode) && (
        <div className="details-section compact">
          <h4>Estimate (minutes)</h4>
          {editMode ? (
            <input
              type="number"
              value={displayBead.estimatedMinutes || ""}
              onChange={(e) => handleFieldChange("estimatedMinutes", e.target.value ? parseInt(e.target.value, 10) : null)}
              className="text-input estimate-input"
              placeholder="Minutes"
              min="0"
            />
          ) : (
            <span className="estimate-value">
              {Math.floor(displayBead.estimatedMinutes! / 60)}h {displayBead.estimatedMinutes! % 60}m
            </span>
          )}
        </div>
      )}

      {/* Design */}
      {(displayBead.design || editMode) && (
        <div className="details-section">
          <h4>Design Notes</h4>
          {editMode ? (
            <textarea
              value={displayBead.design || ""}
              onChange={(e) => handleFieldChange("design", e.target.value)}
              className="description-input"
              rows={3}
              placeholder="Design considerations, architecture notes..."
            />
          ) : (
            <TextContent content={displayBead.design!} renderMarkdown={renderMarkdown} />
          )}
        </div>
      )}

      {/* Acceptance Criteria */}
      {(displayBead.acceptanceCriteria || editMode) && (
        <div className="details-section">
          <h4>Acceptance Criteria</h4>
          {editMode ? (
            <textarea
              value={displayBead.acceptanceCriteria || ""}
              onChange={(e) => handleFieldChange("acceptanceCriteria", e.target.value)}
              className="description-input"
              rows={3}
              placeholder="Definition of done..."
            />
          ) : (
            <TextContent content={displayBead.acceptanceCriteria!} renderMarkdown={renderMarkdown} />
          )}
        </div>
      )}

      {/* Working Notes */}
      {(displayBead.notes || editMode) && (
        <div className="details-section">
          <h4>Working Notes</h4>
          {editMode ? (
            <textarea
              value={displayBead.notes || ""}
              onChange={(e) => handleFieldChange("notes", e.target.value)}
              className="description-input"
              rows={3}
              placeholder="Progress notes, findings..."
            />
          ) : (
            <TextContent content={displayBead.notes!} renderMarkdown={renderMarkdown} />
          )}
        </div>
      )}

      {/* Dependencies grouped by relationship type */}
      {partial && !editMode ? (
        <div className="details-section">
          <h4>Related Issues</h4>
          <span className="muted">Loading…</span>
        </div>
      ) : (() => {
        const dependsOnGroups = groupDependenciesByType(displayBead.dependsOn || []);
        const blocksGroups = groupDependenciesByType(displayBead.blocks || []);
        const hasDependsOn = (displayBead.dependsOn?.length || 0) > 0;
        const hasBlocks = (displayBead.blocks?.length || 0) > 0;

        // Define rendering order: hierarchy first, then workflow, then provenance, then related
        const typeOrder: DependencyType[] = ["parent-child", "blocks", "discovered-from", "related"];

        // Helper to render a dependency item
        const renderDepItem = (dep: BeadDependency, direction: "dependsOn" | "blocks", allowRemove: boolean) => (
          <div
            key={dep.id}
            className={`dep-item dep-type-${dep.type || "task"} ${onSelectBead && !editMode ? "clickable" : ""}`}
            onClick={() => !editMode && onSelectBead?.(dep.id)}
          >
            <span className="dep-id">{dep.id}</span>
            {dep.title && <span className="dep-title">{dep.title}</span>}
            <StatusPriorityPill status={dep.status} priority={dep.priority} />
            {allowRemove && editMode && (
              <button
                className="dep-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveDependency(bead.id, dep.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        );

        if (!editMode && !hasDependsOn && !hasBlocks) {
          return null;
        }

        return (
          <>
            {/* Render dependencies interleaved by type: parent→children, then blocked by→blocks, etc. */}
            {typeOrder.map((depType) => {
              const dependsOnDeps = dependsOnGroups[depType];
              const blocksDeps = blocksGroups[depType];
              if (dependsOnDeps.length === 0 && blocksDeps.length === 0) return null;
              return (
                <React.Fragment key={depType}>
                  {dependsOnDeps.length > 0 && (
                    <div className="details-section">
                      <h4>{DEPENDENCY_LABELS.dependsOn[depType]}</h4>
                      <div className="deps-list">
                        {sortDependencies(dependsOnDeps).map((dep) => renderDepItem(dep, "dependsOn", true))}
                      </div>
                    </div>
                  )}
                  {blocksDeps.length > 0 && (
                    <div className="details-section">
                      <h4>{DEPENDENCY_LABELS.blocks[depType]}</h4>
                      <div className="deps-list">
                        {sortDependencies(blocksDeps).map((dep) => renderDepItem(dep, "blocks", false))}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {/* Add dependency input in edit mode */}
            {editMode && (
              <div className="details-section">
                <h4>Add Dependency</h4>
                <div className="add-inline add-dependency-row">
                  <Dropdown
                    trigger={
                      <span className="dep-type-trigger">
                        {DEPENDENCY_TYPE_OPTIONS[newDepOptionIndex].label}
                      </span>
                    }
                    className="dep-type-dropdown"
                    menuClassName="dep-type-menu"
                  >
                    {DEPENDENCY_TYPE_OPTIONS.map((opt, idx) => (
                      <DropdownItem
                        key={`${opt.value}-${opt.direction}`}
                        onClick={() => setNewDepOptionIndex(idx)}
                        active={idx === newDepOptionIndex}
                      >
                        {opt.label}
                      </DropdownItem>
                    ))}
                  </Dropdown>
                  <input
                    type="text"
                    value={newDependency}
                    onChange={(e) => setNewDependency(e.target.value)}
                    placeholder="+ issue ID"
                    onKeyDown={(e) => e.key === "Enter" && handleAddDependency()}
                  />
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* Comments */}
      <div className="details-section">
        <h4>Comments {partial ? "" : `(${(displayBead.comments || []).length})`}</h4>
        <div className="comments-list">
          {partial && (
            <span className="muted">Loading…</span>
          )}
          {!partial && (displayBead.comments || []).map((comment) => (
            <div key={comment.id} className="comment">
              <div className="comment-header">
                <span className="comment-author">{comment.author}</span>
                <span className="comment-date">
                  <Timestamp value={comment.createdAt} />
                </span>
              </div>
              <div className="comment-text">
                <TextContent content={comment.text} renderMarkdown={renderMarkdown} />
              </div>
            </div>
          ))}
          {!partial && (displayBead.comments || []).length === 0 && (
            <span className="muted">No comments</span>
          )}
        </div>
        {/* Comment input - always shown if callback provided */}
        {onAddComment && (
          <div className="add-comment">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              rows={2}
            />
            <button
              className="btn btn-sm"
              onClick={() => {
                if (newComment.trim() && bead) {
                  onAddComment(bead.id, newComment.trim());
                  setNewComment("");
                }
              }}
              disabled={!newComment.trim()}
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Metadata footer */}
      <div className="details-meta">
        <span title={displayBead.createdAt ? new Date(displayBead.createdAt).toLocaleString() : undefined}>
          Created <Timestamp value={displayBead.createdAt} format="relative" />
        </span>
        <span title={displayBead.updatedAt ? new Date(displayBead.updatedAt).toLocaleString() : undefined}>
          Updated <Timestamp value={displayBead.updatedAt} format="relative" />
        </span>
        {displayBead.closedAt && (
          <span title={new Date(displayBead.closedAt).toLocaleString()}>
            Closed <Timestamp value={displayBead.closedAt} format="relative" />
          </span>
        )}
      </div>

      {/* End-of-document mark below the footer — the crisp "rule & bead"
          tailpiece, distinct from the generic Band used on list-style views. */}
      <div className="view-end" aria-hidden="true">
        <EndFlourish variant="rulebead" />
      </div>
    </div>
  );
}
