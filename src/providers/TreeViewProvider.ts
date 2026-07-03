/**
 * TreeViewProvider - backs a standalone dependency Tree opened as an editor tab
 * (via BeadPanelManager). Reuses the panel provider's bead loading + message
 * handling and only overrides the routing key so the webview renders the Tree
 * directly rather than the PanelShell. Like the Graph tab it pushes graph data
 * proactively, since the Tree is built from the dependency graph and the
 * webview's lazy requestGraph races a freshly-opened tab (vs-xqu.2, cf. vs-e4k).
 */

import * as vscode from "vscode";
import { BeadsPanelViewProvider } from "./BeadsPanelViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { FavoritesService } from "../backend/FavoritesService";
import { ScopeService } from "../backend/ScopeService";
import { Logger } from "../utils/logger";

export class TreeViewProvider extends BeadsPanelViewProvider {
  protected readonly viewType = "beadsTree";

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger,
    favorites?: FavoritesService,
    scope?: ScopeService
  ) {
    super(extensionUri, projectManager, logger, favorites, scope);
    // This tab IS the tree, which renders from the dependency graph — push graph
    // data alongside the bead list on every load instead of waiting for the
    // webview's one-shot requestGraph (which races initializeView, vs-e4k).
    this.graphRequested = true;
  }
}
