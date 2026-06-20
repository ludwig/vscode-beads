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
import { FilterSnapshot } from "../backend/types";
import { Logger } from "../utils/logger";
import { BaseViewProvider } from "./BaseViewProvider";
import { BeadDetailsViewProvider } from "./BeadDetailsViewProvider";
import { BeadDocumentProvider, BEAD_SCHEME } from "./BeadDocumentProvider";
import {
  BeadDocSyncAction,
  BeadDocSyncState,
  decideOnPanelDisposed,
  decideOnViewState,
} from "./beadDocSync";
import { beadDocPath } from "./beadMarkdown";
import { BeadsPanelViewProvider } from "./BeadsPanelViewProvider";
import { DashboardViewProvider } from "./DashboardViewProvider";
import { GraphViewProvider } from "./GraphViewProvider";
import { KanbanViewProvider } from "./KanbanViewProvider";
import { TreeViewProvider } from "./TreeViewProvider";
import { hostFromPanel } from "./WebviewHost";

interface PanelEntry {
  panel: vscode.WebviewPanel;
  provider: BaseViewProvider;
  /** For single-bead Details tabs: the bead id, used to auto-seed Claude's
   *  context with the bead's virtual doc on focus (vs-nr3d). */
  beadId?: string;
  /** Disposes the per-panel onDidChangeViewState listener (bead tabs only). */
  viewStateSub?: vscode.Disposable;
}

export class BeadPanelManager implements vscode.Disposable {
  private readonly entries = new Map<string, PanelEntry>();
  private readonly subscriptions: vscode.Disposable[] = [];
  // Monotonic counter so each New Issue tab gets a unique (never-deduped) key.
  private newIssueSeq = 0;
  // The bead whose virtual `bead:` doc we last auto-opened to seed Claude's
  // context (vs-nr3d). One doc at a time; switching beads closes the previous.
  private readonly docSync: BeadDocSyncState = { activeBeadId: null };

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly projectManager: BeadsProjectManager,
    private readonly log: Logger,
    private readonly favorites?: FavoritesService
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
    if (this.reveal(key)) {
      // Revealing an existing bead tab makes it active → seed its doc (vs-nr3d).
      this.syncActiveBeadDoc(beadId);
      return;
    }

    const panel = this.createPanel(beadId);
    const provider = new BeadDetailsViewProvider(this.extensionUri, this.projectManager, this.log, this.favorites);
    provider.attach(hostFromPanel(panel));
    // currentBeadId is set synchronously, so the webview's "ready" handshake
    // (which triggers initializeView → loadData) renders this bead.
    provider.showBead(beadId);

    this.track(key, panel, provider, beadId);
    // Newly-created tab is focused → seed its doc immediately (the initial
    // activation may not fire onDidChangeViewState).
    this.syncActiveBeadDoc(beadId);
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
    const provider = new BeadsPanelViewProvider(this.extensionUri, this.projectManager, this.log, this.favorites);
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
    const provider = new GraphViewProvider(this.extensionUri, this.projectManager, this.log);
    provider.attach(hostFromPanel(panel));
    provider.seedFilter(seed);

