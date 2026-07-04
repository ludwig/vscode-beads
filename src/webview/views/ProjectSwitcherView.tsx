/**
 * ProjectSwitcherView - the slimmed sidebar's context view.
 *
 * Two sections: "Active Project" (switcher + basic info) and "Selection"
 * (the currently-selected bead, pinned as a reference with a quick-open
 * button). NOTE: the user-facing label is "Selection"; the internal plumbing
 * (activeBead prop, `active-bead` CSS, setActiveBead) keeps the "active bead"
 * naming on purpose — a richer "Active Bead" concept is a future product
 * refinement (vs-lu8f follow-up), and the current card is just the selection.
 * Falls back to friendly empty states.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X, Rocket, ListTodo, ListTree, Copy, FolderPlus, Star } from "lucide-react";
import { Bead, BeadsProject, FavoriteBead, statusColor, isClosedStatus } from "../types";
import { ProjectDropdown } from "../common/ProjectDropdown";
import { Dropdown, DropdownItem, DropdownSeparator } from "../common/Dropdown";
import { formatBytes } from "../common/formatBytes";
import { TypeIcon } from "../common/TypeIcon";
import { BeadSummary } from "../common/BeadSummary";
import { ContextMenu, type ContextMenuItem } from "../common/ContextMenu";
import { EndFlourish } from "../common/EndFlourish";
import { FilterGroup } from "../common/FilterGroup";

interface ProjectSwitcherViewProps {
  projects: BeadsProject[];
  activeProject: BeadsProject | null;
  activeBead: Bead | null;
  /** The active project's favorites, in curated order (vs-sd5.1). Each carries
   *  its own `masked` flag (the Favorites filter group's eye-off state). */
  favorites: FavoriteBead[];
  onSelectProject: (project: BeadsProject) => void;
  onOpenProjectFolder: () => void;
  onOpenBead: (beadId: string) => void;
  onOpenBeadInTab: (beadId: string) => void;
  onClearBead: () => void;
  /** Unstar a favorite from the section's per-row control. */
  onUnfavorite: (beadId: string) => void;
  /** Copy the favorite bead IDs as a single CSV line to the clipboard (vs-sd5.2). */
  onCopyFavorites: () => void;
  /** Copy a single bead's ID to the clipboard (card right-click menu). */
  onCopyId: (beadId: string) => void;
  /** Star/unstar a bead from the card right-click menu (vs-sd5.5). */
  onToggleFavorite: (beadId: string) => void;
  /** Toggle a favorite's mask (eye-off) in the Favorites filter group. */
  onToggleMask: (beadId: string) => void;
  /** Whether the panel Issues Favorites filter is on (full-duplex star state). */
  favoritesFilterOn: boolean;
  /** Drive the panel Issues Favorites filter from the Favorites-card star. */
  onToggleFavoritesFilter: (on: boolean) => void;
  onPickReady: () => void;
  onShowIssues: () => void;
  onShowTree: () => void;
  /** Launch the "Initialize Repository" flow (empty-state CTA, vs-r6a1.5). */
  onCreateBoard: () => void;
  /** Open the Repository Details editor-tab page (⋮ menu, vs-beoh). */
  onOpenRepositoryDetails: () => void;
  /** Swap the projects root via a folder picker (⋮ menu, vs-r6a1.10). */
  onChangeRoot: () => void;
  /** Open the Settings UI filtered to this extension (vs-r6a1.9). */
  onOpenSettings: () => void;
  onShowStatus: () => void;
  onStartDolt: () => void;
  onStopDolt: () => void;
  onOpenDoltLog: () => void;
  /** Export the active project's issues to a JSONL file (vs-ln7e.1). */
  onExportIssues: () => void;
  version?: string;
  buildSha?: string;
  buildDirty?: boolean;
  /** When true, gray out the titles of closed (done) favorites/active bead (beads.muteClosedIssues, vs-b0ga). */
  muteClosedIssues?: boolean;
  /** On-disk size of our built bundle in bytes (0 = unknown). */
  bundleBytes?: number;
}

