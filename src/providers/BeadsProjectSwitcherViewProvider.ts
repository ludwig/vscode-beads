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

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger
  ) {
    super(extensionUri, projectManager, logger.child("ProjectSwitcher"));
  }

  protected async loadData(): Promise<void> {
    // No bead data to load — the switcher only needs project/projects, which
    // initializeView() and refresh() already push.
  }
}
