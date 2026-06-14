/**
 * Beads VS Code Extension - Main Entry Point
 *
 * Simplified to two views:
 * - Issues: List of all beads
 * - Details: Selected bead details
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { BeadsProjectManager } from "./backend/BeadsProjectManager";
import { IssuesFilter } from "./backend/types";
import { DashboardViewProvider } from "./providers/DashboardViewProvider";
import { BeadsPanelViewProvider } from "./providers/BeadsPanelViewProvider";
import { BeadDetailsViewProvider } from "./providers/BeadDetailsViewProvider";
import { BeadPanelManager } from "./providers/BeadPanelManager";
import { createLogger, Logger } from "./utils/logger";
import { CONFIG_NAMESPACE } from "./constants";
import { setAppInfo } from "./appInfo";

let log: Logger;
let projectManager: BeadsProjectManager;
let dashboardProvider: DashboardViewProvider;
let beadsPanelProvider: BeadsPanelViewProvider;
let detailsProvider: BeadDetailsViewProvider;
let panelManager: BeadPanelManager;
let statusBar: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Create the root logger with LogOutputChannel
  log = createLogger("Beads");

  // Log activation with version and timestamp for debugging
  const ext = context.extension;
  const version = ext.packageJSON.version || "unknown";
  const isDev = ext.extensionPath.includes("-dev") || !ext.extensionPath.includes(".vscode");
  const timestamp = new Date().toISOString();
  log.info(`Activating v${version}${isDev ? " (dev)" : ""} @ ${timestamp}`);

  // Build identity stamped at compile time (dist/build-info.json). Absent in
  // some dev flows → SHA stays "unknown", which is fine.
  let buildSha = "unknown";
  let buildDirty = false;
  let builtAt: string | null = null;
  try {
    const raw = fs.readFileSync(path.join(ext.extensionPath, "dist", "build-info.json"), "utf8");
    const info = JSON.parse(raw) as { sha?: string; dirty?: boolean; builtAt?: string };
    buildSha = info.sha || "unknown";
    buildDirty = info.dirty === true;
    builtAt = info.builtAt ?? null;
  } catch {
    // no build-info.json → leave defaults
  }
  setAppInfo({ version, sha: buildSha, dirty: buildDirty, builtAt });
  log.info(`Build ${buildSha}${buildDirty ? " (dirty)" : ""}`);

  const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
  const configuredProjects = config.get<string[]>("projects", []);
  const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  log.debug(`config.pathToBd=${config.get<string>("pathToBd", "bd")}`);
  log.debug(`config.projects=${configuredProjects.length > 0 ? configuredProjects.join(",") : "<none>"}`);
  log.debug(`config.refreshInterval=${config.get<number>("refreshInterval", 3000)}`);
  log.debug(`config.renderMarkdown=${config.get<boolean>("renderMarkdown", true)}`);
  log.debug(`config.userId=${config.get<string>("userId", "") || "<empty>"}`);
  log.debug(`config.tooltipHoverDelay=${config.get<number>("tooltipHoverDelay", 1000)}`);
  log.debug(`config.workspaceFolders=${workspaceFolders.length > 0 ? workspaceFolders.join(",") : "<none>"}`);

  // Initialize the project manager
  projectManager = new BeadsProjectManager(context, log);
  await projectManager.initialize();

  // Initialize context for conditional menu items
  vscode.commands.executeCommand("setContext", "beads.hasSelectedBead", false);

  // Create view providers
  dashboardProvider = new DashboardViewProvider(
    context.extensionUri,
    projectManager,
    log
  );

  beadsPanelProvider = new BeadsPanelViewProvider(
    context.extensionUri,
    projectManager,
    log
  );

  detailsProvider = new BeadDetailsViewProvider(
    context.extensionUri,
    projectManager,
    log
  );

  // Manages bead webviews opened as editor tabs (vs-ask, vs-fx4).
  panelManager = new BeadPanelManager(context.extensionUri, projectManager, log);
  context.subscriptions.push(panelManager);

  // Register webview providers
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("beadsDashboard", dashboardProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider("beadsPanel", beadsPanelProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider("beadsDetails", detailsProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("beads.switchProject", async () => {
      await projectManager.showProjectPicker();
    }),

    vscode.commands.registerCommand("beads.openBeadsPanel", () => {
      vscode.commands.executeCommand("beadsPanel.focus");
    }),

    // Open the Issues panel pre-filtered to a slice (empty filter = all).
    // Used by the Dashboard summary cards and breakdown badges. Focus first so
    // a closed panel resolves its webview, then hand the filter to the provider
    // (which holds it until the webview is ready).
    vscode.commands.registerCommand("beads.openIssuesWithFilter", async (filter?: IssuesFilter) => {
      await vscode.commands.executeCommand("beadsPanel.focus");
      beadsPanelProvider.applyIssuesFilter(filter ?? {});
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
        detailsProvider.showBead(beadId);
        beadsPanelProvider.setSelectedBead(beadId);
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
      dashboardProvider.hardRefresh();
      beadsPanelProvider.hardRefresh();
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
        dashboardProvider.refresh();
        beadsPanelProvider.refresh();
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
        dashboardProvider.refresh();
        beadsPanelProvider.refresh();
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

  // Create status bar item
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.command = "beads.showStatusMenu";
  context.subscriptions.push(statusBar);

  // Register status menu command
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

  // Subscribe to project changes to refresh views
  context.subscriptions.push(
    projectManager.onDataChanged(() => {
      dashboardProvider.refresh();
      beadsPanelProvider.refresh();
      detailsProvider.refresh();
    }),

    projectManager.onActiveProjectChanged(() => {
      beadsPanelProvider.setSelectedBead(null); // Clear selection on project switch
      dashboardProvider.refreshForProjectChange();
      beadsPanelProvider.refreshForProjectChange();
      detailsProvider.refreshForProjectChange();
      updateStatusBar();
    }),

    // Refresh the status bar when the active issue prefix is (re-)derived from
    // the loaded issue IDs, so the prefix surfaces without a project switch.
    projectManager.onPrefixChanged(() => {
      updateStatusBar();
    }),

    // Refresh projects when workspace folders change
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      log.info("Workspace folders changed, refreshing projects...");
      const previousActiveId = projectManager.getActiveProject()?.id;
      await projectManager.discoverProjects();

      // If active project was removed, switch to first available
      const projects = projectManager.getProjects();
      const activeStillExists = projects.some((p) => p.id === previousActiveId);

      if (!activeStillExists && projects.length > 0) {
        log.info("Active project removed, switching to first available");
        await projectManager.setActiveProject(projects[0].id);
      } else if (projects.length === 0) {
        log.info("No beads projects remaining");
          updateStatusBar();
      }

      // Refresh all views
      dashboardProvider.refresh();
      beadsPanelProvider.refresh();
      detailsProvider.refresh();
    })
  );

  // Add project manager and logger to subscriptions for disposal
  context.subscriptions.push(projectManager);
  context.subscriptions.push(log.outputChannel);

  // Initialize status bar
  updateStatusBar();

  log.info("Extension activated");

  // Show warning if no projects found
  if (projectManager.getProjects().length === 0) {
    vscode.window.showInformationMessage(
      "No Beads projects found in the workspace. Initialize a project with `bd init` to get started.",
      "Learn More"
    ).then((action) => {
      if (action === "Learn More") {
        vscode.env.openExternal(vscode.Uri.parse("https://github.com/steveyegge/beads"));
      }
    });
  }
}

export function deactivate(): void {
  log?.info("Extension deactivating...");
}

/**
 * Updates the Beads status bar item based on current project state
 */
