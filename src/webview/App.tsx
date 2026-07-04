/**
 * Main App Component
 *
 * Routes to the appropriate view based on viewType.
 * Manages global state and message passing with the extension.
 */

import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import {
  Bead,
  BeadsProject,
  BeadsSummary,
  DependencyGraph,
  ExtensionMessage,
  FavoriteBead,
  FilterSnapshot,
  InitWizardPhase,
  IssuesFilter,
  WebviewSettings,
  vscode,
} from "./types";
import { DashboardView } from "./views/DashboardView";
import { RepositoryView } from "./views/RepositoryView";
import { IssuesView } from "./views/IssuesView";
import { GraphView } from "./views/graph/GraphView";
import { KanbanBoard } from "./views/KanbanBoard";
import { TreeView } from "./views/tree/TreeView";
import { DetailsView } from "./views/DetailsView";
import { ProjectSwitcherView } from "./views/ProjectSwitcherView";
import { BoardInitWizard } from "./views/BoardInitWizard";
import { PanelShell } from "./views/PanelShell";
import { CreateBeadForm } from "./views/CreateBeadForm";
import { Loading } from "./common/Loading";
import { ToastProvider, triggerToast } from "./common/Toast";

interface AppState {
  viewType: string;
  project: BeadsProject | null;
  projects: BeadsProject[];
  beads: Bead[];
  selectedBead: Bead | null;
  selectedBeadId: string | null;
  summary: BeadsSummary | null;
  graph: DependencyGraph | null;
  loading: boolean;
  error: string | null;
  settings: WebviewSettings;
  createMode: boolean;
  // Drill-in filter pushed from another view (e.g. a Dashboard card/badge).
  // `seq` changes on every request so the Issues view re-applies even if the
  // filter is identical to last time.
  issuesFilterRequest: { filter: IssuesFilter; seq: number } | null;
  // Deep-link to focus a bead on the Graph tab, pushed from another view (e.g.
  // the Details/table "View in graph" action). `seq` changes on every request
  // so the panel re-switches to Graph even if it's the same bead as last time.
  showGraphRequest: { beadId: string; seq: number } | null;
  // Same shape, for the Tree tab "show in tree" action (vs-kp67): switch to the
  // Tree tab and reveal the bead. `seq` re-fires for a repeat of the same bead.
  showTreeRequest: { beadId: string; seq: number } | null;
  // Same shape, for the Kanban tab "show in kanban" action (vs-wbrz): switch to
  // the Kanban tab and reveal the bead's card.
  showKanbanBeadRequest: { beadId: string; seq: number } | null;
  // Same shape, for the Issues tab "show in issues" action (vs-wbrz): switch to
  // the Issues tab and reveal the bead's row.
  showIssuesBeadRequest: { beadId: string; seq: number } | null;
  // Bumped to switch the panel to the Issues tab + pulse a confirmation ring.
  focusIssuesSeq: number;
  // Bumped to switch the panel to the Kanban tab (vs-6xf).
  focusKanbanSeq: number;
  focusTreeSeq: number;
  // Bumped when this (editor-tab) webview is revealed/opened, to flash a
  // confirmation ring so the tab is easy to spot (vs-c59).
  pulseSeq: number;
  // Extension-host RSS (bytes), sampled periodically for the Active Project
  // card (vs-f50). 0 until the first sample arrives.
  memoryBytes: number;
  // Per-tab Back/Forward enablement for an editor-tab Details view (vs-9u8).
  tabNav: { canBack: boolean; canForward: boolean };
  // The active project's favorites, in curated order, resolved to summaries
  // for display (vs-sd5.1). Shared by the Favorites section + Details star.
  favorites: FavoriteBead[];
  // Latest companion-doc state from the host, keyed by bead id, so the Details
  // "seed to Claude" toggle reflects whether that bead's companion is open
  // (vs-nr3d). The view only trusts the entry matching the shown bead.
  companion: { beadId: string; open: boolean } | null;
  // The LIVE parent scope: the shared (panel) filter's matching id set,
  // recomputed host-side and pushed on any change (setParentScope). `null` = no
  // active filter (all beads). Replaces the frozen one-time seed — an editor-tab
  // Kanban/Tree/Graph inherits the panel's scope and now tracks it live.
  parentScope: string[] | null;
  // The shared (panel Issues) Favorites-only filter bit, reported by the host so
  // the dashboard's Favorites-card star reflects it (full-duplex probe).
  sharedFavoritesOnly: boolean;
  // The full shared (panel) filter spec, broadcast by the host so every panel
  // view renders its common FilterBar surface in sync (the shared base).
  // `null` until the host reports one — this deliberately carries NO fabricated
  // default so it never clobbers the leader (Issues) view's own persisted
  // default at cold-load first render (a stale default here was the old race).
  sharedSpec: FilterSnapshot | null;
  // True when the user has temporarily dropped the inherited scope via the
  // ribbon's "Show all" (vs-zq2). The scope itself is retained so they can flip
  // back to "Show filtered". Local to this webview (the "Filtered" toggle).
  seedFilterCleared: boolean;
  // A full Issues-filter snapshot to apply to the IssuesView — seeds an Issues
  // editor tab on open (vs-tle) and lands an "Apply to all" broadcast (vs-dzm).
  // `seq` bumps each time so an identical snapshot still re-applies.
  applySnapshotRequest: { snapshot: FilterSnapshot; seq: number } | null;
  // Board-init wizard state (vs-r6a1.8): the projects root to compose the
  // target path, and the current init phase + message (form until a submit).
  initWizard: { projectsRoot: string; phase: InitWizardPhase; message?: string };
  // Repository Details page metrics (vs-beoh/vs-emyj): raw `bd dolt status` +
  // derived running flag, the on-disk .beads dir size, and the most recent bead
  // update. `null` until the host posts setRepositoryInfo.
  repositoryInfo: {
    doltStatus: string;
    running: boolean;
    dbSizeBytes?: number;
    lastActivity?: string | null;
  } | null;
}

