/**
 * BeadsPanelViewProvider - Provides the main Beads Panel view
 *
 * Features:
 * - Table/list view of all beads
 * - Column sorting
 * - Filtering by status, priority, labels, type
 * - Text search
 * - Click to open details
 */

import * as vscode from "vscode";
import { BaseViewProvider } from "./BaseViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { WebviewToExtensionMessage, Bead, IssuesFilter, issueToWebviewBead } from "../backend/types";
import { Logger } from "../utils/logger";
import { deriveIssuePrefix } from "../utils/issue-prefix";

export class BeadsPanelViewProvider extends BaseViewProvider {
  // Declared as `string` (not the inferred literal) so subclasses like the
  // panel shell can override with their own routing key.
  protected readonly viewType: string = "beadsPanel";
  private static readonly MIN_LOADING_MS = 500;
  private selectedBeadId: string | null = null;
  private loadSequence = 0;
  // Drill-in filter requested from another view (e.g. a Dashboard card/badge).
  // Held until the webview is ready so a freshly-focused panel still applies it.
  private pendingFilter: IssuesFilter | undefined;
  // Deep-link to focus a bead on the Graph tab, requested from another view
  // (e.g. the Details "View in graph" action). Held until the webview is ready
  // so a freshly-focused panel still switches to the Graph tab and focuses it.
  private pendingShowGraph: string | undefined;

  /**
   * Apply a drill-in filter to the Issues list (empty filter = show all).
   * Posts immediately when the webview is live; otherwise it's flushed once the
   * webview signals ready (initializeView).
   */
  public applyIssuesFilter(filter: IssuesFilter): void {
    this.pendingFilter = filter;
    this.flushFilter();
  }

  /**
   * Switch the panel to the Graph tab and focus the given bead's neighborhood.
   * Posts immediately when the webview is live; otherwise it's flushed once the
   * webview signals ready (initializeView).
   */
  public showGraphForBead(beadId: string): void {
    this.pendingShowGraph = beadId;
    this.flushShowGraph();
  }

  private flushFilter(): void {
    if (this.pendingFilter !== undefined && this._host?.visible) {
      this.postMessage({ type: "applyIssuesFilter", filter: this.pendingFilter });
      this.pendingFilter = undefined;
    }
  }

  private flushShowGraph(): void {
    if (this.pendingShowGraph !== undefined && this._host?.visible) {
      this.postMessage({ type: "showGraph", beadId: this.pendingShowGraph });
      this.pendingShowGraph = undefined;
    }
  }

  protected async initializeView(): Promise<void> {
    await super.initializeView();
    this.flushFilter();
    this.flushShowGraph();
  }

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger
  ) {
    super(extensionUri, projectManager, logger.child("Panel"));
  }

  /**
   * Set the selected bead ID and notify webview
   */
  public setSelectedBead(beadId: string | null): void {
    this.selectedBeadId = beadId;
    this.postMessage({ type: "setSelectedBeadId", beadId });
  }

  protected async loadData(reason: "initial" | "projectChange" | "manualRefresh" | "background" = "background"): Promise<void> {
    const thisRequest = ++this.loadSequence;
    const client = this.projectManager.getClient();
    if (!client) {
      this.postMessage({ type: "setBeads", beads: [] });
      this.onBeadsLoaded([]);
      return;
    }

    const showLoading = reason === "initial" || reason === "projectChange" || reason === "manualRefresh";
    const loadingStartedAt = showLoading ? Date.now() : 0;
    if (showLoading) {
      this.postMessage({ type: "setBeads", beads: [] });
      this.setLoading(true);
    }
    this.setError(null);

    try {
      const issues = await client.list();
      if (showLoading) {
        await this.waitForMinimumLoading(loadingStartedAt);
      }
      if (thisRequest !== this.loadSequence) {
        return;
      }
      const beads = issues.map(issueToWebviewBead).filter((b): b is Bead => b !== null);
      this.postMessage({ type: "setBeads", beads });
      // Cache the list so the Details view can paint selected beads instantly
      // before the cold `bd show` spawn returns (vs-7s7).
      this.projectManager.cacheBeadList(beads);
      this.projectManager.setActivePrefix(deriveIssuePrefix(issues.map((i) => i.id)));
      this.onBeadsLoaded(beads);
      this.setLoading(false);
    } catch (err) {
      if (showLoading) {
        await this.waitForMinimumLoading(loadingStartedAt);
      }
      if (thisRequest !== this.loadSequence) {
        return;
      }
      this.setError(String(err));
      if (showLoading) {
        this.postMessage({ type: "setBeads", beads: [] });
      }
      this.handleBackendError("Failed to load beads", err);
    } finally {
      if (thisRequest === this.loadSequence) {
        this.setLoading(false);
      }
    }
  }

  /**
   * Hook invoked after the bead list is loaded (or cleared when there's no
   * client). Subclasses override to derive extra payloads from the same list
   * without spawning a second `bd list` — e.g. the panel shell emits the
   * Dashboard summary here. Default: no-op.
   */
  protected onBeadsLoaded(_beads: Bead[]): void {
    // no-op
  }

  private async waitForMinimumLoading(startedAt: number): Promise<void> {
    const remaining = BeadsPanelViewProvider.MIN_LOADING_MS - (Date.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  protected async handleCustomMessage(
    message: WebviewToExtensionMessage
  ): Promise<void> {
    const client = this.projectManager.getClient();
    if (!client) {
      return;
    }

    switch (message.type) {
      case "updateBead":
        try {
          await client.update({
            id: message.beadId,
            ...message.updates,
          });
          this.projectManager.notifyDataChanged();
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to update bead: ${err}`);
        }
        break;

      case "deleteBead":
        vscode.window.showWarningMessage(
          "Delete functionality is not yet implemented"
        );
        break;

      // Edge drawn / removed on the Graph canvas (vs-caz). Mirror the Details
      // view's mapping (reverse swaps from/to), then re-push the graph so the
      // edge change shows up without the user re-opening the tab.
      case "addDependency":
        try {
          const fromId = message.reverse ? message.targetId : message.beadId;
          const toId = message.reverse ? message.beadId : message.targetId;
          await client.addDependency({ from_id: fromId, to_id: toId, dep_type: message.dependencyType });
          this.projectManager.notifyDataChanged();
          await this.sendGraph(client);
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to add dependency: ${err}`);
        }
        break;

      case "removeDependency":
        try {
          await client.removeDependency({ from_id: message.beadId, to_id: message.dependsOnId });
          this.projectManager.notifyDataChanged();
          await this.sendGraph(client);
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to remove dependency: ${err}`);
        }
        break;

      case "requestGraph":
        await this.sendGraph(client);
        break;
    }
  }

  /**
   * Assemble and push the dependency graph for the Graph subview. Nodes reuse
   * the already-loaded bead list (no extra `bd list`); edges come from one
   * mode-native fetch. Called lazily when the Graph tab opens.
   */
  private async sendGraph(client: NonNullable<ReturnType<BeadsProjectManager["getClient"]>>): Promise<void> {
    try {
      let nodes = this.projectManager.getCachedBeadList();
      if (nodes.length === 0) {
        const issues = await client.list();
        nodes = issues.map(issueToWebviewBead).filter((b): b is Bead => b !== null);
        this.projectManager.cacheBeadList(nodes);
      }
      const edges = await client.getDependencyGraph();
      this.postMessage({ type: "setGraph", graph: { nodes, edges } });
    } catch (err) {
      this.handleBackendError("Failed to load dependency graph", err);
    }
  }
}
