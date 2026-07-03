/**
 * IssuesView
 *
 * Main table/list view for issues using TanStack Table v8.
 * Features:
 * - Multi-column sorting (shift+click for secondary sort)
 * - Column resizing
 * - Column reordering (drag & drop)
 * - Faceted filtering with counts
 * - Column visibility toggle
 * - State persistence (sort order, column visibility, column order survive reloads)
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  flexRender,
  createColumnHelper,
  ColumnFiltersState,
  ColumnResizeMode,
} from "@tanstack/react-table";
import {
  Bead,
  BeadStatus,
  BeadPriority,
  BeadType,
  DependencyGraph,
  IssuesFilter,
  FilterSnapshot,
  STATUS_LABELS,
  isClosedStatus,
  statusLabel,
  statusColor,
  PRIORITY_COLORS,
  TYPE_LABELS,
  TYPE_COLORS,
  TYPE_SORT_ORDER,
  getTypeSortOrder,
  sortLabels,
  vscode,
} from "../types";
import { readyBeadIds } from "../../backend/readyBeads";
import { favoritesWithRelatives, favoriteRowClass } from "../../backend/favoritesScope";
import { needsDependencyGraph } from "../../backend/dependencyGraphGate";
import { StatusBadge } from "../common/StatusBadge";
import { PriorityBadge } from "../common/PriorityBadge";
import { TypeBadge } from "../common/TypeBadge";
import { TypeIcon } from "../common/TypeIcon";
import { LabelBadge } from "../common/LabelBadge";
import { FilterChip } from "../common/FilterChip";
import { ContextMenu, type ContextMenuItem } from "../common/ContextMenu";
import { Rows3, Rows2, Rocket, Star, Share2 } from "lucide-react";
import {
  NOT_CLOSED,
  matchType,
  matchStatus,
  matchPriority,
  matchLabels,
  matchAssignee,
  matchSearch,
} from "../../backend/filterPredicates";
import { FILTER_PRESETS } from "../filterPresets";
import { ErrorMessage } from "../common/ErrorMessage";
import { Loading } from "../common/Loading";
import { Dropdown, DropdownItem } from "../common/Dropdown";
import { Timestamp, timestampSortingFn } from "../common/Timestamp";
import { AutocompleteInput, AutocompleteOption } from "../common/AutocompleteInput";
import { Markdown } from "../common/Markdown";
import { triggerToast } from "../common/Toast";
import { getLabelColorStyle } from "../utils/label-colors";
import { useClickOutside } from "../hooks/useClickOutside";
import { useColumnState } from "../hooks/useColumnState";

interface IssuesViewProps {
  beads: Bead[];
  loading: boolean;
  error: string | null;
  selectedBeadId: string | null;
  /** Favorite bead ids — drives the right-click Add/Remove Favorites item (vs-sd5.5). */
  favoriteIds?: string[];
  /**
   * Masked favorite ids (eye-off in the Favorites filter group). Excluded from
   * the favorites→relatives seed expansion — that's the only effect here; the
   * Issues list just reflects the resulting expansion (no per-row eye/marking).
   */
  maskedIds?: string[];
  /** When true, favorited rows get a subtle accent (beads.highlightFavorites, vs-lu8f). */
  highlightFavorites?: boolean;
  /** When true, gray out the titles of closed (done) issues (beads.muteClosedIssues, vs-on5g). */
  muteClosedIssues?: boolean;
  tooltipHoverDelay: number; // 0 = disabled
  /** Drill-in filter pushed from another view (e.g. a Dashboard card/badge). */
  issuesFilterRequest?: { filter: IssuesFilter; seq: number } | null;
  /**
   * Full Issues-filter snapshot to apply wholesale — seeds an editor tab on
   * open (vs-tle) and lands an "Apply to all" broadcast (vs-dzm). `seq` re-fires
   * an identical snapshot.
   */
  applySnapshotRequest?: { snapshot: FilterSnapshot; seq: number } | null;
  /**
   * A "show in issues" deep-link target (vs-wbrz): select the bead's row and
   * scroll it into view. `seq` re-fires for a repeat of the same bead. If the
   * bead is filtered out of the current view, selection still applies but the
   * scroll is a no-op (the row isn't rendered). Null when there's no pending
   * reveal.
   */
  revealRequest?: { beadId: string; seq: number } | null;
  /** True in an editor-tab Issues view — gates the "Apply to all" action (vs-dzm). */
  isEditorTab?: boolean;
  /**
   * Dependency graph (nodes + edges), used by the "Ready" toggle to compute
   * open-with-no-open-blocker beads. Lazily fetched via onRequestGraph.
   */
  graph?: DependencyGraph | null;
  onRequestGraph?: () => void;
  onSelectBead: (beadId: string) => void;
  onRetry: () => void;
  /**
   * Published whenever the visible (filtered) row set changes, so the shell can
   * scope the Graph view to the same slice (vs-v07). Carries the matching bead
   * ids in current filter/search order.
   */
  onFilteredBeadsChange?: (beadIds: string[]) => void;
}

// Issue types sorted by TYPE_SORT_ORDER (epic first)
const ISSUE_TYPES = Object.keys(TYPE_SORT_ORDER).sort(
  (a, b) => getTypeSortOrder(a) - getTypeSortOrder(b)
);

// Custom sorting function for type columns (epic first)
const typeSortingFn = (rowA: { getValue: (id: string) => unknown }, rowB: { getValue: (id: string) => unknown }) => {
  const a = getTypeSortOrder(rowA.getValue("type") as string | undefined);
  const b = getTypeSortOrder(rowB.getValue("type") as string | undefined);
  return a - b;
};

// Shape of the slice of the shared webview state blob this view persists
// (vs-1q1). Keys are namespaced so they coexist with the column-layout /
// readyOnly keys other hooks/views store in the same blob.
interface PersistedIssuesState {
  issuesColumnFilters?: ColumnFiltersState;
  issuesGlobalFilter?: string;
  issuesActivePreset?: string;
}

// Sentinel status-filter value for the symbolic ¬closed preset (vs-x6b option B):
// a TRUE exclusion ("status is not in the closed/done category"), evaluated
// per-row by the shared matchStatus predicate rather than an OR of enumerated
// statuses — so it renders as a single ¬closed chip and never drifts as the
// status set grows. Imported from filterPredicates (single source of truth,
// shared with the host-side resolveScope).

