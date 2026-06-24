/**
 * BaseViewProvider - Abstract base class for all Beads webview providers
 *
 * Provides common functionality for:
 * - Setting up webview content
 * - Message passing between extension and webview
 * - Loading/error states
 * - Project context
 */

import * as vscode from "vscode";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { FavoritesService } from "../backend/FavoritesService";
import {
  ExtensionToWebviewMessage,
  FavoriteBead,
  FilterSnapshot,
  WebviewToExtensionMessage,
} from "../backend/types";
import { Logger } from "../utils/logger";
import { resolveEnvVariables } from "../utils/resolve-env-variables";
import { CONFIG_NAMESPACE } from "../constants";
import { getAppInfo } from "../appInfo";
import { WebviewHost, hostFromView } from "./WebviewHost";
import { renderBeadMarkdown } from "./beadMarkdown";

export abstract class BaseViewProvider implements vscode.WebviewViewProvider {
  protected _host?: WebviewHost;
  protected readonly extensionUri: vscode.Uri;
  protected readonly projectManager: BeadsProjectManager;
  protected readonly log: Logger;
  // Shared favorites set (vs-sd5.1). Optional so providers that don't surface
  // favorites can omit it; when present, the base wires star/unstar messages
  // and publishes the current set on (re)init.
  protected readonly favorites?: FavoritesService;
  protected abstract readonly viewType: string;
  private readonly disposables: vscode.Disposable[] = [];
  // When set, the webview is pulsed once it signals "ready" — used by editor
  // tabs opened via BeadPanelManager so a freshly-created tab flashes a
  // confirmation ring after it mounts (vs-c59).
  private pulseOnReady = false;
  // One-time Issues-filter snapshot for editor tabs opened via BeadPanelManager
  // (vs-nme). `undefined` = never seeded (sidebar views) → no message sent;
  // `null` or an array = seeded, pushed to the webview on (re)init so a fresh
  // Kanban/Tree/Graph tab inherits the panel's active filter.
  private seedFilteredBeadIds: string[] | null | undefined = undefined;
  // Full Issues-filter snapshot for an Issues editor tab opened from the panel
  // (vs-tle). `undefined` = not seeded; when set, pushed to the webview on init
  // so the tab opens matching the panel's filter spec.
  private seedIssuesFilterSnapshot: FilterSnapshot | undefined = undefined;

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger,
    favorites?: FavoritesService
  ) {
    this.extensionUri = extensionUri;
    this.projectManager = projectManager;
    this.log = logger;
    this.favorites = favorites;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.attach(hostFromView(webviewView));
  }

  /**
   * Binds this provider to a webview host — either a sidebar `WebviewView`
   * (via resolveWebviewView) or an editor-area `WebviewPanel` (via the panel
   * manager). All wiring below is identical for both hosts.
   */
  public attach(host: WebviewHost): void {
    this._host = host;

    host.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "dist"),
        vscode.Uri.joinPath(this.extensionUri, "resources"),
      ],
    };

    host.webview.html = this.getHtmlForWebview(host.webview);

    // Handle messages from the webview
    this.disposables.push(
      host.webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage) => {
        await this.handleMessage(message);
      })
    );

    // Refresh data when the host becomes visible again (e.g., after being hidden)
    this.disposables.push(
      host.onDidChangeVisibility(() => {
        if (host.visible) {
          this.initializeView();
        }
      })
    );

    // Tear down per-host subscriptions when the host goes away (panel closed).
    this.disposables.push(host.onDidDispose(() => this.dispose()));

    // Note: We don't call initializeView() here because the webview's React app
    // hasn't loaded yet. Instead, we wait for the "ready" message from the webview
    // (handled in handleMessage) which indicates the app is ready to receive data.
  }

  /** Releases per-host subscriptions. Safe to call more than once. */
  public dispose(): void {
    for (const d of this.disposables.splice(0)) {
      try {
        d.dispose();
      } catch {
        /* ignore */
      }
    }
    this._host = undefined;
  }

  /**
   * Initializes the view with current data
   */
  protected async initializeView(): Promise<void> {
    if (!this._host) {
      return;
    }

    // Send view type
    this.postMessage({ type: "setViewType", viewType: this.viewType });

    // Send current project
    const project = this.projectManager.getActiveProject();
    this.postMessage({ type: "setProject", project });

    // Send all available projects
    const projects = this.projectManager.getProjects();
    this.postMessage({ type: "setProjects", projects });

    // Send settings
    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    // User ID: prefer setting, fallback to $USER, then "unknown"
    const rawUserId = config.get<string>("userId", "");
    const userId = resolveEnvVariables(rawUserId || "") || process.env.USER || process.env.USERNAME || "unknown";
    const appInfo = getAppInfo();
    this.postMessage({
      type: "setSettings",
      settings: {
        renderMarkdown: config.get<boolean>("renderMarkdown", true),
        highlightFavorites: config.get<boolean>("highlightFavorites", true),
        favoritesHighlightColor: config.get<string>("favoritesHighlightColor", "#dcc173"),
        muteClosedIssues: config.get<boolean>("muteClosedIssues", true),
        userId,
        tooltipHoverDelay: config.get<number>("tooltipHoverDelay", 1000),
        extensionVersion: appInfo.version,
        buildSha: appInfo.sha,
        buildDirty: appInfo.dirty,
        isEditorTab: this._host?.isEditorTab ?? false,
        bundleBytes: appInfo.bundleBytes,
      },
    });

    // Seed the Issues-filter snapshot for editor tabs (vs-nme). Sent after
    // settings so the view has its render mode before scoping. Sidebar views
    // never set this (stays undefined) and get no message.
    if (this.seedFilteredBeadIds !== undefined) {
      this.postMessage({ type: "seedFilter", filteredBeadIds: this.seedFilteredBeadIds });
    }
    if (this.seedIssuesFilterSnapshot !== undefined) {
      this.postMessage({ type: "applyIssuesFilterSnapshot", snapshot: this.seedIssuesFilterSnapshot });
    }

    // Publish the current favorites set so the view can render it immediately
    // on (re)mount (vs-sd5.1).
    if (this.favorites) {
      this.publishFavorites(this.favorites.list());
    }

    // Load view-specific data only for visible views.
    if (this._host.visible) {
      await this.loadData("initial");
    }
  }

  /**
   * Push the favorites set to this view (called when the shared set changes).
   * The ids are the persisted truth; we resolve each to a lightweight summary
   * from the bead cache so the Favorites section can show id + title + type
   * icon. Uncached favorites degrade gracefully to `{ id }` (vs-sd5.1).
   */
  public publishFavorites(ids: string[]): void {
    const favorites: FavoriteBead[] = ids.map((id) => {
      const bead = this.projectManager.getCachedBead(id);
      return bead
        ? { id, title: bead.title, type: bead.type, status: bead.status, priority: bead.priority }
        : { id };
    });
    this.postMessage({ type: "setFavorites", favorites });
  }

  /**
   * Loads view-specific data. Override in subclasses.
   */
  protected abstract loadData(reason?: "initial" | "projectChange" | "manualRefresh" | "background"): Promise<void>;

  /**
   * Handles messages from the webview. Override in subclasses for custom handling.
   */
  protected async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        await this.initializeView();
        if (this.pulseOnReady) {
          this.pulseOnReady = false;
          this.pulse();
        }
        break;

      case "refresh":
        // Flash the confirmation ring so a manual refresh reads as registered,
        // then reload (vs-y1vz). pulse() no-ops if the webview isn't visible.
        this.pulse();
        await this.loadData("manualRefresh");
        break;

      case "selectProject": {
        let switched = await this.projectManager.setActiveProject(message.projectId);
        if (!switched && message.projectRootPath) {
          const fallback = this.projectManager
            .getProjects()
            .find((project) => project.rootPath === message.projectRootPath);
          if (fallback) {
            switched = await this.projectManager.setActiveProject(fallback.id);
          }
        }
        break;
      }

      case "selectBead":
        vscode.commands.executeCommand("beads.openBeadDetails", message.beadId);
        break;

      case "openViewInTab": {
        const command = {
          issues: "beads.openIssuesInTab",
          dashboard: "beads.openDashboardInTab",
          graph: "beads.openGraphInTab",
          kanban: "beads.openKanbanInTab",
          tree: "beads.openTreeInTab",
        }[message.view];
        // Seed the new tab so it opens scoped, not unfiltered: Issues inherits
        // the full filter spec (vs-tle), the id-driven views inherit the bead-id
        // slice (vs-nme).
        const seed = message.view === "issues" ? (message.issuesFilter ?? null) : (message.filteredBeadIds ?? null);
        vscode.commands.executeCommand(command, seed);
        break;
      }

      case "applyFilterGlobally":
        // Fan out this Issues tab's filter to every open surface (vs-dzm). The
        // command (registerCommands) holds the shell provider + panel manager.
        vscode.commands.executeCommand(
          "beads.applyFilterGlobally",
          message.snapshot,
          message.filteredBeadIds
        );
        break;

      case "pickReadyBead":
        vscode.commands.executeCommand("beads.pickReadyBead");
        break;

      case "showIssues":
        vscode.commands.executeCommand("beads.openBeadsPanel");
        break;

      case "showKanban":
        vscode.commands.executeCommand("beads.openKanbanPanel");
        break;

      case "showDoltStatus":
        vscode.commands.executeCommand("beads.showDoltStatus");
        break;

      case "startDoltServer":
        vscode.commands.executeCommand("beads.startDoltServer");
        break;

      case "stopDoltServer":
        vscode.commands.executeCommand("beads.stopDoltServer");
        break;

      case "openDoltLog":
        vscode.commands.executeCommand("beads.openDoltLog");
        break;

      case "openRepositoryDetails":
        vscode.commands.executeCommand("beads.openRepositoryDetails");
        break;

      case "exportIssues":
        vscode.commands.executeCommand("beads.exportIssues");
        break;

      case "openProjectFolder": {
        const project = this.projectManager.getActiveProject();
        if (project) {
          // Open the board root in the OS file manager (Finder/Explorer/Files).
          // `revealInExplorer` only reveals folders inside the open workspace —
          // a no-op for a ~/beads/<board> root that isn't one (vs-cn01).
          await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(project.rootPath));
        }
        break;
      }

      case "openBeadDetails":
        vscode.commands.executeCommand("beads.openBeadDetails", message.beadId);
        break;

      case "viewInGraph":
        // Switch the panel to the Graph tab and focus this bead's neighborhood.
        vscode.commands.executeCommand("beads.viewInGraph", message.beadId);
        break;

      case "viewInTree":
        // Switch the panel to the Tree tab and reveal this bead (vs-kp67).
        vscode.commands.executeCommand("beads.viewInTree", message.beadId);
        break;

      case "viewInKanban":
        // Switch the panel to the Kanban tab and reveal this bead (vs-wbrz).
        vscode.commands.executeCommand("beads.viewInKanban", message.beadId);
        break;

      case "viewInIssues":
        // Switch the panel to the Issues tab and reveal this bead (vs-wbrz).
        vscode.commands.executeCommand("beads.viewInIssues", message.beadId);
        break;

      case "copyBeadId":
        if (message.beadId) {
          await vscode.env.clipboard.writeText(message.beadId);
          // Status-bar confirmation is the default. A few callers (the Details
          // view, far from the status bar) opt into an in-view toast as well.
          vscode.window.setStatusBarMessage(`$(check) Copied: ${message.beadId}`, 2000);
          if (message.toast) {
            this.postMessage({ type: "showToast", text: `Copied ${message.beadId}` });
          }
        }
        break;

      case "copyText":
        if (message.text) {
          await vscode.env.clipboard.writeText(message.text);
          vscode.window.setStatusBarMessage(`$(check) Copied ${message.label ?? "text"}`, 2000);
          if (message.toast) {
            this.postMessage({ type: "showToast", text: `Copied ${message.label ?? "text"}` });
          }
        }
        break;

      case "copyBeadJson":
        if (message.beadId) {
          // Copy the canonical bead record (via the backend) rather than the
          // possibly-partial in-memory row, so the JSON is faithful.
          const backend = this.projectManager.getBackend();
          const issue = backend ? await backend.show(message.beadId) : null;
          if (issue) {
            await vscode.env.clipboard.writeText(JSON.stringify(issue, null, 2));
            vscode.window.setStatusBarMessage(`$(check) Copied JSON: ${message.beadId}`, 2000);
            if (message.toast) {
              this.postMessage({ type: "showToast", text: `Copied JSON for ${message.beadId}` });
            }
          } else {
            vscode.window.setStatusBarMessage(`$(error) Could not load ${message.beadId}`, 2000);
          }
        }
        break;

      case "copyBeadMarkdown":
        if (message.beadId) {
          // Same canonical fetch + renderer as the LLM companion doc
          // (renderBeadMarkdown), so the copied markdown is identical to what
          // Claude Code seeds (vs-3pb5 / vs-nr3d).
          const backend = this.projectManager.getBackend();
          const issue = backend ? await backend.show(message.beadId) : null;
          if (issue) {
            await vscode.env.clipboard.writeText(renderBeadMarkdown(issue));
            vscode.window.setStatusBarMessage(`$(check) Copied Markdown: ${message.beadId}`, 2000);
            if (message.toast) {
              this.postMessage({ type: "showToast", text: `Copied Markdown for ${message.beadId}` });
            }
          } else {
            vscode.window.setStatusBarMessage(`$(error) Could not load ${message.beadId}`, 2000);
          }
        }
        break;

      case "openBeadInTab":
        vscode.commands.executeCommand("beads.openBeadInTab", message.beadId);
        break;

      case "openNewIssueInTab":
        vscode.commands.executeCommand("beads.openNewIssueInTab");
        break;

      case "openFile":
        await this.handleOpenFile(message.filePath, message.line);
        break;

      case "openExternal":
        await this.handleOpenExternal(message.url);
        break;

      case "openIssuesWithFilter":
        await vscode.commands.executeCommand("beads.openIssuesWithFilter", message.filter);
        break;

      case "toggleFavorite":
        if (!this.favorites) {
          // This view renders favorite-toggle UI but wasn't wired to the shared
          // FavoritesService at construction — the toggle would silently no-op
          // (the bug behind the panel's "Add to Favorites" doing nothing). Make
          // it loud instead of swallowing it.
          this.log.warn(`toggleFavorite ignored: ${this.viewType} has no FavoritesService`);
          break;
        }
        await this.favorites.toggle(message.beadId);
        break;

      case "removeFavorite":
        if (!this.favorites) {
          this.log.warn(`removeFavorite ignored: ${this.viewType} has no FavoritesService`);
          break;
        }
        await this.favorites.remove(message.beadId);
        break;

      case "startCreate":
        await vscode.commands.executeCommand("beads.createIssue");
        break;

      case "createBoard":
        await vscode.commands.executeCommand("beads.initRepository");
        break;

      case "openSettings":
        await vscode.commands.executeCommand("beads.openSettings");
        break;

      case "changeProjectsRoot":
        await vscode.commands.executeCommand("beads.setProjectsRoot");
        break;

      default:
        await this.handleCustomMessage(message);
    }
  }

  /**
   * Override in subclasses to handle view-specific messages
   */
  protected async handleCustomMessage(
    _message: WebviewToExtensionMessage
  ): Promise<void> {
    // Default: do nothing
  }

  /**
   * Opens a file in the editor, optionally at a specific line
   */
  private async handleOpenFile(filePath: string, line?: number): Promise<void> {
    const project = this.projectManager.getActiveProject();
    if (!project) {
      vscode.window.showWarningMessage("No active project");
      return;
    }

    // Resolve path relative to project root
    const resolvedPath = filePath.startsWith("/")
      ? filePath
      : vscode.Uri.joinPath(vscode.Uri.file(project.rootPath), filePath).fsPath;

    const fileUri = vscode.Uri.file(resolvedPath);

    try {
      // Check if file exists
      await vscode.workspace.fs.stat(fileUri);

      // Open the file
      const doc = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(doc);

      // If line specified, scroll to it
      if (line !== undefined && line > 0) {
        const lineIndex = line - 1; // VS Code uses 0-based line numbers
        const position = new vscode.Position(lineIndex, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );
      }
    } catch (err) {
      vscode.window.showWarningMessage(`File not found: ${filePath}`);
    }
  }

  /**
   * Opens an external URL in the system handler. The webview already
   * allowlists schemes before sending, but we re-validate here so the
   * extension never hands an untrusted scheme (javascript:, file:, …) to
   * openExternal.
   */
  private async handleOpenExternal(url: string): Promise<void> {
    let parsed: vscode.Uri;
    try {
      parsed = vscode.Uri.parse(url, true);
    } catch {
      return;
    }
    if (!["http", "https", "mailto"].includes(parsed.scheme.toLowerCase())) {
      return;
    }
    await vscode.env.openExternal(parsed);
  }

  /**
   * Sends a message to the webview
   */
  protected postMessage(message: ExtensionToWebviewMessage): void {
    if (this._host) {
      this._host.webview.postMessage(message);
    }
  }

  /**
   * Sets the loading state in the webview
   */
  protected setLoading(loading: boolean): void {
    this.postMessage({ type: "setLoading", loading });
  }

  /**
   * Minimum time (ms) a loading state is held so the spinner doesn't flash on a
   * fast load. Shared by views that show a loading state (vs-qai).
   */
  protected static readonly MIN_LOADING_MS = 500;

  /**
   * Awaits the remainder of MIN_LOADING_MS since `startedAt`, so a quick refresh
   * still shows the loading state long enough to avoid a jarring flash. No-op if
   * the minimum has already elapsed. (vs-qai — hoisted from the view providers.)
   */
  protected async waitForMinimumLoading(startedAt: number): Promise<void> {
    const remaining = BaseViewProvider.MIN_LOADING_MS - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  /**
   * Sets an error message in the webview
   */
  protected setError(error: string | null): void {
    this.postMessage({ type: "setError", error });
  }

  /**
   * Handles backend connection errors - logs and notifies ProjectManager
   * Views show error state in UI; centralized notification handled by ProjectManager
   */
  protected handleBackendError(message: string, err: unknown): void {
    this.log.error(`${message}: ${err}`);
    // ProjectManager handles notification details - views just update their error state
    this.projectManager.notifyBackendError(err);
  }

  /**
   * Flash a confirmation ring in the webview (vs-c59). Used when an editor tab
   * is revealed so re-opening an already-open tab gives visible feedback.
   * No-op if the webview isn't live yet — use pulseWhenReady() for that case.
   */
  public pulse(): void {
    if (this._host?.visible) {
      this.postMessage({ type: "pulse" });
    }
  }

  /** Pulse once the webview signals "ready" (for freshly-created tabs). */
  public pulseWhenReady(): void {
    this.pulseOnReady = true;
  }

  /**
   * Seed this view with a one-time snapshot of the Issues filter (vs-nme), so a
   * freshly-opened editor-tab Kanban/Tree/Graph inherits the panel's active
   * filter. Set synchronously before the webview's "ready" handshake (like
   * showBead). `null` seeds "no filter".
   */
  public seedFilter(filteredBeadIds: string[] | null): void {
    this.seedFilteredBeadIds = filteredBeadIds;
  }

  /**
   * Seed this view with a full Issues-filter snapshot before its "ready"
   * handshake (vs-tle), so an Issues editor tab opens matching the panel.
   */
  public seedIssuesFilter(snapshot: FilterSnapshot): void {
    this.seedIssuesFilterSnapshot = snapshot;
  }

  /**
   * Push a filter update to an already-live view (vs-dzm "Apply to all"). For
   * id-driven views (Kanban/Tree/Graph) pass the bead-id slice; for Issues
   * views pass the full snapshot. Also updates the retained seed so a webview
   * reload re-applies it. No-op when the webview isn't mounted yet — the seed
   * carries it in via initializeView.
   */
  public pushFilter(update: { filteredBeadIds: string[] } | { snapshot: FilterSnapshot }): void {
    if ("snapshot" in update) {
      this.seedIssuesFilterSnapshot = update.snapshot;
      this.postMessage({ type: "applyIssuesFilterSnapshot", snapshot: update.snapshot });
    } else {
      this.seedFilteredBeadIds = update.filteredBeadIds;
      this.postMessage({ type: "seedFilter", filteredBeadIds: update.filteredBeadIds });
    }
  }

  /**
   * Triggers a refresh of the view
   */
  public refresh(): void {
    if (!this._host?.visible) {
      return;
    }

    // Update project state in webview
    const project = this.projectManager.getActiveProject();
    this.postMessage({ type: "setProject", project });

    // Also update projects list (for dropdown status indicators)
    const projects = this.projectManager.getProjects();
    this.postMessage({ type: "setProjects", projects });

    this.loadData("background");
  }

  public hardRefresh(): void {
    if (!this._host?.visible) {
      return;
    }

    const project = this.projectManager.getActiveProject();
    this.postMessage({ type: "setProject", project });

    const projects = this.projectManager.getProjects();
    this.postMessage({ type: "setProjects", projects });

    this.loadData("manualRefresh");
  }

  /**
   * Triggers a refresh intended for active project switches.
   */
  public refreshForProjectChange(): void {
    if (!this._host?.visible) {
      return;
    }

    const project = this.projectManager.getActiveProject();
    this.postMessage({ type: "setProject", project });

    const projects = this.projectManager.getProjects();
    this.postMessage({ type: "setProjects", projects });

    this.loadData("projectChange");
  }

  /**
   * Generates the HTML content for the webview
   */
  protected getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "main.js")
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "main.css")
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>Beads</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Generates a random nonce for CSP
   */
  private getNonce(): string {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
