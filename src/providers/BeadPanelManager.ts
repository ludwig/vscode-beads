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
import { Logger } from "../utils/logger";
import { BaseViewProvider } from "./BaseViewProvider";
import { BeadDetailsViewProvider } from "./BeadDetailsViewProvider";
import { BeadsPanelViewProvider } from "./BeadsPanelViewProvider";
import { DashboardViewProvider } from "./DashboardViewProvider";
import { GraphViewProvider } from "./GraphViewProvider";
import { hostFromPanel } from "./WebviewHost";

interface PanelEntry {
  panel: vscode.WebviewPanel;
  provider: BaseViewProvider;
}

export class BeadPanelManager implements vscode.Disposable {
  private readonly entries = new Map<string, PanelEntry>();
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly projectManager: BeadsProjectManager,
    private readonly log: Logger
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
    const provider = new BeadDetailsViewProvider(this.extensionUri, this.projectManager, this.log);
    provider.attach(hostFromPanel(panel));
    // currentBeadId is set synchronously, so the webview's "ready" handshake
    // (which triggers initializeView → loadData) renders this bead.
    provider.showBead(beadId);

    this.track(key, panel, provider);
  }

  /** Open (or focus) the Issues list as an editor tab. */
  public openIssues(): void {
    const key = "beadsPanel";
    if (this.reveal(key)) return;

    const panel = this.createPanel("Issues");
    const provider = new BeadsPanelViewProvider(this.extensionUri, this.projectManager, this.log);
    provider.attach(hostFromPanel(panel));

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

  /** Open (or focus) the dependency Graph as an editor tab. */
  public openGraph(): void {
    const key = "beadsGraph";
    if (this.reveal(key)) return;

    const panel = this.createPanel("Graph");
    const provider = new GraphViewProvider(this.extensionUri, this.projectManager, this.log);
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

  private track(key: string, panel: vscode.WebviewPanel, provider: BaseViewProvider): void {
    this.entries.set(key, { panel, provider });
    panel.onDidDispose(() => {
      this.entries.delete(key);
      provider.dispose();
    });
  }

  /** Focus an already-open tab for `key`; returns true if one existed. */
  private reveal(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    entry.panel.reveal();
    return true;
  }

  private forEachProvider(fn: (provider: BaseViewProvider) => void): void {
    for (const { provider } of this.entries.values()) fn(provider);
  }

  public dispose(): void {
    for (const d of this.subscriptions.splice(0)) d.dispose();
    for (const { panel } of this.entries.values()) panel.dispose();
    this.entries.clear();
  }
}
