import { HiddenBeadsStore } from "../HiddenBeadsStore";

/**
 * Minimal in-memory stand-in for vscode.Memento (workspaceState) — the same
 * fake the FavoritesStore test uses. `get` returns the stored value or default;
 * `update` with `undefined` deletes the key.
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

const STORAGE_KEY = "beads.hidden";

describe("HiddenBeadsStore", () => {
  it("is empty with no active project", () => {
    const store = new HiddenBeadsStore(new FakeMemento());
    expect(store.list()).toEqual([]);
    expect(store.isHidden("vs-1")).toBe(false);
  });

  it("hides a bead for the active project", async () => {
    const store = new HiddenBeadsStore(new FakeMemento());
    store.setActiveProject("proj-a");
    await store.add("vs-1");
    expect(store.list()).toEqual(["vs-1"]);
    expect(store.isHidden("vs-1")).toBe(true);
  });

  it("dedupes: hiding an already-hidden bead is a no-op", async () => {
    const store = new HiddenBeadsStore(new FakeMemento());
    store.setActiveProject("proj-a");
    expect(await store.add("vs-1")).toBe(true);
    expect(await store.add("vs-1")).toBe(false);
    expect(store.list()).toEqual(["vs-1"]);
  });

  it("shows a bead again and reports whether it changed", async () => {
    const store = new HiddenBeadsStore(new FakeMemento());
    store.setActiveProject("proj-a");
    await store.add("vs-1");
    expect(await store.remove("vs-1")).toBe(true);
    expect(store.list()).toEqual([]);
    expect(await store.remove("vs-1")).toBe(false);
  });

  it("toggle returns the resulting hidden state", async () => {
    const store = new HiddenBeadsStore(new FakeMemento());
    store.setActiveProject("proj-a");
    expect(await store.toggle("vs-1")).toBe(true);
    expect(store.isHidden("vs-1")).toBe(true);
    expect(await store.toggle("vs-1")).toBe(false);
    expect(store.isHidden("vs-1")).toBe(false);
  });

  it("ignores mutations when there is no active project", async () => {
    const store = new HiddenBeadsStore(new FakeMemento());
    expect(await store.add("vs-1")).toBe(false);
    expect(await store.toggle("vs-1")).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it("keys hidden sets per project — sets do not bleed across projects", async () => {
    const memento = new FakeMemento();
    const store = new HiddenBeadsStore(memento);

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
    const store = new HiddenBeadsStore(memento);
    store.setActiveProject("proj-a");
    await store.add("vs-1");
    store.setActiveProject("proj-b");
    await store.add("vs-9");

    expect(memento.get(STORAGE_KEY)).toEqual({
      "proj-a": ["vs-1"],
      "proj-b": ["vs-9"],
    });
  });

  it("returns a defensive copy from list()", async () => {
    const store = new HiddenBeadsStore(new FakeMemento());
    store.setActiveProject("proj-a");
    await store.add("vs-1");
    const snapshot = store.list();
    snapshot.push("vs-bogus");
    expect(store.list()).toEqual(["vs-1"]);
  });
});
