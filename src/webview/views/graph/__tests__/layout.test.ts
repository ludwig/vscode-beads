import { layeredLayout, forceLayout, treeLayout, radialLayout, NODE_WIDTH, NODE_HEIGHT } from "../layout";

const edges = [
  { from: "a", to: "b" },
  { from: "a", to: "c" },
  { from: "b", to: "d" },
];

describe("layeredLayout", () => {
  it("returns a position for every node", () => {
    const pos = layeredLayout(["a", "b", "c", "d"], edges);
    expect(pos.size).toBe(4);
    for (const id of ["a", "b", "c", "d"]) {
      const p = pos.get(id)!;
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("ranks dependents above dependencies (TB)", () => {
    const pos = layeredLayout(["a", "b", "c", "d"], edges);
    expect(pos.get("a")!.y).toBeLessThan(pos.get("b")!.y);
    expect(pos.get("b")!.y).toBeLessThan(pos.get("d")!.y);
  });

  it("is deterministic", () => {
    const a = layeredLayout(["a", "b", "c", "d"], edges);
    const b = layeredLayout(["a", "b", "c", "d"], edges);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("handles cycles without throwing", () => {
    const cyclic = [{ from: "a", to: "b" }, { from: "b", to: "a" }];
    const pos = layeredLayout(["a", "b"], cyclic);
    expect(pos.size).toBe(2);
  });

  it("places orphan nodes (no edges)", () => {
    const pos = layeredLayout(["x", "y", "z"], []);
    expect(pos.size).toBe(3);
  });

  it("packs many orphans into a grid (multiple rows), not one wide row", () => {
    const ids = Array.from({ length: 9 }, (_, i) => `n${i}`);
    const pos = layeredLayout(ids, []);
    const ys = new Set([...pos.values()].map((p) => Math.round(p.y)));
    const xs = new Set([...pos.values()].map((p) => Math.round(p.x)));
    // 9 orphans → ~3x3 grid: more than one distinct row and column.
    expect(ys.size).toBeGreaterThan(1);
    expect(xs.size).toBeGreaterThan(1);
  });

  it("places the orphan grid below the connected graph", () => {
    const ids = ["a", "b", "orphan1", "orphan2"];
    const pos = layeredLayout(ids, [{ from: "a", to: "b" }]);
    const connectedMaxY = Math.max(pos.get("a")!.y, pos.get("b")!.y);
    expect(pos.get("orphan1")!.y).toBeGreaterThan(connectedMaxY);
    expect(pos.get("orphan2")!.y).toBeGreaterThan(connectedMaxY);
  });

  it("ignores edges to unknown nodes and self-loops", () => {
    const pos = layeredLayout(["a"], [{ from: "a", to: "ghost" }, { from: "a", to: "a" }]);
    expect(pos.size).toBe(1);
  });

  it("returns an empty map for no nodes", () => {
    expect(layeredLayout([], edges).size).toBe(0);
  });

  it("uses top-left corner positions (offset from dagre center)", () => {
    const pos = layeredLayout(["solo"], []);
    const p = pos.get("solo")!;
    // Single node centers near (marginx + w/2); corner = center - w/2 >= 0-ish.
    expect(p.x).toBeGreaterThanOrEqual(-NODE_WIDTH);
    expect(p.y).toBeGreaterThanOrEqual(-NODE_HEIGHT);
  });
});

describe("forceLayout", () => {
  it("returns a finite position for every node", () => {
    const pos = forceLayout(["a", "b", "c", "d"], edges);
    expect(pos.size).toBe(4);
    for (const p of pos.values()) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("is deterministic across runs", () => {
    const a = forceLayout(["a", "b", "c", "d"], edges);
    const b = forceLayout(["a", "b", "c", "d"], edges);
    for (const id of ["a", "b", "c", "d"]) {
      expect(a.get(id)).toEqual(b.get(id));
    }
  });

  it("separates connected nodes (collision keeps them apart)", () => {
    const pos = forceLayout(["a", "b"], [{ from: "a", to: "b" }]);
    const a = pos.get("a")!;
    const b = pos.get("b")!;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    expect(dist).toBeGreaterThan(NODE_HEIGHT / 2);
  });

  it("returns an empty map for no nodes", () => {
    expect(forceLayout([], edges).size).toBe(0);
  });

  it("produces distinct variants for different seeds, reproducible per seed", () => {
    const ids = ["a", "b", "c", "d"];
    const v1 = forceLayout(ids, edges, 1);
    const v2 = forceLayout(ids, edges, 2);
    const v1again = forceLayout(ids, edges, 1);
    // Same seed → identical; different seeds → at least one node moved.
    expect([...v1.entries()]).toEqual([...v1again.entries()]);
    const moved = ids.some((id) => v1.get(id)!.x !== v2.get(id)!.x || v1.get(id)!.y !== v2.get(id)!.y);
    expect(moved).toBe(true);
  });
});

// Parent-child hierarchy edges: from=child, to=parent.
const hier = [
  { from: "b", to: "a" }, // a is parent of b
  { from: "c", to: "a" }, // a is parent of c
  { from: "d", to: "b" }, // b is parent of d
];

describe("treeLayout", () => {
  it("returns a position for every node", () => {
    const pos = treeLayout(["a", "b", "c", "d"], hier);
    expect(pos.size).toBe(4);
    for (const id of ["a", "b", "c", "d"]) expect(pos.has(id)).toBe(true);
  });

  it("places the parent above its children (smaller y)", () => {
    const pos = treeLayout(["a", "b", "c", "d"], hier);
    expect(pos.get("a")!.y).toBeLessThan(pos.get("b")!.y);
    expect(pos.get("b")!.y).toBeLessThan(pos.get("d")!.y);
  });

  it("grids isolated beads (no parent-child edge) and still positions them", () => {
    const pos = treeLayout(["a", "b", "orphan1", "orphan2"], [{ from: "b", to: "a" }]);
    expect(pos.size).toBe(4);
    expect(pos.has("orphan1")).toBe(true);
  });

  it("handles cycles without throwing", () => {
    const pos = treeLayout(["a", "b"], [{ from: "a", to: "b" }, { from: "b", to: "a" }]);
    expect(pos.size).toBe(2);
  });

  it("handles empty input", () => {
    expect(treeLayout([], hier).size).toBe(0);
  });
});

describe("radialLayout", () => {
  it("returns a position for every node", () => {
    const pos = radialLayout(["a", "b", "c", "d"], hier);
    expect(pos.size).toBe(4);
  });

  it("grids isolated beads alongside the hierarchy", () => {
    const pos = radialLayout(["a", "b", "orphan1"], [{ from: "b", to: "a" }]);
    expect(pos.size).toBe(3);
    expect(pos.has("orphan1")).toBe(true);
  });

  it("handles empty input", () => {
    expect(radialLayout([], hier).size).toBe(0);
  });
});
