/**
 * TreeView — the hierarchical Tree subview of the bottom PanelShell (vs-bw9).
 *
 * Renders beads in their parent/child hierarchy as an indented, collapsible
 * tree (file-explorer chrome) that conveys dependency lineage (gitk-ish), with
 * a filter line that narrows to matching beads while keeping the path to them.
 * Reuses the lazily-fetched dependency graph (same data as the Graph tab).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronDown, ArrowUp, ArrowDown, CornerLeftUp, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import {
  Bead,
  BeadType,
  DependencyGraph,
  PRIORITY_COLORS,
  UNKNOWN_PRIORITY_COLOR,
  BeadPriority,
  TYPE_LABELS,
  statusColor,
  statusLabel,
  isClosedStatus,
  getTypeSortOrder,
  vscode,
} from "../../types";
import { TypeIcon } from "../../common/TypeIcon";
import { FilterBar } from "../../common/FilterBar";
import { useLocalFilter, type SharedFilterControl } from "../../hooks/useLocalFilter";
import { intersect } from "../../composeScope";
import { Loading } from "../../common/Loading";
import { ErrorMessage } from "../../common/ErrorMessage";
import { ContextMenu, type ContextMenuItem } from "../../common/ContextMenu";
import { Timestamp } from "../../common/Timestamp";
import { useClickOutside } from "../../hooks/useClickOutside";
import { ancestorPath, buildForest, filterForest, filterForestByIds, subtreeIds, compareById, type BeadComparator, type TreeNode } from "./treeModel";

interface DragApi {
  draggedId: string | null;
  dropTargetId: string | null;
  onStart: (id: string) => void;
  onOver: (id: string, e: React.DragEvent) => void;
  onDrop: (id: string) => void;
  onEnd: () => void;
}

type SortKey = "id" | "type" | "title" | "priority" | "status" | "updated" | "created";

// Toggleable, fixed-width columns shown to the RIGHT of the always-on Title
// (tree) column. `width` feeds the grid template; `sortKey` ties the header to
// the sort machinery. Title stays a separate, always-on flexible column that
// occupies the indented tree area across all depths (vs-3ie).
type ColKey = "status" | "type" | "priority" | "updated" | "created";
interface TreeColumn {
  key: ColKey;
  label: string;
  /** Short header label when the full `label` is too wide for the column (e.g.
   * "Priority" wrapping in a 44px column injects whitespace); falls back to
   * `label`. The full `label` is still used in the column-toggle menu + tooltip. */
  headerLabel?: string;
  width: string;
  sortKey: SortKey;
}
const TREE_COLUMNS: TreeColumn[] = [
  { key: "status", label: "Status", width: "84px", sortKey: "status" },
  { key: "type", label: "Type", width: "56px", sortKey: "type" },
  { key: "priority", label: "Priority", headerLabel: "P", width: "38px", sortKey: "priority" },
  { key: "updated", label: "Updated", width: "92px", sortKey: "updated" },
  { key: "created", label: "Created", width: "92px", sortKey: "created" },
];
// Default visibility: Updated shown, Created hidden, to keep the tree narrow by
// default (mirrors the Issues table hiding some columns).
const DEFAULT_TREE_COLS: Record<ColKey, boolean> = {
  status: true,
  type: true,
  priority: true,
  updated: true,
  created: false,
};

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
// Parse an ISO timestamp to epoch ms; missing/invalid sorts oldest (0).
const tparse = (s?: string) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? 0 : t;
};
const cmpUpdated = (a: Bead, b: Bead) => tparse(a.updatedAt) - tparse(b.updatedAt);
const cmpCreated = (a: Bead, b: Bead) => tparse(a.createdAt) - tparse(b.createdAt);

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
    case "updated":
      return cmpUpdated;
    case "created":
      return cmpCreated;
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
  /** Favorite bead ids — drives the right-click Add/Remove Favorites item (vs-sd5.5). */
  favoriteIds?: string[];
  /** Masked favorites (eye-off), excluded from the favorites→relatives seed in
   * the Tree's own Favorites filter. */
  maskedIds?: string[];
  /** Accent favorited rows (beads.highlightFavorites, vs-or31). */
  highlightFavorites?: boolean;
  /** Gray out closed (done) row titles (beads.muteClosedIssues, vs-or31). */
  muteClosedIssues?: boolean;
  /**
   * The inherited parent scope (panel filter / editor-tab seed), or null for no
   * inherited scope. The Tree's own FilterBar composes on top of this.
   */
  filteredBeadIds: string[] | null;
  /**
   * Editor-tab only: the inherited-scope ribbon controls. When `onToggleParentScope`
   * is provided, the Tree's FilterBar shows the Show-all/Show-filtered ribbon and
   * `parentCleared` gates the inherited scope. Omitted in the panel subtab (the
   * inherited scope simply applies).
   */
  parentCleared?: boolean;
  onToggleParentScope?: () => void;
  /**
   * Panel only: controls for the shared filter surface. When provided, the
   * Tree's FilterBar common controls read/write the shared (panel) spec — linked
   * with every other panel view. Omitted in an editor tab (self-owned filter).
   */
  sharedFilter?: SharedFilterControl;
  /**
   * Panel only: shared collapse state for the FilterBar, so collapsing in one
   * panel tab is reflected in all of them. When provided, overrides the view's
   * own local collapse. Omitted in an editor tab.
   */
  filterBarCollapsed?: boolean;
  onToggleFilterBar?: () => void;
  totalCount?: number;
  /**
   * A "show in tree" deep-link target (vs-kp67): expand the bead's collapsed
   * ancestors, select it, and scroll it into view. `seq` re-fires for a repeat
   * of the same bead. Null when there's no pending reveal.
   */
  revealRequest?: { beadId: string; seq: number } | null;
  onSelectBead: (beadId: string) => void;
  onRequestGraph: () => void;
  onRetry: () => void;
}

