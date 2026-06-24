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
import { BeadCompanionController } from "./BeadCompanionController";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { FavoritesService } from "../backend/FavoritesService";
import { WebviewHost } from "./WebviewHost";
import { WebviewToExtensionMessage, issueToWebviewBead } from "../backend/types";
import { Logger } from "../utils/logger";
import { NavigationHistory } from "./NavigationHistory";
import { pulseOnReveal } from "./pulseOnReveal";

export class BeadDetailsViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsDetails";
  private currentBeadId: string | null = null;
  private currentProjectId: string | null = null;
  private loadSequence = 0; // Tracks request order to prevent stale responses
  private createMode = false; // True while the create-bead form is shown
  // Per-tab Back/Forward trail (vs-9u8). Each editor tab instance owns its own
  // history so navigating within a tab has tab-scoped "memory" — unlike the
  // sidebar, which shares the single global NavigationHistory in registerCommands.
  // Unused by the sidebar instance (isEditorTab === false), which records into
  // the global history via the beads.navigateBack/Forward commands instead.
  private readonly history = new NavigationHistory();
  // Subscription to the companion controller's change feed, so the "seed to
  // Claude" toggle reflects reality (incl. manual companion-tab closes, vs-nr3d).
  private companionSub?: vscode.Disposable;

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger,
    private readonly companion: BeadCompanionController,
    favorites?: FavoritesService
  ) {
    super(extensionUri, projectManager, logger.child("Details"), favorites);
  }

  /**
   * Bind to a host and (re)subscribe to the companion feed so the toggle's lit
   * state stays in sync. Re-attach (sidebar re-resolve) replaces the prior sub.
   */
  public attach(host: WebviewHost): void {
    super.attach(host);
    this.companionSub?.dispose();
    this.companionSub = this.companion.onDidChange(() => this.postCompanionState());
  }

  public dispose(): void {
    this.companionSub?.dispose();
    this.companionSub = undefined;
    super.dispose();
  }

  /** Tell the webview whether the current bead's companion doc is open. */
  private postCompanionState(): void {
    if (!this.currentBeadId) return;
    this.postMessage({
      type: "setBeadCompanionOpen",
      beadId: this.currentBeadId,
      open: this.companion.isOpen(this.currentBeadId),
    });
  }

  /**
   * Show details for a specific bead in response to a *user* navigation
   * (initial open, or clicking a related bead/dependency). In an editor tab
   * this records a step in the per-tab Back/Forward trail (vs-9u8); history-
   * driven moves use {@link navigate} instead, which renders without recording.
   *
   * Pass `{ pulse: true }` to flash a confirmation ring on reveal — used by the
   * "Show Details" menu so the action is visible even when the Details view is
   * already showing, mirroring the editor-tab reveal pulse (vs-c59) and the
   * "Show Issues" panel ring (vs-1vxq). The pulse intent is armed *before*
   * {@link renderBead} reveals the view so a freshly-resolved webview's "ready"
   * signal consumes it without racing the bead load.
   */
  public async showBead(beadId: string, opts?: { pulse?: boolean }): Promise<void> {
    if (this._host?.isEditorTab) {
      this.history.record(beadId);
      this.postNavState();
    }
    if (opts?.pulse) {
      pulseOnReveal({
        visible: this._host?.visible ?? false,
        pulse: () => this.pulse(),
        pulseWhenReady: () => this.pulseWhenReady(),
      });
    }
    await this.renderBead(beadId);
  }

  /**
   * Push the per-tab Back/Forward enablement to the webview so the editor-tab
   * header buttons reflect this tab's own trail (vs-9u8). No-op for the sidebar,
   * which has no per-tab buttons and uses the global history's context keys.
   */
  private postNavState(): void {
    if (!this._host?.isEditorTab) return;
    this.postMessage({
      type: "setTabNavState",
      canBack: this.history.canBack(),
      canForward: this.history.canForward(),
    });
  }

  /** Render a bead without touching the navigation trail. */
  private async renderBead(beadId: string): Promise<void> {
    if (this.createMode) {
      this.createMode = false;
      this.postMessage({ type: "setCreateMode", value: false });
    }
    this.currentBeadId = beadId;
    this.currentProjectId = this.projectManager.getActiveProject()?.id || null;

    // Keep an editor tab's label tracking the bead it currently shows: the tab
    // opens titled with the first bead's id, but navigating to another bead
    // within the same tab must retitle it rather than stay stuck (vs-q0e2).
    this._host?.setTitle(beadId);

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
    } else {
      // No cached row to paint optimistically (e.g. a closed bead opened from
      // the Graph/Tree that the default list excludes). Clear the prior bead now
      // so the view switches to a loading state for THIS selection immediately,
      // instead of leaving the stale previous bead (and its comments) on screen
      // until the cold `bd show` returns (vs-dqc).
      this.postMessage({ type: "setBead", bead: null });
      this.setLoading(true);
    }

    // Reflect whether THIS bead's companion doc is already open (vs-nr3d).
    this.postCompanionState();

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
    // Re-assert per-tab Back/Forward enablement after a (re)resolve so the
    // editor-tab header buttons aren't stuck disabled on mount/reveal (vs-9u8).
    this.postNavState();
    // Re-assert the companion toggle state on mount/reveal (vs-nr3d).
    this.postCompanionState();
  }

  /**
   * Get the currently displayed bead ID
   */
  public getCurrentBeadId(): string | null {
    return this.currentBeadId;
  }

  /**
   * Move along this tab's Back/Forward trail and render the target without
   * recording (a history move must not truncate the forward branch). No-op at
   * the ends of the trail. Editor-tab only — the sidebar uses the global history.
   */
  private async navigate(direction: "back" | "forward"): Promise<void> {
    const id = direction === "back" ? this.history.back() : this.history.forward();
    if (id) {
      await this.renderBead(id);
      this.postNavState();
    }
  }

  /**
   * Clear the current bead (e.g., when switching projects)
   */
  public clearBead(): void {
    this.currentBeadId = null;
    this.history.reset();
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

    // Clear selection (and the per-tab trail) if project changed
    if (this.currentProjectId && activeProjectId !== this.currentProjectId) {
      this.currentBeadId = null;
      this.history.reset();
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

  /**
   * In an editor tab, bead-to-bead links navigate WITHIN the same tab rather
   * than escaping to the sidebar Details view (vs-qvt). The sidebar instance
   * keeps the default routing (via the global command). Everything else falls
   * through to the shared handler.
   */
  protected async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    // The companion toggle needs no backend client, so handle it here rather
    // than in handleCustomMessage (which early-returns when there's no client).
    if (message.type === "toggleBeadCompanion") {
      await this.companion.toggle(message.beadId);
      this.postCompanionState();
      return;
    }
    if (this._host?.isEditorTab && message.type === "openBeadDetails") {
      await this.showBead(message.beadId);
      return;
    }
    await super.handleMessage(message);
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

      case "viewInTree":
        // Switch the panel to the Tree tab and reveal this bead (vs-kp67).
        vscode.commands.executeCommand("beads.viewInTree", message.beadId);
        break;

      case "viewInKanban":
        // Switch the panel to the Kanban tab and reveal this bead (vs-wbrz).
        vscode.commands.executeCommand("beads.viewInKanban", message.beadId);
        break;

      case "viewInIssues":
        // Switch the panel to the Issues tab and reveal this bead (vs-wbrz).
        vscode.commands.executeCommand("beads.viewInIssues", message.beadId);
        break;

      case "navigateBack":
        // Editor tabs walk their own per-tab trail (vs-9u8); the sidebar
        // delegates to the global history command.
        if (this._host?.isEditorTab) {
          await this.navigate("back");
        } else {
          vscode.commands.executeCommand("beads.navigateBack");
        }
        break;

      case "navigateForward":
        if (this._host?.isEditorTab) {
          await this.navigate("forward");
        } else {
          vscode.commands.executeCommand("beads.navigateForward");
        }
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
          if (this._host?.isEditorTab) {
            // A dedicated New Issue tab becomes the created bead's Details tab
            // in place — opening a separate tab would leave this one stranded on
            // the empty "No issue selected" state (vs-2tn.2).
            await this.showBead(created.id);
          } else {
            // Select and show the freshly created bead in all views.
            await vscode.commands.executeCommand("beads.openBeadDetails", created.id);
          }
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to create bead: ${err}`);
        }
        break;

      case "cancelCreate":
        this.createMode = false;
        if (this._host?.isEditorTab) {
          // A dedicated New Issue tab has no prior bead to restore — just close
          // it (vs-2tn.2).
          this._host.close();
          break;
        }
        this.postMessage({ type: "setCreateMode", value: false });
        // Restore whatever bead was shown before entering create mode.
        await this.loadData();
        break;
    }
  }
}
