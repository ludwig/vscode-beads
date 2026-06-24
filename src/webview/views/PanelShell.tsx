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

import React, { useCallback, useEffect, useRef, useState } from "react";
import { LayoutDashboard, ListTodo, Workflow, ListTree, Kanban, RefreshCw, ExternalLink, LucideIcon } from "lucide-react";
import { Bead, BeadsSummary, DependencyGraph, FilterSnapshot, IssuesFilter, WebviewSettings, vscode } from "../types";
import { DashboardView } from "./DashboardView";
import { IssuesView } from "./IssuesView";
import { KanbanBoard } from "./KanbanBoard";
import { GraphView } from "./graph/GraphView";
import { TreeView } from "./tree/TreeView";
import { Loading } from "../common/Loading";

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
  settings: WebviewSettings;
  issuesFilterRequest: { filter: IssuesFilter; seq: number } | null;
  // Full Issues-filter snapshot to apply, landed by an "Apply to all" broadcast
  // (vs-dzm). Forwarded to the embedded IssuesView.
  applySnapshotRequest: { snapshot: FilterSnapshot; seq: number } | null;
  showGraphRequest: { beadId: string; seq: number } | null;
  showTreeRequest: { beadId: string; seq: number } | null;
  focusIssuesSeq: number;
  focusKanbanSeq: number;
}

export function PanelShell({
  summary,
  beads,
  graph,
  loading,
  error,
  selectedBeadId,
  favoriteIds,
  settings,
  issuesFilterRequest,
  applySnapshotRequest,
  showGraphRequest,
  showTreeRequest,
  focusIssuesSeq,
  focusKanbanSeq,
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
  // Ids of the rows currently matching the Issues filter/search, published by
  // IssuesView. The Graph "Filtered" toggle scopes its nodes to this set
  // (vs-v07). Stays current because the filter can only change on the Issues
  // tab, and the last value persists while IssuesView is unmounted.
  const [filteredBeadIds, setFilteredBeadIds] = useState<string[] | null>(null);
  const handleFilteredBeads = useCallback((ids: string[]) => setFilteredBeadIds(ids), []);

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
  const filteredCount = filteredBeadIds?.length ?? totalCount;
  const filterActive = filteredBeadIds != null && filteredCount < totalCount;

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
            title={`Open ${tabs.find((t) => t.id === active)?.label ?? "view"} in an editor tab`}
            aria-label="Open in editor tab"
            onClick={() =>
              // Seed the new tab with the panel's active filter so it opens
              // scoped, not blank: Kanban/Tree/Graph inherit the bead-id slice
              // (vs-nme); the Issues tab inherits the full filter spec (vs-tle).
              vscode.postMessage({
                type: "openViewInTab",
                view: active,
                filteredBeadIds,
                issuesFilter: active === "issues" ? readIssuesFilterSnapshot() : null,
              })
            }
          >
            <ExternalLink size={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="panel-shell-action"
            title="Refresh"
            aria-label="Refresh"
            onClick={handleRefresh}
          >
            <RefreshCw size={14} strokeWidth={2} className={refreshing ? "spinning" : undefined} />
          </button>
        </div>
      </nav>

      <div className="panel-shell-body">
        {active === "kanban" ? (
          <KanbanBoard
            beads={beads}
            filteredBeadIds={filteredBeadIds}
            filterActive={filterActive}
            filteredCount={filteredCount}
            totalCount={totalCount}
            selectedBeadId={selectedBeadId}
            favoriteIds={favoriteIds}
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
            filteredBeadIds={filteredBeadIds}
            filterActive={filterActive}
            filteredCount={filteredCount}
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
            focusBeadId={graphFocusId}
            filteredBeadIds={filteredBeadIds}
            issuesFilterActive={filterActive}
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
            highlightFavorites={settings.highlightFavorites}
            muteClosedIssues={settings.muteClosedIssues}
            tooltipHoverDelay={settings.tooltipHoverDelay}
            issuesFilterRequest={localFilter ?? issuesFilterRequest}
            applySnapshotRequest={applySnapshotRequest}
            graph={graph}
            onRequestGraph={requestGraph}
            onFilteredBeadsChange={handleFilteredBeads}
            onSelectBead={(beadId) => vscode.postMessage({ type: "openBeadDetails", beadId })}
            onRetry={() => vscode.postMessage({ type: "refresh" })}
          />
        )}
      </div>
    </div>
  );
}