/** Auto-scaled binary size, e.g. 248 MB / 1.5 GB. */
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
  onCopyFavorites,
  onCopyId,
  onToggleFavorite,
  onToggleMask,
  favoritesFilterOn,
  onToggleFavoritesFilter,
  onPickReady,
  onShowIssues,
  onShowTree,
  onCreateBoard,
  onOpenRepositoryDetails,
  onChangeRoot,
  onOpenSettings,
  onShowStatus,
  onStartDolt,
  onStopDolt,
  onOpenDoltLog,
  onExportIssues,
  version,
  buildSha,
  buildDirty,
  muteClosedIssues = true,
  bundleBytes = 0,
}: ProjectSwitcherViewProps): React.ReactElement {
  const backendState = activeProject?.backendStatus ?? "unknown";
  const [projectCollapsed, setProjectCollapsed] = useState(false);
  const [favoritesCollapsed, setFavoritesCollapsed] = useState(false);
  // Optimistic star: `favoritesFilterOn` reflects the host round-trip (star →
  // command → scope flip → broadcast back), which reads as lag. Flip the star
  // instantly on click and reconcile the override away once the authoritative
  // bit catches up. Null = no pending optimism.
  const [favStarOptimistic, setFavStarOptimistic] = useState<boolean | null>(null);
  const favStarOn = favStarOptimistic ?? favoritesFilterOn;
  useEffect(() => {
    if (favStarOptimistic != null && favoritesFilterOn === favStarOptimistic) setFavStarOptimistic(null);
  }, [favoritesFilterOn, favStarOptimistic]);

  // Right-click menu for a bead card/row (vs-sd5.5). `isFavorite` is captured at
  // open time so the toggle label reads correctly for the menu's bead.
  const [cardMenu, setCardMenu] = useState<{ x: number; y: number; id: string; isFavorite: boolean } | null>(null);
  const openCardMenu = useCallback(
    (e: React.MouseEvent, id: string, isFavorite: boolean) => {
      e.preventDefault();
      setCardMenu({ x: e.clientX, y: e.clientY, id, isFavorite });
    },
    [],
  );
  const cardMenuItems = useCallback(
    (id: string, isFavorite: boolean): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [
        { label: "Copy ID", onSelect: () => onCopyId(id) },
        { label: "Show Details", onSelect: () => onOpenBead(id) },
        { label: "Show in editor tab", onSelect: () => onOpenBeadInTab(id) },
      ];
      // A hidden (masked) favorite can be un-hidden straight from its card menu —
      // handy when the muted card makes the eye toggle easy to miss (vs-sd5).
      if (isFavorite && favorites.some((f) => f.id === id && f.masked)) {
        items.push({
          label: "Reset visibility",
          separatorBefore: true,
          onSelect: () => onToggleMask(id),
        });
      }
      items.push({
        label: isFavorite ? "Remove from Favorites" : "Add to Favorites",
        separatorBefore: true,
        onSelect: () => onToggleFavorite(id),
      });
      return items;
    },
    [onCopyId, onOpenBead, onOpenBeadInTab, onToggleFavorite, onToggleMask, favorites],
  );

  // Click-count router on the Selection card (mirrors the Graph/Tree): 1/2
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
              <DropdownItem onClick={onCreateBoard}>Initialize New Board</DropdownItem>
              <DropdownItem onClick={onOpenRepositoryDetails}>Repository Details</DropdownItem>
              <DropdownItem onClick={onChangeRoot}>Change Projects Root</DropdownItem>
              <DropdownItem onClick={onOpenProjectFolder}>Open Folder in Finder</DropdownItem>
              <DropdownItem onClick={onExportIssues}>Export Issues as JSONL</DropdownItem>
              <DropdownSeparator />
              <DropdownItem onClick={onShowStatus}>Show Dolt Status</DropdownItem>
              <DropdownItem onClick={onStartDolt}>Start Dolt</DropdownItem>
              <DropdownItem onClick={onStopDolt}>Stop Dolt</DropdownItem>
              <DropdownItem onClick={onOpenDoltLog}>Open Dolt Log</DropdownItem>
              <DropdownSeparator />
              <DropdownItem onClick={onOpenSettings}>Extension Settings</DropdownItem>
            </Dropdown>
          )}
        </div>

        {!projectCollapsed && (
        <>
        <ProjectDropdown
          projects={projects}
          activeProject={activeProject}
          onSelectProject={onSelectProject}
          onCreateBoard={onCreateBoard}
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
            </dl>
          </>
        ) : (
          <div className="context-empty">
            <p>No Beads boards yet.</p>
            <button
              type="button"
              className="btn context-action-btn create-board"
              onClick={onCreateBoard}
              title="Create and initialize a new Beads board"
            >
              <FolderPlus size={14} strokeWidth={2} />
              <span>Create your first board</span>
            </button>
            <p className="context-empty-hint">
              Or run <code>bd init</code> in a folder, or point the{" "}
              <code>beads.projects</code> setting at one.
            </p>
          </div>
        )}
        </>
        )}
      </section>

      {/* Selection card — the current selection captured in the Project view at
          medium LOD, so it's reachable even after navigating away from the
          Issues tab. Clicking it loads the full Details takeover. */}
      {activeBead && (
        <section className="context-section context-selection-section">
          <div className="context-section-head">
            <span className="context-heading">Selection</span>
            <button
              type="button"
              className="context-heading-action fb-tip fb-tip-end"
              data-tip="Clear selection"
              aria-label="Clear selection"
              onClick={onClearBead}
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
          <BeadSummary
            bead={activeBead}
            muteClosed={muteClosedIssues}
            onOpen={onOpenBead}
            onContextMenu={(e) =>
              openCardMenu(e, activeBead.id, favorites.some((f) => f.id === activeBead.id))
            }
          />
        </section>
      )}

      <div className="context-actions">
        <button
          type="button"
          className="btn context-action-btn pick-ready"
          onClick={onPickReady}
          disabled={!activeProject}
          title="Pick a ready-to-work bead (open, no open blocker) and show it as the selection"
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
        <button
          type="button"
          className="btn context-action-btn show-tree"
          onClick={onShowTree}
          title="Show the Tree panel"
        >
          <ListTree size={14} strokeWidth={2} />
          <span>Show Tree</span>
        </button>
      </div>

      {/* Favorites is a seed-based FilterGroup: the seed list (starred beads)
          expands into relatives in the Issues view, and each seed's eye masks it
          out of that expansion. The mask is owned by the group, not the card. */}
      <FilterGroup
        title="Favorites"
        collapsed={favoritesCollapsed}
        onToggleCollapsed={() => setFavoritesCollapsed((v) => !v)}
        count={favorites.length}
        headerAction={
          favorites.length > 0 ? (
            <>
              {/* Secondary action leads; the primary full-duplex star sits in
                  the corner (rightmost) as the comfy, reach-for-it default. */}
              <button
                type="button"
                className="context-heading-action fb-tip fb-tip-end"
                data-tip="Copy favorite IDs as CSV"
                aria-label="Copy favorite IDs as CSV"
                onClick={onCopyFavorites}
              >
                <Copy size={13} strokeWidth={2} />
              </button>
              {/* Full-duplex star: reflects the panel Issues Favorites filter
                  (filled = on) and toggles it (vs-sd5). Optimistic: flips
                  instantly, reconciled to the host bit. */}
              <button
                type="button"
                className={`context-heading-action favorites-filter-star fb-tip fb-tip-end${favStarOn ? " active" : ""}`}
                data-tip={
                  favStarOn
                    ? "Favorites filter is ON in Issues — click to turn it off"
                    : "Favorites filter is OFF — click to show only favorites (and their relatives) in Issues"
                }
                aria-label="Toggle the Issues favorites filter"
                aria-pressed={favStarOn}
                onClick={() => {
                  setFavStarOptimistic(!favStarOn);
                  onToggleFavoritesFilter(!favStarOn);
                }}
              >
                <Star size={13} strokeWidth={2} fill={favStarOn ? "currentColor" : "none"} />
              </button>
            </>
          ) : undefined
        }
        items={favorites}
        getKey={(fav) => fav.id}
        isMasked={(fav) => !!fav.masked}
        onToggleMask={(fav) => onToggleMask(fav.id)}
        emptyState={
          <div className="context-empty">
            <p>No favorites yet — star a bead to pin it here.</p>
          </div>
        }
        renderItem={(fav) => (
          <button
            type="button"
            className="active-bead context-card-open"
            title={`${fav.id}${fav.title ? ` — ${fav.title}` : ""}\nClick to open in Details · triple-click to open in an editor tab`}
            onClick={() => activateBead(fav.id)}
            onContextMenu={(e) => openCardMenu(e, fav.id, true)}
          >
            <div className="active-bead-main">
              <div className="active-bead-head">
                {fav.type && <TypeIcon type={fav.type} size={13} />}
                <span className="active-bead-id">{fav.id}</span>
                {fav.status && (
                  <span
                    className="active-bead-status"
                    style={{ backgroundColor: statusColor(fav.status) }}
                    title={fav.status}
                  />
                )}
              </div>
              {fav.title && (
                <span className={`active-bead-title${muteClosedIssues && fav.status && isClosedStatus(fav.status) ? " muted-closed" : ""}`}>
                  {fav.title}
                </span>
              )}
            </div>
          </button>
        )}
        renderTrailing={(fav) => (
          <button
            type="button"
            className="context-card-x"
            title="Unstar this bead"
            aria-label={`Unstar ${fav.id}`}
            onClick={() => onUnfavorite(fav.id)}
          >
            <X size={13} strokeWidth={2} />
          </button>
        )}
      />

      {/* End-of-view flourish. */}
      <div className="view-end" aria-hidden="true">
        <EndFlourish />
      </div>

      {cardMenu && (
        <ContextMenu
          x={cardMenu.x}
          y={cardMenu.y}
          onClose={() => setCardMenu(null)}
          items={cardMenuItems(cardMenu.id, cardMenu.isFavorite)}
        />
      )}
    </div>
  );
}
