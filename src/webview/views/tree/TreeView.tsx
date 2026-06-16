/**
 * TreeView — the hierarchical Tree subview of the bottom PanelShell (vs-bw9).
 *
 * Renders beads in their parent/child hierarchy as an indented, collapsible
 * tree (file-explorer chrome) that conveys dependency lineage (gitk-ish), with
 * a filter line that narrows to matching beads while keeping the path to them.
 * Reuses the lazily-fetched dependency graph (same data as the Graph tab).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronDown, Search, ArrowUp, ArrowDown } from "lucide-react";
import {
  Bead,
  BeadType,
  DependencyGraph,
  STATUS_COLORS,
  PRIORITY_COLORS,
  UNKNOWN_PRIORITY_COLOR,
  BeadPriority,
  TYPE_LABELS,
  getTypeSortOrder,
  vscode,
} from "../../types";
import { TypeIcon } from "../../common/TypeIcon";
import { Loading } from "../../common/Loading";
import { ErrorMessage } from "../../common/ErrorMessage";
import { ContextMenu, type ContextMenuItem } from "../../common/ContextMenu";
import { buildForest, filterForest, filterForestByIds, subtreeIds, compareById, type BeadComparator, type TreeNode } from "./treeModel";

interface DragApi {
  draggedId: string | null;
  dropTargetId: string | null;
  onStart: (id: string) => void;
  onOver: (id: string, e: React.DragEvent) => void;
  onDrop: (id: string) => void;
  onEnd: () => void;
}

type SortKey = "id" | "type" | "title" | "priority";

// Sortable tree-table columns. Clicking a header cycles asc → desc → off; the
// "off" state is the natural id order (so id sort needs no dedicated column).
// The Title header occupies the indented tree column; Type/Priority align in
// fixed columns across all depths.
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "type", label: "Type" },
  { key: "priority", label: "Priority" },
];

type SortDir = "asc" | "desc";
interface SortState {
  key: SortKey;
  dir: SortDir;
}

// Tri-state cycle on a sort button: none → asc → desc → none (back to default).
function cycleSort(prev: SortState | null, key: SortKey): SortState | null {
  if (!prev || prev.key !== key) return { key, dir: "asc" };
  if (prev.dir === "asc") return { key, dir: "desc" };
  return null;
}

const byTitle = (a: Bead, b: Bead) => a.title.localeCompare(b.title) || compareById(a, b);
const byType = (a: Bead, b: Bead) =>
  getTypeSortOrder(a.type) - getTypeSortOrder(b.type) || byTitle(a, b);
// P0 (highest) first; missing priority sorts last, then by id.
const byPriority = (a: Bead, b: Bead) =>
  (a.priority ?? 99) - (b.priority ?? 99) || compareById(a, b);

function comparatorFor(sort: SortState | null): BeadComparator {
  if (!sort) return compareById;
  const base =
    sort.key === "type" ? byType : sort.key === "title" ? byTitle : sort.key === "priority" ? byPriority : compareById;
  return sort.dir === "asc" ? base : (a, b) => -base(a, b);
}

function typeLabel(type: string | undefined): string {
  if (!type) return "";
  return TYPE_LABELS[type as BeadType] ?? type;
}

interface TreeViewProps {
  graph: DependencyGraph | null;
  loading: boolean;
  error: string | null;
  selectedBeadId: string | null;
  /**
   * Ids matching the current Issues filter/search, or null when unknown. The
   * "Filtered" toggle scopes the tree to this set; null disables the toggle.
   */
  filteredBeadIds: string[] | null;
  onSelectBead: (beadId: string) => void;
  onRequestGraph: () => void;
  onRetry: () => void;
}

