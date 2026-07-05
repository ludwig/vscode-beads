/**
 * BeadPanelManager — opens Beads webviews as editor-area tabs
 * (`vscode.window.createWebviewPanel`) in addition to the sidebar views.
 *
 * Each tab gets its own provider instance bound to the panel via the
 * host-agnostic BaseViewProvider.attach(), so it reuses the exact same render
 * bundle, message protocol, and edit/data logic as the sidebar — no
 * duplication. Tabs are de-duplicated by key (one tab per bead; one Issues
 * tab) and refreshed live on data/project changes.
 *
 * vs-ask: Details in a tab. vs-fx4: Issues list in a tab.
 */

import * as vscode from "vscode";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { FavoritesService } from "../backend/FavoritesService";
import { ScopeService } from "../backend/ScopeService";
import { FilterSnapshot } from "../backend/types";
import { Logger } from "../utils/logger";
import { BaseViewProvider } from "./BaseViewProvider";
import { BeadCompanionController } from "./BeadCompanionController";
import { BeadDetailsViewProvider } from "./BeadDetailsViewProvider";
import { BeadsPanelViewProvider } from "./BeadsPanelViewProvider";
import { BoardInitWizardViewProvider } from "./BoardInitWizardViewProvider";
import { DashboardViewProvider } from "./DashboardViewProvider";
import { GraphViewProvider } from "./GraphViewProvider";
import { KanbanViewProvider } from "./KanbanViewProvider";
import { RepositoryViewProvider } from "./RepositoryViewProvider";
import { TreeViewProvider } from "./TreeViewProvider";
import { hostFromPanel } from "./WebviewHost";

interface PanelEntry {
  panel: vscode.WebviewPanel;
  provider: BaseViewProvider;
}

