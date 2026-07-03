import type { Memento } from "vscode";

/**
 * Owns the per-project set of "hidden" beads — beads the user has toggled to
 * excluded/hidden via the eye control (Photoshop-layers metaphor). A hidden
 * bead's row stays visible in the Issues list (marked with a left-edge stripe
 * and an eye-off icon); "hidden" means it is excluded from the derived list
 * that expands into related beads (the favorites→relatives scope). Persisted in
 * extension-host workspaceState so it survives reloads, keyed per active project
 * — the exact shape and lifecycle of {@link FavoritesStore}.
 *
 * Persistence shape: a single workspaceState entry under STORAGE_KEY holding a
 * `{ [projectId]: beadIds[] }` map. Order isn't meaningful (unlike favorites),
 * but we keep it stable for a deterministic persisted shape. Pure and
 * vscode-runtime-free (the Memento type is a type-only import) so it can be
 * unit-tested with an in-memory fake.
 */
export class HiddenBeadsStore {
  private static readonly STORAGE_KEY = "beads.hidden";

  private activeProjectId: string | null = null;

  constructor(private readonly memento: Memento) {}

  /** Point the store at a project; subsequent reads/writes target its set. */
  setActiveProject(projectId: string | null): void {
    this.activeProjectId = projectId;
  }

  /** The active project's hidden bead ids. Empty if no project. */
  list(): string[] {
    if (!this.activeProjectId) return [];
    return [...(this.readAll()[this.activeProjectId] ?? [])];
  }

  isHidden(id: string): boolean {
    if (!this.activeProjectId) return false;
    return (this.readAll()[this.activeProjectId] ?? []).includes(id);
  }

  /** Hide `id`. Returns true if the set changed (false if already hidden or no project). */
  async add(id: string): Promise<boolean> {
    if (!this.activeProjectId) return false;
    const current = this.readAll()[this.activeProjectId] ?? [];
    if (current.includes(id)) return false;
    await this.writeProjectSet([...current, id]);
    return true;
  }

  /** Show `id` again. Returns true if the set changed (false if not present or no project). */
  async remove(id: string): Promise<boolean> {
    if (!this.activeProjectId) return false;
    const current = this.readAll()[this.activeProjectId] ?? [];
    if (!current.includes(id)) return false;
    await this.writeProjectSet(current.filter((existing) => existing !== id));
    return true;
  }

  /** Flip `id`'s hidden state. Returns the resulting state (true = now hidden). */
  async toggle(id: string): Promise<boolean> {
    if (this.isHidden(id)) {
      await this.remove(id);
      return false;
    }
    await this.add(id);
    return this.isHidden(id);
  }

  private readAll(): Record<string, string[]> {
    return this.memento.get<Record<string, string[]>>(HiddenBeadsStore.STORAGE_KEY) ?? {};
  }

  private async writeProjectSet(ids: string[]): Promise<void> {
    if (!this.activeProjectId) return;
    const all = { ...this.readAll(), [this.activeProjectId]: ids };
    await this.memento.update(HiddenBeadsStore.STORAGE_KEY, all);
  }
}
