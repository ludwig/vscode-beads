/**
 * GraphViewProvider - backs a standalone dependency-Graph webview opened as an
 * editor tab (via BeadPanelManager). It reuses the Issues provider's bead
 * loading + requestGraph/setGraph handling and only overrides the routing key
 * so the webview renders the Graph view directly (rather than the PanelShell).
 */

import * as vscode from "vscode";
import { BeadsPanelViewProvider } from "./BeadsPanelViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { ScopeService } from "../backend/ScopeService";
import { Logger } from "../utils/logger";

export class GraphViewProvider extends BeadsPanelViewProvider {
  protected readonly viewType = "beadsGraph";

  constructor(extensionUri: vscode.Uri, projectManager: BeadsProjectManager, logger: Logger, scope?: ScopeService) {
    super(extensionUri, projectManager, logger, undefined, scope);
    // This tab IS the graph, so always push graph data alongside the bead list
    // (on initial load, project switch, refresh, and re-show). Don't depend on
    // the webview's one-shot requestGraph, which races initializeView in a
    // freshly-opened editor tab and leaves the graph empty (vs-e4k).
    this.graphRequested = true;
  }
}
