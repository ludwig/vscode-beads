/**
 * PanelShell - a single embeddable surface for the bottom Panel that hosts the
 * Dashboard and Issues subviews behind an in-view nav row (room for a future
 * Graph/Tree tab). One webview, one panel tab — the nav buttons live IN the
 * view (not the panel tab bar), and clicking a Dashboard card flips to the
 * Issues subview with the matching filter applied.
 *
 * The components themselves are not tied to VS Code's collapsible view model;
 * this shell just routes between them client-side.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutDashboard, ListTodo, Workflow, ListTree, Kanban, RefreshCw, ExternalLink, LucideIcon } from "lucide-react";
import { Bead, BeadsSummary, DependencyGraph, FilterSnapshot, IssuesFilter, WebviewSettings, vscode } from "../types";
import { DashboardView } from "./DashboardView";
import { IssuesView } from "./IssuesView";
import { KanbanBoard } from "./KanbanBoard";
import { GraphView } from "./graph/GraphView";
import { TreeView } from "./tree/TreeView";
import { Loading } from "../common/Loading";
import { ContextMenu } from "../common/ContextMenu";

type PanelTab = "issues" | "dashboard" | "kanban" | "graph" | "tree";

// The five persisted keys that fully define the Issues filter, read straight
// from the shared webview state blob (IssuesView's own source of truth). Used
// to seed an Issues editor tab so it opens matching the panel (vs-tle).
// Defaults mirror IssuesView's initial state (¬closed preset).
function readIssuesFilterSnapshot(): FilterSnapshot {
  const s = (vscode.getState() as Record<string, unknown> | undefined) ?? {};
  return {
    columnFilters: (s.issuesColumnFilters as { id: string; value: unknown }[] | undefined) ?? [
      { id: "status", value: ["__not-closed__"] },
    ],
    globalFilter: (s.issuesGlobalFilter as string | undefined) ?? "",
    activePreset: (s.issuesActivePreset as string | undefined) ?? "not-closed",
    readyOnly: (s.issuesReadyOnly as boolean | undefined) ?? false,
    favoritesOnly: (s.issuesFavoritesOnly as boolean | undefined) ?? false,
  };
}

interface PanelShellProps {
  summary: BeadsSummary | null;
  beads: Bead[];
  graph: DependencyGraph | null;
  loading: boolean;
  error: string | null;
  selectedBeadId: string | null;
  /** Favorite bead ids, for the views' right-click star/unstar item (vs-sd5.5). */
  favoriteIds: string[];
  /** Masked favorite ids, forwarded to the embedded IssuesView's favorites scope. */
  maskedIds: string[];
  /**
   * The LIVE parent scope (host-computed shared-filter id set, or null = all).
   * Drives the embedded Kanban/Tree/Graph scope so they track the panel filter
   * (and favorites mask) even while the Issues subview is unmounted.
   */
  parentScope: string[] | null;
  /**
   * The shared (panel) filter spec, broadcast by the host (`null` until first
   * report). Drives the common FilterBar surface of every panel view so they
   * stay linked: follower views (Kanban/Tree/Graph) render it live and publish
   * edits back via `setSharedFilter`; the leader (Issues) seeds from it on
   * (re)mount. Free-text search stays local to each view.
   */
  sharedSpec: FilterSnapshot | null;
  settings: WebviewSettings;
  issuesFilterRequest: { filter: IssuesFilter; seq: number } | null;
  // Full Issues-filter snapshot to apply, landed by an "Apply to all" broadcast
  // (vs-dzm). Forwarded to the embedded IssuesView.
  applySnapshotRequest: { snapshot: FilterSnapshot; seq: number } | null;
  showGraphRequest: { beadId: string; seq: number } | null;
  showTreeRequest: { beadId: string; seq: number } | null;
  showKanbanBeadRequest: { beadId: string; seq: number } | null;
  showIssuesBeadRequest: { beadId: string; seq: number } | null;
  focusIssuesSeq: number;
  focusKanbanSeq: number;
  focusTreeSeq: number;
}

