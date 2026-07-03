/**
 * PanelShellViewProvider - backs the single consolidated bottom-Panel webview
 * (PanelShell), which hosts the Dashboard and Issues subviews behind an in-view
 * nav row.
 *
 * It extends the Issues provider (so it already loads the full bead list and
 * handles selection / inline edits / drill-in filters) and additionally derives
 * the Dashboard summary from that SAME list via the onBeadsLoaded hook — so the
 * panel makes one `bd list` spawn serve both subviews instead of two.
 */

import * as vscode from "vscode";
import { BeadsPanelViewProvider } from "./BeadsPanelViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { FavoritesService } from "../backend/FavoritesService";
import { Bead, BeadPriority, BeadsSummary, BUILTIN_STATUSES } from "../backend/types";
import { Logger } from "../utils/logger";

export class PanelShellViewProvider extends BeadsPanelViewProvider {
  protected readonly viewType = "beadsPanelShell";

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger,
    favorites?: FavoritesService
  ) {
    super(extensionUri, projectManager, logger, favorites);
  }

  /** Derive and push the Dashboard summary from the just-loaded bead list. */
  protected onBeadsLoaded(beads: Bead[]): void {
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
  }
}
