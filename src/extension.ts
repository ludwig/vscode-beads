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
import { FavoritesService } from "./backend/FavoritesService";
import { PanelShellViewProvider } from "./providers/PanelShellViewProvider";
import { BeadDetailsViewProvider } from "./providers/BeadDetailsViewProvider";
import { BeadsProjectSwitcherViewProvider } from "./providers/BeadsProjectSwitcherViewProvider";
import { BeadPanelManager } from "./providers/BeadPanelManager";
import { registerCommands } from "./commands/registerCommands";
import { createLogger, Logger } from "./utils/logger";
import { CONFIG_NAMESPACE } from "./constants";
import { setAppInfo } from "./appInfo";

let log: Logger;
let projectManager: BeadsProjectManager;
// One consolidated webview backs the bottom Panel: the shell hosts the
// Dashboard and Issues subviews behind an in-view nav row, and loads the bead
// list once to feed both. The slimmed sidebar holds the project switcher and
// Details.
let shellProvider: PanelShellViewProvider;
let detailsProvider: BeadDetailsViewProvider;
let switcherProvider: BeadsProjectSwitcherViewProvider;
let panelManager: BeadPanelManager;
let favorites: FavoritesService;
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
  let bundleBytes = 0;
  try {
    const raw = fs.readFileSync(path.join(ext.extensionPath, "dist", "build-info.json"), "utf8");
    const info = JSON.parse(raw) as { sha?: string; dirty?: boolean; builtAt?: string; bundleBytes?: number };
    buildSha = info.sha || "unknown";
    buildDirty = info.dirty === true;
    builtAt = info.builtAt ?? null;
    bundleBytes = info.bundleBytes ?? 0;
  } catch {
    // no build-info.json → leave defaults
  }
  setAppInfo({ version, sha: buildSha, dirty: buildDirty, builtAt, bundleBytes });
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

  // Favorites: per-project set of starred beads, persisted in workspaceState
  // and published to every view (vs-sd5.1). Point it at the active project up
  // front so the first render shows the right set.
  favorites = new FavoritesService(context.workspaceState);
  favorites.setActiveProject(projectManager.getActiveProject()?.id ?? null);
  context.subscriptions.push(favorites);

  // Initialize context for conditional menu items
  vscode.commands.executeCommand("setContext", "beads.hasSelectedBead", false);
  vscode.commands.executeCommand("setContext", "beads.canNavigateBack", false);
  vscode.commands.executeCommand("setContext", "beads.canNavigateForward", false);

  // Create view providers. The bottom Panel is one consolidated shell;
  // the slimmed sidebar holds the project switcher and Details.
  shellProvider = new PanelShellViewProvider(
    context.extensionUri,
    projectManager,
    log
  );

  switcherProvider = new BeadsProjectSwitcherViewProvider(
    context.extensionUri,
    projectManager,
    log,
    favorites
  );

  detailsProvider = new BeadDetailsViewProvider(
    context.extensionUri,
    projectManager,
    log,
    favorites
  );

  // Manages bead webviews opened as editor tabs (vs-ask, vs-fx4).
  panelManager = new BeadPanelManager(context.extensionUri, projectManager, log, favorites);
  context.subscriptions.push(panelManager);

  // Register webview providers
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("beadsProjectSwitcher", switcherProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider("beadsPanelShell", shellProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider("beadsDetails", detailsProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Create the status-bar item; its click runs beads.showStatusMenu (registered
  // by registerCommands below).
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.command = "beads.showStatusMenu";
  context.subscriptions.push(statusBar);

  // Register all beads.* commands (see src/commands/registerCommands.ts).
  registerCommands(context, {
    projectManager,
    shellProvider,
    detailsProvider,
    switcherProvider,
    panelManager,
    log,
    updateStatusBar,
  });

  // Subscribe to project changes to refresh views
  context.subscriptions.push(
    // Fan the favorites set out to every live view whenever it changes (a
    // star/unstar in one view, or a project switch). vs-sd5.1.
    favorites.onDidChange((ids) => {
      shellProvider.publishFavorites(ids);
      detailsProvider.publishFavorites(ids);
      switcherProvider.publishFavorites(ids);
      panelManager.publishFavorites(ids);
    }),

    // When a project's bead list (re)caches, re-publish favorites so their
    // id→title/type resolution fills in. On a project switch the cache is
    // cleared then refilled asynchronously, so the initial post-switch publish
    // resolves to bare ids until this fires (vs-sd5.1).
    projectManager.onBeadsCached(() => {
      const ids = favorites.list();
      shellProvider.publishFavorites(ids);
      detailsProvider.publishFavorites(ids);
      switcherProvider.publishFavorites(ids);
      panelManager.publishFavorites(ids);
    }),

    projectManager.onDataChanged(() => {
      shellProvider.refresh();
      detailsProvider.refresh();
      switcherProvider.refresh();
    }),

    projectManager.onActiveProjectChanged(() => {
      // Re-point favorites at the new project (fires onDidChange → re-publishes).
      favorites.setActiveProject(projectManager.getActiveProject()?.id ?? null);
      shellProvider.setSelectedBead(null); // Clear selection on project switch
      switcherProvider.setActiveBead(null);
      shellProvider.refreshForProjectChange();
      detailsProvider.refreshForProjectChange();
      switcherProvider.refreshForProjectChange();
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
      shellProvider.refresh();
      detailsProvider.refresh();
      switcherProvider.refresh();
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