export function PanelShell({
  summary,
  beads,
  graph,
  loading,
  error,
  selectedBeadId,
  favoriteIds,
  maskedIds,
  parentScope,
  sharedSpec,
  settings,
  issuesFilterRequest,
  applySnapshotRequest,
  showGraphRequest,
  showTreeRequest,
  showKanbanBeadRequest,
  showIssuesBeadRequest,
  focusIssuesSeq,
  focusKanbanSeq,
  focusTreeSeq,
}: PanelShellProps): React.ReactElement {
  // Issues is the default view when the panel first opens.
  const [active, setActive] = useState<PanelTab>("issues");
  // A Dashboard card click flips to Issues and carries its filter in-shell.
  const [localFilter, setLocalFilter] = useState<{ filter: IssuesFilter; seq: number } | null>(null);
  // Bead to focus on the Graph tab, set by a "View in graph" deep-link. Carried
  // into GraphView (which auto-enables Focus when it arrives).
  const [graphFocusId, setGraphFocusId] = useState<string | null>(null);
  // Reveal target for the Tree tab, set by a "show in tree" deep-link (vs-kp67).
  // Carried into TreeView, which expands ancestors + scrolls the bead into view.
  const [treeRevealRequest, setTreeRevealRequest] = useState<{ beadId: string; seq: number } | null>(null);
  // Reveal target for the Kanban tab, set by a "show in kanban" deep-link
  // (vs-wbrz). Carried into KanbanBoard, which scrolls the card into view.
  const [kanbanRevealRequest, setKanbanRevealRequest] = useState<{ beadId: string; seq: number } | null>(null);
  // Reveal target for the Issues tab, set by a "show in issues" deep-link
  // (vs-wbrz). Carried into IssuesView, which scrolls the row into view.
  const [issuesRevealRequest, setIssuesRevealRequest] = useState<{ beadId: string; seq: number } | null>(null);
  // Ids currently matching the shared (panel) filter — the LIVE parent scope
  // computed host-side. Drives the Kanban/Tree indicators and the Graph
  // "Filtered" toggle (vs-v07). Sourced from the host (not the embedded
  // IssuesView) so it stays correct even while IssuesView is unmounted and
  // updates live when the filter or the favorites mask changes.
  const filteredBeadIds = parentScope;

  // The shared filter control handed to the follower views (Kanban/Tree/Graph):
  // they render their common FilterBar surface from `sharedSpec` and publish
  // edits via `setSharedFilter`, so toggling Favorites/Ready/a chip in ANY panel
  // view updates the host spec → re-scopes → echoes back to all of them. Only
  // provided once the host has reported a spec (`sharedSpec` non-null); until
  // then followers fall back to a self-owned local filter. Each view keeps its
  // own local free-text search + collapse. Issues (the leader) instead seeds
  // from `sharedSpec` on mount — it owns/publishes rather than being controlled.
  const sharedFilter = useMemo(
    () =>
      sharedSpec
        ? {
            snapshot: sharedSpec,
            onPublish: (next: FilterSnapshot) => vscode.postMessage({ type: "setSharedFilter", snapshot: next }),
          }
        : undefined,
    [sharedSpec],
  );

  // A "View in graph" deep-link: flip to the Graph tab and focus the bead.
  // Keyed on `seq` so a repeat request for the same bead still re-fires.
  const lastShowGraphSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!showGraphRequest || lastShowGraphSeq.current === showGraphRequest.seq) {
      return;
    }
    lastShowGraphSeq.current = showGraphRequest.seq;
    setGraphFocusId(showGraphRequest.beadId);
    setActive("graph");
  }, [showGraphRequest]);

  // A "show in tree" deep-link: flip to the Tree tab and reveal the bead.
  // Keyed on `seq` so a repeat request for the same bead still re-fires.
  const lastShowTreeSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!showTreeRequest || lastShowTreeSeq.current === showTreeRequest.seq) {
      return;
    }
    lastShowTreeSeq.current = showTreeRequest.seq;
    setTreeRevealRequest(showTreeRequest);
    setActive("tree");
  }, [showTreeRequest]);

  // A "show in kanban" deep-link: flip to the Kanban tab and reveal the card.
  // Keyed on `seq` so a repeat request for the same bead still re-fires.
  const lastShowKanbanBeadSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!showKanbanBeadRequest || lastShowKanbanBeadSeq.current === showKanbanBeadRequest.seq) {
      return;
    }
    lastShowKanbanBeadSeq.current = showKanbanBeadRequest.seq;
    setKanbanRevealRequest(showKanbanBeadRequest);
    setActive("kanban");
  }, [showKanbanBeadRequest]);

  // A "show in issues" deep-link: flip to the Issues tab and reveal the row.
  // Keyed on `seq` so a repeat request for the same bead still re-fires.
  const lastShowIssuesBeadSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!showIssuesBeadRequest || lastShowIssuesBeadSeq.current === showIssuesBeadRequest.seq) {
      return;
    }
    lastShowIssuesBeadSeq.current = showIssuesBeadRequest.seq;
    setIssuesRevealRequest(showIssuesBeadRequest);
    setActive("issues");
  }, [showIssuesBeadRequest]);

  // "Show Issues": flip to the Issues tab and pulse a confirmation ring, so the
  // action reads as registered even when Issues was already showing.
  const [pulsing, setPulsing] = useState(false);
  const lastFocusIssuesSeq = useRef(0);
  useEffect(() => {
    if (focusIssuesSeq === 0 || lastFocusIssuesSeq.current === focusIssuesSeq) {
      return;
    }
    lastFocusIssuesSeq.current = focusIssuesSeq;
    setActive("issues");
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 1600);
    return () => clearTimeout(t);
  }, [focusIssuesSeq]);

  // "Show Kanban" (from the empty Details view): flip to the Kanban tab and
  // pulse the same confirmation ring (vs-6xf).
  const lastFocusKanbanSeq = useRef(0);
  useEffect(() => {
    if (focusKanbanSeq === 0 || lastFocusKanbanSeq.current === focusKanbanSeq) {
      return;
    }
    lastFocusKanbanSeq.current = focusKanbanSeq;
    setActive("kanban");
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 1600);
    return () => clearTimeout(t);
  }, [focusKanbanSeq]);

  // "Show Tree" (sidebar action): flip to the Tree tab and pulse the same
  // confirmation ring.
  const lastFocusTreeSeq = useRef(0);
  useEffect(() => {
    if (focusTreeSeq === 0 || lastFocusTreeSeq.current === focusTreeSeq) {
      return;
    }
    lastFocusTreeSeq.current = focusTreeSeq;
    setActive("tree");
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 1600);
    return () => clearTimeout(t);
  }, [focusTreeSeq]);

  const flipToIssues = (filter: IssuesFilter) => {
    setLocalFilter((prev) => ({ filter, seq: (prev?.seq ?? 0) + 1 }));
    setActive("issues");
  };

  // Lazily ask the provider for the dependency graph; only fired when the Graph
  // tab is opened so the default Issues/Dashboard path pays no extra fetch.
  const requestGraph = useCallback(() => vscode.postMessage({ type: "requestGraph" }), []);

  // Refresh: spin the icon briefly so the click reads as registered (the data
  // swap is otherwise silent). Tied to the click, not background loads.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    vscode.postMessage({ type: "refresh" });
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  // Each downstream subtab (Kanban/Tree/Graph) can independently opt out of the
  // inherited Issues filter via its FilterBar's Show-all/Show-filtered toggle —
  // the common "Filtered" capability lives in the base bar, but each instance
  // carries its own opt-out state. Issues is the source, so it has none.
  const [clearedViews, setClearedViews] = useState<Set<PanelTab>>(new Set());
  const toggleCleared = useCallback(
    (view: PanelTab) =>
      setClearedViews((prev) => {
        const next = new Set(prev);
        if (next.has(view)) next.delete(view);
        else next.add(view);
        return next;
      }),
    [],
  );
  // The toggle is only meaningful when there's an active upstream filter to drop
  // — otherwise the ribbon would misleadingly read "0 of M". A helper builds the
  // per-view props, omitting the toggle (→ no ribbon) when nothing is inherited.
  const parentScopeProps = useCallback(
    (view: PanelTab) =>
      filteredBeadIds != null
        ? { parentCleared: clearedViews.has(view), onToggleParentScope: () => toggleCleared(view) }
        : {},
    [filteredBeadIds, clearedViews, toggleCleared],
  );

  const tabs: { id: PanelTab; label: string; Icon: LucideIcon }[] = [
    { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { id: "issues", label: "Issues", Icon: ListTodo },
    { id: "kanban", label: "Kanban", Icon: Kanban },
    { id: "tree", label: "Tree", Icon: ListTree },
    { id: "graph", label: "Graph", Icon: Workflow },
  ];

  // Whether the Issues filter currently narrows to a strict subset of the board.
  // Drives the Kanban/Tree filter indicator (immediate-data views) and the
  // Graph's auto-enabled "Filtered" toggle. Stays accurate while IssuesView is
  // unmounted because filteredBeadIds holds the last published slice.
  const totalCount = beads.length;

  // Open a given tab's view in an editor tab, seeded with the panel's active
  // filter (Kanban/Tree/Graph inherit the bead-id slice, vs-nme; Issues inherits
  // the full filter spec, vs-tle). Shared by the toolbar button and the
  // right-click-a-tab context menu.
  const openInEditorTab = useCallback(
    (view: PanelTab) =>
      vscode.postMessage({
        type: "openViewInTab",
        view,
        filteredBeadIds,
        issuesFilter: view === "issues" ? readIssuesFilterSnapshot() : null,
      }),
    [filteredBeadIds],
  );
  const [tabMenu, setTabMenu] = useState<{ id: PanelTab; label: string; x: number; y: number } | null>(null);

  return (
    <div className={`panel-shell${pulsing ? " pulsing" : ""}`}>
      <nav className="panel-shell-nav" role="tablist">
        <div className="panel-shell-tabs">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active === id}
              className={`panel-shell-tab ${active === id ? "active" : ""}`}
              onClick={() => setActive(id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setTabMenu({ id, label, x: e.clientX, y: e.clientY });
              }}
            >
              <Icon size={15} strokeWidth={2} className="panel-shell-tab-icon" />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="panel-shell-actions">
          <button
            type="button"
            className="panel-shell-action"
            title="Refresh"
            aria-label="Refresh"
            onClick={handleRefresh}
          >
            <RefreshCw size={14} strokeWidth={2} className={refreshing || loading ? "spinning" : undefined} />
          </button>
          <button
            type="button"
            className="panel-shell-action"
            title={`Open ${tabs.find((t) => t.id === active)?.label ?? "view"} in an editor tab`}
            aria-label="Open in editor tab"
            onClick={() => openInEditorTab(active)}
          >
            <ExternalLink size={14} strokeWidth={2} />
          </button>
        </div>
      </nav>

      <div className="panel-shell-body">
        {active === "kanban" ? (
          <KanbanBoard
            beads={beads}
            graph={graph}
            onRequestGraph={requestGraph}
            filteredBeadIds={filteredBeadIds}
            {...parentScopeProps("kanban")}
            sharedFilter={sharedFilter}
            totalCount={totalCount}
            selectedBeadId={selectedBeadId}
            favoriteIds={favoriteIds}
            maskedIds={maskedIds}
            muteClosedIssues={settings.muteClosedIssues}
            revealRequest={kanbanRevealRequest}
            onSelectBead={(beadId) => vscode.postMessage({ type: "openBeadDetails", beadId })}
            onUpdateBead={(beadId, updates) => vscode.postMessage({ type: "updateBead", beadId, updates })}
          />
        ) : active === "tree" ? (
          <TreeView
            graph={graph}
            loading={loading}
            error={error}
            selectedBeadId={selectedBeadId}
            favoriteIds={favoriteIds}
            maskedIds={maskedIds}
            highlightFavorites={settings.highlightFavorites}
            muteClosedIssues={settings.muteClosedIssues}
            filteredBeadIds={filteredBeadIds}
            {...parentScopeProps("tree")}
            sharedFilter={sharedFilter}
            totalCount={totalCount}
            revealRequest={treeRevealRequest}
            onSelectBead={(beadId) => vscode.postMessage({ type: "openBeadDetails", beadId })}
            onRequestGraph={requestGraph}
            onRetry={() => vscode.postMessage({ type: "refresh" })}
          />
        ) : active === "graph" ? (
          <GraphView
            graph={graph}
            loading={loading}
            error={error}
            selectedBeadId={selectedBeadId}
            favoriteIds={favoriteIds}
            maskedIds={maskedIds}
            focusBeadId={graphFocusId}
            filteredBeadIds={filteredBeadIds}
            {...parentScopeProps("graph")}
            sharedFilter={sharedFilter}
            onOpenBead={(beadId) => vscode.postMessage({ type: "openBeadDetails", beadId })}
            onRequestGraph={requestGraph}
            onRetry={() => vscode.postMessage({ type: "refresh" })}
          />
        ) : active === "dashboard" ? (
          <DashboardView
            summary={summary}
            beads={beads}
            loading={loading}
            error={error}
            version={settings.extensionVersion}
            buildSha={settings.buildSha}
            buildDirty={settings.buildDirty}
            onSelectBead={(beadId) => vscode.postMessage({ type: "openBeadDetails", beadId })}
            onOpenIssues={(filter) => flipToIssues(filter)}
            onRetry={() => vscode.postMessage({ type: "refresh" })}
          />
        ) : loading && beads.length === 0 ? (
          <Loading />
        ) : (
          <IssuesView
            beads={beads}
            loading={loading}
            error={error}
            selectedBeadId={selectedBeadId}
            favoriteIds={favoriteIds}
            maskedIds={maskedIds}
            highlightFavorites={settings.highlightFavorites}
            muteClosedIssues={settings.muteClosedIssues}
            tooltipHoverDelay={settings.tooltipHoverDelay}
            issuesFilterRequest={localFilter ?? issuesFilterRequest}
            applySnapshotRequest={applySnapshotRequest}
            sharedSpec={sharedSpec}
            revealRequest={issuesRevealRequest}
            graph={graph}
            onRequestGraph={requestGraph}
            onSelectBead={(beadId) => vscode.postMessage({ type: "openBeadDetails", beadId })}
            onRetry={() => vscode.postMessage({ type: "refresh" })}
          />
        )}
      </div>

      {tabMenu && (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          items={[
            {
              label: `Open ${tabMenu.label} in editor tab`,
              onSelect: () => openInEditorTab(tabMenu.id),
            },
          ]}
          onClose={() => setTabMenu(null)}
        />
      )}
    </div>
  );
}
