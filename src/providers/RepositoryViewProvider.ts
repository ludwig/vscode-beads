/**
 * RepositoryViewProvider - Provides the Repository Details editor-tab page
 *
 * Surfaces rich repository + Dolt backend info (location, backend mode/status,
 * raw `bd dolt status`, issue counts) so the Repository pane's ⋮ menu no longer
 * has to dump Dolt status into the output log (vs-beoh). Mirrors
 * DashboardViewProvider: extends BaseViewProvider, overrides loadData, posts a
 * summary; additionally posts setRepositoryInfo.
 */

import * as vscode from "vscode";
import { BaseViewProvider } from "./BaseViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { Bead, BeadsSummary, issueToWebviewBead, BeadPriority, BUILTIN_STATUSES } from "../backend/types";
import { doltStatusIsRunning } from "../backend/repositoryInitializer";
import { Logger } from "../utils/logger";

export class RepositoryViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsRepository";
  private loadSequence = 0;

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger
  ) {
    super(extensionUri, projectManager, logger.child("Repository"));
  }

  protected async loadData(reason: "initial" | "projectChange" | "manualRefresh" | "background" = "background"): Promise<void> {
    const thisRequest = ++this.loadSequence;
    const client = this.projectManager.getClient();
    if (!client) {
      this.postMessage({ type: "setRepositoryInfo", doltStatus: "", running: false });
      this.postMessage({ type: "setSummary", summary: null });
      return;
    }

    const showLoading = reason === "initial" || reason === "projectChange" || reason === "manualRefresh";
    const loadingStartedAt = showLoading ? Date.now() : 0;
    if (showLoading) {
      this.postMessage({ type: "setSummary", summary: null });
      this.setLoading(true);
    }
    this.setError(null);

    try {
      // Raw `bd dolt status` text; tolerate failures (e.g. embedded mode has no
      // server) by treating any error as empty/not-running.
      let doltStatusText = "";
      try {
        doltStatusText = await client.doltStatus();
      } catch {
        doltStatusText = "";
      }
      const running = doltStatusIsRunning(doltStatusText);

      const issues = await client.list();
      if (showLoading) {
        await this.waitForMinimumLoading(loadingStartedAt);
      }
      if (thisRequest !== this.loadSequence) {
        return;
      }

      this.postMessage({ type: "setRepositoryInfo", doltStatus: doltStatusText, running });

      // Summary computed exactly as DashboardViewProvider does, so the Issues
      // card matches the Dashboard.
      const beads = issues.map(issueToWebviewBead).filter((b): b is Bead => b !== null);
      const byStatus: Record<string, number> = Object.fromEntries(BUILTIN_STATUSES.map((s) => [s, 0]));
      const byPriority: Record<BeadPriority, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };

      for (const bead of beads) {
        byStatus[bead.status] = (byStatus[bead.status] ?? 0) + 1;
        if (bead.priority !== undefined) byPriority[bead.priority]++;
      }

      const summary: BeadsSummary = {
        total: beads.length,
        byStatus,
        byPriority,
        readyCount: byStatus.open,
        blockedCount: byStatus.blocked,
        inProgressCount: byStatus.in_progress,
      };

      this.postMessage({ type: "setSummary", summary });
      this.setLoading(false);
    } catch (err) {
      if (showLoading) {
        await this.waitForMinimumLoading(loadingStartedAt);
      }
      if (thisRequest !== this.loadSequence) {
        return;
      }
      this.setError(String(err));
      this.handleBackendError("Failed to load repository details", err);
    } finally {
      if (thisRequest === this.loadSequence) {
        this.setLoading(false);
      }
    }
  }
}
