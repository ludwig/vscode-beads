import { layeredLayout, forceLayout, NODE_WIDTH, NODE_HEIGHT } from "../layout";

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
});
