/**
 * BeadsProjectSwitcherViewProvider - the slimmed sidebar's project switcher.
 *
 * Renders only the project dropdown (and the active project's path). It carries
 * no bead data — BaseViewProvider.initializeView() already pushes the active
 * project + project list + settings, which is all the switcher needs, so
 * loadData is a no-op. Project changes re-push via refresh()/refreshForProjectChange().
 */

import * as vscode from "vscode";
import { BaseViewProvider } from "./BaseViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { Logger } from "../utils/logger";

export class BeadsProjectSwitcherViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsProjectSwitcher";

  /** The currently-selected ("active") bead, pinned in the view for reference. */
  private activeBeadId: string | null = null;

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger
  ) {
    super(extensionUri, projectManager, logger.child("ProjectSwitcher"));
  }

  /**
   * Pin a bead as the active reference (or clear with null). Reuses the
   * existing `setBead` message; the bead row is resolved from the list cache so
   * we don't spawn a `bd show`.
   */
  public setActiveBead(beadId: string | null): void {
    this.activeBeadId = beadId;
    this.postActiveBead();
  }

  private postActiveBead(): void {
    const bead = this.activeBeadId
      ? this.projectManager.getCachedBead(this.activeBeadId)
      : null;
    this.postMessage({ type: "setBead", bead });
  }

  protected async loadData(): Promise<void> {
    // No bead list to load — the switcher only needs project/projects (pushed by
    // initializeView/refresh). Re-send the pinned active bead on (re)init.
    this.postActiveBead();
  }
}
