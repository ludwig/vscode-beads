/**
 * KanbanBoard
 *
 * Status-based board view for issues.
 * Supports drag-and-drop to change status.
 */

import React, { useState, useMemo, useEffect, useRef } from "react";
import { Bead, BeadStatus, BuiltInStatus, BeadType, DependencyGraph, STATUS_LABELS, STATUS_COLORS, isClosedStatus, vscode } from "../types";
import { TypeIcon } from "../common/TypeIcon";
import { PriorityBadge } from "../common/PriorityBadge";
import { LabelBadge } from "../common/LabelBadge";
import { Icon } from "../common/Icon";
import { FilterBar } from "../common/FilterBar";
import { useLocalFilter, type SharedFilterControl } from "../hooks/useLocalFilter";
import { intersect } from "../composeScope";
import { ContextMenu, type ContextMenuItem } from "../common/ContextMenu";

interface KanbanBoardProps {
  beads: Bead[];
  selectedBeadId: string | null;
  /** Favorite bead ids — drives the right-click Add/Remove Favorites item (vs-sd5.5). */
  favoriteIds?: string[];
  /** Masked favorites (eye-off), excluded from the board FilterBar's Favorites seed. */
  maskedIds?: string[];
  /** When true, gray out the titles of closed (done) cards (beads.muteClosedIssues, vs-b0ga). */
  muteClosedIssues?: boolean;
  /** Dependency graph — supplies edges for the board FilterBar's Ready/Favorites. */
  graph?: DependencyGraph | null;
  onRequestGraph?: () => void;
  onSelectBead: (beadId: string) => void;
  onUpdateBead?: (beadId: string, updates: Partial<Bead>) => void;
  /** Whether any filters are active (affects empty state messaging) */
  hasActiveFilters?: boolean;
  /** Unfiltered counts per status (to show "0 of N" when filtering) */
  unfilteredCounts?: Record<string, number>;
  /**
   * The inherited parent scope (panel filter / editor-tab seed), or null. The
   * board's own FilterBar composes on top of this (mirroring the Tree).
   */
  filteredBeadIds?: string[] | null;
  /** Editor-tab inherited-scope ribbon controls (omitted in the panel subtab). */
  parentCleared?: boolean;
  onToggleParentScope?: () => void;
  /**
   * Panel only: controls for the shared filter surface. When provided, the
   * board's FilterBar common controls read/write the shared (panel) spec —
   * linked with every other panel view. Omitted in an editor tab.
   */
  sharedFilter?: SharedFilterControl;
  totalCount?: number;
  /**
   * A "show in kanban" deep-link target (vs-wbrz): select the bead's card and
   * scroll it into view. `seq` re-fires for a repeat of the same bead. If the
   * card is filtered out of the current view it's a harmless no-op. Null when
   * there's no pending reveal.
   */
  revealRequest?: { beadId: string; seq: number } | null;
}

// bd's seven built-in statuses in lifecycle order: backlog → ready → doing →
// done, with the persistent "pinned" lane parked at the far end (it lives
// outside the normal flow). Full dynamic lane derivation (incl. custom statuses)
// + persisted collapse is vs-9ph; for now we surface all built-ins so
// deferred/pinned/hooked beads are no longer dropped.
const COLUMNS: BuiltInStatus[] = [
  "deferred", // backlog — parked for later (frozen)
  "open", // ready (active)
  "in_progress", // doing (wip)
  "hooked", // claimed by a worker (wip)
  "blocked", // started but stuck (wip)
  "closed", // done
  "pinned", // standing / persistent (frozen) — outside the flow
];

