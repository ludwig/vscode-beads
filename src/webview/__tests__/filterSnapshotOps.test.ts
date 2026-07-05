import type { FilterSnapshot, BeadStatus } from "../../shared/contract";
import { NOT_CLOSED } from "../../backend/filterPredicates";
import {
  emptyFilterSnapshot,
  applyPreset,
  addStatus,
  removeStatus,
  clearStatus,
  addPriority,
  removePriority,
  addType,
  removeType,
  addLabel,
  addAssignee,
  removeAssignee,
  toggleReady,
  toggleFavoritesOnly,
  clearAll,
  statusValues,
  labelValues,
} from "../filterSnapshotOps";

const empty = emptyFilterSnapshot();

describe("emptyFilterSnapshot", () => {
  it("narrows nothing", () => {
    expect(empty).toEqual({
      columnFilters: [],
      globalFilter: "",
      activePreset: "",
      readyOnly: false,
      favoritesOnly: false,
    });
  });
});

describe("presets", () => {
  it("applyPreset sets the status column and records the preset id", () => {
    const s = applyPreset(empty, "active");
    expect(statusValues(s)).toEqual(["in_progress", "blocked"]);
    expect(s.activePreset).toBe("active");
  });

  it("applyPreset('all') drops the status column entirely", () => {
    const s = applyPreset(applyPreset(empty, "active"), "all");
    expect(s.columnFilters.find((f) => f.id === "status")).toBeUndefined();
    expect(s.activePreset).toBe("all");
  });

  it("applyPreset with an unknown id is a no-op", () => {
    expect(applyPreset(empty, "nope")).toBe(empty);
  });
});

describe("status ops", () => {
  it("addStatus drops the ¬closed sentinel when a concrete status is picked", () => {
    const notClosed = applyPreset(empty, "not-closed");
    expect(statusValues(notClosed)).toEqual([NOT_CLOSED]);
    const s = addStatus(notClosed, "open");
    expect(statusValues(s)).toEqual(["open"]);
    expect(s.activePreset).toBe("");
  });

  it("addStatus is idempotent", () => {
    const s = addStatus(empty, "open");
    expect(addStatus(s, "open")).toBe(s);
  });

  it("removeStatus drops the column when the last value goes", () => {
    const s = addStatus(empty, "open");
    const r = removeStatus(s, "open");
    expect(r.columnFilters.find((f) => f.id === "status")).toBeUndefined();
    expect(r.activePreset).toBe("");
  });

  it("clearStatus is equivalent to the 'all' preset", () => {
    const s = addStatus(empty, "open");
    const r = clearStatus(s);
    expect(r.columnFilters.find((f) => f.id === "status")).toBeUndefined();
    expect(r.activePreset).toBe("all");
  });
});

describe("uniform add/remove dimensions", () => {
  it("priority add is idempotent, remove clears the column", () => {
    const s = addPriority(empty, 0);
    expect(addPriority(s, 0)).toBe(s);
    expect(removePriority(s, 0).columnFilters).toEqual([]);
  });

  it("type/label/assignee accumulate distinct values and clear the preset", () => {
    let s: FilterSnapshot = applyPreset(empty, "all");
    s = addType(s, "bug");
    s = addLabel(s, "ui");
    s = addLabel(s, "backend");
    s = addAssignee(s, "luis");
    expect(labelValues(s)).toEqual(["ui", "backend"]);
    expect(s.activePreset).toBe("");
    s = removeType(s, "bug");
    expect(s.columnFilters.find((f) => f.id === "type")).toBeUndefined();
    s = removeAssignee(s, "luis");
    expect(s.columnFilters.find((f) => f.id === "assignee")).toBeUndefined();
  });
});

describe("toggles + clearAll", () => {
  it("toggleReady / toggleFavoritesOnly flip their flags", () => {
    expect(toggleReady(empty).readyOnly).toBe(true);
    expect(toggleFavoritesOnly(empty).favoritesOnly).toBe(true);
    expect(toggleReady(toggleReady(empty)).readyOnly).toBe(false);
  });

  it("clearAll empties everything and selects 'all'", () => {
    let s = addStatus(empty, "open");
    s = toggleReady(s);
    s = { ...s, globalFilter: "foo" };
    const r = clearAll(s);
    expect(r).toEqual({
      columnFilters: [],
      globalFilter: "",
      activePreset: "all",
      readyOnly: false,
      favoritesOnly: false,
    });
  });

  it("does not mutate the input snapshot", () => {
    const s = addStatus(empty, "open");
    const before = JSON.parse(JSON.stringify(s)) as FilterSnapshot;
    addStatus(s, "closed" as BeadStatus);
    removeStatus(s, "open");
    toggleReady(s);
    expect(s).toEqual(before);
  });
});
