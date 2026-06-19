import type { Memento } from "vscode";

/**
 * Owns the per-project set of "favorite"/starred beads (vs-sd5.1), persisted in
 * extension-host workspaceState so it survives reloads. Keyed per active project
 * — mirroring how BeadsProjectManager persists the active project under a
 * workspaceState key (ACTIVE_PROJECT_KEY).
 *
 * Persistence shape: a single workspaceState entry under STORAGE_KEY holding a
 * `{ [projectId]: orderedBeadIds[] }` map. Insertion order is preserved so the
 * Favorites section can render newest-pinned-last (the curated order the user
 * built up). Pure and vscode-runtime-free (the Memento type is a type-only
 * import) so it can be unit-tested with an in-memory fake.
 */
export class FavoritesStore {
  private static readonly STORAGE_KEY = "beads.favorites";

  private activeProjectId: string | null = null;

  constructor(private readonly memento: Memento) {}

  /** Point the store at a project; subsequent reads/writes target its set. */
  setActiveProject(projectId: string | null): void {
    this.activeProjectId = projectId;
  }

  /** The active project's favorites, in insertion order. Empty if no project. */
  list(): string[] {
    if (!this.activeProjectId) return [];
    return [...(this.readAll()[this.activeProjectId] ?? [])];
  }

  isFavorite(id: string): boolean {
    if (!this.activeProjectId) return false;
    return (this.readAll()[this.activeProjectId] ?? []).includes(id);
  }

  /** Star `id`. Returns true if the set changed (false if already a favorite or no project). */
  async add(id: string): Promise<boolean> {
    if (!this.activeProjectId) return false;
    const current = this.readAll()[this.activeProjectId] ?? [];
    if (current.includes(id)) return false;
    await this.writeProjectSet([...current, id]);
    return true;
  }

  /** Unstar `id`. Returns true if the set changed (false if not present or no project). */
  async remove(id: string): Promise<boolean> {
    if (!this.activeProjectId) return false;
    const current = this.readAll()[this.activeProjectId] ?? [];
    if (!current.includes(id)) return false;
    await this.writeProjectSet(current.filter((existing) => existing !== id));
    return true;
  }

  /** Flip `id`'s favorite state. Returns the resulting state (true = now a favorite). */
  async toggle(id: string): Promise<boolean> {
    if (this.isFavorite(id)) {
      await this.remove(id);
      return false;
    }
    await this.add(id);
    return this.isFavorite(id);
  }

  private readAll(): Record<string, string[]> {
    return this.memento.get<Record<string, string[]>>(FavoritesStore.STORAGE_KEY) ?? {};
  }

  private async writeProjectSet(ids: string[]): Promise<void> {
    if (!this.activeProjectId) return;
    const all = { ...this.readAll(), [this.activeProjectId]: ids };
    await this.memento.update(FavoritesStore.STORAGE_KEY, all);
  }
}
