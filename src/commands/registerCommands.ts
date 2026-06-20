/**
 * Command registration for the Beads extension.
 *
 * Extracted from extension.ts to keep activate() focused on lifecycle wiring.
 * All `beads.*` commands are registered here against an explicit dependency
 * bag, so the commands' collaborators (providers, project manager, status-bar
 * refresh) are passed in rather than reached for via module globals.
 */

import * as vscode from "vscode";
import { IssuesFilter, FilterSnapshot, Bead, issueToWebviewBead } from "../backend/types";
import { nextReadyBead } from "../backend/readyBeads";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { PanelShellViewProvider } from "../providers/PanelShellViewProvider";
import { BeadDetailsViewProvider } from "../providers/BeadDetailsViewProvider";
import { BeadsProjectSwitcherViewProvider } from "../providers/BeadsProjectSwitcherViewProvider";
import { BeadPanelManager } from "../providers/BeadPanelManager";
import { NavigationHistory } from "../providers/NavigationHistory";
import { Logger } from "../utils/logger";

export interface CommandDeps {
  projectManager: BeadsProjectManager;
  /** The consolidated bottom-Panel shell (Dashboard + Issues data + selection). */
  shellProvider: PanelShellViewProvider;
  detailsProvider: BeadDetailsViewProvider;
  /** Sidebar context view — pins the active bead as a reference. */
  switcherProvider: BeadsProjectSwitcherViewProvider;
  panelManager: BeadPanelManager;
  log: Logger;
  /** Recompute the Beads status-bar item from current project state. */
  updateStatusBar: () => void | Promise<void>;
}

