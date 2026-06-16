/**
 * GraphViewProvider - backs a standalone dependency-Graph webview opened as an
 * editor tab (via BeadPanelManager). It reuses the Issues provider's bead
 * loading + requestGraph/setGraph handling and only overrides the routing key
 * so the webview renders the Graph view directly (rather than the PanelShell).
 */

import * as vscode from "vscode";
import { BeadsPanelViewProvider } from "./BeadsPanelViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { Logger } from "../utils/logger";

export class GraphViewProvider extends BeadsPanelViewProvider {
  protected readonly viewType = "beadsGraph";

  constructor(extensionUri: vscode.Uri, projectManager: BeadsProjectManager, logger: Logger) {
    super(extensionUri, projectManager, logger);
  }
}
