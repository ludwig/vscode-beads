import { resolveScope } from "../resolveScope";
import type { FilterSnapshot, Bead } from "../../shared/contract";

const spec = (over: Partial<FilterSnapshot> = {}): FilterSnapshot => ({
  columnFilters: [],
  globalFilter: "",
  activePreset: "custom",
  readyOnly: false,
  favoritesOnly: false,
  ...over,
});
const B = (id: string, o: Partial<Bead> = {}): Bead =>
  ({ id, title: id, status: "open", priority: 2, type: "task", labels: [], ...o }) as Bead;

describe("resolveScope", () => {
  const beads = [B("a"), B("b", { status: "closed" }), B("c", { labels: ["ui"] })];

  it("returns null when no dimension is active", () => {
    expect(resolveScope({ beads, edges: [], favoriteIds: [], maskedIds: [], spec: spec() })).toBeNull();
  });

  it("applies a status column filter", () => {
    const r = resolveScope({
      beads,
      edges: [],
      favoriteIds: [],
      maskedIds: [],
      spec: spec({ columnFilters: [{ id: "status", value: ["closed"] }] }),
    });
    expect(r).toEqual(["b"]);
  });

  it("favoritesOnly expands seeds into 1-hop relatives, minus masked", () => {
    const edges = [{ from: "a", to: "c", type: "related" }];
    const r = resolveScope({ beads, edges, favoriteIds: ["a"], maskedIds: [], spec: spec({ favoritesOnly: true }) });
    expect(new Set(r)).toEqual(new Set(["a", "c"]));
    const masked = resolveScope({ beads, edges, favoriteIds: ["a"], maskedIds: ["a"], spec: spec({ favoritesOnly: true }) });
    expect(masked).toEqual([]); // masked seed drops itself and its relative
  });

  it("readyOnly intersects with blocks-graph readiness", () => {
    // Blocks-edge convention (readyBeads.ts): {from, to} means "from is
    // blocked by to". Here "a" depends on "c" and "c" is still open, so "a"
    // is not ready; "b" is excluded from readiness on status alone (closed,
    // not "open"); only "c" (open, unblocked) is ready.
    const edges = [{ from: "a", to: "c", type: "blocks" }];
    const r = resolveScope({ beads, edges, favoriteIds: [], maskedIds: [], spec: spec({ readyOnly: true }) });
    expect(r).toEqual(["c"]);
  });

  it("composes column filter AND favorites scope (intersection)", () => {
    const edges = [{ from: "a", to: "c", type: "related" }];
    const r = resolveScope({
      beads,
      edges,
      favoriteIds: ["a"],
      maskedIds: [],
      spec: spec({ favoritesOnly: true, columnFilters: [{ id: "labels", value: ["ui"] }] }),
    });
    expect(r).toEqual(["c"]); // only c is in favorites-scope AND labeled ui
  });
});