const initialState: AppState = {
  viewType: "",
  project: null,
  projects: [],
  beads: [],
  selectedBead: null,
  selectedBeadId: null,
  summary: null,
  graph: null,
  loading: true,
  error: null,
  settings: {
    renderMarkdown: true,
    highlightFavorites: true,
    favoritesHighlightColor: "#dcc173",
    muteClosedIssues: true,
    userId: "",
    tooltipHoverDelay: 1000,
    extensionVersion: "",
    buildSha: "",
    buildDirty: false,
    isEditorTab: false,
    bundleBytes: 0,
  },
  createMode: false,
  issuesFilterRequest: null,
  showGraphRequest: null,
  showTreeRequest: null,
  showKanbanBeadRequest: null,
  showIssuesBeadRequest: null,
  focusIssuesSeq: 0,
  focusKanbanSeq: 0,
  focusTreeSeq: 0,
  pulseSeq: 0,
  memoryBytes: 0,
  tabNav: { canBack: false, canForward: false },
  favorites: [],
  companion: null,
  parentScope: null,
  sharedFavoritesOnly: false,
  sharedSpec: null,
  seedFilterCleared: false,
  applySnapshotRequest: null,
  initWizard: { projectsRoot: "", phase: "form" },
  repositoryInfo: null,
};