export class BeadPanelManager implements vscode.Disposable {
  private readonly entries = new Map<string, PanelEntry>();
  private readonly subscriptions: vscode.Disposable[] = [];
  // Monotonic counter so each New Issue tab gets a unique (never-deduped) key.
  private newIssueSeq = 0;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly projectManager: BeadsProjectManager,
    private readonly log: Logger,
    private readonly companion: BeadCompanionController,
    private readonly favorites?: FavoritesService,
    private readonly scope?: ScopeService
  ) {
    // Keep open tabs in sync with the rest of the extension.
    this.subscriptions.push(
      this.projectManager.onDataChanged(() => this.forEachProvider((p) => p.refresh())),
      this.projectManager.onActiveProjectChanged(() =>
        this.forEachProvider((p) => p.refreshForProjectChange())
      )
    );
  }

  /** Open (or focus) a single bead's Details as an editor tab. */
  public openBeadDetails(beadId: string): void {
    const key = `beadsDetails:${beadId}`;
    if (this.reveal(key)) return;

    const panel = this.createPanel(beadId);
    const provider = new BeadDetailsViewProvider(this.extensionUri, this.projectManager, this.log, this.companion, this.favorites, this.scope);
    provider.attach(hostFromPanel(panel));
    // currentBeadId is set synchronously, so the webview's "ready" handshake
    // (which triggers initializeView → loadData) renders this bead.
    provider.showBead(beadId);

    this.track(key, panel, provider);
  }

  /**
   * Open (or focus) the Issues list as an editor tab. `seed` is a full
   * Issues-filter snapshot (vs-tle) so the tab opens matching the panel's
   * filter; re-opening an existing tab keeps its own state and is not reseeded.
   */
  public openIssues(seed: FilterSnapshot | null = null): void {
    const key = "beadsPanel";
    if (this.reveal(key)) return;

    const panel = this.createPanel("Issues");
    const provider = new BeadsPanelViewProvider(this.extensionUri, this.projectManager, this.log, this.favorites, this.scope);
    provider.attach(hostFromPanel(panel));
    if (seed) provider.seedIssuesFilter(seed);

    this.track(key, panel, provider);
  }

  /** Open (or focus) the Dashboard as an editor tab. */
  public openDashboard(): void {
    const key = "beadsDashboard";
    if (this.reveal(key)) return;

    const panel = this.createPanel("Dashboard");
    const provider = new DashboardViewProvider(this.extensionUri, this.projectManager, this.log);
    provider.attach(hostFromPanel(panel));

    this.track(key, panel, provider);
  }

  /** Open (or focus) the Repository Details page as an editor tab (vs-beoh). */
  public openRepository(): void {
    const key = "beadsRepository";
    if (this.reveal(key)) return;

    const panel = this.createPanel("Repository");
    const provider = new RepositoryViewProvider(this.extensionUri, this.projectManager, this.log);
    provider.attach(hostFromPanel(panel));

    this.track(key, panel, provider);
  }

  /**
   * Open (or focus) the dependency Graph as an editor tab. `seed` is a one-time
   * Issues-filter snapshot (matching bead ids) so the new tab inherits the
   * panel's active filter (vs-nme); re-opening an existing tab keeps its own
   * (possibly user-adjusted) state and is not re-seeded.
   */
  public openGraph(seed: string[] | null = null): void {
    const key = "beadsGraph";
    if (this.reveal(key)) return;

    const panel = this.createPanel("Graph");
    const provider = new GraphViewProvider(this.extensionUri, this.projectManager, this.log, this.scope);
    provider.attach(hostFromPanel(panel));
    provider.seedFilter(seed);

    this.track(key, panel, provider);
  }

  /** Open (or focus) the Kanban board as an editor tab (vs-xqu.1). `seed`: vs-nme. */
  public openKanban(seed: string[] | null = null): void {
    const key = "beadsKanban";
    if (this.reveal(key)) return;

    const panel = this.createPanel("Kanban");
    const provider = new KanbanViewProvider(this.extensionUri, this.projectManager, this.log, this.favorites, this.scope);
    provider.attach(hostFromPanel(panel));
    provider.seedFilter(seed);

    this.track(key, panel, provider);
  }

  /** Open (or focus) the dependency Tree as an editor tab (vs-xqu.2). `seed`: vs-nme. */
  public openTree(seed: string[] | null = null): void {
    const key = "beadsTree";
    if (this.reveal(key)) return;

    const panel = this.createPanel("Tree");
    const provider = new TreeViewProvider(this.extensionUri, this.projectManager, this.log, this.favorites, this.scope);
    provider.attach(hostFromPanel(panel));
    provider.seedFilter(seed);

    this.track(key, panel, provider);
  }

  /**
   * Open a New Issue (create-bead) form as an editor tab (vs-2tn.2). Each call
   * opens an INDEPENDENT tab (unique key, never deduped) so multiple drafts can
   * coexist — unlike the single-instance view tabs above.
   */
  public openNewIssue(): void {
    const key = `beadsNewIssue:${++this.newIssueSeq}`;
    const panel = this.createPanel("New Issue");
    const provider = new BeadDetailsViewProvider(this.extensionUri, this.projectManager, this.log, this.companion, this.favorites, this.scope);
    provider.attach(hostFromPanel(panel));
    provider.startCreate();

    this.track(key, panel, provider);
  }

  /**
   * Open (or focus) the board-initialization wizard as an editor tab
   * (vs-r6a1.8). Single-instance — re-invoking focuses the existing wizard
   * rather than opening a second one.
   */
  public openInitWizard(): void {
    const key = "beadsInitWizard";
    if (this.reveal(key)) return;

    const panel = this.createPanel("Initialize Board");
    const provider = new BoardInitWizardViewProvider(this.extensionUri, this.projectManager, this.log);
    provider.attach(hostFromPanel(panel));

    this.track(key, panel, provider);
  }

  private createPanel(title: string): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      "beadsTab",
      title,
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "dist"),
          vscode.Uri.joinPath(this.extensionUri, "resources"),
        ],
      }
    );
    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, "resources", "beads-icon.svg");
    return panel;
  }

  private track(
    key: string,
    panel: vscode.WebviewPanel,
    provider: BaseViewProvider
  ): void {
    // Freshly-created tab: pulse it once the webview mounts (vs-c59).
    provider.pulseWhenReady();
    this.entries.set(key, { panel, provider });
    panel.onDidDispose(() => {
      this.entries.delete(key);
      provider.dispose();
    });
  }

  /**
   * Focus an already-open tab for `key`; returns true if one existed. Pulses
   * the revealed tab so re-opening gives visible feedback (vs-c59).
   */
  private reveal(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    entry.panel.reveal();
    entry.provider.pulse();
    return true;
  }

  private forEachProvider(fn: (provider: BaseViewProvider) => void): void {
    for (const { provider } of this.entries.values()) fn(provider);
  }

  /** Push the favorites set to every open editor-tab panel (vs-sd5.1). */
  public publishFavorites(favorites: string[]): void {
    this.forEachProvider((p) => p.publishFavorites(favorites));
  }

  /** Push the live parent scope to every open editor-tab panel. */
  public publishParentScope(beadIds: string[] | null): void {
    this.forEachProvider((p) => p.publishParentScope(beadIds));
  }

  /** Broadcast the shared filter spec to every open editor-tab panel. */
  public publishSharedFilterSpec(snapshot: FilterSnapshot): void {
    this.forEachProvider((p) => p.publishSharedFilterSpec(snapshot));
  }

  /** Briefly spin the refresh in every open editor-tab panel (vs-sd5). */
  public flashLoading(): void {
    this.forEachProvider((p) => p.flashLoading());
  }

  /**
   * Fan out an "Apply to all" broadcast to every open editor tab (vs-dzm):
   * id-driven views (Kanban/Tree/Graph) get reseeded with the matching bead
   * ids; an open Issues tab applies the full snapshot. The source Issues tab
   * re-applies its own snapshot idempotently.
   */
  public applyFilterToOpenTabs(snapshot: FilterSnapshot, filteredBeadIds: string[]): void {
    for (const [key, { provider }] of this.entries) {
      if (key === "beadsKanban" || key === "beadsTree" || key === "beadsGraph") {
        provider.pushFilter({ filteredBeadIds });
      } else if (key === "beadsPanel") {
        provider.pushFilter({ snapshot });
      }
    }
  }

  public dispose(): void {
    for (const d of this.subscriptions.splice(0)) d.dispose();
    for (const { panel } of this.entries.values()) {
      panel.dispose();
    }
    this.entries.clear();
  }
}
