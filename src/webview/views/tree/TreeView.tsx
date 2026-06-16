/**
 * TreeView — the hierarchical Tree subview of the bottom PanelShell (vs-bw9).
 *
 * Renders beads in their parent/child hierarchy as an indented, collapsible
 * tree (file-explorer chrome) that conveys dependency lineage (gitk-ish), with
 * a filter line that narrows to matching beads while keeping the path to them.
 * Reuses the lazily-fetched dependency graph (same data as the Graph tab).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronDown, Search, ArrowUp, ArrowDown, CornerLeftUp } from "lucide-react";
import {
  Bead,
  BeadType,
  DependencyGraph,
  PRIORITY_COLORS,
  UNKNOWN_PRIORITY_COLOR,
  BeadPriority,
  TYPE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  getTypeSortOrder,
  vscode,
} from "../../types";
import { TypeIcon } from "../../common/TypeIcon";
import { FilterIndicator } from "../../common/FilterIndicator";
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

type SortKey = "id" | "type" | "title" | "priority" | "status";

// Sortable tree-table columns. Clicking a header cycles asc → desc → off; the
// "off" state is the natural id order (so id sort needs no dedicated column).
// The Title header occupies the indented tree column; Status/Type/Priority align
// in fixed columns across all depths. (The Status column replaces the old
// per-row colored rail.)
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "type", label: "Type" },
  { key: "priority", label: "Priority" },
];

type SortDir = "asc" | "desc";
interface SortSpec {
  key: SortKey;
  dir: SortDir;
}

// Click a header to make it the sole (primary) sort, cycling asc → desc → off.
// Shift-click adds/cycles it as an additional (secondary, …) level, so the Tree
// supports multi-column sort with explicit precedence (index 0 = primary).
function applySort(prev: SortSpec[], key: SortKey, additive: boolean): SortSpec[] {
  const existing = prev.find((s) => s.key === key);
  if (additive) {
    if (!existing) return [...prev, { key, dir: "asc" }];
    if (existing.dir === "asc") return prev.map((s) => (s.key === key ? { key, dir: "desc" } : s));
    return prev.filter((s) => s.key !== key); // asc → desc → drop this level
  }
  // Non-additive: this column becomes the only sort, cycling its own direction.
  if (!existing || prev.length > 1) return [{ key, dir: "asc" }];
  if (existing.dir === "asc") return [{ key, dir: "desc" }];
  return []; // back to the default (natural id order)
}

// Pure per-key comparators (return 0 on a tie) so chained levels actually defer
// to the next; the final compareById is the stable tiebreak.
const cmpTitle = (a: Bead, b: Bead) => a.title.localeCompare(b.title);
const cmpType = (a: Bead, b: Bead) => getTypeSortOrder(a.type) - getTypeSortOrder(b.type);
// P0 (highest) first; missing priority sorts last.
const cmpPriority = (a: Bead, b: Bead) => (a.priority ?? 99) - (b.priority ?? 99);
// Workflow order: open → in_progress → blocked → closed.
const STATUS_ORDER: Record<string, number> = { open: 0, in_progress: 1, blocked: 2, closed: 3 };
const cmpStatus = (a: Bead, b: Bead) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);

function baseComparator(key: SortKey): BeadComparator {
  switch (key) {
    case "title":
      return cmpTitle;
    case "type":
      return cmpType;
    case "priority":
      return cmpPriority;
    case "status":
      return cmpStatus;
    default:
      return compareById;
  }
}

// Chain the sort specs in precedence order; fall through to the next level on a
// tie, then to a stable id order.
function comparatorFor(sorts: SortSpec[]): BeadComparator {
  if (sorts.length === 0) return compareById;
  return (a, b) => {
    for (const s of sorts) {
      const r = baseComparator(s.key)(a, b);
      if (r !== 0) return s.dir === "asc" ? r : -r;
    }
    return compareById(a, b);
  };
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
  /** Whether the Issues filter narrows to a strict subset (drives the indicator). */
  filterActive?: boolean;
  filteredCount?: number;
  totalCount?: number;
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
  filterActive,
  filteredCount,
  totalCount,
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
  const [sorts, setSorts] = useState<SortSpec[]>(() => {
    const saved = (vscode.getState() as { treeSort?: unknown } | undefined)?.treeSort;
    if (Array.isArray(saved)) return saved as SortSpec[];
    // Migrate the old single-sort shape ({ key, dir } | null).
    if (saved && typeof saved === "object" && "key" in saved) return [saved as SortSpec];
    return [];
  });
  useEffect(() => {
    const prev = (vscode.getState() as Record<string, unknown>) ?? {};
    vscode.setState({ ...prev, treeSort: sorts });
  }, [sorts]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; bead: Bead } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  // Highlight for the "Move to root" drop band while dragging over it.
  const [rootZoneOver, setRootZoneOver] = useState(false);

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
    () => (graph ? buildForest(graph.nodes, graph.edges, comparatorFor(sorts)) : []),
    [graph, sorts],
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
      setRootZoneOver(false);
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
        {filterActive && (
          <FilterIndicator
            count={filteredCount ?? 0}
            total={totalCount ?? 0}
            className="beads-tree-filter-indicator"
          />
        )}
      </div>
      <div className="beads-tree-colheader" role="row">
        {COLUMNS.map(({ key, label }) => {
          const idx = sorts.findIndex((s) => s.key === key);
          const spec = idx >= 0 ? sorts[idx] : null;
          const active = spec != null;
          return (
            <button
              key={key}
              type="button"
              role="columnheader"
              aria-sort={active ? (spec!.dir === "asc" ? "ascending" : "descending") : "none"}
              className={`beads-tree-col beads-tree-col-${key} ${active ? "active" : ""}`}
              onClick={(e) => setSorts((prev) => applySort(prev, key, e.shiftKey))}
              title={`Sort by ${label.toLowerCase()} — click to sort, Shift+click to add as a secondary sort`}
            >
              <span>{label}</span>
              {active ? (
                spec!.dir === "asc" ? (
                  <ArrowUp size={11} strokeWidth={2.5} className="beads-tree-sort-dir" />
                ) : (
                  <ArrowDown size={11} strokeWidth={2.5} className="beads-tree-sort-dir" />
                )
              ) : null}
              {active && sorts.length > 1 ? (
                <span className="beads-tree-sort-rank">{idx + 1}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {canDetach && (
        <div
          className={`beads-tree-rootzone${rootZoneOver ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setRootZoneOver(true);
            setDropTargetId(null);
          }}
          onDragLeave={() => setRootZoneOver(false)}
          onDrop={(e) => {
            e.stopPropagation();
            setRootZoneOver(false);
            onBodyDrop();
          }}
        >
          <CornerLeftUp size={13} strokeWidth={2} />
          <span>Move to root</span>
        </div>
      )}
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
          items={rowMenuItems(menu.bead, {
            hasParent: parentOf.has(menu.bead.id),
            onMoveToRoot: () => reparent(menu.bead.id, null),
          })}
        />
      )}
    </div>
  );
}

function rowMenuItems(
  bead: Bead,
  opts: { hasParent: boolean; onMoveToRoot: () => void },
): ContextMenuItem[] {
  return [
    {
      label: "Open Details (editor tab)",
      onSelect: () => vscode.postMessage({ type: "openBeadInTab", beadId: bead.id }),
    },
    {
      label: "Show Details",
      onSelect: () => vscode.postMessage({ type: "openBeadDetails", beadId: bead.id }),
    },
    ...(opts.hasParent
      ? [
          {
            label: "Move to root",
            separatorBefore: true,
            onSelect: opts.onMoveToRoot,
          } satisfies ContextMenuItem,
        ]
      : []),
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
    {
      label: "Copy JSON",
      onSelect: () => vscode.postMessage({ type: "copyBeadJson", beadId: bead.id }),
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
            Priority columns stay aligned across depths. One guide line per
            ancestor level draws the subtle hierarchy rails (file-explorer style). */}
        <span className="beads-tree-main">
          {depth > 0 && (
            <span className="beads-tree-guides" aria-hidden="true">
              {Array.from({ length: depth }, (_, i) => (
                <span key={i} className="beads-tree-guide" />
              ))}
            </span>
          )}
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
          {bead.type ? <TypeIcon type={bead.type} size={13} /> : null}
          <span className="beads-tree-id">{bead.id}</span>
          <span className="beads-tree-title">{bead.title}</span>
        </span>
        <span className="beads-tree-status" style={{ color: STATUS_COLORS[bead.status] }}>
          {STATUS_LABELS[bead.status] ?? bead.status}
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
