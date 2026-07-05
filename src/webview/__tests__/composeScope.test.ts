import { intersect } from "../composeScope";

describe("intersect (scope composition)", () => {
  it("treats null as the unconstrained identity on either side", () => {
    expect(intersect(null, null)).toBeNull();
    expect(intersect(null, ["a", "b"])).toEqual(["a", "b"]);
    expect(intersect(["a", "b"], null)).toEqual(["a", "b"]);
  });

  it("intersects two lists, preserving the first operand's order", () => {
    expect(intersect(["c", "a", "b"], ["b", "c"])).toEqual(["c", "b"]);
  });

  it("returns an empty array (not null) for a disjoint intersection", () => {
    expect(intersect(["a"], ["b"])).toEqual([]);
  });

  it("collapses an empty operand to empty (active-but-empty scope)", () => {
    expect(intersect([], ["a"])).toEqual([]);
    expect(intersect(["a"], [])).toEqual([]);
  });
});