    this.track(key, panel, provider);
  }

  /** Open (or focus) the Kanban board as an editor tab (vs-xqu.1). `seed`: vs-nme. */
  public openKanban(seed: string[] | null = null): void {
    const key = "beadsKanban";
    if (this.reveal(key)) return;

    const panel = this.createPanel("Kanban");
    const provider = new KanbanViewProvider(this.extensionUri, this.projectManager, this.log, this.favorites);
    provider.attach(hostFromPanel(panel));
    provider.seedFilter(seed);

    this.track(key, panel, provider);
  }

  /** Open (or focus) the dependency Tree as an editor tab (vs-xqu.2). `seed`: vs-nme. */
  public openTree(seed: string[] | null = null): void {
    const key = "beadsTree";
    if (this.reveal(key)) return;

    const panel = this.createPanel("Tree");
    const provider = new TreeViewProvider(this.extensionUri, this.projectManager, this.log, this.favorites);
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
    const provider = new BeadDetailsViewProvider(this.extensionUri, this.projectManager, this.log, this.favorites);
    provider.attach(hostFromPanel(panel));
    provider.startCreate();

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
    provider: BaseViewProvider,
    beadId?: string
  ): void {
    // Freshly-created tab: pulse it once the webview mounts (vs-c59).
    provider.pulseWhenReady();
    const entry: PanelEntry = { panel, provider, beadId };
    // Single-bead tabs follow focus: when this panel becomes active, seed its
    // bead doc into Claude's context (vs-nr3d). Deactivation/visibility changes
    // are ignored downstream, which is what prevents focus ping-pong.
    if (beadId) {
      entry.viewStateSub = panel.onDidChangeViewState((e) => {
        if (e.webviewPanel.active) this.syncActiveBeadDoc(beadId);
      });
    }
    this.entries.set(key, entry);
    panel.onDidDispose(() => {
      this.entries.delete(key);
      entry.viewStateSub?.dispose();
      provider.dispose();
      // Closing a bead tab closes its auto-opened doc so no orphan `bead:`
      // editors leak (vs-nr3d).
      if (beadId) this.applyDocSync(decideOnPanelDisposed(this.docSync, beadId));
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

  // ---- Auto-seed the active bead into Claude Code's context (vs-nr3d) ----
  //
  // Claude Code seeds `vscode.window.activeTextEditor`; a WebviewPanel is not a
  // TextEditor, so we open the focused bead's virtual `bead:` doc *beside* the
  // webview with focus preserved. The webview keeps keyboard focus, but with no
  // text editor focused VS Code reports the freshly-shown doc as the active text
  // editor, so Claude seeds it — without a manual command and without thrash.

  /** Run the view-state decision for a bead panel that just became active. */
  private syncActiveBeadDoc(beadId: string): void {
    const enabled = vscode.workspace
      .getConfiguration("beads")
      .get<boolean>("autoSeedActiveBead", false);
    this.applyDocSync(decideOnViewState(this.docSync, { beadId, active: true, enabled }));
  }

  private applyDocSync(action: BeadDocSyncAction): void {
    switch (action.kind) {
      case "noop":
        return;
      case "open":
        if (action.closePrev) void this.closeBeadDoc(action.closePrev);
        this.docSync.activeBeadId = action.beadId;
        void this.openBeadDoc(action.beadId);
        return;
      case "close":
        this.docSync.activeBeadId = null;
        void this.closeBeadDoc(action.beadId);
        return;
    }
  }

  private async openBeadDoc(beadId: string): Promise<void> {
    try {
      const doc = await vscode.workspace.openTextDocument(BeadDocumentProvider.uriFor(beadId));
      await vscode.languages.setTextDocumentLanguage(doc, "markdown");
      await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true,
        preview: false,
      });
    } catch (err) {
      this.log.error(
        `BeadPanelManager: failed to seed bead doc ${beadId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** Close any open editor tab showing `beadId`'s virtual `bead:` doc. */
  private async closeBeadDoc(beadId: string): Promise<void> {
    const targetPath = beadDocPath(beadId);
    const matches: vscode.Tab[] = [];
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input;
        if (
          input instanceof vscode.TabInputText &&
          input.uri.scheme === BEAD_SCHEME &&
          input.uri.path === targetPath
        ) {
          matches.push(tab);
        }
      }
    }
    if (matches.length) {
      await vscode.window.tabGroups.close(matches);
    }
  }

  public dispose(): void {
    for (const d of this.subscriptions.splice(0)) d.dispose();
    for (const { panel, viewStateSub } of this.entries.values()) {
      viewStateSub?.dispose();
      panel.dispose();
    }
    this.entries.clear();
  }
}
