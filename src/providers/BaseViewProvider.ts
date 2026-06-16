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
import {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from "../backend/types";
import { Logger } from "../utils/logger";
import { resolveEnvVariables } from "../utils/resolve-env-variables";
import { CONFIG_NAMESPACE } from "../constants";
import { getAppInfo } from "../appInfo";
import { WebviewHost, hostFromView } from "./WebviewHost";

export abstract class BaseViewProvider implements vscode.WebviewViewProvider {
  protected _host?: WebviewHost;
  protected readonly extensionUri: vscode.Uri;
  protected readonly projectManager: BeadsProjectManager;
  protected readonly log: Logger;
  protected abstract readonly viewType: string;
  private readonly disposables: vscode.Disposable[] = [];
  // When set, the webview is pulsed once it signals "ready" — used by editor
  // tabs opened via BeadPanelManager so a freshly-created tab flashes a
  // confirmation ring after it mounts (vs-c59).
  private pulseOnReady = false;

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger
  ) {
    this.extensionUri = extensionUri;
    this.projectManager = projectManager;
    this.log = logger;
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
        userId,
        tooltipHoverDelay: config.get<number>("tooltipHoverDelay", 1000),
        extensionVersion: appInfo.version,
        buildSha: appInfo.sha,
        buildDirty: appInfo.dirty,
        isEditorTab: this._host?.isEditorTab ?? false,
      },
    });

    // Load view-specific data only for visible views.
    if (this._host.visible) {
      await this.loadData("initial");
    }
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
        }[message.view];
        vscode.commands.executeCommand(command);
        break;
      }

      case "pickReadyBead":
        vscode.commands.executeCommand("beads.pickReadyBead");
        break;

      case "showIssues":
        vscode.commands.executeCommand("beads.openBeadsPanel");
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

      case "openProjectFolder": {
        const project = this.projectManager.getActiveProject();
        if (project) {
          await vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(project.rootPath));
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

      case "copyBeadId":
        if (message.beadId) {
          await vscode.env.clipboard.writeText(message.beadId);
          vscode.window.setStatusBarMessage(`$(check) Copied: ${message.beadId}`, 2000);
        }
        break;

      case "copyText":
        if (message.text) {
          await vscode.env.clipboard.writeText(message.text);
          vscode.window.setStatusBarMessage(`$(check) Copied ${message.label ?? "text"}`, 2000);
        }
        break;

      case "openBeadInTab":
        vscode.commands.executeCommand("beads.openBeadInTab", message.beadId);
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

      case "startCreate":
        await vscode.commands.executeCommand("beads.createIssue");
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
