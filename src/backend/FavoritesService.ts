import * as vscode from "vscode";
import { FavoritesStore } from "./FavoritesStore";
import { FavoritesMaskStore } from "./FavoritesMaskStore";

/**
 * Host-side owner of the favorites set AND its mask (vs-sd5.1). Thin
 * vscode-coupled wrapper around the pure {@link FavoritesStore} (the seed list)
 * and {@link FavoritesMaskStore} (which seeds are toggled off / eye-off) — both
 * hold per-project sets in workspaceState and are unit-tested in isolation.
 *
 * The mask lives here, not on individual bead cards, because it's a property of
 * the Favorites container: masked favorites drop out of the favorites→relatives
 * seed expansion. Adds the one thing the stores omit to stay testable: a change
 * event so every webview can be re-published whenever the set, the mask, or the
 * active project changes.
 */
export class FavoritesService {
  private readonly store: FavoritesStore;
  private readonly mask: FavoritesMaskStore;
  private readonly _onDidChange = new vscode.EventEmitter<string[]>();

  /** Fires with the active project's favorites whenever the set or mask changes. */
  public readonly onDidChange = this._onDidChange.event;

  constructor(memento: vscode.Memento) {
    this.store = new FavoritesStore(memento);
    this.mask = new FavoritesMaskStore(memento);
  }

  /** Re-point at a project (on switch) and re-publish its set. */
  setActiveProject(projectId: string | null): void {
    this.store.setActiveProject(projectId);
    this.mask.setActiveProject(projectId);
    this.fire();
  }

  /** The active project's favorites, in curated order. */
  list(): string[] {
    return this.store.list();
  }

  isFavorite(id: string): boolean {
    return this.store.isFavorite(id);
  }

  /** True when this favorite is masked (eye-off, excluded from the expansion). */
  isMasked(id: string): boolean {
    return this.mask.isMasked(id);
  }

  async toggle(id: string): Promise<boolean> {
    const result = await this.store.toggle(id);
    this.fire();
    return result;
  }

  async remove(id: string): Promise<void> {
    if (await this.store.remove(id)) this.fire();
  }

  /** Flip a favorite's mask (eye-off) in the Favorites filter group. */
  async toggleMask(id: string): Promise<boolean> {
    const result = await this.mask.toggle(id);
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
