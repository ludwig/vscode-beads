/**
 * Main App Component
 *
 * Routes to the appropriate view based on viewType.
 * Manages global state and message passing with the extension.
 */

import React, { useState, useEffect, useCallback } from "react";
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
import { FilterSnapshotRibbon } from "./common/FilterSnapshotRibbon";
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
  // Bumped to switch the panel to the Issues tab + pulse a confirmation ring.
  focusIssuesSeq: number;
  // Bumped to switch the panel to the Kanban tab (vs-6xf).
  focusKanbanSeq: number;
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
  // One-time Issues-filter snapshot for an editor-tab Kanban/Tree/Graph view,
  // pushed by the provider on open so the tab inherits the panel's active
  // filter instead of opening unfiltered (vs-nme). `null` = no filter.
  seedFilteredBeadIds: string[] | null;
  // True when the user has temporarily dropped the inherited snapshot via the
  // ribbon's "Show all" (vs-zq2). The snapshot itself is retained so they can
  // flip back to "Show filtered". Reset whenever a fresh seed arrives.
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
  focusIssuesSeq: 0,
  focusKanbanSeq: 0,
  pulseSeq: 0,
  memoryBytes: 0,
  tabNav: { canBack: false, canForward: false },
  favorites: [],
  companion: null,
  seedFilteredBeadIds: null,
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
      case "focusIssuesTab":
        setState((prev) => ({ ...prev, focusIssuesSeq: prev.focusIssuesSeq + 1 }));
        break;
      case "focusKanbanTab":
        setState((prev) => ({ ...prev, focusKanbanSeq: prev.focusKanbanSeq + 1 }));
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
      case "seedFilter":
        setState((prev) => ({
          ...prev,
          seedFilteredBeadIds: message.filteredBeadIds,
          seedFilterCleared: false,
        }));
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

  // Favorite bead ids (vs-sd5.1) — passed to the bead-context-menu views so a
  // right-click can star/unstar, and labelled Add/Remove based on membership.
  const favoriteIds = state.favorites.map((f) => f.id);

  // Editor-tab filter seed (vs-nme): when a Kanban/Tree/Graph tab was opened
  // from a filtered panel, scope it to the inherited snapshot. The ribbon
  // (vs-zq2) can temporarily drop the scope ("Show all"), which only zeroes the
  // ids handed to the view — the snapshot is retained so "Show filtered"
  // restores it.
  const seedSnapshot = state.seedFilteredBeadIds;
  // A real snapshot narrows to a strict subset; equal length = no-op filter.
  const hasSeedSnapshot = seedSnapshot != null && seedSnapshot.length < state.beads.length;
  const effectiveSeed = state.seedFilterCleared ? null : seedSnapshot;
  const seedFilterActive =
    effectiveSeed != null && effectiveSeed.length < state.beads.length;
  const seedFilteredCount = effectiveSeed?.length ?? state.beads.length;
  const toggleSeedFilter = () =>
    setState((prev) => ({ ...prev, seedFilterCleared: !prev.seedFilterCleared }));

  // Wrap an editor-tab view with the snapshot ribbon when a real filter was
  // inherited (vs-zq2). The flex-column shell keeps the view's own height/scroll
  // model intact (Graph/React Flow needs a sized body).
  const withSnapshotRibbon = (view: React.ReactElement): React.ReactElement =>
    hasSeedSnapshot ? (
      <div className="editor-tab-shell">
        <FilterSnapshotRibbon
          filteredCount={seedSnapshot?.length ?? 0}
          totalCount={state.beads.length}
          cleared={state.seedFilterCleared}
          onToggle={toggleSeedFilter}
        />
        <div className="editor-tab-body">{view}</div>
      </div>
    ) : (
      view
    );

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
              vscode.postMessage({ type: "openBeadDetails", beadId })
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
        return (
          <IssuesView
            beads={state.beads}
            loading={state.loading}
            error={state.error}
            selectedBeadId={state.selectedBeadId}
            favoriteIds={favoriteIds}
            highlightFavorites={state.settings.highlightFavorites}
            muteClosedIssues={state.settings.muteClosedIssues}
            tooltipHoverDelay={state.settings.tooltipHoverDelay}
            issuesFilterRequest={state.issuesFilterRequest}
            applySnapshotRequest={state.applySnapshotRequest}
            isEditorTab={state.settings.isEditorTab}
            graph={state.graph}
            onRequestGraph={() => vscode.postMessage({ type: "requestGraph" })}
            onSelectBead={(beadId) =>
              vscode.postMessage({ type: "openBeadDetails", beadId })
            }
            onRetry={() =>
              vscode.postMessage({ type: "refresh" })
            }
          />
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
            settings={state.settings}
            issuesFilterRequest={state.issuesFilterRequest}
            applySnapshotRequest={state.applySnapshotRequest}
            showGraphRequest={state.showGraphRequest}
            showTreeRequest={state.showTreeRequest}
            focusIssuesSeq={state.focusIssuesSeq}
            focusKanbanSeq={state.focusKanbanSeq}
          />
        );

      case "beadsGraph":
        return withSnapshotRibbon(
          <GraphView
            graph={state.graph}
            loading={state.loading}
            error={state.error}
            selectedBeadId={state.selectedBeadId}
            favoriteIds={favoriteIds}
            focusBeadId={null}
            filteredBeadIds={effectiveSeed}
            issuesFilterActive={seedFilterActive}
            onOpenBead={(beadId) =>
              vscode.postMessage({ type: "openBeadDetails", beadId })
            }
            onRetry={() => vscode.postMessage({ type: "refresh" })}
          />
        );

      case "beadsKanban":
        return withSnapshotRibbon(
          <KanbanBoard
            beads={state.beads}
            selectedBeadId={state.selectedBeadId}
            favoriteIds={favoriteIds}
            filteredBeadIds={effectiveSeed}
            filterActive={seedFilterActive}
            filteredCount={seedFilteredCount}
            totalCount={state.beads.length}
            onSelectBead={(beadId) => vscode.postMessage({ type: "openBeadDetails", beadId })}
            onUpdateBead={(beadId, updates) =>
              vscode.postMessage({ type: "updateBead", beadId, updates })
            }
          />
        );

      case "beadsTree":
        return withSnapshotRibbon(
          <TreeView
            graph={state.graph}
            loading={state.loading}
            error={state.error}
            selectedBeadId={state.selectedBeadId}
            favoriteIds={favoriteIds}
            filteredBeadIds={effectiveSeed}
            filterActive={seedFilterActive}
            filteredCount={seedFilteredCount}
            totalCount={state.beads.length}
            onSelectBead={(beadId) => vscode.postMessage({ type: "openBeadDetails", beadId })}
            onRequestGraph={() => vscode.postMessage({ type: "requestGraph" })}
            onRetry={() => vscode.postMessage({ type: "refresh" })}
          />
        );

      case "beadsProjectSwitcher":
        return (
          <ProjectSwitcherView
            projects={state.projects}
            activeProject={state.project}
            activeBead={state.selectedBead}
            favorites={state.favorites}
            version={state.settings.extensionVersion}
            buildSha={state.settings.buildSha}
            buildDirty={state.settings.buildDirty}
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
            onToggleFavorite={(beadId) => vscode.postMessage({ type: "toggleFavorite", beadId })}
            onPickReady={() => vscode.postMessage({ type: "pickReadyBead" })}
            onShowIssues={() => vscode.postMessage({ type: "showIssues" })}
            onCreateBoard={() => vscode.postMessage({ type: "createBoard" })}
            onOpenRepositoryDetails={() => vscode.postMessage({ type: "openRepositoryDetails" })}
            onChangeRoot={() => vscode.postMessage({ type: "changeProjectsRoot" })}
            onOpenSettings={() => vscode.postMessage({ type: "openSettings" })}
            onShowStatus={() => vscode.postMessage({ type: "showDoltStatus" })}
            onStartDolt={() => vscode.postMessage({ type: "startDoltServer" })}
            onStopDolt={() => vscode.postMessage({ type: "stopDoltServer" })}
            onOpenDoltLog={() => vscode.postMessage({ type: "openDoltLog" })}
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
              vscode.postMessage({ type: "openBeadDetails", beadId })
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