const columnHelper = createColumnHelper<Bead>();

export function IssuesView({
  beads,
  loading,
  error,
  selectedBeadId,
  favoriteIds = [],
  maskedIds = [],
  highlightFavorites = true,
  muteClosedIssues = true,
  tooltipHoverDelay,
  issuesFilterRequest,
  applySnapshotRequest,
  revealRequest,
  isEditorTab = false,
  graph,
  onRequestGraph,
  onSelectBead,
  onRetry,
  onFilteredBeadsChange,
}: IssuesViewProps): React.ReactElement {
  // Persisted column state (sorting, visibility, order)
  const defaultVisibility = {
    labels: false,
    assignee: false,
    estimate: false,
  };
  const {
    sorting,
    setSorting,
    columnVisibility,
    setColumnVisibility,
    columnOrder,
    setColumnOrder,
    compact,
    setCompact,
    resetVisibility,
    resetSorting,
  } = useColumnState({
    defaultSorting: [{ id: "updatedAt", desc: true }],
    defaultVisibility,
    defaultCompact: true, // compact (packed rows) is the default; persisted choice wins
  });

  // Active filters + search persist across reloads and Panel-tab switches
  // (IssuesView unmounts when another tab is active, so plain state would
  // forget them). Merged into the same shared vscode state blob as the column
  // layout / readyOnly so we don't clobber the Tree's persisted sort (vs-1q1).
  const persisted = (vscode.getState() as PersistedIssuesState | undefined) ?? {};
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    () =>
      persisted.issuesColumnFilters ?? [
        { id: "status", value: [NOT_CLOSED] }, // Default: ¬closed (symbolic)
      ],
  );
  const [globalFilter, setGlobalFilter] = useState(() => persisted.issuesGlobalFilter ?? "");
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  // UI state
  // Optimistic selection: highlight the clicked row instantly instead of waiting
  // for the extension to echo setSelectedBeadId back (the round trip read as
  // selection lag). Cleared whenever the authoritative prop updates so external
  // selections still win.
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  useEffect(() => setLocalSelectedId(null), [selectedBeadId]);
  const activeSelectedId = localSelectedId ?? selectedBeadId;
  const selectRow = useCallback(
    (id: string) => {
      setLocalSelectedId(id);
      onSelectBead(id);
    },
    [onSelectBead],
  );
  // "Ready" filter (vs-bo9): show only open beads with no open blocker. Composes
  // with the column filters/search (it narrows the data they then filter). Needs
  // the dependency graph, fetched lazily on first enable.
  // Persisted across tab switches (IssuesView unmounts when another Panel tab is
  // active, so plain state would forget it). Merged into the shared state blob so
  // we don't clobber the Tree's persisted sort.
  const [readyOnly, setReadyOnly] = useState<boolean>(
    () => (vscode.getState() as { issuesReadyOnly?: boolean } | undefined)?.issuesReadyOnly ?? false,
  );
  useEffect(() => {
    const prev = (vscode.getState() as Record<string, unknown>) ?? {};
    vscode.setState({ ...prev, issuesReadyOnly: readyOnly });
  }, [readyOnly]);
  // "Favorites" filter (vs-sd5.6): show starred beads AND their relatives —
  // the 1-hop dependency neighbors over any edge (vs-sd5.7), so a favorite
  // appears with its context rather than stripped bare. Needs the dependency
  // graph (fetched lazily on first enable, like Ready). Persisted like readyOnly
  // and composes with it + the column filters/search.
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(
    () => (vscode.getState() as { issuesFavoritesOnly?: boolean } | undefined)?.issuesFavoritesOnly ?? false,
  );
  useEffect(() => {
    const prev = (vscode.getState() as Record<string, unknown>) ?? {};
    vscode.setState({ ...prev, issuesFavoritesOnly: favoritesOnly });
  }, [favoritesOnly]);
  const toggleFavoritesOnly = useCallback(() => {
    setFavoritesOnly((on) => {
      // `!on` is the post-toggle state: enabling needs the graph to resolve relatives.
      if (needsDependencyGraph(!on, !!graph)) onRequestGraph?.();
      return !on;
    });
  }, [graph, onRequestGraph]);
  // A Ready/Favorites filter restored as active from persisted state needs the
  // dependency graph just like a freshly-toggled one, but the lazy fetch lives in
  // the toggle handlers — which never run on mount. Without this, a restored
  // Favorites filter renders each favorite stripped of its 1-hop relatives (and
  // Ready can't filter at all) until the user toggles the filter off and on
  // (vs-mbqc). Mount-only: later enables are handled by the toggle callbacks.
  useEffect(() => {
    if (needsDependencyGraph(readyOnly || favoritesOnly, !!graph)) onRequestGraph?.();
  }, []); // mount-only by design — see comment above
  const readySet = useMemo(() => {
    if (!graph) return null;
    const blocks = graph.edges.filter((e) => e.type === "blocks");
    return new Set(readyBeadIds(beads, blocks));
  }, [graph, beads]);
  // Hidden (eye-off) ids as a set for O(1) per-row lookups (stripe + toggle).
  const maskedIdSet = useMemo(() => new Set(maskedIds), [maskedIds]);
  // Favorites + their 1-hop neighbors (relatives), or null when the filter is
  // off. Until the graph loads it's just the favorites themselves. Masked
  // favorites are dropped from the SEED so they neither appear nor expand into
  // their relatives — the Favorites filter group's mask, applied here.
  const favoritesScope = useMemo(
    () =>
      favoritesOnly
        ? favoritesWithRelatives(
            favoriteIds.filter((id) => !maskedIdSet.has(id)),
            graph?.edges ?? [],
          )
        : null,
    [favoritesOnly, favoriteIds, maskedIdSet, graph],
  );
  // Set for O(1) per-row favorite lookups when applying the row highlight (vs-lu8f).
  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const tableData = useMemo(() => {
    let rows = beads;
    if (readyOnly && readySet) rows = rows.filter((b) => readySet.has(b.id));
    if (favoritesScope) rows = rows.filter((b) => favoritesScope.has(b.id));
    return rows;
  }, [readyOnly, readySet, favoritesScope, beads]);
  const toggleReady = useCallback(() => {
    setReadyOnly((on) => {
      // `!on` is the post-toggle state: enabling needs the graph the first time.
      if (needsDependencyGraph(!on, !!graph)) onRequestGraph?.();
      return !on;
    });
  }, [graph, onRequestGraph]);
  const [activePreset, setActivePreset] = useState<string>(() => persisted.issuesActivePreset ?? "not-closed");
  // Persist filters + search + preset whenever they change (merge, don't clobber).
  useEffect(() => {
    const prev = (vscode.getState() as Record<string, unknown>) ?? {};
    vscode.setState({
      ...prev,
      issuesColumnFilters: columnFilters,
      issuesGlobalFilter: globalFilter,
      issuesActivePreset: activePreset,
    });
  }, [columnFilters, globalFilter, activePreset]);
  const [filterBarOpen, setFilterBarOpen] = useState(true);
  const [filterMenuOpen, setFilterMenuOpen] = useState<string | null>(null);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const columnMenuRef = useRef<HTMLTableCellElement>(null);

  // Tooltip state
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get hovered bead content for tooltip
  const hoveredBead = useMemo(() => {
    if (!hoveredRowId) return null;
    return beads.find((b) => b.id === hoveredRowId);
  }, [hoveredRowId, beads]);

  const handleRowMouseEnter = useCallback((e: React.MouseEvent<HTMLElement>, beadId: string) => {
    // Skip if tooltips are disabled
    if (tooltipHoverDelay === 0) return;

    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 300;
    const tooltipMaxHeight = 200;
    const padding = 8;

    // Position below the row, left-aligned with some offset
    let left = rect.left + 20;
    let top = rect.bottom + padding;

    // Keep tooltip within viewport horizontally
    if (left + tooltipWidth > window.innerWidth - padding) {
      left = window.innerWidth - tooltipWidth - padding;
    }

    // Check if tooltip would overflow below viewport
    const spaceBelow = window.innerHeight - rect.bottom - padding;
    const spaceAbove = rect.top - padding;

    if (spaceBelow < tooltipMaxHeight && spaceAbove > spaceBelow) {
      // Position above the row when there's more space above
      top = rect.top - tooltipMaxHeight - padding;
      // Clamp to viewport top
      if (top < padding) {
        top = padding;
      }
    }

    tooltipTimeoutRef.current = setTimeout(() => {
      setHoveredRowId(beadId);
      setTooltipPosition({ top, left });
    }, tooltipHoverDelay);
  }, [tooltipHoverDelay]);

  const handleRowMouseLeave = useCallback(() => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    setHoveredRowId(null);
    setTooltipPosition(null);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  // Click outside to close menus
  useClickOutside(filterMenuRef, () => setFilterMenuOpen(null), !!filterMenuOpen);
  useClickOutside(columnMenuRef, () => setColumnMenuOpen(false), columnMenuOpen);

  // Apply a drill-in filter pushed from another view (Dashboard card/badge).
  // Sets the named dimensions (status, labels) and clears the others so the
  // list matches the clicked slice. Keyed by seq so an identical repeat
  // request still re-applies.
  const lastFilterSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!issuesFilterRequest || lastFilterSeq.current === issuesFilterRequest.seq) {
      return;
    }
    lastFilterSeq.current = issuesFilterRequest.seq;

    const statuses = issuesFilterRequest.filter.statuses ?? [];
    const labels = issuesFilterRequest.filter.labels ?? [];
    const types = issuesFilterRequest.filter.types ?? [];
    setColumnFilters((prev) => {
      const others = prev.filter((f) => f.id !== "status" && f.id !== "labels" && f.id !== "type");
      if (statuses.length > 0) others.push({ id: "status", value: statuses });
      if (labels.length > 0) others.push({ id: "labels", value: labels });
      if (types.length > 0) others.push({ id: "type", value: types });
      return others;
    });
    // Reflect a matching status preset in the dropdown when one lines up and
    // no label filter is in play; otherwise it's a custom filter.
    const matched =
      labels.length === 0
        ? FILTER_PRESETS.find(
            (p) =>
              p.statuses.length === statuses.length &&
              p.statuses.every((s) => statuses.includes(s))
          )
        : undefined;
    setActivePreset(matched ? matched.id : "");
  }, [issuesFilterRequest]);

  // Apply a full filter snapshot wholesale (vs-tle seed-on-open / vs-dzm "Apply
  // to all"). Sets all five filter dimensions at once; keyed by seq so an
  // identical snapshot still re-applies. Distinct from issuesFilterRequest
  // above, which only carries the narrow status/label/type drill-in slice.
  const lastSnapshotSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!applySnapshotRequest || lastSnapshotSeq.current === applySnapshotRequest.seq) {
      return;
    }
    lastSnapshotSeq.current = applySnapshotRequest.seq;
    const s = applySnapshotRequest.snapshot;
    setColumnFilters(s.columnFilters as ColumnFiltersState);
    setGlobalFilter(s.globalFilter);
    setActivePreset(s.activePreset);
    setReadyOnly(s.readyOnly);
    setFavoritesOnly(s.favoritesOnly);
  }, [applySnapshotRequest]);

  // "Show in issues" deep-link (vs-wbrz): select the target's row and scroll it
  // into view. Held as pending state and retried as `beads` updates, because the
  // list may still be loading when the request arrives. Selection always
  // applies; if the bead is filtered out of the current view its row isn't
  // rendered, so the scroll is a harmless no-op. Mirrors the Tree's idiom.
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [pendingReveal, setPendingReveal] = useState<string | null>(null);
  const lastRevealSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!revealRequest || lastRevealSeq.current === revealRequest.seq) return;
    lastRevealSeq.current = revealRequest.seq;
    setPendingReveal(revealRequest.beadId);
  }, [revealRequest]);
  useEffect(() => {
    if (!pendingReveal) return;
    if (!beads.some((b) => b.id === pendingReveal)) return; // list not loaded yet — retry later
    selectRow(pendingReveal);
    const id = pendingReveal;
    requestAnimationFrame(() => {
      tableContainerRef.current
        ?.querySelector(`[data-bead-id="${id}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    setPendingReveal(null);
  }, [pendingReveal, beads, selectRow]);

  // Column definitions
  const columns = useMemo(
    () => [
      columnHelper.accessor("type", {
        id: "icon",
        header: "",
        size: 28,
        minSize: 28,
        maxSize: 28,
        enableResizing: false,
        cell: (info) =>
          info.getValue() ? (
            <TypeIcon type={info.getValue() as BeadType} size={16} />
          ) : null,
        sortingFn: typeSortingFn,
      }),
      columnHelper.accessor("type", {
        header: "Type",
        // Wider so the shared-width badge clears the cell's 24px padding (vs-xy5).
        size: 78,
        minSize: 30,
        cell: (info) =>
          info.getValue() ? (
            <TypeBadge type={info.getValue() as BeadType} size="small" />
          ) : null,
        sortingFn: typeSortingFn,
        filterFn: (row, _columnId, filterValue: string[]) => matchType(row.original, filterValue),
      }),
      columnHelper.accessor("title", {
        header: "Title",
        size: 200,
        minSize: 100,
        cell: (info) => (
          <span className="title-inner">
            <span
              className={`bead-id ${copiedId === info.row.original.id ? "copied" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                handleCopyId(info.row.original.id);
                selectRow(info.row.original.id);
              }}
              title={copiedId === info.row.original.id ? "Copied!" : "Click to copy"}
            >
              {info.row.original.id}
            </span>
            <span
              className={`bead-title${
                muteClosedIssues && isClosedStatus(info.row.original.status) ? " muted-closed" : ""
              }`}
            >
              {info.getValue()}
            </span>
          </span>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        // Wider so the longest "In Progress" badge isn't clipped at the right (vs-xy5).
        size: 96,
        minSize: 30,
        cell: (info) => <StatusBadge status={info.getValue()} size="small" />,
        // ¬closed (NOT_CLOSED) + explicit-membership handled by the shared matcher.
        filterFn: (row, _columnId, filterValue: BeadStatus[]) => matchStatus(row.original, filterValue),
      }),
      columnHelper.accessor("priority", {
        header: "Priority",
        size: 70,
        minSize: 30,
        cell: (info) =>
          info.getValue() !== undefined ? (
            <PriorityBadge priority={info.getValue()!} size="small" />
          ) : null,
        filterFn: (row, _columnId, filterValue: BeadPriority[]) => matchPriority(row.original, filterValue),
      }),
      columnHelper.accessor("labels", {
        header: "Labels",
        size: 100,
        minSize: 30,
        enableSorting: false,
        cell: (info) => (
          <>
            {sortLabels(info.getValue()).map((label) => (
              <LabelBadge key={label} label={label} />
            ))}
          </>
        ),
        filterFn: (row, _columnId, filterValue: string[]) => matchLabels(row.original, filterValue),
      }),
      columnHelper.accessor("assignee", {
        header: "Assignee",
        size: 80,
        minSize: 30,
        cell: (info) => info.getValue() || "-",
        filterFn: (row, _columnId, filterValue: string[]) => matchAssignee(row.original, filterValue),
      }),
      columnHelper.accessor("estimatedMinutes", {
        id: "estimate",
        header: "Estimate",
        size: 70,
        minSize: 30,
        cell: (info) => (info.getValue() ? `${info.getValue()}m` : "-"),
      }),
      columnHelper.accessor("updatedAt", {
        header: "Updated",
        size: 80,
        minSize: 30,
        cell: (info) => <Timestamp value={info.getValue()} format="auto" />,
        sortingFn: timestampSortingFn,
      }),
      columnHelper.accessor("createdAt", {
        header: "Created",
        size: 80,
        minSize: 30,
        cell: (info) => <Timestamp value={info.getValue()} format="auto" />,
        sortingFn: timestampSortingFn,
      }),
    ],
    [copiedId, selectRow, muteClosedIssues]
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnVisibility,
      columnOrder,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    globalFilterFn: (row, _columnId, filterValue: string) => matchSearch(row.original, filterValue),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    columnResizeMode: "onChange" as ColumnResizeMode,
    enableColumnResizing: true,
  });

  const handleCopyId = useCallback((beadId: string) => {
    vscode.postMessage({ type: "copyBeadId", beadId });
    setCopiedId(beadId);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; bead: Bead } | null>(null);

  const rowMenuItems = useCallback(
    (bead: Bead): ContextMenuItem[] => [
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
        label: favoriteIds.includes(bead.id) ? "Remove from Favorites" : "Add to Favorites",
        separatorBefore: true,
        onSelect: () => vscode.postMessage({ type: "toggleFavorite", beadId: bead.id }),
      },
      {
        label: "Copy ID",
        separatorBefore: true,
        onSelect: () => handleCopyId(bead.id),
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
    ],
    [handleCopyId, favoriteIds],
  );

  // Filter helpers
  const statusFilter = (columnFilters.find((f) => f.id === "status")?.value || []) as BeadStatus[];
  const priorityFilter = (columnFilters.find((f) => f.id === "priority")?.value || []) as BeadPriority[];
  const typeFilter = (columnFilters.find((f) => f.id === "type")?.value || []) as string[];
  const assigneeFilter = (columnFilters.find((f) => f.id === "assignee")?.value || []) as string[];
  const labelFilter = (columnFilters.find((f) => f.id === "labels")?.value || []) as string[];
  const hasActiveFilters = statusFilter.length > 0 || priorityFilter.length > 0 || typeFilter.length > 0 || assigneeFilter.length > 0 || labelFilter.length > 0;
  // Count of active filters surfaced on the toggle badge (vs-dd7): every filter
  // chip (one per value), plus the Ready/Favorites toggles and an active text
  // search. The preset isn't counted separately — its status values already
  // show up as chips.
  const activeFilterCount =
    statusFilter.length +
    priorityFilter.length +
    typeFilter.length +
    assigneeFilter.length +
    labelFilter.length +
    (readyOnly ? 1 : 0) +
    (favoritesOnly ? 1 : 0) +
    (globalFilter.trim() ? 1 : 0);

  const applyPreset = (presetId: string) => {
    const preset = FILTER_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setColumnFilters((prev) =>
        prev
          .filter((f) => f.id !== "status")
          .concat(preset.statuses.length > 0 ? [{ id: "status", value: preset.statuses }] : [])
      );
      setActivePreset(presetId);
    }
  };

  const addStatusFilter = (status: BeadStatus) => {
    // Picking an explicit status leaves the symbolic ¬closed preset: drop the
    // sentinel and start a concrete status list.
    const base = statusFilter.filter((s) => s !== NOT_CLOSED);
    if (!base.includes(status)) {
      setColumnFilters((prev) => {
        const others = prev.filter((f) => f.id !== "status");
        return [...others, { id: "status", value: [...base, status] }];
      });
      setActivePreset("");
    }
    setFilterMenuOpen(null);
  };

  const removeStatusFilter = (status: BeadStatus) => {
    const newStatuses = statusFilter.filter((s) => s !== status);
    setColumnFilters((prev) => {
      const others = prev.filter((f) => f.id !== "status");
      return newStatuses.length > 0
        ? [...others, { id: "status", value: newStatuses }]
        : others;
    });
    setActivePreset("");
  };

  // Clear the status filter entirely (used by the single ¬closed chip's remove);
  // semantically equivalent to the "All" preset.
  const clearStatusFilter = () => {
    setColumnFilters((prev) => prev.filter((f) => f.id !== "status"));
    setActivePreset("all");
  };

  const addPriorityFilter = (priority: BeadPriority) => {
    if (!priorityFilter.includes(priority)) {
      setColumnFilters((prev) => {
        const others = prev.filter((f) => f.id !== "priority");
        return [...others, { id: "priority", value: [...priorityFilter, priority] }];
      });
      setActivePreset("");
    }
    setFilterMenuOpen(null);
  };

  const addTypeFilter = (type: string) => {
    if (!typeFilter.includes(type)) {
      setColumnFilters((prev) => {
        const others = prev.filter((f) => f.id !== "type");
        return [...others, { id: "type", value: [...typeFilter, type] }];
      });
      setActivePreset("");
    }
    setFilterMenuOpen(null);
  };

  const removePriorityFilter = (priority: BeadPriority) => {
    const newPriorities = priorityFilter.filter((p) => p !== priority);
    setColumnFilters((prev) => {
      const others = prev.filter((f) => f.id !== "priority");
      return newPriorities.length > 0
        ? [...others, { id: "priority", value: newPriorities }]
        : others;
    });
    setActivePreset("");
  };

  const removeTypeFilter = (type: string) => {
    const newTypes = typeFilter.filter((t) => t !== type);
    setColumnFilters((prev) => {
      const others = prev.filter((f) => f.id !== "type");
      return newTypes.length > 0
        ? [...others, { id: "type", value: newTypes }]
        : others;
    });
    setActivePreset("");
  };

  const addAssigneeFilter = (assignee: string) => {
    if (!assigneeFilter.includes(assignee)) {
      setColumnFilters((prev) => {
        const others = prev.filter((f) => f.id !== "assignee");
        return [...others, { id: "assignee", value: [...assigneeFilter, assignee] }];
      });
      setActivePreset("");
    }
    setFilterMenuOpen(null);
  };

  const removeAssigneeFilter = (assignee: string) => {
    const newAssignees = assigneeFilter.filter((a) => a !== assignee);
    setColumnFilters((prev) => {
      const others = prev.filter((f) => f.id !== "assignee");
      return newAssignees.length > 0
        ? [...others, { id: "assignee", value: newAssignees }]
        : others;
    });
    setActivePreset("");
  };

  const addLabelFilter = (label: string) => {
    if (!labelFilter.includes(label)) {
      setColumnFilters((prev) => {
        const others = prev.filter((f) => f.id !== "labels");
        return [...others, { id: "labels", value: [...labelFilter, label] }];
      });
      setActivePreset("");
    }
    setFilterMenuOpen(null);
  };

  const removeLabelFilter = (label: string) => {
    const newLabels = labelFilter.filter((l) => l !== label);
    setColumnFilters((prev) => {
      const others = prev.filter((f) => f.id !== "labels");
      return newLabels.length > 0
        ? [...others, { id: "labels", value: newLabels }]
        : others;
    });
    setActivePreset("");
  };

  const clearAllFilters = () => {
    setColumnFilters([]);
    setGlobalFilter("");
    setActivePreset("all");
    setReadyOnly(false);
    setFavoritesOnly(false);
  };

  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = beads.length;

  // Get faceted counts for filters (counts based on OTHER active filters, not this column)
  const statusFacets = table.getColumn("status")?.getFacetedUniqueValues() ?? new Map();
  const priorityFacets = table.getColumn("priority")?.getFacetedUniqueValues() ?? new Map();
  const typeFacets = table.getColumn("type")?.getFacetedUniqueValues() ?? new Map();
  const assigneeFacets = table.getColumn("assignee")?.getFacetedUniqueValues() ?? new Map();

  // Unfiltered counts per status (for kanban empty state messaging)
  // Get unique assignees from facets for filter menu
  const uniqueAssignees = useMemo(() => {
    const assignees = Array.from(assigneeFacets.keys()).filter((a): a is string => typeof a === "string" && a !== "");
    return assignees.sort();
  }, [assigneeFacets]);

  // Count unassigned issues
  const unassignedCount = useMemo(() => {
    // Count null/undefined/empty assignees
    let count = 0;
    for (const [key, value] of assigneeFacets.entries()) {
      if (!key || key === "") {
        count += value;
      }
    }
    return count;
  }, [assigneeFacets]);

  // Get unique labels and counts from filtered rows (labels are arrays, so facets don't work directly)
  const { uniqueLabels, labelCounts, unlabeledCount } = useMemo(() => {
    const counts = new Map<string, number>();
    let unlabeled = 0;
    const filteredRows = table.getFilteredRowModel().rows;
    for (const row of filteredRows) {
      const labels = row.original.labels;
      if (!labels || labels.length === 0) {
        unlabeled++;
      } else {
        for (const label of labels) {
          counts.set(label, (counts.get(label) || 0) + 1);
        }
      }
    }
    const sorted = Array.from(counts.keys()).sort();
    return { uniqueLabels: sorted, labelCounts: counts, unlabeledCount: unlabeled };
  }, [table.getFilteredRowModel().rows]);

  // Publish the filtered bead ids upward so the shell can scope the Graph view
  // to the same slice (vs-v07). Fires whenever the filter/search result changes.
  const filteredBeadIds = useMemo(
    () => table.getFilteredRowModel().rows.map((r) => r.original.id),
    [table.getFilteredRowModel().rows],
  );
  useEffect(() => {
    onFilteredBeadsChange?.(filteredBeadIds);
  }, [filteredBeadIds, onFilteredBeadsChange]);

  // "Apply to all" (vs-dzm): broadcast this editor tab's filter to every open
  // surface. Ships both the full spec (for Issues views) and the computed ids
  // (for Kanban/Tree/Graph), so the extension never re-runs filter logic. A
  // discrete user action — no continuous sync, no cross-webview race.
  const handleApplyToAll = useCallback(() => {
    const snapshot: FilterSnapshot = {
      columnFilters,
      globalFilter,
      activePreset,
      readyOnly,
      favoritesOnly,
    };
    vscode.postMessage({ type: "applyFilterGlobally", snapshot, filteredBeadIds });
    triggerToast("Applied this filter to all open views", "top-right");
  }, [columnFilters, globalFilter, activePreset, readyOnly, favoritesOnly, filteredBeadIds]);

  // Publish the shared (panel) filter to the host so it recomputes the LIVE
  // parent scope for every other view. Only the panel's Issues view owns the
  // shared filter — an editor-tab Issues view gets its own local filter (Phase 2)
  // and must not clobber the shared one.
  useEffect(() => {
    if (isEditorTab) return;
    const snapshot: FilterSnapshot = { columnFilters, globalFilter, activePreset, readyOnly, favoritesOnly };
    vscode.postMessage({ type: "setSharedFilter", snapshot });
  }, [isEditorTab, columnFilters, globalFilter, activePreset, readyOnly, favoritesOnly]);

  // Build label autocomplete options
  const labelOptions = useMemo((): AutocompleteOption[] => {
    const options: AutocompleteOption[] = [];
    // Add "Unlabeled" option first if available
    if (!labelFilter.includes("__unlabeled__") && unlabeledCount > 0) {
      options.push({
        value: "__unlabeled__",
        label: "Unlabeled",
        count: unlabeledCount,
      });
    }
    // Add all unique labels not already filtered
    for (const label of uniqueLabels) {
      if (!labelFilter.includes(label)) {
        options.push({
          value: label,
          label: label,
          count: labelCounts.get(label) ?? 0,
          render: () => (
            <>
              <LabelBadge label={label} />
              <span className="autocomplete-option-count">({labelCounts.get(label) ?? 0})</span>
            </>
          ),
        });
      }
    }
    return options;
  }, [uniqueLabels, labelCounts, unlabeledCount, labelFilter]);

  return (
    <div className="beads-panel">
      {/* Row 1: filter/density toggles (left, easy to reach) + search */}
      <div className="panel-toolbar-compact">
        <button
          className={`filter-toggle ${filterBarOpen || hasActiveFilters ? "active" : ""}`}
          onClick={() => setFilterBarOpen(!filterBarOpen)}
          title={activeFilterCount > 0 ? `Filters (${activeFilterCount} active)` : "Filters"}
          aria-label={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : "Filters"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 10.5v-1h4v1H6zm-2-3v-1h8v1H4zm-2-3v-1h12v1H2z" />
          </svg>
          {activeFilterCount > 0 && (
            <span className="filter-toggle-badge">{activeFilterCount}</span>
          )}
        </button>
        <button
          className={`compact-toggle ${compact ? "active" : ""}`}
          onClick={() => setCompact((c) => !c)}
          title={compact ? "Comfortable rows" : "Compact rows"}
          aria-pressed={compact}
        >
          {compact ? <Rows2 size={14} /> : <Rows3 size={14} />}
        </button>
        <div className="search-input-wrapper">
          <input
            type="text"
            className="search-input-compact"
            placeholder="Search..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
          {globalFilter && (
            <button
              className="search-clear-btn"
              onClick={() => setGlobalFilter("")}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
        {isEditorTab && (
          <button
            className="apply-all-btn"
            onClick={handleApplyToAll}
            title="Apply this tab's filter to the panel and every open view"
          >
            <Share2 size={13} strokeWidth={2} />
            <span>Apply to all</span>
          </button>
        )}
      </div>

      {/* Row 2: Filter bar */}
      {(filterBarOpen || hasActiveFilters) && (
        <div className="filter-bar">
          <Dropdown
            trigger={FILTER_PRESETS.find((p) => p.id === activePreset)?.label || "Custom"}
            className="preset-dropdown"
            triggerClassName="preset-dropdown-btn"
            menuClassName="preset-dropdown-menu"
          >
            {FILTER_PRESETS.map((preset) => (
              <DropdownItem
                key={preset.id}
                className="preset-option"
                active={activePreset === preset.id}
                onClick={() => applyPreset(preset.id)}
              >
                {preset.label}
              </DropdownItem>
            ))}
          </Dropdown>

          {/* Ready toggle (vs-bo9) — composes with the presets/filter chips. */}
          <button
            type="button"
            className={`ready-toggle ${readyOnly ? "active" : ""}`}
            aria-pressed={readyOnly}
            onClick={toggleReady}
            title="Show only ready-to-work beads (open, no open blocker). Composes with the other filters."
          >
            {readyOnly ? (
              <span className="ready-toggle-glyph ready-toggle-emoji" aria-hidden="true">🚀</span>
            ) : (
              <Rocket size={12} strokeWidth={2.25} className="ready-toggle-glyph" />
            )}
            <span>Ready</span>
          </button>

          {/* Favorites toggle (vs-sd5.6/.7) — favorites + their relatives. */}
          <button
            type="button"
            className={`ready-toggle favorites-toggle ${favoritesOnly ? "active" : ""}`}
            aria-pressed={favoritesOnly}
            onClick={toggleFavoritesOnly}
            title="Show favorited (starred) beads and their relatives (direct dependency neighbors). Composes with the other filters."
          >
            <Star size={12} strokeWidth={2.25} />
            <span>Favorites</span>
          </button>

          {/* Active filter chips */}
          {statusFilter.includes(NOT_CLOSED) ? (
            <FilterChip
              key="status-not-closed"
              // Plain "not closed" copy (the ¬ logic-notation read poorly here),
              // kept distinct via the negated styling: green ("open"/active palette
              // color, not the gray of the closed state it excludes) + bold fill
              // so it reads as the active working set (vs-th4z).
              label="not closed"
              accentColor={statusColor("open")}
              negated
              onRemove={clearStatusFilter}
            />
          ) : (
            statusFilter.map((status) => (
              <FilterChip
                key={`status-${status}`}
                label={statusLabel(status)}
                accentColor={statusColor(status)}
                onRemove={() => removeStatusFilter(status)}
              />
            ))
          )}
          {priorityFilter.map((priority) => (
            <FilterChip
              key={`priority-${priority}`}
              label={`p${priority}`}
              accentColor={PRIORITY_COLORS[priority]}
              onRemove={() => removePriorityFilter(priority)}
            />
          ))}
          {typeFilter.map((type) => (
            <FilterChip
              key={`type-${type}`}
              label={TYPE_LABELS[type as BeadType] || type}
              accentColor={TYPE_COLORS[type as BeadType]}
              onRemove={() => removeTypeFilter(type)}
            />
          ))}
          {assigneeFilter.map((assignee) => (
            <FilterChip
              key={`assignee-${assignee}`}
              label={assignee === "__unassigned__" ? "Unassigned" : assignee}
              accentColor="#6b7280"
              onRemove={() => removeAssigneeFilter(assignee)}
            />
          ))}
          {labelFilter.map((label) => (
            <FilterChip
              key={`label-${label}`}
              label={label === "__unlabeled__" ? "Unlabeled" : label}
              accentColor={label === "__unlabeled__" ? "#6b7280" : getLabelColorStyle(label).backgroundColor}
              onRemove={() => removeLabelFilter(label)}
            />
          ))}

          {/* Add filter dropdown with faceted counts */}
          <div className="filter-add-wrapper" ref={filterMenuRef}>
            <button
              className="filter-add-btn"
              onClick={() => setFilterMenuOpen(filterMenuOpen === "main" ? null : "main")}
            >
              + Filter
            </button>

            {filterMenuOpen === "main" && (
              <div className="filter-menu">
                <button onClick={() => setFilterMenuOpen("status")}>Status <span className="menu-chevron">›</span></button>
                <button onClick={() => setFilterMenuOpen("priority")}>Priority <span className="menu-chevron">›</span></button>
                <button onClick={() => setFilterMenuOpen("type")}>Type <span className="menu-chevron">›</span></button>
                <button onClick={() => setFilterMenuOpen("assignee")}>Assignee <span className="menu-chevron">›</span></button>
                <button onClick={() => setFilterMenuOpen("label")}>Label <span className="menu-chevron">›</span></button>
              </div>
            )}

            {filterMenuOpen === "status" && (
              <div className="filter-menu">
                {(Object.keys(STATUS_LABELS) as BeadStatus[])
                  .filter((s) => !statusFilter.includes(s))
                  .map((status) => {
                    const count = statusFacets.get(status) ?? 0;
                    return (
                      <button key={status} onClick={() => addStatusFilter(status)}>
                        <StatusBadge status={status} size="small" />
                        <span className="facet-count">({count})</span>
                      </button>
                    );
                  })}
                <button className="back-btn" onClick={() => setFilterMenuOpen("main")}>← Back</button>
              </div>
            )}

            {filterMenuOpen === "priority" && (
              <div className="filter-menu">
                {([0, 1, 2, 3, 4] as BeadPriority[])
                  .filter((p) => !priorityFilter.includes(p))
                  .map((priority) => {
                    const count = priorityFacets.get(priority) ?? 0;
                    return (
                      <button key={priority} onClick={() => addPriorityFilter(priority)}>
                        <PriorityBadge priority={priority} size="small" />
                        <span className="facet-count">({count})</span>
                      </button>
                    );
                  })}
                <button className="back-btn" onClick={() => setFilterMenuOpen("main")}>← Back</button>
              </div>
            )}

            {filterMenuOpen === "type" && (
              <div className="filter-menu">
                {ISSUE_TYPES
                  .filter((t) => !typeFilter.includes(t))
                  .map((type) => {
                    const count = typeFacets.get(type) ?? 0;
                    return (
                      <button key={type} onClick={() => addTypeFilter(type)}>
                        <TypeBadge type={type as BeadType} size="small" />
                        <span className="facet-count">({count})</span>
                      </button>
                    );
                  })}
                <button className="back-btn" onClick={() => setFilterMenuOpen("main")}>← Back</button>
              </div>
            )}

            {filterMenuOpen === "assignee" && (
              <div className="filter-menu">
                {!assigneeFilter.includes("__unassigned__") && unassignedCount > 0 && (
                  <button onClick={() => addAssigneeFilter("__unassigned__")}>
                    <span className="assignee-name">Unassigned</span>
                    <span className="facet-count">({unassignedCount})</span>
                  </button>
                )}
                {uniqueAssignees
                  .filter((a) => !assigneeFilter.includes(a))
                  .map((assignee) => {
                    const count = assigneeFacets.get(assignee) ?? 0;
                    return (
                      <button key={assignee} onClick={() => addAssigneeFilter(assignee)}>
                        <span className="assignee-name">{assignee}</span>
                        <span className="facet-count">({count})</span>
                      </button>
                    );
                  })}
                {uniqueAssignees.length === 0 && unassignedCount === 0 && (
                  <span className="filter-menu-empty">No assignees</span>
                )}
                <button className="back-btn" onClick={() => setFilterMenuOpen("main")}>← Back</button>
              </div>
            )}

            {filterMenuOpen === "label" && (
              <div className="filter-menu filter-menu-label">
                <AutocompleteInput
                  placeholder="Search labels..."
                  options={labelOptions}
                  onSelect={(value) => {
                    addLabelFilter(value);
                    setFilterMenuOpen(null);
                  }}
                  autoFocus
                  showAllOnFocus
                />
                <button className="back-btn" onClick={() => setFilterMenuOpen("main")}>← Back</button>
              </div>
            )}
          </div>

          {hasActiveFilters && (
            <button className="filter-reset" onClick={clearAllFilters}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <ErrorMessage
          message={error}
          onRetry={onRetry}
        />
      )}

      {/* Table */}
      {!error && (
        <div className="beads-table-wrapper">
          {loading && (
            <div className="issues-loading-state">
              <Loading />
            </div>
          )}
          <div ref={tableContainerRef} className={`beads-table-container ${table.getState().columnSizingInfo.isResizingColumn ? "resizing" : ""}`}>
            <table
              className={`beads-table ${compact ? "compact" : ""}`}
              style={{ minWidth: table.getCenterTotalSize() }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        // Title flexes (width:auto) to absorb all slack so the
                        // other columns render at their fixed, clip-safe widths
                        // (vs-xy5) instead of inflating to fill width:100%.
                        style={header.column.id === "title" ? {} : { width: header.getSize() }}
                        className={`${header.column.id}-th ${header.column.getCanSort() ? "sortable" : ""} ${draggedColumn === header.id ? "dragging" : ""} ${dragOverColumn === header.id && draggedColumn !== header.id ? "drag-over" : ""}`}
                        onClick={header.column.getToggleSortingHandler()}
                        draggable={!isResizing}
                        onDragStart={(e) => {
                          if (isResizing) {
                            e.preventDefault();
                            return;
                          }
                          setDraggedColumn(header.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (draggedColumn && draggedColumn !== header.id) {
                            setDragOverColumn(header.id);
                          }
                        }}
                        onDragLeave={() => {
                          setDragOverColumn(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedColumn && draggedColumn !== header.id) {
                            const currentOrder = table.getAllLeafColumns().map((c) => c.id);
                            const dragIdx = currentOrder.indexOf(draggedColumn);
                            const dropIdx = currentOrder.indexOf(header.id);
                            const newOrder = [...currentOrder];
                            newOrder.splice(dragIdx, 1);
                            newOrder.splice(dropIdx, 0, draggedColumn);
                            setColumnOrder(newOrder);
                          }
                          setDraggedColumn(null);
                          setDragOverColumn(null);
                        }}
                        onDragEnd={() => {
                          setDraggedColumn(null);
                          setDragOverColumn(null);
                        }}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() && (
                          <span className="sort-indicator">
                            {header.column.getIsSorted() === "asc" ? "▲" : "▼"}
                          </span>
                        )}
                        <span
                          className="resize-handle"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setIsResizing(true);
                            const resizeHandler = header.getResizeHandler();
                            resizeHandler(e);
                            // Clear resizing state on mouseup
                            const handleMouseUp = () => {
                              setIsResizing(false);
                              document.removeEventListener("mouseup", handleMouseUp);
                            };
                            document.addEventListener("mouseup", handleMouseUp);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            setIsResizing(true);
                            const resizeHandler = header.getResizeHandler();
                            resizeHandler(e);
                            const handleTouchEnd = () => {
                              setIsResizing(false);
                              document.removeEventListener("touchend", handleTouchEnd);
                            };
                            document.addEventListener("touchend", handleTouchEnd);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          title="Drag to resize · double-click to fit contents"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (!header.column.getCanResize()) return;
                            const tableEl = (e.currentTarget as HTMLElement).closest("table");
                            if (!tableEl) return;
                            // Cells clip with overflow:hidden, so scrollWidth is the
                            // full (unclipped) content width incl. padding (border-box).
                            const id = header.column.id;
                            const cells = tableEl.querySelectorAll<HTMLElement>(
                              `.${CSS.escape(id)}-th, .${CSS.escape(id)}-cell`
                            );
                            let max = 0;
                            cells.forEach((c) => {
                              if (c.scrollWidth > max) max = c.scrollWidth;
                            });
                            if (max <= 0) return;
                            const { minSize = 0, maxSize = Number.MAX_SAFE_INTEGER } =
                              header.column.columnDef;
                            const fitted = Math.min(Math.max(max + 2, minSize), maxSize);
                            table.setColumnSizing((prev) => ({ ...prev, [id]: fitted }));
                          }}
                        />
                      </th>
                    ))}
                    <th className="col-menu-th" ref={columnMenuRef}>
                      <button
                        className="col-menu-btn"
                        onClick={() => setColumnMenuOpen(!columnMenuOpen)}
                        title="Show/hide columns"
                      >
                        ⋮
                      </button>
                      {columnMenuOpen && (
                        <div className="col-menu">
                          {table.getAllLeafColumns().map((column) => (
                            <label key={column.id}>
                              <input
                                type="checkbox"
                                checked={column.getIsVisible()}
                                onChange={column.getToggleVisibilityHandler()}
                              />
                              {typeof column.columnDef.header === "string"
                                ? column.columnDef.header
                                : column.id}
                            </label>
                          ))}
                          <hr className="col-menu-divider" />
                          <button
                            className="col-menu-reset"
                            onClick={() => {
                              resetSorting();
                              setColumnMenuOpen(false);
                            }}
                          >
                            Reset sort
                          </button>
                          <button
                            className="col-menu-reset"
                            onClick={() => {
                              resetVisibility();
                              setColumnMenuOpen(false);
                            }}
                          >
                            Reset columns
                          </button>
                        </div>
                      )}
                    </th>
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={table.getVisibleLeafColumns().length + 1}
                      className="empty-row"
                    >
                      {loading ? "Loading..." : "No issues matching filter"}
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      data-bead-id={row.original.id}
                      onClick={() => selectRow(row.original.id)}
                      onDoubleClick={() => vscode.postMessage({ type: "openBeadInTab", beadId: row.original.id })}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setRowMenu({ x: e.clientX, y: e.clientY, bead: row.original });
                      }}
                      className={`bead-row ${row.original.id === activeSelectedId ? "selected" : ""} ${favoriteRowClass(row.original.id, favoriteIdSet, highlightFavorites)}`}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const isIcon = cell.column.id === "icon";
                        return (
                          <td
                            key={cell.id}
                            className={`${cell.column.id}-cell${isIcon ? " icon-cell-hoverable" : ""}`}
                            style={cell.column.id === "title" ? {} : { width: cell.column.getSize() }}
                            onMouseEnter={isIcon ? (e) => handleRowMouseEnter(e, row.original.id) : undefined}
                            onMouseLeave={isIcon ? handleRowMouseLeave : undefined}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                      <td className="row-spacer" />
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Filtered count overlay */}
          {(hasActiveFilters || globalFilter || readyOnly) && filteredCount !== totalCount && (
            <div className="filter-count-overlay">
              {filteredCount} of {totalCount}
            </div>
          )}
        </div>
      )}


      {/* Markdown tooltip */}
      {hoveredBead && tooltipPosition && (hoveredBead.description || hoveredBead.title) &&
        createPortal(
          <div
            className="markdown-tooltip"
            style={{
              top: tooltipPosition.top,
              left: tooltipPosition.left,
            }}
          >
            <Markdown
              content={hoveredBead.description || hoveredBead.title}
              className="markdown-tooltip-content"
            />
          </div>,
          document.body
        )}

      {rowMenu && (
        <ContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          items={rowMenuItems(rowMenu.bead)}
          onClose={() => setRowMenu(null)}
        />
      )}
    </div>
  );
}