export function TreeView({
  graph,
  loading,
  error,
  selectedBeadId,
  favoriteIds = [],
  maskedIds = [],
  highlightFavorites = true,
  muteClosedIssues = true,
  filteredBeadIds,
  parentCleared,
  onToggleParentScope,
  sharedFilter,
  filterBarCollapsed,
  onToggleFilterBar,
  totalCount,
  revealRequest,
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
  // Column visibility (vs-3ie) — persisted across reload/tab-switch like the
  // sort. Merge over defaults so a newly-added column gets its default.
  const [visibleCols, setVisibleCols] = useState<Record<ColKey, boolean>>(() => {
    const saved = (vscode.getState() as { treeColumns?: Partial<Record<ColKey, boolean>> } | undefined)?.treeColumns;
    return saved && typeof saved === "object" ? { ...DEFAULT_TREE_COLS, ...saved } : DEFAULT_TREE_COLS;
  });
  useEffect(() => {
    const prev = (vscode.getState() as Record<string, unknown>) ?? {};
    vscode.setState({ ...prev, treeColumns: visibleCols });
  }, [visibleCols]);
  const shownColumns = useMemo(() => TREE_COLUMNS.filter((c) => visibleCols[c.key]), [visibleCols]);
  // Per-column widths, drag-resizable and persisted (overrides the declared
  // default width). Only the fixed columns resize; Title stays the flexible 1fr.
  const [colWidths, setColWidths] = useState<Partial<Record<ColKey, number>>>(() => {
    const saved = (vscode.getState() as { treeColWidths?: Partial<Record<ColKey, number>> } | undefined)?.treeColWidths;
    return saved && typeof saved === "object" ? saved : {};
  });
  useEffect(() => {
    const prev = (vscode.getState() as Record<string, unknown>) ?? {};
    vscode.setState({ ...prev, treeColWidths: colWidths });
  }, [colWidths]);
  const colWidthPx = useCallback(
    (c: TreeColumn) => colWidths[c.key] ?? parseInt(c.width, 10),
    [colWidths],
  );
  // The Title (tree) column is the only flexible one; the shown fixed columns
  // follow at their (resizable) widths. Set inline so header + every row share
  // the exact same template as columns toggle on/off or resize.
  // A trailing gutter track holds the column show/hide menu in the header (like
  // the Issues table). Body rows leave it empty; sharing the template keeps the
  // fixed columns aligned between header and rows.
  const gridTemplate = useMemo(
    () => `minmax(0, 1fr) ${shownColumns.map((c) => `${colWidthPx(c)}px`).join(" ")} 28px`,
    [shownColumns, colWidthPx],
  );
  // Drag-to-resize a fixed column: the handle on a column's right edge widens/
  // narrows THAT column; the flexible Title track absorbs the delta.
  const resizeRef = useRef<{ key: ColKey; startX: number; startW: number; dir: 1 | -1 } | null>(null);
  // Set while (and just after) a resize so the header's sort onClick — which
  // fires on mouseup inside the button — doesn't also toggle the sort.
  const didResizeRef = useRef(false);
  // The handles live on each fixed column's LEFT edge (its boundary with the
  // previous track), so the Title|Status divider is grabbable. Because the
  // flexible Title track absorbs the delta, dragging a left-edge handle toward
  // Title (mouse left) WIDENS the column — hence dir = -1.
  const startColResize = useCallback(
    (e: React.MouseEvent, c: TreeColumn, dir: 1 | -1 = -1) => {
      e.preventDefault();
      e.stopPropagation();
      didResizeRef.current = true;
      resizeRef.current = { key: c.key, startX: e.clientX, startW: colWidthPx(c), dir };
      const onMove = (ev: MouseEvent) => {
        const st = resizeRef.current;
        if (!st) return;
        const next = Math.max(32, Math.min(400, st.startW + st.dir * (ev.clientX - st.startX)));
        setColWidths((prev) => ({ ...prev, [st.key]: next }));
      };
      const onUp = () => {
        resizeRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        // Clear after the click that follows mouseup has been swallowed.
        setTimeout(() => {
          didResizeRef.current = false;
        }, 0);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [colWidthPx],
  );
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useClickOutside(colMenuRef, () => setColMenuOpen(false), colMenuOpen);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; bead: Bead } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  // Highlight for the "Move to root" drop band while dragging over it.
  const [rootZoneOver, setRootZoneOver] = useState(false);

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
      bodyRef.current?.focus({ preventScroll: true }); // so arrow-key nav works after a click
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
        // Single-click already selected (passive) above. Double-click reveals
        // the Details view; triple opens an editor tab.
        if (n >= 3) vscode.postMessage({ type: "openBeadInTab", beadId: id });
        else if (n === 2) vscode.postMessage({ type: "openBeadDetails", beadId: id });
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

  // The Tree's own unified FilterBar (structured local filter), composed on top
  // of the inherited parent scope: (Filtered ? parentScope : all) ∩ resolve(local).
  const lf = useLocalFilter({
    persistKey: "treeLocalFilter",
    beads: graph?.nodes ?? [],
    edges: graph?.edges ?? [],
    favoriteIds,
    maskedIds,
    hasGraph: !!graph,
    onRequestGraph,
    shared: sharedFilter,
  });
  const inheritedScope = parentCleared ? null : filteredBeadIds;
  const finalScope = useMemo(
    () => intersect(inheritedScope, lf.localScope),
    [inheritedScope, lf.localScope],
  );

  // Scope the forest to the composed id-set (keeping ancestor paths so nodes stay
  // connected). Then narrow further by the text query.
  const scoped = useMemo(
    () => (finalScope != null ? filterForestByIds(forest, new Set(finalScope)) : forest),
    [forest, finalScope],
  );

  const total = totalCount ?? (graph?.nodes.length ?? 0);
  const scopeCount = finalScope?.length ?? total;
  const visible = useMemo(() => filterForest(scoped, query), [scoped, query]);
  // Only the text query force-expands (to reveal matches); the always-on Issues
  // scope must not, so the user can still collapse/expand within it.
  const filtering = query.trim().length > 0;
  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  // Flattened visible rows in display order, honoring collapse state — the basis
  // for keyboard row navigation (↑↓ step, ←→ collapse/expand).
  const flatVisible = useMemo(() => {
    const out: { id: string; hasChildren: boolean; isCollapsed: boolean }[] = [];
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        const hasChildren = n.children.length > 0;
        const isCollapsed = !filtering && collapsed.has(n.bead.id);
        out.push({ id: n.bead.id, hasChildren, isCollapsed });
        if (hasChildren && !isCollapsed) walk(n.children);
      }
    };
    walk(visible);
    return out;
  }, [visible, collapsed, filtering]);

  // "Show in tree" deep-link (vs-kp67): expand the target's collapsed ancestors,
  // select it, and scroll it into view. Held as pending state and retried as
  // `visible` updates, because the graph may still be loading when the request
  // arrives (the tree fetches its graph lazily on mount). If the bead is scoped
  // out by the Issues filter it simply never resolves — a harmless no-op.
  const [pendingReveal, setPendingReveal] = useState<string | null>(null);
  const lastRevealSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!revealRequest || lastRevealSeq.current === revealRequest.seq) return;
    lastRevealSeq.current = revealRequest.seq;
    setPendingReveal(revealRequest.beadId);
  }, [revealRequest]);
  useEffect(() => {
    if (!pendingReveal) return;
    const ancestors = ancestorPath(visible, pendingReveal);
    const present =
      ancestors.length > 0 || visible.some((n) => n.bead.id === pendingReveal);
    if (!present) return; // graph not loaded / bead not in scope yet — retry later
    if (ancestors.length > 0) {
      setCollapsed((prev) => {
        if (ancestors.every((a) => !prev.has(a))) return prev;
        const next = new Set(prev);
        ancestors.forEach((a) => next.delete(a));
        return next;
      });
    }
    setLocalSelectedId(pendingReveal);
    const target = pendingReveal;
    requestAnimationFrame(() => {
      bodyRef.current
        ?.querySelector(`[data-bead-id="${target}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    setPendingReveal(null);
  }, [pendingReveal, visible]);

  // Every id that owns children — the set the expand/collapse-all controls act
  // on, and the basis for the "all collapsed / all expanded" affordances (vs-fpp).
  const parentIds = useMemo(() => {
    const ids = new Set<string>();
    const walk = (nodes: typeof visible) => {
      for (const n of nodes) {
        if (n.children.length > 0) {
          ids.add(n.bead.id);
          walk(n.children);
        }
      }
    };
    walk(visible);
    return ids;
  }, [visible]);
  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(() => setCollapsed(new Set(parentIds)), [parentIds]);

  // Toggle a node's collapse state. `recursive` (shift-click) applies the
  // clicked node's *resulting* state to its whole subtree (vs-fpp) — collapse a
  // branch wholesale, or blow it fully open.
  const toggle = useCallback(
    (id: string, recursive = false) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        const willCollapse = !next.has(id);
        const targets = recursive ? subtreeIds(forest, id) : new Set([id]);
        for (const tid of targets) {
          if (willCollapse) next.add(tid);
          else next.delete(tid);
        }
        return next;
      });
    },
    [forest],
  );
  // Drives the single fold toggle: when everything's expanded the button
  // collapses all, otherwise it expands all.
  const allExpanded = [...parentIds].every((id) => !collapsed.has(id));

  // Current parent per bead (first parent-child edge from=child wins).
  const parentOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of graph?.edges ?? []) {
      if (e.type === "parent-child" && !m.has(e.from)) m.set(e.from, e.to);
    }
    return m;
  }, [graph]);

  // Keyboard row navigation (roving selection). ArrowUp/Down move the cursor and
  // never scroll the pane; ArrowRight/Left collapse/expand the focused row
  // (⇧ = whole subtree) or step to first-child / parent; Enter selects.
  const focusRowId = useCallback((id: string | undefined) => {
    if (!id) return;
    setLocalSelectedId(id);
    requestAnimationFrame(() => {
      bodyRef.current
        ?.querySelector(`[data-bead-id="${id}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }, []);
  const onTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (flatVisible.length === 0) return;
      const idx = flatVisible.findIndex((r) => r.id === activeSelectedId);
      const cur = idx >= 0 ? flatVisible[idx] : null;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          focusRowId(flatVisible[idx < 0 ? 0 : Math.min(flatVisible.length - 1, idx + 1)].id);
          break;
        case "ArrowUp":
          e.preventDefault();
          focusRowId(flatVisible[idx < 0 ? 0 : Math.max(0, idx - 1)].id);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (!cur) {
            focusRowId(flatVisible[0].id);
          } else if (cur.hasChildren && cur.isCollapsed) {
            toggle(cur.id, e.shiftKey);
          } else if (cur.hasChildren) {
            focusRowId(flatVisible[idx + 1]?.id);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (!cur) {
            focusRowId(flatVisible[0].id);
          } else if (cur.hasChildren && !cur.isCollapsed) {
            toggle(cur.id, e.shiftKey);
          } else {
            focusRowId(parentOf.get(cur.id));
          }
          break;
        case "Enter":
          e.preventDefault();
          if (cur) onSelectBead(cur.id);
          break;
        case "Home":
          e.preventDefault();
          focusRowId(flatVisible[0].id);
          break;
        case "End":
          e.preventDefault();
          focusRowId(flatVisible[flatVisible.length - 1].id);
          break;
        default:
          break;
      }
    },
    [flatVisible, activeSelectedId, focusRowId, toggle, parentOf, onSelectBead],
  );

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
          e.dataTransfer.dropEffect = "move";
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
      <FilterBar
        snapshot={lf.snapshot}
        facets={lf.facets}
        ops={lf.ops}
        count={{ shown: scopeCount, total, unit: "beads" }}
        collapsed={filterBarCollapsed ?? lf.collapsed}
        onToggleCollapsed={onToggleFilterBar ?? lf.toggleCollapsed}
        searchTerm={query}
        onClearSearch={() => setQuery("")}
        search={
          <>
            <input
              type="text"
              className="filter-bar-search-input"
              placeholder="Filter beads…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
            />
            {parentIds.size > 0 && (
              // One toggle: collapse-all when everything's expanded, else
              // expand-all. The icon reflects the action it will perform.
              <button
                type="button"
                className="beads-tree-foldbtn"
                title={
                  allExpanded
                    ? "Collapse all (⇧-click a row's chevron to collapse just its subtree)"
                    : "Expand all (⇧-click a row's chevron to expand just its subtree)"
                }
                aria-label={allExpanded ? "Collapse all" : "Expand all"}
                disabled={filtering}
                onClick={allExpanded ? collapseAll : expandAll}
              >
                {allExpanded ? (
                  <ChevronsDownUp size={15} strokeWidth={2} />
                ) : (
                  <ChevronsUpDown size={15} strokeWidth={2} />
                )}
              </button>
            )}
          </>
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
      {/* Header lives INSIDE the scroll container (sticky) so it and the rows
          share the same scrollbar-narrowed width and their columns stay aligned. */}
      <div
        ref={bodyRef}
        className={`beads-tree-body${canDetach ? " can-detach" : ""}`}
        role="tree"
        tabIndex={0}
        onKeyDown={onTreeKeyDown}
        onDragOver={onBodyDragOver}
        onDrop={onBodyDrop}
      >
      <div className="beads-tree-colheader" role="row" style={{ gridTemplateColumns: gridTemplate }}>
        {[
          { sortKey: "title" as SortKey, label: "Title", headerLabel: undefined as string | undefined, colKey: "title" },
          ...shownColumns.map((c) => ({ sortKey: c.sortKey, label: c.label, headerLabel: c.headerLabel, colKey: c.key })),
        ].map(({ sortKey, label, headerLabel, colKey }) => {
          const idx = sorts.findIndex((s) => s.key === sortKey);
          const spec = idx >= 0 ? sorts[idx] : null;
          const active = spec != null;
          return (
            <button
              key={sortKey}
              type="button"
              role="columnheader"
              aria-sort={active ? (spec!.dir === "asc" ? "ascending" : "descending") : "none"}
              className={`beads-tree-col beads-tree-col-${colKey} ${active ? "active" : ""}`}
              onClick={(e) => {
                if (didResizeRef.current) return; // just resized — don't also sort
                setSorts((prev) => applySort(prev, sortKey, e.shiftKey));
              }}
              title={`Sort by ${label.toLowerCase()} — click to sort, Shift+click to add as a secondary sort`}
            >
              <span>{headerLabel ?? label}</span>
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
              {colKey !== "title" && (
                <span
                  className="beads-tree-col-resize"
                  role="separator"
                  aria-hidden="true"
                  title="Drag to resize · double-click to reset"
                  onMouseDown={(e) => {
                    const col = TREE_COLUMNS.find((tc) => tc.key === colKey);
                    if (col) startColResize(e, col);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => {
                    // Reset BOTH columns adjacent to this divider to their default
                    // widths. Title is the flexible column — it has no stored width
                    // (it absorbs the delta), so there's nothing to reset there.
                    e.stopPropagation();
                    const key = colKey as ColKey;
                    const shownIdx = shownColumns.findIndex((c) => c.key === key);
                    const prevKey = shownIdx > 0 ? shownColumns[shownIdx - 1].key : null;
                    setColWidths((prev) => {
                      const next = { ...prev };
                      delete next[key];
                      if (prevKey) delete next[prevKey];
                      return next;
                    });
                  }}
                />
              )}
            </button>
          );
        })}
        {/* Column show/hide menu — anchored to the header's right edge (in the
            trailing gutter track), mirroring the Issues table. */}
        <div className="beads-tree-colmenu" ref={colMenuRef}>
          <button
            type="button"
            className="beads-tree-colmenu-btn"
            title="Show or hide columns"
            aria-label="Show or hide columns"
            aria-expanded={colMenuOpen}
            onClick={() => setColMenuOpen((v) => !v)}
          >
            {/* Vertical ellipsis — same "show/hide columns" affordance the Issues
                list uses (⋮), for consistency across the two tables. */}
            <span className="beads-tree-colmenu-glyph" aria-hidden="true">⋮</span>
          </button>
          {colMenuOpen && (
            <div className="col-menu beads-tree-col-menu">
              {TREE_COLUMNS.map((c) => (
                <label key={c.key}>
                  <input
                    type="checkbox"
                    checked={visibleCols[c.key]}
                    onChange={() => setVisibleCols((prev) => ({ ...prev, [c.key]: !prev[c.key] }))}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
        {visible.length === 0 ? (
          <div className="beads-tree-empty">{forest.length === 0 ? "No beads to show." : "No matches."}</div>
        ) : (
          visible.map((node) => (
            <TreeRow
              key={node.bead.id}
              node={node}
              depth={0}
              columns={shownColumns}
              gridTemplate={gridTemplate}
              selectedBeadId={activeSelectedId}
              favoriteIds={favoriteIdSet}
              highlightFavorites={highlightFavorites}
              muteClosedIssues={muteClosedIssues}
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
            isFavorite: favoriteIds.includes(menu.bead.id),
            onMoveToRoot: () => reparent(menu.bead.id, null),
          })}
        />
      )}
    </div>
  );
}

function rowMenuItems(
  bead: Bead,
  opts: { hasParent: boolean; isFavorite: boolean; onMoveToRoot: () => void },
): ContextMenuItem[] {
  return [
    {
      label: "Show Details",
      onSelect: () => vscode.postMessage({ type: "openBeadDetails", beadId: bead.id }),
    },
    {
      label: "Show in editor tab",
      onSelect: () => vscode.postMessage({ type: "openBeadInTab", beadId: bead.id }),
    },
    {
      label: opts.isFavorite ? "Remove from Favorites" : "Add to Favorites",
      separatorBefore: true,
      onSelect: () => vscode.postMessage({ type: "toggleFavorite", beadId: bead.id }),
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
    {
      label: "Copy Markdown",
      onSelect: () => vscode.postMessage({ type: "copyBeadMarkdown", beadId: bead.id }),
    },
  ];
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  /** Visible fixed columns (after the always-on Title), in display order. */
  columns: TreeColumn[];
  /** Grid template shared with the header so cells stay aligned across depths. */
  gridTemplate: string;
  selectedBeadId: string | null;
  favoriteIds: Set<string>;
  highlightFavorites: boolean;
  muteClosedIssues: boolean;
  collapsed: Set<string>;
  forceExpand: boolean;
  onToggle: (id: string, recursive?: boolean) => void;
  onActivate: (beadId: string) => void;
  onContextMenu: (x: number, y: number, bead: Bead) => void;
  drag: DragApi;
}

function TreeRow({
  node,
  depth,
  columns,
  gridTemplate,
  selectedBeadId,
  favoriteIds,
  highlightFavorites,
  muteClosedIssues,
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
  const isFavorite = highlightFavorites && favoriteIds.has(bead.id);
  const isMutedClosed = muteClosedIssues && isClosedStatus(bead.status);
  const isDragging = drag.draggedId === bead.id;
  const isDropTarget = drag.dropTargetId === bead.id;
  const priorityColor =
    bead.priority === undefined ? UNKNOWN_PRIORITY_COLOR : PRIORITY_COLORS[bead.priority as BeadPriority];

  return (
    <>
      <div
        className={`beads-tree-row${isSelected ? " selected" : ""}${isFavorite ? " favorite" : ""}${isDragging ? " dragging" : ""}${isDropTarget ? " drop-target" : ""}`}
        style={{ gridTemplateColumns: gridTemplate }}
        data-bead-id={bead.id}
        role="treeitem"
        aria-expanded={hasChildren ? !isCollapsed : undefined}
        aria-selected={isSelected}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          // Explicitly seed the drag payload + allowed effect. Without this,
          // Chromium can silently refuse to START the drag (no dragstart →
          // draggedId never set → no drop-target outline, no reparent) — which
          // regressed once the surrounding DOM changed (sticky header / a
          // focusable, keyboard-navigable body).
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", bead.id);
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
              if (hasChildren) onToggle(bead.id, e.shiftKey);
            }}
          >
            {hasChildren ? (
              isCollapsed ? <ChevronRight size={13} strokeWidth={2} /> : <ChevronDown size={13} strokeWidth={2} />
            ) : null}
          </span>
          {bead.type ? <TypeIcon type={bead.type} size={13} /> : null}
          <span className="beads-tree-id">{bead.id}</span>
          <span className={`beads-tree-title${isMutedClosed ? " muted-closed" : ""}`}>{bead.title}</span>
        </span>
        {columns.map((col) => {
          switch (col.key) {
            case "status":
              return (
                <span key="status" className="beads-tree-status" style={{ color: statusColor(bead.status) }}>
                  {statusLabel(bead.status)}
                </span>
              );
            case "type":
              return (
                <span key="type" className="beads-tree-type">
                  {bead.type ? typeLabel(bead.type) : ""}
                </span>
              );
            case "priority":
              return (
                <span key="priority" className="beads-tree-prio" style={{ color: priorityColor }}>
                  {bead.priority === undefined ? "—" : `P${bead.priority}`}
                </span>
              );
            case "updated":
              return (
                <span key="updated" className="beads-tree-time">
                  <Timestamp value={bead.updatedAt} format="date" />
                </span>
              );
            case "created":
              return (
                <span key="created" className="beads-tree-time">
                  <Timestamp value={bead.createdAt} format="date" />
                </span>
              );
            default:
              return null;
          }
        })}
      </div>
      {hasChildren && !isCollapsed
        ? children.map((child) => (
            <TreeRow
              key={child.bead.id}
              node={child}
              depth={depth + 1}
              columns={columns}
              gridTemplate={gridTemplate}
              selectedBeadId={selectedBeadId}
              favoriteIds={favoriteIds}
              highlightFavorites={highlightFavorites}
              muteClosedIssues={muteClosedIssues}
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