async function updateStatusBar(): Promise<void> {
  const project = projectManager.getActiveProject();

  if (!project) {
    statusBar.hide();
    return;
  }

  const status = await projectManager.getBackendStatus();

  // Surface the active issue prefix (e.g. "vs") in the label so it's always
  // clear which root is active. Falls back to plain "Beads" until derived.
  const prefix = projectManager.getActivePrefix();
  const label = prefix ? `Beads: ${prefix}` : "Beads";

  switch (status.state) {
    case "running":
      statusBar.text = `$(check) ${label}`;
      statusBar.backgroundColor = undefined;
      statusBar.tooltip = `Beads ready for ${project.name}\n${status.message}\nClick for options`;
      break;
    case "stopped":
      statusBar.text = `$(circle-slash) ${label}`;
      statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      statusBar.tooltip = `Beads unavailable for ${project.name}\n${status.message}\nCheck Output > Beads for details`;
      break;
    case "zombie":
      statusBar.text = `$(warning) ${label}`;
      statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      statusBar.tooltip = `Beads backend unhealthy for ${project.name}\n${status.message}\nCheck Output > Beads for details`;
      break;
    case "not_initialized":
      statusBar.text = `$(circle-slash) ${label}`;
      statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      statusBar.tooltip = `Project not initialized: ${project.name}\n${status.message}`;
      break;
    default:
      statusBar.text = `$(question) ${label}`;
      statusBar.backgroundColor = undefined;
      statusBar.tooltip = `Unknown state for ${project.name}\n${status.message}`;
  }

  statusBar.show();
}
