import * as vscode from "vscode";
import { HiddenBeadsStore } from "./HiddenBeadsStore";

/**
 * Host-side owner of the hidden-beads set. Thin vscode-coupled wrapper around
 * the pure {@link HiddenBeadsStore} (which holds the per-project set in
 * workspaceState and is unit-tested in isolation). Adds the one thing the store
 * deliberately omits to stay testable: a change event so every webview can be
 * re-published whenever the set or the active project changes. Mirrors
 * {@link FavoritesService}.
 */
export class HiddenBeadsService {
  private readonly store: HiddenBeadsStore;
  private readonly _onDidChange = new vscode.EventEmitter<string[]>();

  /** Fires with the active project's hidden ids whenever they change. */
  public readonly onDidChange = this._onDidChange.event;

  constructor(memento: vscode.Memento) {
    this.store = new HiddenBeadsStore(memento);
  }

  /** Re-point at a project (on switch) and re-publish its set. */
  setActiveProject(projectId: string | null): void {
    this.store.setActiveProject(projectId);
    this.fire();
  }

  /** The active project's hidden bead ids. */
  list(): string[] {
    return this.store.list();
  }

  isHidden(id: string): boolean {
    return this.store.isHidden(id);
  }

  async toggle(id: string): Promise<boolean> {
    const result = await this.store.toggle(id);
    this.fire();
    return result;
  }

  dispose(): void {
    this._onDidChange.dispose();
  }

  private fire(): void {
    this._onDidChange.fire(this.store.list());
  }
}
