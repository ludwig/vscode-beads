import { FavoritesStore } from "../FavoritesStore";

/**
 * Minimal in-memory stand-in for vscode.Memento (workspaceState). Mirrors the
 * real contract: `get` returns the stored value or the default, `update` with
 * `undefined` deletes the key. Lets us assert the persisted shape directly.
 */
class FakeMemento {
  readonly store = new Map<string, unknown>();
  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.store.has(key) ? (this.store.get(key) as T) : defaultValue;
  }
  update(key: string, value: unknown): Promise<void> {
    if (value === undefined) this.store.delete(key);
    else this.store.set(key, value);
    return Promise.resolve();
  }
  keys(): readonly string[] {
    return [...this.store.keys()];
  }
}

const STORAGE_KEY = "beads.favorites";

describe("FavoritesStore", () => {
  it("is empty with no active project", () => {
    const store = new FavoritesStore(new FakeMemento());
    expect(store.list()).toEqual([]);
    expect(store.isFavorite("vs-1")).toBe(false);
  });

  it("adds a bead to the active project's favorites", async () => {
    const store = new FavoritesStore(new FakeMemento());
    store.setActiveProject("proj-a");
    await store.add("vs-1");
    expect(store.list()).toEqual(["vs-1"]);
    expect(store.isFavorite("vs-1")).toBe(true);
  });

  it("preserves insertion order across multiple adds", async () => {
    const store = new FavoritesStore(new FakeMemento());
    store.setActiveProject("proj-a");
    await store.add("vs-3");
    await store.add("vs-1");
    await store.add("vs-2");
    expect(store.list()).toEqual(["vs-3", "vs-1", "vs-2"]);
  });

  it("dedupes: adding an existing favorite is a no-op and reports no change", async () => {
    const store = new FavoritesStore(new FakeMemento());
    store.setActiveProject("proj-a");
    expect(await store.add("vs-1")).toBe(true);
    expect(await store.add("vs-1")).toBe(false);
    expect(store.list()).toEqual(["vs-1"]);
  });

  it("removes a favorite and reports whether it changed", async () => {
    const store = new FavoritesStore(new FakeMemento());
    store.setActiveProject("proj-a");
    await store.add("vs-1");
    expect(await store.remove("vs-1")).toBe(true);
    expect(store.list()).toEqual([]);
    expect(await store.remove("vs-1")).toBe(false);
  });

  it("toggle returns the resulting favorite state", async () => {
    const store = new FavoritesStore(new FakeMemento());
    store.setActiveProject("proj-a");
    expect(await store.toggle("vs-1")).toBe(true);
    expect(store.isFavorite("vs-1")).toBe(true);
    expect(await store.toggle("vs-1")).toBe(false);
    expect(store.isFavorite("vs-1")).toBe(false);
  });

  it("ignores mutations when there is no active project", async () => {
    const store = new FavoritesStore(new FakeMemento());
    expect(await store.add("vs-1")).toBe(false);
    expect(await store.toggle("vs-1")).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it("keys favorites per project — sets do not bleed across projects", async () => {
    const memento = new FakeMemento();
    const store = new FavoritesStore(memento);

    store.setActiveProject("proj-a");
    await store.add("vs-1");
    await store.add("vs-2");

    store.setActiveProject("proj-b");
    expect(store.list()).toEqual([]);
    await store.add("vs-9");
    expect(store.list()).toEqual(["vs-9"]);

    store.setActiveProject("proj-a");
    expect(store.list()).toEqual(["vs-1", "vs-2"]);
  });

  it("persists a project-keyed map under a single workspaceState key", async () => {
    const memento = new FakeMemento();
    const store = new FavoritesStore(memento);
    store.setActiveProject("proj-a");
    await store.add("vs-1");
    store.setActiveProject("proj-b");
    await store.add("vs-9");

    expect(memento.get(STORAGE_KEY)).toEqual({
      "proj-a": ["vs-1"],
      "proj-b": ["vs-9"],
    });
  });

  it("rehydrates favorites from a pre-populated workspaceState", () => {
    const memento = new FakeMemento();
    memento.update(STORAGE_KEY, { "proj-a": ["vs-1", "vs-2"] });
    const store = new FavoritesStore(memento);
    store.setActiveProject("proj-a");
    expect(store.list()).toEqual(["vs-1", "vs-2"]);
    expect(store.isFavorite("vs-2")).toBe(true);
  });

  it("returns a defensive copy from list() — mutating it does not corrupt the store", async () => {
    const store = new FavoritesStore(new FakeMemento());
    store.setActiveProject("proj-a");
    await store.add("vs-1");
    const snapshot = store.list();
    snapshot.push("vs-bogus");
    expect(store.list()).toEqual(["vs-1"]);
  });
});
