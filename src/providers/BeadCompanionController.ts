/**
 * BeadCompanionController — opens, closes, and tracks the companion virtual
 * `bead:` document for a bead (vs-nr3d / epic vs-fkb).
 *
 * A WebviewPanel is not a TextEditor, so a rich bead webview can never be
 * `vscode.window.activeTextEditor` — the only thing Claude Code's IDE
 * integration seeds. The workaround: open the bead's `bead:/<id>.md` document
 * *beside* the view with focus preserved. With no text editor focused, VS Code
 * reports that freshly-shown doc as the active text editor, so Claude seeds it
 * while the webview keeps keyboard focus.
 *
 * This is the single owner of the open/close/scan logic, shared by the in-view
 * "seed to Claude" toggle (BeadDetailsViewProvider), the focus-follow option
 * (BeadPanelManager, off by default), and the `beads.toggleBeadCompanion`
 * command. It emits {@link onDidChange} so toggles can reflect reality even when
 * the user closes a companion tab by hand.
 */

import * as vscode from "vscode";
import { Logger } from "../utils/logger";
import { BeadDocumentProvider, BEAD_SCHEME } from "./BeadDocumentProvider";
import { beadDocPath } from "./beadMarkdown";

export class BeadCompanionController implements vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  /** Fires whenever the set of open companion docs may have changed. */
  public readonly onDidChange = this.onDidChangeEmitter.event;
  private readonly tabSub: vscode.Disposable;

  constructor(private readonly log: Logger) {
    // Keep toggle state honest when the user closes a companion tab by hand.
    this.tabSub = vscode.window.tabGroups.onDidChangeTabs(() =>
      this.onDidChangeEmitter.fire()
    );
  }

  /** Is `beadId`'s companion `bead:` document open in any tab group? */
  public isOpen(beadId: string): boolean {
    return this.findTabs(beadId).length > 0;
  }

  /** Open `beadId`'s companion document beside the active view, keeping focus. */
  public async open(beadId: string): Promise<void> {
    try {
      const doc = await vscode.workspace.openTextDocument(BeadDocumentProvider.uriFor(beadId));
      await vscode.languages.setTextDocumentLanguage(doc, "markdown");
      await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true,
        preview: false,
      });
      this.onDidChangeEmitter.fire();
    } catch (err) {
      this.log.error(
        `BeadCompanionController: failed to open ${beadId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** Close every open companion document for `beadId`. */
  public async close(beadId: string): Promise<void> {
    const tabs = this.findTabs(beadId);
    if (tabs.length) {
      await vscode.window.tabGroups.close(tabs);
      this.onDidChangeEmitter.fire();
    }
  }

  /** Open the companion if closed; close it if open. */
  public async toggle(beadId: string): Promise<void> {
    if (this.isOpen(beadId)) {
      await this.close(beadId);
    } else {
      await this.open(beadId);
    }
  }

  private findTabs(beadId: string): vscode.Tab[] {
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
    return matches;
  }

  public dispose(): void {
    this.tabSub.dispose();
    this.onDidChangeEmitter.dispose();
  }
}