/**
 * Registers every `beads.*` command (including the status-bar menu) and pushes
 * the disposables onto the extension context.
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  deps: CommandDeps
): void {
  const {
    projectManager,
    shellProvider,
    detailsProvider,
    switcherProvider,
    panelManager,
    log,
    updateStatusBar,
  } = deps;

  // Per-session Details navigation history (vs-xzq). Back/Forward walk a cursor
  // along the beads the user has visited; a new navigation truncates the
  // forward branch. Reset when the selection is cleared or the project changes.
  const navHistory = new NavigationHistory();
  // Cursor for "Pick Ready Bead" so repeated invocations cycle through the
  // ready set rather than re-picking the same top bead.
  let lastReadyId: string | null = null;

  const updateNavContext = (): void => {
    vscode.commands.executeCommand("setContext", "beads.canNavigateBack", navHistory.canBack());
    vscode.commands.executeCommand("setContext", "beads.canNavigateForward", navHistory.canForward());
  };

  // Drive every selection surface from one place: the sidebar Details view, the
  // Issues table highlight, and the Active Bead pin — so traversal keeps them in
  // sync (the Active Bead follows where the user actually is).
  const selectBead = (beadId: string, opts?: { pulse?: boolean }): void => {
    detailsProvider.showBead(beadId, opts);
    shellProvider.setSelectedBead(beadId);
    switcherProvider.setActiveBead(beadId);
  };

  // Reset history whenever the active project changes — bead ids don't carry
  // across projects, so a stale trail would navigate to the wrong board.
  context.subscriptions.push(
    projectManager.onActiveProjectChanged(() => {
      navHistory.reset();
      lastReadyId = null;
      updateNavContext();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("beads.switchProject", async () => {
      await projectManager.showProjectPicker();
    }),

    vscode.commands.registerCommand("beads.openBeadsPanel", async () => {
      await vscode.commands.executeCommand("beadsPanelShell.focus");
      // Switch to the Issues tab and pulse a ring so the action is visible even
      // when the panel (or Issues tab) was already showing.
      shellProvider.focusIssuesTab();
    }),

    // Reveal the Beads panel with the Kanban tab focused. Used by the empty
    // Details "Show Kanban" action, which prefers activating the in-panel
    // Kanban over opening a standalone editor tab (vs-6xf).
    vscode.commands.registerCommand("beads.openKanbanPanel", async () => {
      await vscode.commands.executeCommand("beadsPanelShell.focus");
      shellProvider.focusKanbanTab();
    }),

    // Open the Issues panel pre-filtered to a slice (empty filter = all).
    // Used by the Dashboard summary cards and breakdown badges. Focus first so
    // a closed panel resolves its webview, then hand the filter to the provider
    // (which holds it until the webview is ready).
    vscode.commands.registerCommand("beads.openIssuesWithFilter", async (filter?: IssuesFilter) => {
      await vscode.commands.executeCommand("beadsPanelShell.focus");
      shellProvider.applyIssuesFilter(filter ?? {});
    }),

    // Deep-link a bead into the Graph tab: focus the panel shell (so a closed
    // panel resolves its webview), then hand the bead to the provider, which
    // holds it until the webview is ready. Replaces the dead `beadsGraph.focus`
    // command from the old standalone graph container (vs-iz8).
    vscode.commands.registerCommand("beads.viewInGraph", async (beadId?: string) => {
      if (!beadId) {
        return;
      }
      await vscode.commands.executeCommand("beadsPanelShell.focus");
      shellProvider.showGraphForBead(beadId);
    }),

    vscode.commands.registerCommand("beads.openBeadDetails", async (beadId?: string) => {
      if (!beadId) {
        // Prompt for bead ID
        const client = projectManager.getClient();
        if (!client) {
          vscode.window.showWarningMessage("No active Beads project");
          return;
        }

        try {
          const beads = await client.list();
          const items = beads.map((bead) => ({
            label: bead.title,
            description: bead.id,
            detail: `Status: ${bead.status} | Priority: P${bead.priority}`,
            bead,
          }));

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: "Select a bead to view details",
          });

          if (selected) {
            beadId = selected.bead.id;
          }
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to load beads: ${err}`);
          return;
        }
      }

      if (beadId) {
        // A user navigation: record it (truncating any forward branch) and
        // drive all selection surfaces. Pulse the Details view so "Show Details"
        // gives visible feedback even when it's already showing (vs-1vxq).
        navHistory.record(beadId);
        selectBead(beadId, { pulse: true });
        updateNavContext();
      }
    }),

    // Back/Forward through the Details navigation history (vs-xzq). These move
    // the cursor and re-select WITHOUT recording, so they don't grow the trail.
    vscode.commands.registerCommand("beads.navigateBack", () => {
      const id = navHistory.back();
      if (id) {
        selectBead(id);
        updateNavContext();
      }
    }),

    vscode.commands.registerCommand("beads.navigateForward", () => {
      const id = navHistory.forward();
      if (id) {
        selectBead(id);
        updateNavContext();
      }
    }),

    // Pick a ready-to-work bead (open, no open blocker) and make it the active
    // bead. Repeated invocations cycle through the ready set. (vs-ih1)
    vscode.commands.registerCommand("beads.pickReadyBead", async () => {
      const client = projectManager.getClient();
      if (!client) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }
      try {
        const issues = await client.list();
        const beads = issues.map(issueToWebviewBead).filter((b): b is Bead => b !== null);
        const edges = await client.getDependencyGraph();
        const blocks = edges
          .filter((e) => e.type === "blocks")
          .map((e) => ({ from: e.from, to: e.to }));
        const pick = nextReadyBead(beads, blocks, lastReadyId);
        if (!pick) {
          vscode.window.showInformationMessage(
            "No ready beads — everything is blocked, in progress, or done."
          );
          return;
        }
        lastReadyId = pick;
        await vscode.commands.executeCommand("beads.openBeadDetails", pick);
        vscode.window.setStatusBarMessage(`$(rocket) Ready: ${pick}`, 2500);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to pick a ready bead: ${err}`);
      }
    }),

    // Clear the current selection across every surface that tracks it: the
    // sidebar Details view, the Issues table highlight, and the Active Bead pin.
    // Also resets the navigation history — the trail is meaningless once the
    // selection is gone.
    vscode.commands.registerCommand("beads.clearSelection", () => {
      detailsProvider.clearBead();
      shellProvider.setSelectedBead(null);
      switcherProvider.setActiveBead(null);
      navHistory.reset();
      updateNavContext();
    }),

    // vs-ask: open a bead's Details as an editor tab. With no argument, use the
    // bead currently shown in the sidebar Details view.
    vscode.commands.registerCommand("beads.openBeadInTab", async (beadId?: string) => {
      const targetId = beadId ?? detailsProvider.getCurrentBeadId() ?? undefined;
      if (!targetId) {
        vscode.window.showInformationMessage("Select a bead first, then open it in a tab.");
        return;
      }
      panelManager.openBeadDetails(targetId);
    }),

    // vs-fx4: open the Issues list as an editor tab. The optional arg is a full
    // filter snapshot (vs-tle) seeding the tab with the panel's filter spec.
    vscode.commands.registerCommand("beads.openIssuesInTab", (seed?: FilterSnapshot | null) => {
      panelManager.openIssues(seed ?? null);
    }),

    // vs-s56: open the Dashboard as an editor tab.
    vscode.commands.registerCommand("beads.openDashboardInTab", () => {
      panelManager.openDashboard();
    }),

    // vs-3bp: open the dependency Graph as an editor tab. The optional arg is a
    // filter snapshot (vs-nme) seeding the new tab with the panel's filter.
    vscode.commands.registerCommand("beads.openGraphInTab", (seed?: string[] | null) => {
      panelManager.openGraph(seed ?? null);
    }),

    // vs-xqu.1: open the Kanban board as an editor tab.
    vscode.commands.registerCommand("beads.openKanbanInTab", (seed?: string[] | null) => {
      panelManager.openKanban(seed ?? null);
    }),

    // vs-xqu.2: open the dependency Tree as an editor tab.
    vscode.commands.registerCommand("beads.openTreeInTab", (seed?: string[] | null) => {
      panelManager.openTree(seed ?? null);
    }),

    // vs-dzm: "Apply to all" — an Issues editor tab broadcasts its filter to
    // every open surface. The panel applies the full spec (its embedded
    // Kanban/Tree/Graph follow); open editor tabs are reseeded with the
    // already-computed ids. One discrete push — no reactive sync loop.
    vscode.commands.registerCommand(
      "beads.applyFilterGlobally",
      (snapshot: FilterSnapshot, filteredBeadIds: string[]) => {
        shellProvider.pushFilter({ snapshot });
        panelManager.applyFilterToOpenTabs(snapshot, filteredBeadIds);
      }
    ),

    vscode.commands.registerCommand("beads.createIssue", () => {
      if (!projectManager.getActiveProject()) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }
      detailsProvider.startCreate();
    }),

    // vs-2tn.2: open a New Issue form as an independent editor tab.
    vscode.commands.registerCommand("beads.openNewIssueInTab", () => {
      if (!projectManager.getActiveProject()) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }
      panelManager.openNewIssue();
    }),

    vscode.commands.registerCommand("beads.refresh", async () => {
      log.info("Manual refresh triggered");
      await projectManager.refresh();
      shellProvider.hardRefresh();
      detailsProvider.hardRefresh();
      log.info("Refresh complete");
      vscode.window.setStatusBarMessage("$(check) Beads: Refreshed", 2000);
    }),

    vscode.commands.registerCommand("beads.startDoltServer", async () => {
      const client = projectManager.getClient();
      const project = projectManager.getActiveProject();
      if (!client || !project) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }

      if (project.doltMode === "embedded") {
        vscode.window.showInformationMessage(
          `${project.name} uses embedded Dolt — there is no server to start.`
        );
        return;
      }

      try {
        const output = await client.startDoltServer();
        log.info(`Started Dolt server for ${project.name}: ${output || "<no output>"}`);
        await projectManager.refresh();
        shellProvider.refresh();
        detailsProvider.refresh();
        await updateStatusBar();
        vscode.window.showInformationMessage(`Dolt server started for ${project.name}.`);
      } catch (err) {
        await log.errorNotify(`Failed to start Dolt server: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),

    vscode.commands.registerCommand("beads.stopDoltServer", async () => {
      const client = projectManager.getClient();
      const project = projectManager.getActiveProject();
      if (!client || !project) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }

      try {
        const output = await client.stopDoltServer();
        log.info(`Stopped Dolt server for ${project.name}: ${output || "<no output>"}`);
        await projectManager.refresh();
        shellProvider.refresh();
        detailsProvider.refresh();
        await updateStatusBar();
        vscode.window.showInformationMessage(`Dolt server stopped for ${project.name}.`);
      } catch (err) {
        await log.errorNotify(`Failed to stop Dolt server: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),

    vscode.commands.registerCommand("beads.showDoltStatus", async () => {
      const client = projectManager.getClient();
      const project = projectManager.getActiveProject();
      if (!client || !project) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }

      try {
        const output = await client.doltStatus();
        log.info(`Dolt status for ${project.name}:\n${output || "<no output>"}`);
        vscode.window.showInformationMessage(`Dolt status logged for ${project.name}. Check Output > Beads.`);
      } catch (err) {
        await log.errorNotify(`Failed to get Dolt status: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),

    vscode.commands.registerCommand("beads.openDoltLog", async () => {
      const project = projectManager.getActiveProject();
      if (!project) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }

      const logUri = vscode.Uri.file(vscode.Uri.joinPath(vscode.Uri.file(project.beadsDir), "dolt-server.log").fsPath);
      try {
        const doc = await vscode.workspace.openTextDocument(logUri);
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch (err) {
        await log.errorNotify(`Failed to open Dolt log: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),

    vscode.commands.registerCommand("beads.copyBeadId", async () => {
      const beadId = detailsProvider.getCurrentBeadId();
      if (beadId) {
        await vscode.env.clipboard.writeText(beadId);
        vscode.window.setStatusBarMessage(`$(check) Copied: ${beadId}`, 2000);
      } else {
        vscode.window.showWarningMessage("No bead selected");
      }
    })
  );

  // Status-bar menu (the status-bar item's click target).
  context.subscriptions.push(
    vscode.commands.registerCommand("beads.showStatusMenu", async () => {
      const project = projectManager.getActiveProject();
      if (!project) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }

      const status = await projectManager.getBackendStatus();
      const items: vscode.QuickPickItem[] = [];

      items.push(
        { label: "$(refresh) Refresh", description: "Refresh Beads data" },
        { label: "$(server-process) Dolt Status", description: "Log Dolt server status" },
        { label: "$(play) Start Dolt", description: "Start the Dolt server for this project" },
        { label: "$(debug-stop) Stop Dolt", description: "Stop the Dolt server for this project" },
        { label: "$(output) Show Logs", description: "Open Beads output panel" }
      );

      const selected = await vscode.window.showQuickPick(items, {
        title: `Beads: ${project.name} (${status.state})`,
        placeHolder: status.message,
      });

      if (selected) {
        if (selected.label.includes("Refresh")) {
          vscode.commands.executeCommand("beads.refresh");
        } else if (selected.label.includes("Dolt Status")) {
          vscode.commands.executeCommand("beads.showDoltStatus");
        } else if (selected.label.includes("Start Dolt")) {
          vscode.commands.executeCommand("beads.startDoltServer");
        } else if (selected.label.includes("Stop Dolt")) {
          vscode.commands.executeCommand("beads.stopDoltServer");
        } else if (selected.label.includes("Show Logs")) {
          log.show();
        }
      }
    })
  );
}
