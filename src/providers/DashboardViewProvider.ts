/**
 * DashboardViewProvider - Provides the Dashboard summary view
 *
 * Features:
 * - Summary cards with counts by status
 * - Priority breakdown
 * - Ready/blocked/in-progress sections
 * - Quick access to important beads
 */

import * as vscode from "vscode";
import { BaseViewProvider } from "./BaseViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { Bead, BeadsSummary, issueToWebviewBead, BeadPriority, BUILTIN_STATUSES } from "../backend/types";
import { Logger } from "../utils/logger";
import { deriveIssuePrefix } from "../utils/issue-prefix";

export class DashboardViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsDashboard";
  private loadSequence = 0;

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger
  ) {
    super(extensionUri, projectManager, logger.child("Dashboard"));
  }

  protected async loadData(reason: "initial" | "projectChange" | "manualRefresh" | "background" = "background"): Promise<void> {
    const thisRequest = ++this.loadSequence;
    const client = this.projectManager.getClient();
    if (!client) {
      this.postMessage({
        type: "setSummary",
        summary: {
          total: 0,
          byStatus: { open: 0, in_progress: 0, blocked: 0, closed: 0 },
          byPriority: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
          readyCount: 0,
          blockedCount: 0,
          inProgressCount: 0,
        },
      });
      this.postMessage({ type: "setBeads", beads: [] });
      return;
    }

    const showLoading = reason === "initial" || reason === "projectChange" || reason === "manualRefresh";
    const loadingStartedAt = showLoading ? Date.now() : 0;
    if (showLoading) {
      this.postMessage({ type: "setSummary", summary: null });
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
      // Seed all built-ins to 0 so they render even at 0; custom statuses are
      // added on demand as beads are counted.
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
      // Cache the full list (not just the dashboard slice) so selecting a bead
      // from the dashboard also paints instantly before `bd show` (vs-7s7).
      this.projectManager.cacheBeadList(beads);
      this.projectManager.setActivePrefix(deriveIssuePrefix(issues.map((i) => i.id)));

      const openBeads = beads.filter((b) => b.status === "open").slice(0, 5);
      const blockedBeads = beads.filter((b) => b.status === "blocked").slice(0, 5);
      const inProgressBeads = beads.filter((b) => b.status === "in_progress").slice(0, 5);
      this.postMessage({ type: "setBeads", beads: [...openBeads, ...blockedBeads, ...inProgressBeads] });
      this.setLoading(false);
    } catch (err) {
      if (showLoading) {
        await this.waitForMinimumLoading(loadingStartedAt);
      }
      if (thisRequest !== this.loadSequence) {
        return;
      }
      this.setError(String(err));
      this.handleBackendError("Failed to load dashboard", err);
    } finally {
      if (thisRequest === this.loadSequence) {
        this.setLoading(false);
      }
    }
  }

}
