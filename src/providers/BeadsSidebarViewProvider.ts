/**
 * BeadsSidebarViewProvider — the unified left-sidebar view.
 *
 * One webview view (`beadsProjectSwitcher`) that shows EITHER the Project
 * switcher screen or a full-height Details takeover. It extends
 * {@link BeadDetailsViewProvider}, inheriting the entire Details pipeline
 * (showBead/renderBead/loadData, the edit/dependency/comment mutations, create
 * mode, companion toggle), and adds:
 *
 *   - the Project switcher's memory sampler, and
 *   - client-side SCREEN swapping: `setScreen("details"|"project")` posts a
 *     `setScreen` message the webview flips with a React `setState` — instant,
 *     no view/context-key churn. This replaces the old two-view swap (two
 *     mutually-exclusive `beadsProjectSwitcher`/`beadsDetails` views gated by
 *     the `beads.detailScreen` context key), whose viewlet re-layout made every
 *     Project↔Details flip visibly slow in BOTH directions.
 *
 * The `beads.detailScreen` context key is still toggled here, but now ONLY to
 * gate the view-title menu items per screen (cheap — it drives no view `when`).
 *
 * The Project screen reads the same `selectedBead` the Details screen renders:
 * a passive select (single-click) calls `showBead(reveal:false)` — it updates
 * the content + the Selection card WITHOUT flipping to Details; an explicit open
 * (double-click / Selection-card click / "Show Details") reveals → flips to the
 * Details screen.
 */

import * as vscode from "vscode";
import { BeadDetailsViewProvider } from "./BeadDetailsViewProvider";
import { BeadCompanionController } from "./BeadCompanionController";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { FavoritesService } from "../backend/FavoritesService";
import { ScopeService } from "../backend/ScopeService";
import { WebviewToExtensionMessage } from "../backend/types";
import { Logger } from "../utils/logger";

type SidebarScreen = "project" | "details";

export class BeadsSidebarViewProvider extends BeadDetailsViewProvider {
  protected readonly viewType = "beadsProjectSwitcher";

  /** The resolved sidebar view, so we can own its title bar directly. */
  private sidebarView?: vscode.WebviewView;
  /** Which screen the webview is currently showing. */
  private screen: SidebarScreen = "project";
  // The screen we were on when create mode began, so cancelling New Issue
  // returns there (Project when launched from the Project screen's "+", or the
  // bead's Details when launched from the Details header's "+").
  private screenBeforeCreate: SidebarScreen = "project";

  // Low-frequency memory sampler (vs-f50): posts the extension-host RSS to the
  // Project card while the view is visible on the Project screen.
  private memoryTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly MEMORY_SAMPLE_MS = 4000;

  constructor(
    extensionUri: vscode.Uri,
    projectManager: BeadsProjectManager,
    logger: Logger,
    companion: BeadCompanionController,
    favorites?: FavoritesService,
    scope?: ScopeService
  ) {
    super(extensionUri, projectManager, logger, companion, favorites, scope);
  }

  /**
   * Flip which screen the webview shows. A pure client-side React swap (the
   * webview flips on the `setScreen` message) — no view contribution / context
   * key drives the visible content, so it's instant with no flash. The context
   * key is toggled only to gate the view-title menu items per screen.
   */
  private setScreen(screen: SidebarScreen): void {
    // No-op when the screen isn't actually changing. showBead(reveal) fires on
    // every selection (incl. clicking child/dep links while already on the
    // Details screen); without this guard each one re-posts setScreen and
    // re-writes view.title to the same string, churning the header label on
    // every id selection. Content still updates via super.showBead → renderBead.
    if (this.screen === screen) return;
    this.screen = screen;
    this.postMessage({ type: "setScreen", screen });
    vscode.commands.executeCommand("setContext", "beads.detailScreen", screen === "details");
    this.applyTitle();
  }

  /**
   * Drive the sidebar view's header label from the current SCREEN (not from
   * every renderBead): a categorical "Issue Details" on the Details screen,
   * "Repository" on the Project screen (VS Code uppercases both in the view
   * header). Screen-driven, so a passive selection just re-sets the same string
   * → no oscillation.
   */
  private applyTitle(): void {
    if (!this.sidebarView) return;
    this.sidebarView.title = this.screen === "details" ? "Issue Details" : "Repository";
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void {
    this.sidebarView = webviewView;
    super.resolveWebviewView(webviewView, context, token);
    this.applyTitle();
  }

  /** The Details "← Back" button (and project changes) return to the Project screen. */
  public backToProject(): void {
    this.setScreen("project");
  }

  /**
   * Open a bead's Details. A reveal (the default) flips to the Details screen;
   * a passive selection (reveal:false, single-click) only updates the content +
   * the Selection card and stays on whatever screen is showing.
   */
  public async showBead(
    beadId: string,
    opts?: { pulse?: boolean; reveal?: boolean },
  ): Promise<void> {
    if (opts?.reveal ?? true) {
      this.setScreen("details");
    }
    await super.showBead(beadId, opts);
  }

  /** Entering create mode is an explicit open — flip to the Details screen,
   *  remembering where we came from so Cancel can return there. */
  public startCreate(): void {
    this.screenBeforeCreate = this.screen;
    this.setScreen("details");
    super.startCreate();
  }

  /** Clearing the selection returns to the Project screen. */
  public clearBead(): void {
    super.clearBead();
    this.setScreen("project");
  }

  protected async initializeView(): Promise<void> {
    await super.initializeView();
    // Re-assert the current screen after a (re)resolve so a webview that was
    // disposed while hidden comes back showing the right screen.
    this.postMessage({ type: "setScreen", screen: this.screen });
    vscode.commands.executeCommand("setContext", "beads.detailScreen", this.screen === "details");
    this.applyTitle();
    this.startMemorySampler();
  }

  private startMemorySampler(): void {
    this.sampleMemory();
    if (this.memoryTimer) return;
    this.memoryTimer = setInterval(
      () => this.sampleMemory(),
      BeadsSidebarViewProvider.MEMORY_SAMPLE_MS
    );
  }

  private sampleMemory(): void {
    if (!this._host?.visible) return;
    // RSS — resident memory of the whole extension-host process as the OS sees
    // it (a superset: all extensions + the Node/V8 runtime share this process).
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
   * The Project screen's own messages (clear-selection, favorites-filter star)
   * need no backend client, so intercept them before the Details handler (which
   * early-returns when there's no client). Everything else falls through to the
   * inherited Details handling.
   */
  protected async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    if (message.type === "clearActiveBead") {
      await vscode.commands.executeCommand("beads.clearSelection");
      return;
    }
    if (message.type === "setFavoritesFilter") {
      await vscode.commands.executeCommand("beads.setIssuesFavoritesFilter", message.on);
      return;
    }
    // Forward nav from the Project screen re-opens the current selection's
    // Details — so "← Active Project" then "→" returns to the issue you backed
    // out of (the selection card still shows it), keeping the flow predictable.
    // With no current selection, fall through to the global history.
    if (message.type === "historyForward" && this.screen === "project") {
      const current = this.getCurrentBeadId();
      if (current) {
        await this.showBead(current, { reveal: true });
        return;
      }
    }
    // Cancelling New Issue: let the inherited handler exit create mode + restore
    // the prior bead, then return to the screen we launched create from (so
    // Cancel "goes back" to the Project screen when that's where "+" was hit).
    if (message.type === "cancelCreate") {
      await super.handleMessage(message);
      this.setScreen(this.screenBeforeCreate);
      return;
    }
    await super.handleMessage(message);
  }
}
