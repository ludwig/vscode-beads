import * as vscode from "vscode";
import { FavoritesStore } from "./FavoritesStore";

/**
 * Host-side owner of the favorites set (vs-sd5.1). Thin vscode-coupled wrapper
 * around the pure {@link FavoritesStore} (which holds the per-project set in
 * workspaceState and is unit-tested in isolation). Adds the one thing the store
 * deliberately omits to stay testable: a change event so every webview can be
 * re-published whenever the set or the active project changes.
 */
export class FavoritesService {
  private readonly store: FavoritesStore;
  private readonly _onDidChange = new vscode.EventEmitter<string[]>();

  /** Fires with the active project's favorites whenever they change. */
  public readonly onDidChange = this._onDidChange.event;

  constructor(memento: vscode.Memento) {
    this.store = new FavoritesStore(memento);
  }

  /** Re-point at a project (on switch) and re-publish its set. */
  setActiveProject(projectId: string | null): void {
    this.store.setActiveProject(projectId);
    this.fire();
  }

  /** The active project's favorites, in curated order. */
  list(): string[] {
    return this.store.list();
  }

  isFavorite(id: string): boolean {
    return this.store.isFavorite(id);
  }

  async toggle(id: string): Promise<boolean> {
    const result = await this.store.toggle(id);
    this.fire();
    return result;
  }

  async remove(id: string): Promise<void> {
    if (await this.store.remove(id)) this.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }

  private fire(): void {
    this._onDidChange.fire(this.store.list());
  }
}
