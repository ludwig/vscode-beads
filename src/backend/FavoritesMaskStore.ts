import type { Memento } from "vscode";

/**
 * Owns the per-project *mask* over the favorites seed list — which favorites are
 * toggled off (eye-off) in the Favorites filter group. A masked favorite stays
 * in the collection but is excluded from the favorites→relatives expansion (it's
 * dropped from the seed list). The mask is a property of the Favorites container,
 * so {@link FavoritesService} owns an instance of this store alongside the seed
 * store. Persisted in extension-host workspaceState so it survives reloads,
 * keyed per active project — the same shape/lifecycle as {@link FavoritesStore}.
 *
 * Persistence shape: a single workspaceState entry under STORAGE_KEY holding a
 * `{ [projectId]: beadIds[] }` map. Pure and vscode-runtime-free (the Memento
 * type is a type-only import) so it can be unit-tested with an in-memory fake.
 */
export class FavoritesMaskStore {
  private static readonly STORAGE_KEY = "beads.favorites.masked";

  private activeProjectId: string | null = null;

  constructor(private readonly memento: Memento) {}

  /** Point the store at a project; subsequent reads/writes target its set. */
  setActiveProject(projectId: string | null): void {
    this.activeProjectId = projectId;
  }

  /** The active project's masked favorite ids. Empty if no project. */
  list(): string[] {
    if (!this.activeProjectId) return [];
    return [...(this.readAll()[this.activeProjectId] ?? [])];
  }

  isMasked(id: string): boolean {
    if (!this.activeProjectId) return false;
    return (this.readAll()[this.activeProjectId] ?? []).includes(id);
  }

  /** Mask `id`. Returns true if the set changed (false if already masked or no project). */
  async add(id: string): Promise<boolean> {
    if (!this.activeProjectId) return false;
    const current = this.readAll()[this.activeProjectId] ?? [];
    if (current.includes(id)) return false;
    await this.writeProjectSet([...current, id]);
    return true;
  }

  /** Unmask `id`. Returns true if the set changed (false if not present or no project). */
  async remove(id: string): Promise<boolean> {
    if (!this.activeProjectId) return false;
    const current = this.readAll()[this.activeProjectId] ?? [];
    if (!current.includes(id)) return false;
    await this.writeProjectSet(current.filter((existing) => existing !== id));
    return true;
  }

  /** Flip `id`'s masked state. Returns the resulting state (true = now masked). */
  async toggle(id: string): Promise<boolean> {
    if (this.isMasked(id)) {
      await this.remove(id);
      return false;
    }
    await this.add(id);
    return this.isMasked(id);
  }

  private readAll(): Record<string, string[]> {
    return this.memento.get<Record<string, string[]>>(FavoritesMaskStore.STORAGE_KEY) ?? {};
  }

  private async writeProjectSet(ids: string[]): Promise<void> {
    if (!this.activeProjectId) return;
    const all = { ...this.readAll(), [this.activeProjectId]: ids };
    await this.memento.update(FavoritesMaskStore.STORAGE_KEY, all);
  }
}