export function KanbanBoard({ beads, selectedBeadId, favoriteIds = [], maskedIds = [], muteClosedIssues = true, graph, onRequestGraph, onSelectBead, onUpdateBead, hasActiveFilters, unfilteredCounts, filteredBeadIds, parentCleared, onToggleParentScope, sharedFilter, totalCount, revealRequest }: KanbanBoardProps): React.ReactElement {
  const boardRef = useRef<HTMLDivElement>(null);
  // Track which columns are collapsed. The quiet lanes (closed + the frozen
  // deferred/pinned) start collapsed; good per-lane defaults + persistence are
  // vs-9ph.
  const [collapsedColumns, setCollapsedColumns] = useState<Set<BeadStatus>>(
    new Set(["closed", "deferred", "pinned"])
  );
  // Track which column is being dragged over
  const [dragOverColumn, setDragOverColumn] = useState<BeadStatus | null>(null);
  // Optimistic status overrides for instant visual feedback
  const [optimisticStatus, setOptimisticStatus] = useState<Map<string, BeadStatus>>(new Map());
  // Right-click row menu (mirrors the Tree/Graph card menus).
  const [menu, setMenu] = useState<{ x: number; y: number; bead: Bead } | null>(null);
  // Ad-hoc quick filter local to the board (mirrors the Tree's filter input) —
  // narrows the cards by id/title on top of the shared Issues filter slice.
  const [query, setQuery] = useState("");
  // Optimistic selection: highlight the clicked card instantly instead of
  // waiting for the extension to echo selectedBeadId back. Cleared when the
  // authoritative prop updates so external selections win.
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  useEffect(() => setLocalSelectedId(null), [selectedBeadId]);
  const activeSelectedId = localSelectedId ?? selectedBeadId;
  const selectCard = (id: string) => {
    setLocalSelectedId(id);
    onSelectBead(id);
  };

  // Apply optimistic overrides to beads
  const effectiveBeads = useMemo(() => {
    if (optimisticStatus.size === 0) return beads;
    return beads.map((bead) => {
      const override = optimisticStatus.get(bead.id);
      if (override && bead.status !== override) {
        return { ...bead, status: override };
      }
      // Clear optimistic override once real data catches up
      if (override && bead.status === override) {
        setOptimisticStatus((prev) => {
          const next = new Map(prev);
          next.delete(bead.id);
          return next;
        });
      }
      return bead;
    });
  }, [beads, optimisticStatus]);

  const toggleColumn = (status: BeadStatus) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, beadId: string) => {
    e.dataTransfer.setData("text/plain", beadId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, status: BeadStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, newStatus: BeadStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    const beadId = e.dataTransfer.getData("text/plain");
    const bead = beads.find((b) => b.id === beadId);

    // Only update if status actually changed
    if (bead && bead.status !== newStatus && onUpdateBead) {
      // Optimistic update - move card immediately
      setOptimisticStatus((prev) => new Map(prev).set(beadId, newStatus));
      onUpdateBead(beadId, { status: newStatus });
    }
  };

  // The board's own unified FilterBar (structured local filter), composed on top
  // of the inherited parent scope: (Filtered ? parentScope : all) ∩ resolve(local).
  const lf = useLocalFilter({
    persistKey: "kanbanLocalFilter",
    beads,
    edges: graph?.edges ?? [],
    favoriteIds,
    maskedIds,
    hasGraph: !!graph,
    onRequestGraph,
    shared: sharedFilter,
  });
  const inheritedScope = parentCleared ? null : (filteredBeadIds ?? null);
  const finalScope = useMemo(
    () => intersect(inheritedScope, lf.localScope),
    [inheritedScope, lf.localScope],
  );
  const total = totalCount ?? beads.length;
  const scopeCount = finalScope?.length ?? total;

  // Scope to the composed id-set (always-on, like the Tree).
  const scopedBeads = useMemo(() => {
    if (finalScope == null) return effectiveBeads;
    const allowed = new Set(finalScope);
    return effectiveBeads.filter((b) => allowed.has(b.id));
  }, [effectiveBeads, finalScope]);

  // Apply the ad-hoc board filter on top (id/title contains, case-insensitive).
  const visibleBeads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scopedBeads;
    return scopedBeads.filter((b) => b.id.toLowerCase().includes(q) || b.title.toLowerCase().includes(q));
  }, [scopedBeads, query]);

  // Group beads by status (using the scoped + locally-filtered beads)
  const grouped = COLUMNS.reduce((acc, status) => {
    acc[status] = visibleBeads.filter((b) => b.status === status);
    return acc;
  }, {} as Record<BeadStatus, Bead[]>);

  // "Show in kanban" deep-link (vs-wbrz): select the target's card and scroll it
  // into view. Held as pending state and retried as the visible cards update,
  // because the bead list may still be loading when the request arrives. If the
  // card is scoped out by the Issues/board filter it simply never resolves — a
  // harmless no-op. Mirrors the Tree's pending-reveal idiom.
  const [pendingReveal, setPendingReveal] = useState<string | null>(null);
  const lastRevealSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!revealRequest || lastRevealSeq.current === revealRequest.seq) return;
    lastRevealSeq.current = revealRequest.seq;
    setPendingReveal(revealRequest.beadId);
  }, [revealRequest]);
  useEffect(() => {
    if (!pendingReveal) return;
    const target = visibleBeads.find((b) => b.id === pendingReveal);
    if (!target) return; // list not loaded / card not in scope yet — retry later
    // Expand the card's column if it was collapsed, so the card is visible.
    setCollapsedColumns((prev) => {
      if (!prev.has(target.status)) return prev;
      const next = new Set(prev);
      next.delete(target.status);
      return next;
    });
    setLocalSelectedId(pendingReveal);
    onSelectBead(pendingReveal);
    const id = pendingReveal;
    requestAnimationFrame(() => {
      boardRef.current
        ?.querySelector(`[data-bead-id="${id}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    });
    setPendingReveal(null);
  }, [pendingReveal, visibleBeads, onSelectBead]);

  return (
    <div className="kanban">
      <FilterBar
        snapshot={lf.snapshot}
        facets={lf.facets}
        ops={lf.ops}
        count={{ shown: scopeCount, total, unit: "cards" }}
        collapsed={lf.collapsed}
        onToggleCollapsed={lf.toggleCollapsed}
        searchTerm={query}
        onClearSearch={() => setQuery("")}
        search={
          <input
            type="text"
            className="filter-bar-search-input"
            placeholder="Filter cards…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
        }
        inherited={
          onToggleParentScope
            ? {
                filteredCount: filteredBeadIds?.length ?? 0,
                totalCount: total,
                cleared: !!parentCleared,
                onToggle: onToggleParentScope,
              }
            : undefined
        }
      />
      <div className="kanban-board" ref={boardRef}>
      {COLUMNS.map((status) => {
        const isCollapsed = collapsedColumns.has(status);
        const items = grouped[status] || [];
        const isDragOver = dragOverColumn === status;

        return (
          <div
            key={status}
            className={`kanban-column ${isCollapsed ? "collapsed" : ""} ${isDragOver ? "drag-over" : ""}`}
            style={{ "--column-color": STATUS_COLORS[status] } as React.CSSProperties}
            onDragOver={(e) => handleDragOver(e, status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, status)}
          >
            <div
              className="kanban-column-header"
              onClick={() => toggleColumn(status)}
            >
              <span className="kanban-column-title">{STATUS_LABELS[status]}</span>
              <span className="kanban-column-count">
                {hasActiveFilters && unfilteredCounts && unfilteredCounts[status] !== items.length
                  ? `${items.length}/${unfilteredCounts[status]}`
                  : items.length}
              </span>
            </div>
            {!isCollapsed && (
              <div className="kanban-column-body">
                {items.map((bead) => (
                  <div
                    key={bead.id}
                    data-bead-id={bead.id}
                    className={`kanban-card ${bead.id === activeSelectedId ? "selected" : ""}`}
                    draggable={!!onUpdateBead}
                    onDragStart={(e) => handleDragStart(e, bead.id)}
                    onClick={() => selectCard(bead.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, bead });
                    }}
                  >
                    <div className="kanban-card-header">
                      <TypeIcon type={(bead.type || "task") as BeadType} size={12} />
                      <span className="kanban-card-id">{bead.id}</span>
                    </div>
                    <div className={`kanban-card-title${muteClosedIssues && isClosedStatus(bead.status) ? " muted-closed" : ""}`}>{bead.title}</div>
                    <div className="kanban-card-meta">
                      {bead.priority !== undefined && <PriorityBadge priority={bead.priority} size="small" />}
                      {bead.assignee && (
                        <>
                          <Icon name="user" size={10} className="kanban-card-icon" />
                          <span className="kanban-card-assignee">{bead.assignee}</span>
                        </>
                      )}
                      {bead.labels && bead.labels.length > 0 && (
                        <>
                          <span className="kanban-card-spacer" />
                          <Icon name="tag" size={10} className="kanban-card-icon" />
                          {bead.labels.slice(0, 3).map((label) => (
                            <LabelBadge key={label} label={label} />
                          ))}
                          {bead.labels.length > 3 && (
                            <span className="kanban-card-labels-more">+{bead.labels.length - 3}</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="kanban-empty">
                    {hasActiveFilters && unfilteredCounts && unfilteredCounts[status] > 0
                      ? `No matches (${unfilteredCounts[status]} filtered)`
                      : "No items"}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={cardMenuItems(menu.bead, favoriteIds.includes(menu.bead.id))}
        />
      )}
    </div>
  );
}

function cardMenuItems(bead: Bead, isFavorite: boolean): ContextMenuItem[] {
  return [
    {
      label: "Open Details (editor tab)",
      onSelect: () => vscode.postMessage({ type: "openBeadInTab", beadId: bead.id }),
    },
    {
      label: "Show Details",
      onSelect: () => vscode.postMessage({ type: "openBeadDetails", beadId: bead.id }),
    },
    {
      label: "Focus on Graph",
      onSelect: () => vscode.postMessage({ type: "viewInGraph", beadId: bead.id }),
    },
    {
      label: isFavorite ? "Remove from Favorites" : "Add to Favorites",
      separatorBefore: true,
      onSelect: () => vscode.postMessage({ type: "toggleFavorite", beadId: bead.id }),
    },
    {
      label: "Copy ID",
      separatorBefore: true,
      onSelect: () => vscode.postMessage({ type: "copyBeadId", beadId: bead.id }),
    },
    {
      label: "Copy title",
      onSelect: () => vscode.postMessage({ type: "copyText", text: bead.title, label: "title" }),
    },
    {
      label: "Copy JSON",
      onSelect: () => vscode.postMessage({ type: "copyBeadJson", beadId: bead.id }),
    },
    {
      label: "Copy Markdown",
      onSelect: () => vscode.postMessage({ type: "copyBeadMarkdown", beadId: bead.id }),
    },
  ];
}
