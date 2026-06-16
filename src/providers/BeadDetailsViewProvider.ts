/**
 * BeadDetailsViewProvider - Provides the Bead Details view
 *
 * Features:
 * - Full view/edit of a single bead
 * - Editable fields: title, description, status, priority, type, labels, assignee
 * - Dependency management
 * - View in graph button
 */

import * as vscode from "vscode";
import { BaseViewProvider } from "./BaseViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { WebviewToExtensionMessage, issueToWebviewBead } from "../backend/types";
import { Logger } from "../utils/logger";

export class BeadDetailsViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsDetails";
  private currentBeadId: string | null = null;
  private currentProjectId: string | null = null;
  private loadSequence = 0; // Tracks request order to prevent stale responses
  private createMode = false; // True while the create-bead form is shown

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger
  ) {
    super(extensionUri, projectManager, logger.child("Details"));
  }

  /**
   * Show details for a specific bead
   */
  public async showBead(beadId: string): Promise<void> {
    if (this.createMode) {
      this.createMode = false;
      this.postMessage({ type: "setCreateMode", value: false });
    }
    this.currentBeadId = beadId;
    this.currentProjectId = this.projectManager.getActiveProject()?.id || null;

    // Update context for conditional menu items
    vscode.commands.executeCommand("setContext", "beads.hasSelectedBead", true);

    // Auto-expand the details panel
    if (this._host) {
      this._host.reveal(true); // true = preserve focus
    }

    // Optimistic paint (vs-7s7): render the fields already known from the list
    // row immediately so the visible update doesn't wait on a cold `bd show`
    // spawn. Marked `partial` so the webview shows deps/comments as loading
    // (the list payload lacks them) rather than as "none". loadData() below
    // fetches the authoritative record and reconciles via a second setBead.
    const cached = this.projectManager.getCachedBead(beadId);
    if (cached) {
      this.postMessage({ type: "setBead", bead: { ...cached, partial: true } });
    }

    await this.loadData();
  }

  /**
   * Reveal the Details view and switch it into create-bead mode (vs-69z).
   */
  public startCreate(): void {
    this.createMode = true;
    if (this._host) {
      this._host.reveal(true); // true = preserve focus
    }
    // If the view is already resolved this reaches the webview now; if it is
    // still resolving, initializeView() re-sends create mode once it is ready.
    this.postMessage({ type: "setCreateMode", value: true });
  }

  /**
   * Re-send create mode after a (re)resolve so a create requested before the
   * webview was ready is not lost.
   */
  protected async initializeView(): Promise<void> {
    await super.initializeView();
    if (this.createMode) {
      this.postMessage({ type: "setCreateMode", value: true });
    }
  }

  /**
   * Get the currently displayed bead ID
   */
  public getCurrentBeadId(): string | null {
    return this.currentBeadId;
  }

  /**
   * Clear the current bead (e.g., when switching projects)
   */
  public clearBead(): void {
    this.currentBeadId = null;
    this.createMode = false;
    vscode.commands.executeCommand("setContext", "beads.hasSelectedBead", false);
    this.postMessage({ type: "setCreateMode", value: false });
    this.postMessage({ type: "setBead", bead: null });
    this.setLoading(false);
  }

  protected async loadData(_reason: "initial" | "projectChange" | "manualRefresh" | "background" = "background"): Promise<void> {
    // Increment sequence to track this request - prevents stale responses from
    // overwriting newer data when multiple refreshes occur in rapid succession
    const thisRequest = ++this.loadSequence;

    const client = this.projectManager.getClient();
    const activeProjectId = this.projectManager.getActiveProject()?.id;

    // Clear selection if project changed
    if (this.currentProjectId && activeProjectId !== this.currentProjectId) {
      this.currentBeadId = null;
      this.currentProjectId = activeProjectId || null;
    }

    if (!client || !this.currentBeadId) {
      this.postMessage({ type: "setBead", bead: null });
      this.setLoading(false);
      return;
    }

    this.setLoading(true);
    this.setError(null);

    try {
      // The backend's show() returns comments inline (SQL backend always; CLI
      // backend only when comment_count > 0), so we no longer fire a second
      // concurrent `bd` process for comments — that parallel spawn was the
      // embedded-mode lock-contention slow path (vs-266).
      const issue = await client.show(this.currentBeadId);

      // Check if a newer request has started - if so, discard this stale response
      if (thisRequest !== this.loadSequence) {
        this.log.debug(`Discarding stale response (request ${thisRequest}, current ${this.loadSequence})`);
        return;
      }

      if (issue) {
        this.log.debug(`Loaded ${(issue.comments?.length ?? 0)} comments for ${this.currentBeadId}`);
        const bead = issueToWebviewBead(issue);
        if (bead) {
          this.postMessage({ type: "setBead", bead });
        } else {
          this.setError("Invalid bead status");
          this.postMessage({ type: "setBead", bead: null });
        }
      } else {
        this.setError("Bead not found");
        this.postMessage({ type: "setBead", bead: null });
      }
    } catch (err) {
      // Only handle error if this is still the current request
      if (thisRequest !== this.loadSequence) {
        return;
      }
      this.setError(String(err));
      this.postMessage({ type: "setBead", bead: null });
      this.handleBackendError("Failed to load bead details", err);
    } finally {
      // Only update loading state if this is still the current request
      if (thisRequest === this.loadSequence) {
        this.setLoading(false);
      }
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
        this.log.debug(`Updating bead ${message.beadId}: ${JSON.stringify(message.updates)}`);

        try {
          // Map webview field names (camelCase) to CLI/backend field names (snake_case)
          const {
            labels,
            externalRef,
            acceptanceCriteria,
            estimatedMinutes,
            ...rest
          } = message.updates;
          const updateArgs: Record<string, unknown> = {
            id: message.beadId,
            ...rest,
          };
          // CLI uses set_labels instead of labels
          if (labels !== undefined) {
            updateArgs.set_labels = labels;
          }
          // Map camelCase to snake_case
          if (externalRef !== undefined) {
            updateArgs.external_ref = externalRef;
          }
          if (acceptanceCriteria !== undefined) {
            updateArgs.acceptance_criteria = acceptanceCriteria;
          }
          if (estimatedMinutes !== undefined) {
            updateArgs.estimated_minutes = estimatedMinutes;
          }
          await client.update(updateArgs as unknown as Parameters<typeof client.update>[0]);
          this.projectManager.notifyDataChanged();
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to update bead: ${err}`);
        }
        break;

      case "addDependency":
        try {
          // When reverse=true, swap direction: target depends on current bead
          const fromId = message.reverse ? message.targetId : message.beadId;
          const toId = message.reverse ? message.beadId : message.targetId;
          await client.addDependency({
            from_id: fromId,
            to_id: toId,
            dep_type: message.dependencyType,
          });
          this.projectManager.notifyDataChanged();
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to add dependency: ${err}`);
        }
        break;

      case "removeDependency":
        try {
          await client.removeDependency({
            from_id: message.beadId,
            to_id: message.dependsOnId,
          });
          this.projectManager.notifyDataChanged();
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to remove dependency: ${err}`);
        }
        break;

      case "addComment":
        try {
          // Get username from environment or default
          const author = process.env.USER || process.env.USERNAME || "vscode";
          await client.addComment({
            id: message.beadId,
            author,
            text: message.text,
          });
          // Refresh all views to show the new comment
          this.projectManager.notifyDataChanged();
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to add comment: ${err}`);
        }
        break;

      case "viewInGraph":
        // Switch the panel to the Graph tab and focus this bead's neighborhood.
        vscode.commands.executeCommand("beads.viewInGraph", message.beadId);
        break;

      case "navigateBack":
        vscode.commands.executeCommand("beads.navigateBack");
        break;

      case "navigateForward":
        vscode.commands.executeCommand("beads.navigateForward");
        break;

      case "createBead":
        try {
          const { title, type, priority, description, design, acceptanceCriteria, assignee, labels } =
            message.fields;
          const created = await client.create({
            title,
            issue_type: type,
            priority,
            description,
            design,
            acceptance_criteria: acceptanceCriteria,
            assignee,
            labels,
          });
          this.createMode = false;
          this.postMessage({ type: "setCreateMode", value: false });
          this.projectManager.notifyDataChanged();
          // Select and show the freshly created bead in all views.
          await vscode.commands.executeCommand("beads.openBeadDetails", created.id);
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to create bead: ${err}`);
        }
        break;

      case "cancelCreate":
        this.createMode = false;
        this.postMessage({ type: "setCreateMode", value: false });
        // Restore whatever bead was shown before entering create mode.
        await this.loadData();
        break;
    }
  }
}
