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
  protected readonly viewType = "beadsPanel";
  private static readonly MIN_LOADING_MS = 500;
  private selectedBeadId: string | null = null;
  private loadSequence = 0;
  // Drill-in filter requested from another view (e.g. a Dashboard card/badge).
  // Held until the webview is ready so a freshly-focused panel still applies it.
  private pendingFilter: IssuesFilter | undefined;

  /**
   * Apply a drill-in filter to the Issues list (empty filter = show all).
   * Posts immediately when the webview is live; otherwise it's flushed once the
   * webview signals ready (initializeView).
   */
  public applyIssuesFilter(filter: IssuesFilter): void {
    this.pendingFilter = filter;
    this.flushFilter();
  }

  private flushFilter(): void {
    if (this.pendingFilter !== undefined && this._host?.visible) {
      this.postMessage({ type: "applyIssuesFilter", filter: this.pendingFilter });
      this.pendingFilter = undefined;
    }
  }

  protected async initializeView(): Promise<void> {
    await super.initializeView();
    this.flushFilter();
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
    }
  }
}