export function App(): React.ReactElement {
  const [state, setState] = useState<AppState>(initialState);

  // Handle messages from the extension
  const handleMessage = useCallback((event: MessageEvent<ExtensionMessage>) => {
    const message = event.data;

    switch (message.type) {
      case "setInitWizard":
        setState((prev) => ({
          ...prev,
          initWizard: { projectsRoot: message.projectsRoot, phase: "form" },
        }));
        break;

      case "setInitProgress":
        setState((prev) => ({
          ...prev,
          initWizard: { ...prev.initWizard, phase: message.phase, message: message.message },
        }));
        break;

      case "setViewType":
        setState((prev) => ({ ...prev, viewType: message.viewType }));
        break;
      case "setProject":
        setState((prev) => ({ ...prev, project: message.project }));
        break;
      case "setProjects":
        setState((prev) => ({ ...prev, projects: message.projects }));
        break;
      case "setBeads":
        setState((prev) => ({ ...prev, beads: message.beads }));
        break;
      case "setBead":
        setState((prev) => ({ ...prev, selectedBead: message.bead }));
        break;
      case "setSelectedBeadId":
        setState((prev) => ({ ...prev, selectedBeadId: (message as { type: "setSelectedBeadId"; beadId: string | null }).beadId }));
        break;
      case "setSummary":
        setState((prev) => ({ ...prev, summary: message.summary }));
        break;
      case "setRepositoryInfo":
        setState((prev) => ({
          ...prev,
          repositoryInfo: {
            doltStatus: message.doltStatus,
            running: message.running,
            dbSizeBytes: message.dbSizeBytes,
            lastActivity: message.lastActivity,
          },
        }));
        break;
      case "setGraph":
        setState((prev) => ({ ...prev, graph: message.graph }));
        break;
      case "setLoading":
        setState((prev) => ({ ...prev, loading: message.loading }));
        break;
      case "setError":
        setState((prev) => ({ ...prev, error: message.error }));
        break;
      case "setSettings":
        setState((prev) => ({ ...prev, settings: message.settings }));
        break;
      case "setCreateMode":
        setState((prev) => ({ ...prev, createMode: message.value }));
        break;
      case "applyIssuesFilter":
        setState((prev) => ({
          ...prev,
          issuesFilterRequest: {
            filter: message.filter,
            seq: (prev.issuesFilterRequest?.seq ?? 0) + 1,
          },
        }));
        break;
      case "showGraph":
        setState((prev) => ({
          ...prev,
          showGraphRequest: {
            beadId: message.beadId,
            seq: (prev.showGraphRequest?.seq ?? 0) + 1,
          },
        }));
        break;
      case "showTree":
        setState((prev) => ({
          ...prev,
          showTreeRequest: {
            beadId: message.beadId,
            seq: (prev.showTreeRequest?.seq ?? 0) + 1,
          },
        }));
        break;
      case "showKanbanBead":
        setState((prev) => ({
          ...prev,
          showKanbanBeadRequest: {
            beadId: message.beadId,
            seq: (prev.showKanbanBeadRequest?.seq ?? 0) + 1,
          },
        }));
        break;
      case "showIssuesBead":
        setState((prev) => ({
          ...prev,
          showIssuesBeadRequest: {
            beadId: message.beadId,
            seq: (prev.showIssuesBeadRequest?.seq ?? 0) + 1,
          },
        }));
        break;
      case "focusIssuesTab":
        setState((prev) => ({ ...prev, focusIssuesSeq: prev.focusIssuesSeq + 1 }));
        break;
      case "focusKanbanTab":
        setState((prev) => ({ ...prev, focusKanbanSeq: prev.focusKanbanSeq + 1 }));
        break;
      case "focusTreeTab":
        setState((prev) => ({ ...prev, focusTreeSeq: prev.focusTreeSeq + 1 }));
        break;
      case "pulse":
        setState((prev) => ({ ...prev, pulseSeq: prev.pulseSeq + 1 }));
        break;
      case "setMemoryUsage":
        setState((prev) => ({ ...prev, memoryBytes: message.bytes }));
        break;

      case "setTabNavState":
        setState((prev) => ({
          ...prev,
          tabNav: { canBack: message.canBack, canForward: message.canForward },
        }));
        break;
      case "setFavorites":
        setState((prev) => ({ ...prev, favorites: message.favorites }));
        break;
      case "setBeadCompanionOpen":
        setState((prev) => ({
          ...prev,
          companion: { beadId: message.beadId, open: message.open },
        }));
        break;
      case "setParentScope":
        // Live shared-filter scope from the host. Updated continuously — do NOT
        // reset the local "Filtered"/cleared toggle here (that would fight the
        // user's choice); the toggle only flips on explicit user action.
        setState((prev) => ({ ...prev, parentScope: message.beadIds }));
        break;

      case "setSharedFavoritesOnly":
        setState((prev) => ({ ...prev, sharedFavoritesOnly: message.on }));
        break;

      case "setSharedFilterSpec":
        setState((prev) => ({ ...prev, sharedSpec: message.snapshot }));
        break;
      case "applyIssuesFilterSnapshot":
        setState((prev) => ({
          ...prev,
          applySnapshotRequest: {
            snapshot: message.snapshot,
            seq: (prev.applySnapshotRequest?.seq ?? 0) + 1,
          },
        }));
        break;
      case "refresh":
        vscode.postMessage({ type: "refresh" });
        break;
      case "showToast":
        triggerToast(message.text, "top-right");
        break;
    }
  }, []);

  useEffect(() => {
    // Listen for messages from the extension
    window.addEventListener("message", handleMessage);

    // Notify extension that webview is ready
    vscode.postMessage({ type: "ready" });

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [handleMessage]);

  // Flash a confirmation ring when this webview is pulsed (editor tab opened /
  // revealed, vs-c59). Keyed on pulseSeq so repeat opens re-fire.
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    if (state.pulseSeq === 0) return;
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 1600);
    return () => clearTimeout(t);
  }, [state.pulseSeq]);

  // Drive the favorites-highlight accent from the setting (vs-bvk7): publish it
  // as a CSS var on :root so every favorite style (Issues row, Tree row) picks
  // it up. Empty falls back to the theme chart-yellow via the var's CSS default.
  useEffect(() => {
    const root = document.documentElement;
    const color = state.settings.favoritesHighlightColor;
    if (color) {
      root.style.setProperty("--beads-favorite-color", color);
    } else {
      root.style.removeProperty("--beads-favorite-color");
    }
  }, [state.settings.favoritesHighlightColor]);

  // Favorite bead ids (vs-sd5.1) — passed to the bead-context-menu views so a
  // right-click can star/unstar, and labelled Add/Remove based on membership.
  const favoriteIds = state.favorites.map((f) => f.id);
  // Masked favorites (eye-off in the Favorites filter group) — excluded from the
  // favorites→relatives seed expansion in the Issues list.
  const maskedIds = state.favorites.filter((f) => f.masked).map((f) => f.id);

  // Editor-tab filter scope: a Kanban/Tree/Graph tab inherits the panel's LIVE
  // parent scope (host-computed). Each view self-hosts its own FilterBar and
  // composes its local filter on top; the ribbon's Show-all/Show-filtered toggle
  // (driven by `seedFilterCleared`) lets a tab temporarily drop the inherited
  // scope. So App just hands the views the raw parent scope + the toggle.
  const seedSnapshot = state.parentScope;
  const toggleSeedFilter = () =>
    setState((prev) => ({ ...prev, seedFilterCleared: !prev.seedFilterCleared }));

  // Contextual refresh for editor-tab views: the sidebar PanelShell has its own
  // refresh, but a view opened standalone in an editor tab had no way to refresh
  // THAT view. Brief spin mirrors the PanelShell affordance so the click reads
  // as registered.
  const [tabRefreshing, setTabRefreshing] = useState(false);
  const handleTabRefresh = useCallback(() => {
    vscode.postMessage({ type: "refresh" });
    setTabRefreshing(true);
    setTimeout(() => setTabRefreshing(false), 800);
  }, []);

  // Wrap an editor-tab data view with shared chrome: a thin top toolbar holding
  // a contextual Refresh + a "<View> view for <project>" heading. Each view
  // self-hosts its own FilterBar in its body now, so the chrome no longer injects
  // one. The flex-column shell keeps the view's own height/scroll model intact
  // (Graph/React Flow needs a sized body).
  const VIEW_LABELS: Record<string, string> = {
    beadsPanel: "Issues",
    beadsKanban: "Kanban",
    beadsTree: "Tree",
    beadsGraph: "Graph",
  };
  const withEditorTabChrome = (view: React.ReactElement): React.ReactElement => {
    if (!state.settings.isEditorTab) return view;
    const viewLabel = VIEW_LABELS[state.viewType];
    const projectName = state.project?.displayPath ?? state.project?.name;
    return (
      <div className="editor-tab-shell">
        <div className="editor-tab-toolbar">
          {viewLabel && projectName && (
            <span className="editor-tab-title" title={`${viewLabel} view · ${projectName}`}>
              <span className="editor-tab-title-view">{viewLabel} view</span>
              <span className="editor-tab-title-for">for</span>
              <span className="editor-tab-title-project">{projectName}</span>
            </span>
          )}
          <span className="editor-tab-toolbar-spacer" />
          <div className="editor-tab-toolbar-actions">
            <button
              type="button"
              className="panel-shell-action"
              title="Refresh"
              aria-label="Refresh"
              onClick={handleTabRefresh}
            >
              <RefreshCw
                size={14}
                strokeWidth={2}
                className={tabRefreshing || state.loading ? "spinning" : undefined}
              />
            </button>
          </div>
        </div>
        <div className="editor-tab-body">{view}</div>
      </div>
    );
  };

  // Render the appropriate view
  const renderView = () => {
      if (state.viewType === "beadsPanel" && state.loading && state.beads.length === 0) {
        return <Loading />;
      }

      switch (state.viewType) {
      case "beadsInitWizard":
        return (
          <BoardInitWizard
            projectsRoot={state.initWizard.projectsRoot}
            phase={state.initWizard.phase}
            message={state.initWizard.message}
            onSubmit={(name, mode) => vscode.postMessage({ type: "submitInitBoard", name, mode })}
            onCancel={() => vscode.postMessage({ type: "cancelInitBoard" })}
            onChangeRoot={() => vscode.postMessage({ type: "changeProjectsRoot" })}
          />
        );

      case "beadsDashboard":
        return (
          <DashboardView
            summary={state.summary}
            beads={state.beads}
            loading={state.loading}
            error={state.error}
            version={state.settings.extensionVersion}
            buildSha={state.settings.buildSha}
            buildDirty={state.settings.buildDirty}
            onSelectBead={(beadId) =>
              vscode.postMessage({ type: "selectBead", beadId })
            }
            onOpenIssues={(filter) =>
              vscode.postMessage({ type: "openIssuesWithFilter", filter })
            }
            onRetry={() =>
              vscode.postMessage({ type: "refresh" })
            }
          />
        );

      case "beadsRepository":
        return (
          <RepositoryView
            project={state.project}
            projects={state.projects}
            summary={state.summary}
            repositoryInfo={state.repositoryInfo}
            settings={state.settings}
            memoryBytes={state.memoryBytes}
          />
        );

      case "beadsPanel":
        return withEditorTabChrome(
          <IssuesView
            beads={state.beads}
            loading={state.loading}
            error={state.error}
            selectedBeadId={state.selectedBeadId}
            favoriteIds={favoriteIds}
            maskedIds={maskedIds}
            highlightFavorites={state.settings.highlightFavorites}
            muteClosedIssues={state.settings.muteClosedIssues}
            tooltipHoverDelay={state.settings.tooltipHoverDelay}
            issuesFilterRequest={state.issuesFilterRequest}
            applySnapshotRequest={state.applySnapshotRequest}
            isEditorTab={state.settings.isEditorTab}
            graph={state.graph}
            onRequestGraph={() => vscode.postMessage({ type: "requestGraph" })}
            onSelectBead={(beadId) =>
              vscode.postMessage({ type: "selectBead", beadId })
            }
            onRetry={() =>
              vscode.postMessage({ type: "refresh" })
            }
          />,
          // Issues has its own toolbar + "Apply to all"; no sidecar FilterBar here.
        );

      case "beadsPanelShell":
        return (
          <PanelShell
            summary={state.summary}
            beads={state.beads}
            graph={state.graph}
            loading={state.loading}
            error={state.error}
            selectedBeadId={state.selectedBeadId}
            favoriteIds={favoriteIds}
            maskedIds={maskedIds}
            parentScope={state.parentScope}
            sharedSpec={state.sharedSpec}
            settings={state.settings}
            issuesFilterRequest={state.issuesFilterRequest}
            applySnapshotRequest={state.applySnapshotRequest}
            showGraphRequest={state.showGraphRequest}
            showTreeRequest={state.showTreeRequest}
            showKanbanBeadRequest={state.showKanbanBeadRequest}
            showIssuesBeadRequest={state.showIssuesBeadRequest}
            focusIssuesSeq={state.focusIssuesSeq}
            focusKanbanSeq={state.focusKanbanSeq}
            focusTreeSeq={state.focusTreeSeq}
          />
        );

      case "beadsGraph":
        return withEditorTabChrome(
          <GraphView
            graph={state.graph}
            loading={state.loading}
            error={state.error}
            selectedBeadId={state.selectedBeadId}
            favoriteIds={favoriteIds}
            maskedIds={maskedIds}
            focusBeadId={null}
            filteredBeadIds={seedSnapshot}
            parentCleared={state.seedFilterCleared}
            onToggleParentScope={toggleSeedFilter}
            onOpenBead={(beadId) =>
              vscode.postMessage({ type: "openBeadDetails", beadId })
            }
            onRetry={() => vscode.postMessage({ type: "refresh" })}
          />,
        );

      case "beadsKanban":
        // Self-hosts its FilterBar (like the Tree): raw parent scope + ribbon
        // toggle, own compose; no chrome FilterBar.
        return withEditorTabChrome(
          <KanbanBoard
            beads={state.beads}
            graph={state.graph}
            onRequestGraph={() => vscode.postMessage({ type: "requestGraph" })}
            selectedBeadId={state.selectedBeadId}
            favoriteIds={favoriteIds}
            maskedIds={maskedIds}
            muteClosedIssues={state.settings.muteClosedIssues}
            filteredBeadIds={seedSnapshot}
            parentCleared={state.seedFilterCleared}
            onToggleParentScope={toggleSeedFilter}
            totalCount={state.beads.length}
            onSelectBead={(beadId) => vscode.postMessage({ type: "selectBead", beadId })}
            onUpdateBead={(beadId, updates) =>
              vscode.postMessage({ type: "updateBead", beadId, updates })
            }
          />,
        );

      case "beadsTree":
        // The Tree self-hosts its FilterBar (so it works in the panel too), so
        // it gets the RAW parent scope + the inherited-ribbon toggle and does its
        // own compose; no chrome FilterBar here.
        return withEditorTabChrome(
          <TreeView
            graph={state.graph}
            loading={state.loading}
            error={state.error}
            selectedBeadId={state.selectedBeadId}
            favoriteIds={favoriteIds}
            maskedIds={maskedIds}
            highlightFavorites={state.settings.highlightFavorites}
            muteClosedIssues={state.settings.muteClosedIssues}
            filteredBeadIds={seedSnapshot}
            parentCleared={state.seedFilterCleared}
            onToggleParentScope={toggleSeedFilter}
            totalCount={state.beads.length}
            onSelectBead={(beadId) => vscode.postMessage({ type: "selectBead", beadId })}
            onRequestGraph={() => vscode.postMessage({ type: "requestGraph" })}
            onRetry={() => vscode.postMessage({ type: "refresh" })}
          />,
        );

      case "beadsProjectSwitcher":
        return (
          <ProjectSwitcherView
            projects={state.projects}
            activeProject={state.project}
            activeBead={state.selectedBead}
            favoritesFilterOn={state.sharedFavoritesOnly}
            onToggleFavoritesFilter={(on) => vscode.postMessage({ type: "setFavoritesFilter", on })}
            favorites={state.favorites}
            version={state.settings.extensionVersion}
            buildSha={state.settings.buildSha}
            buildDirty={state.settings.buildDirty}
            muteClosedIssues={state.settings.muteClosedIssues}
            bundleBytes={state.settings.bundleBytes}
            onSelectProject={(project) =>
              vscode.postMessage({
                type: "selectProject",
                projectId: project.id,
                projectRootPath: project.rootPath,
              })
            }
            onOpenProjectFolder={() => vscode.postMessage({ type: "openProjectFolder" })}
            onOpenBead={(beadId) => vscode.postMessage({ type: "openBeadDetails", beadId })}
            onOpenBeadInTab={(beadId) => vscode.postMessage({ type: "openBeadInTab", beadId })}
            onClearBead={() => vscode.postMessage({ type: "clearActiveBead" })}
            onUnfavorite={(beadId) => vscode.postMessage({ type: "removeFavorite", beadId })}
            onCopyFavorites={() =>
              vscode.postMessage({
                type: "copyText",
                text: state.favorites.map((f) => f.id).join(","),
                label: "favorite ids",
                toast: true,
              })
            }
            onCopyId={(beadId) => vscode.postMessage({ type: "copyBeadId", beadId, toast: true })}
            onToggleFavorite={(beadId) => vscode.postMessage({ type: "toggleFavorite", beadId })}
            onToggleMask={(beadId) => {
              // Optimistic: flip the mask locally so the eye + muted card (and the
              // Issues favorites scope, both derived from state.favorites) update
              // instantly. The host echoes the authoritative setFavorites shortly
              // after, which reconciles to the same value.
              setState((prev) => ({
                ...prev,
                favorites: prev.favorites.map((f) =>
                  f.id === beadId ? { ...f, masked: !f.masked } : f,
                ),
              }));
              vscode.postMessage({ type: "toggleFavoriteMask", beadId });
            }}
            onPickReady={() => vscode.postMessage({ type: "pickReadyBead" })}
            onShowIssues={() => vscode.postMessage({ type: "showIssues" })}
            onShowTree={() => vscode.postMessage({ type: "showTreePanel" })}
            onCreateBoard={() => vscode.postMessage({ type: "createBoard" })}
            onOpenRepositoryDetails={() => vscode.postMessage({ type: "openRepositoryDetails" })}
            onChangeRoot={() => vscode.postMessage({ type: "changeProjectsRoot" })}
            onOpenSettings={() => vscode.postMessage({ type: "openSettings" })}
            onShowStatus={() => vscode.postMessage({ type: "showDoltStatus" })}
            onStartDolt={() => vscode.postMessage({ type: "startDoltServer" })}
            onStopDolt={() => vscode.postMessage({ type: "stopDoltServer" })}
            onOpenDoltLog={() => vscode.postMessage({ type: "openDoltLog" })}
            onExportIssues={() => vscode.postMessage({ type: "exportIssues" })}
          />
        );

      case "beadsDetails": {
        if (state.createMode) {
          return (
            <CreateBeadForm
              userId={state.settings.userId}
              onCreate={(fields) => vscode.postMessage({ type: "createBead", fields })}
              onCancel={() => vscode.postMessage({ type: "cancelCreate" })}
            />
          );
        }
        if (!state.selectedBead && !state.loading) {
          return (
            <div className="empty-state">
              <div className="empty-state-icon">🔖</div>
              <h3>No issue selected</h3>
              <p>
                Pick an issue from the <strong>Issues</strong> list in the panel
                below to see its details here.
              </p>
              <div className="empty-state-actions">
                <button
                  type="button"
                  className="empty-state-action"
                  onClick={() => vscode.postMessage({ type: "startCreate" })}
                >
                  <span className="empty-state-action-icon">+</span>
                  New Issue
                </button>
                <button
                  type="button"
                  className="empty-state-action secondary"
                  onClick={() => vscode.postMessage({ type: "showKanban" })}
                >
                  Show Kanban
                </button>
              </div>
            </div>
          );
        }
        if (!state.selectedBead) {
          return <Loading />;
        }
        // Extract unique assignees from beads list
        const knownAssignees = Array.from(
          new Set(state.beads.map((b) => b.assignee).filter((a): a is string => !!a))
        ).sort();
        return (
          <DetailsView
            bead={state.selectedBead}
            loading={state.loading}
            renderMarkdown={state.settings.renderMarkdown}
            userId={state.settings.userId}
            isEditorTab={state.settings.isEditorTab}
            knownAssignees={knownAssignees}
            onUpdateBead={(beadId, updates) =>
              vscode.postMessage({ type: "updateBead", beadId, updates })
            }
            onAddDependency={(beadId, targetId, dependencyType, reverse) =>
              vscode.postMessage({ type: "addDependency", beadId, targetId, dependencyType, reverse })
            }
            onRemoveDependency={(beadId, dependsOnId) =>
              vscode.postMessage({ type: "removeDependency", beadId, dependsOnId })
            }
            onAddComment={(beadId, text) =>
              vscode.postMessage({ type: "addComment", beadId, text })
            }
            onViewInGraph={(beadId) =>
              vscode.postMessage({ type: "viewInGraph", beadId })
            }
            onSelectBead={(beadId) =>
              vscode.postMessage({ type: "selectBead", beadId })
            }
            onCopyId={(beadId) =>
              vscode.postMessage({ type: "copyBeadId", beadId, toast: true })
            }
            isFavorite={state.favorites.some((f) => f.id === state.selectedBead?.id)}
            onToggleFavorite={(beadId) =>
              vscode.postMessage({ type: "toggleFavorite", beadId })
            }
            canNavigateBack={state.tabNav.canBack}
            canNavigateForward={state.tabNav.canForward}
            onNavigateBack={() => vscode.postMessage({ type: "navigateBack" })}
            onNavigateForward={() => vscode.postMessage({ type: "navigateForward" })}
            companionOpen={
              state.companion?.beadId === state.selectedBead.id && state.companion.open
            }
            onToggleCompanion={(beadId) =>
              vscode.postMessage({ type: "toggleBeadCompanion", beadId })
            }
          />
        );
      }

      default:
        return (
          <div className="empty-state">
            <p>Loading...</p>
          </div>
        );
    }
  };

  return (
    <ToastProvider>
      <div className={`app${pulsing ? " pulsing" : ""}`}>
        <main className="app-content">{renderView()}</main>
      </div>
    </ToastProvider>
  );
}
