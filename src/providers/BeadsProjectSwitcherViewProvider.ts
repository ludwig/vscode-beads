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
import { WebviewToExtensionMessage } from "../backend/types";
import { Logger } from "../utils/logger";

export class BeadsProjectSwitcherViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsProjectSwitcher";

  /** The currently-selected ("active") bead, pinned in the view for reference. */
  private activeBeadId: string | null = null;

  // Low-frequency memory sampler (vs-f50): posts the extension-host RSS to the
  // card while the view is visible. process.memoryUsage() is cheap; we still
  // gate on visibility and tear down on dispose to keep it near-free.
  private memoryTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly MEMORY_SAMPLE_MS = 4000;

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger
  ) {
    super(extensionUri, projectManager, logger.child("ProjectSwitcher"));
  }

  protected async initializeView(): Promise<void> {
    await super.initializeView();
    this.startMemorySampler();
  }

  private startMemorySampler(): void {
    this.sampleMemory();
    if (this.memoryTimer) return;
    this.memoryTimer = setInterval(
      () => this.sampleMemory(),
      BeadsProjectSwitcherViewProvider.MEMORY_SAMPLE_MS
    );
  }

  private sampleMemory(): void {
    if (!this._host?.visible) return;
    // RSS — resident memory of the whole extension-host process as the OS sees
    // it (read from the kernel by process.memoryUsage; not deduced in-process).
    // It's a superset: all extensions + the Node/V8 runtime share this process,
    // so it is NOT a per-extension figure (none is exposed at runtime).
    this.postMessage({ type: "setMemoryUsage", bytes: process.memoryUsage().rss });
  }

  public dispose(): void {
    if (this.memoryTimer) {
      clearInterval(this.memoryTimer);
      this.memoryTimer = null;
    }
    super.dispose();
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

  protected async handleCustomMessage(message: WebviewToExtensionMessage): Promise<void> {
    if (message.type === "clearActiveBead") {
      // Clear every selection surface (Details + table highlight + pin), not
      // just this view's pin.
      await vscode.commands.executeCommand("beads.clearSelection");
    }
  }
}