export function TreeView({
  graph,
  loading,
  error,
  selectedBeadId,
  filteredBeadIds,
  onSelectBead,
  onRequestGraph,
  onRetry,
}: TreeViewProps): React.ReactElement {
  // Lazily fetch the graph when this tab mounts (shares the Graph tab's data).
  useEffect(() => {
    onRequestGraph();
  }, [onRequestGraph]);

  const [query, setQuery] = useState("");
  // Optimistic selection: highlight the clicked node instantly rather than
  // waiting for the extension to echo selectedBeadId back. Cleared when the
  // authoritative prop updates so external selections win.
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  useEffect(() => setLocalSelectedId(null), [selectedBeadId]);
  const activeSelectedId = localSelectedId ?? selectedBeadId;
  // Sort persists across tab switches / reloads via the shared webview state
  // (the Tree unmounts when another Panel tab is active, so local state alone
  // would forget it). Merge into the blob so we don't clobber the Issues table's
  // persisted column state.
  const [sort, setSort] = useState<SortState | null>(
    () => (vscode.getState() as { treeSort?: SortState | null } | undefined)?.treeSort ?? null,
  );
  useEffect(() => {
    const prev = (vscode.getState() as Record<string, unknown>) ?? {};
    vscode.setState({ ...prev, treeSort: sort });
  }, [sort]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; bead: Bead } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openMenu = useCallback((x: number, y: number, bead: Bead) => {
    setMenu({ x, y, bead });
  }, []);

  // Click-count router (mirrors the Graph): 1/2 clicks select + show the bead in
  // the sidebar Details (double keeps it there), 3 clicks open it in an editor
  // tab. Selection fires immediately on every click for instant feedback.
  const clickRef = useRef<{ id: string; count: number; timer: ReturnType<typeof setTimeout> | null }>({
    id: "",
    count: 0,
    timer: null,
  });
  const handleActivate = useCallback(
    (id: string) => {
      setLocalSelectedId(id); // instant highlight, before the extension echoes back
      onSelectBead(id);
      const c = clickRef.current;
      if (c.id !== id) {
        c.id = id;
        c.count = 0;
      }
      c.count += 1;
      if (c.timer) clearTimeout(c.timer);
      c.timer = setTimeout(() => {
        const n = c.count;
        c.count = 0;
        c.id = "";
        c.timer = null;
        if (n >= 3) vscode.postMessage({ type: "openBeadInTab", beadId: id });
      }, 320);
    },
    [onSelectBead],
  );
  useEffect(
    () => () => {
      if (clickRef.current.timer) clearTimeout(clickRef.current.timer);
    },
    [],
  );

  const forest = useMemo(
    () => (graph ? buildForest(graph.nodes, graph.edges, comparatorFor(sort)) : []),
    [graph, sort],
  );
  // The Tree always reflects the current Issues filter set (vs-wp5): Issues is
  // where filters are defined; the Tree scopes to that slice (keeping the
  // ancestor path so it stays connected). Then narrow further by the text query.
  const scoped = useMemo(
    () => (filteredBeadIds != null ? filterForestByIds(forest, new Set(filteredBeadIds)) : forest),
    [forest, filteredBeadIds],
  );
  const visible = useMemo(() => filterForest(scoped, query), [scoped, query]);
  // Only the text query force-expands (to reveal matches); the always-on Issues
  // scope must not, so the user can still collapse/expand within it.
  const filtering = query.trim().length > 0;

  // Current parent per bead (first parent-child edge from=child wins).
  const parentOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of graph?.edges ?? []) {
      if (e.type === "parent-child" && !m.has(e.from)) m.set(e.from, e.to);
    }
    return m;
  }, [graph]);

  // Drag-to-reparent (vs-jb6): drop A onto B = make B the parent of A. Illegal
  // if B is A itself, A's current parent (no-op), or in A's subtree (cycle).
  const isLegalTarget = useCallback(
    (targetId: string): boolean => {
      if (!draggedId || targetId === draggedId) return false;
      if ((parentOf.get(draggedId) ?? null) === targetId) return false;
      return !subtreeIds(forest, draggedId).has(targetId);
    },
    [draggedId, parentOf, forest],
  );

  const reparent = useCallback(
    (dragged: string, newParent: string | null) => {
      const oldParent = parentOf.get(dragged) ?? null;
      if (oldParent === newParent) return;
      if (newParent && newParent !== dragged && subtreeIds(forest, dragged).has(newParent)) return;
      if (oldParent) {
        vscode.postMessage({ type: "removeDependency", beadId: dragged, dependsOnId: oldParent });
      }
      if (newParent) {
        vscode.postMessage({
          type: "addDependency",
          beadId: dragged,
          targetId: newParent,
          dependencyType: "parent-child",
          reverse: false,
        });
      }
    },
    [parentOf, forest],
  );

  const drag: DragApi = {
    draggedId,
    dropTargetId,
    onStart: useCallback((id: string) => setDraggedId(id), []),
    onOver: useCallback(
      (id: string, e: React.DragEvent) => {
        e.stopPropagation();
        if (isLegalTarget(id)) {
          e.preventDefault();
          setDropTargetId(id);
        }
      },
      [isLegalTarget],
    ),
    onDrop: useCallback(
      (id: string) => {
        if (draggedId && isLegalTarget(id)) reparent(draggedId, id);
        setDraggedId(null);
        setDropTargetId(null);
      },
      [draggedId, isLegalTarget, reparent],
    ),
    onEnd: useCallback(() => {
      setDraggedId(null);
      setDropTargetId(null);
    }, []),
  };

  // Detach to root: drop on empty body space removes the dragged bead's parent.
  const canDetach = draggedId != null && parentOf.has(draggedId);
  const onBodyDragOver = (e: React.DragEvent) => {
    if (canDetach) {
      e.preventDefault();
      setDropTargetId(null);
    }
  };
  const onBodyDrop = () => {
    if (draggedId && parentOf.has(draggedId)) reparent(draggedId, null);
    setDraggedId(null);
    setDropTargetId(null);
  };

  if (error) {
    return <ErrorMessage message={error} onRetry={onRetry} />;
  }
  if (!graph && loading) {
    return <Loading />;
  }

  return (
    <div className="beads-tree">
      <div className="beads-tree-filter">
        <Search size={13} strokeWidth={2} className="beads-tree-filter-icon" />
        <input
          type="text"
          className="beads-tree-filter-input"
          placeholder="Filter beads…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
      </div>
      <div className="beads-tree-colheader" role="row">
        {COLUMNS.map(({ key, label }) => {
          const active = sort?.key === key;
          return (
            <button
              key={key}
              type="button"
              role="columnheader"
              aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
              className={`beads-tree-col beads-tree-col-${key} ${active ? "active" : ""}`}
              onClick={() => setSort((prev) => cycleSort(prev, key))}
              title={`Sort by ${label.toLowerCase()} (click to cycle ascending → descending → off)`}
            >
              <span>{label}</span>
              {active ? (
                sort!.dir === "asc" ? (
                  <ArrowUp size={11} strokeWidth={2.5} className="beads-tree-sort-dir" />
                ) : (
                  <ArrowDown size={11} strokeWidth={2.5} className="beads-tree-sort-dir" />
                )
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        className={`beads-tree-body${canDetach ? " can-detach" : ""}`}
        role="tree"
        onDragOver={onBodyDragOver}
        onDrop={onBodyDrop}
      >
        {visible.length === 0 ? (
          <div className="beads-tree-empty">{forest.length === 0 ? "No beads to show." : "No matches."}</div>
        ) : (
          visible.map((node) => (
            <TreeRow
              key={node.bead.id}
              node={node}
              depth={0}
              selectedBeadId={activeSelectedId}
              collapsed={collapsed}
              forceExpand={filtering}
              onToggle={toggle}
              onActivate={handleActivate}
              onContextMenu={openMenu}
              drag={drag}
            />
          ))
        )}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={rowMenuItems(menu.bead)}
        />
      )}
    </div>
  );
}

function rowMenuItems(bead: Bead): ContextMenuItem[] {
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
      label: "Copy ID",
      separatorBefore: true,
      onSelect: () => vscode.postMessage({ type: "copyBeadId", beadId: bead.id }),
    },
    {
      label: "Copy title",
      onSelect: () => vscode.postMessage({ type: "copyText", text: bead.title, label: "title" }),
    },
  ];
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  selectedBeadId: string | null;
  collapsed: Set<string>;
  forceExpand: boolean;
  onToggle: (id: string) => void;
  onActivate: (beadId: string) => void;
  onContextMenu: (x: number, y: number, bead: Bead) => void;
  drag: DragApi;
}

function TreeRow({
  node,
  depth,
  selectedBeadId,
  collapsed,
  forceExpand,
  onToggle,
  onActivate,
  onContextMenu,
  drag,
}: TreeRowProps): React.ReactElement {
  const { bead, children } = node;
  const hasChildren = children.length > 0;
  const isCollapsed = !forceExpand && collapsed.has(bead.id);
  const isSelected = bead.id === selectedBeadId;
  const isDragging = drag.draggedId === bead.id;
  const isDropTarget = drag.dropTargetId === bead.id;
  const statusColor = STATUS_COLORS[bead.status] || "#888888";
  const priorityColor =
    bead.priority === undefined ? UNKNOWN_PRIORITY_COLOR : PRIORITY_COLORS[bead.priority as BeadPriority];

  return (
    <>
      <div
        className={`beads-tree-row${isSelected ? " selected" : ""}${isDragging ? " dragging" : ""}${isDropTarget ? " drop-target" : ""}`}
        role="treeitem"
        aria-expanded={hasChildren ? !isCollapsed : undefined}
        aria-selected={isSelected}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          drag.onStart(bead.id);
        }}
        onDragOver={(e) => drag.onOver(bead.id, e)}
        onDrop={(e) => {
          e.stopPropagation();
          drag.onDrop(bead.id);
        }}
        onDragEnd={drag.onEnd}
        onClick={() => onActivate(bead.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e.clientX, e.clientY, bead);
        }}
        title={`${bead.id} · ${bead.title}`}
      >
        {/* Tree column: indentation lives here (not on the row) so the Type /
            Priority columns stay aligned across depths. */}
        <span className="beads-tree-main" style={{ paddingLeft: depth * 16 }}>
          <span
            className="beads-tree-twisty"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) onToggle(bead.id);
            }}
          >
            {hasChildren ? (
              isCollapsed ? <ChevronRight size={13} strokeWidth={2} /> : <ChevronDown size={13} strokeWidth={2} />
            ) : null}
          </span>
          <span className="beads-tree-rail" style={{ backgroundColor: statusColor }} />
          {bead.type ? <TypeIcon type={bead.type} size={13} /> : null}
          <span className="beads-tree-id">{bead.id}</span>
          <span className="beads-tree-title">{bead.title}</span>
        </span>
        <span className="beads-tree-type">{bead.type ? typeLabel(bead.type) : ""}</span>
        <span className="beads-tree-prio" style={{ color: priorityColor }}>
          {bead.priority === undefined ? "—" : `P${bead.priority}`}
        </span>
      </div>
      {hasChildren && !isCollapsed
        ? children.map((child) => (
            <TreeRow
              key={child.bead.id}
              node={child}
              depth={depth + 1}
              selectedBeadId={selectedBeadId}
              collapsed={collapsed}
              forceExpand={forceExpand}
              onToggle={onToggle}
              onActivate={onActivate}
              onContextMenu={onContextMenu}
              drag={drag}
            />
          ))
        : null}
    </>
  );
}
