import { neighborhood, edgeStyle, EDGE_TYPE_ORDER } from "../graphModel";

const edges = [
  { from: "a", to: "b" },
  { from: "b", to: "c" },
  // disconnected pair
  { from: "x", to: "y" },
];

describe("neighborhood", () => {
  it("returns the focus node plus all weakly-connected nodes", () => {
    const hood = neighborhood("a", ["a", "b", "c", "x", "y"], edges);
    expect([...hood].sort()).toEqual(["a", "b", "c"]);
  });

  it("traverses edges in both directions", () => {
    // focus on a leaf still pulls in its ancestors
    const hood = neighborhood("c", ["a", "b", "c"], edges);
    expect([...hood].sort()).toEqual(["a", "b", "c"]);
  });

  it("isolates a separate component", () => {
    const hood = neighborhood("x", ["a", "b", "c", "x", "y"], edges);
    expect([...hood].sort()).toEqual(["x", "y"]);
  });

  it("returns just the node when it has no edges", () => {
    const hood = neighborhood("solo", ["solo", "a", "b"], edges);
    expect([...hood]).toEqual(["solo"]);
  });

  it("returns an empty set when the focus id is absent", () => {
    expect(neighborhood("ghost", ["a", "b"], edges).size).toBe(0);
  });

  it("ignores edges referencing absent nodes", () => {
    const hood = neighborhood("a", ["a", "b"], [{ from: "a", to: "b" }, { from: "b", to: "gone" }]);
    expect([...hood].sort()).toEqual(["a", "b"]);
  });
});

describe("edgeStyle", () => {
  it("gives blocks a bold solid stroke", () => {
    const s = edgeStyle("blocks");
    expect(s.bold).toBe(true);
    expect(s.dashed).toBe(false);
  });

  it("gives related a dashed stroke", () => {
    expect(edgeStyle("related").dashed).toBe(true);
  });

  it("has a style for every ordered type", () => {
    for (const type of EDGE_TYPE_ORDER) {
      expect(edgeStyle(type).color).toMatch(/^#/);
    }
  });
});
