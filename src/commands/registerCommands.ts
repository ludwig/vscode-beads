/**
 * Command registration for the Beads extension.
 *
 * Extracted from extension.ts to keep activate() focused on lifecycle wiring.
 * All `beads.*` commands are registered here against an explicit dependency
 * bag, so the commands' collaborators (providers, project manager, status-bar
 * refresh) are passed in rather than reached for via module globals.
 */

import * as vscode from "vscode";
import { IssuesFilter } from "../backend/types";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { PanelShellViewProvider } from "../providers/PanelShellViewProvider";
import { BeadDetailsViewProvider } from "../providers/BeadDetailsViewProvider";
import { BeadsProjectSwitcherViewProvider } from "../providers/BeadsProjectSwitcherViewProvider";
import { BeadPanelManager } from "../providers/BeadPanelManager";
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

  context.subscriptions.push(
    vscode.commands.registerCommand("beads.switchProject", async () => {
      await projectManager.showProjectPicker();
    }),

    vscode.commands.registerCommand("beads.openBeadsPanel", () => {
      vscode.commands.executeCommand("beadsPanelShell.focus");
    }),

    // Open the Issues panel pre-filtered to a slice (empty filter = all).
    // Used by the Dashboard summary cards and breakdown badges. Focus first so
    // a closed panel resolves its webview, then hand the filter to the provider
    // (which holds it until the webview is ready).
    vscode.commands.registerCommand("beads.openIssuesWithFilter", async (filter?: IssuesFilter) => {
      await vscode.commands.executeCommand("beadsPanelShell.focus");
      shellProvider.applyIssuesFilter(filter ?? {});
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
        const selectedId = beadId;
        detailsProvider.showBead(selectedId);
        shellProvider.setSelectedBead(selectedId);
        switcherProvider.setActiveBead(selectedId);
      }
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

    // vs-fx4: open the Issues list as an editor tab.
    vscode.commands.registerCommand("beads.openIssuesInTab", () => {
      panelManager.openIssues();
    }),

    // vs-s56: open the Dashboard as an editor tab.
    vscode.commands.registerCommand("beads.openDashboardInTab", () => {
      panelManager.openDashboard();
    }),

    vscode.commands.registerCommand("beads.createIssue", () => {
      if (!projectManager.getActiveProject()) {
        vscode.window.showWarningMessage("No active Beads project");
        return;
      }
      detailsProvider.startCreate();
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
