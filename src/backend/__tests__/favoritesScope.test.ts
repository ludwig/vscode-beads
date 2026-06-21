import { favoritesWithRelatives, favoriteRowClass } from "../favoritesScope";

const edges = (...pairs: [string, string][]) => pairs.map(([from, to]) => ({ from, to }));

describe("favoritesWithRelatives", () => {
  it("is empty when there are no favorites", () => {
    expect(favoritesWithRelatives([], edges(["a", "b"]))).toEqual(new Set());
  });

  it("returns the favorite itself when it has no edges", () => {
    expect(favoritesWithRelatives(["a"], edges(["b", "c"]))).toEqual(new Set(["a"]));
  });

  it("includes neighbors where the favorite is the edge source", () => {
    expect(favoritesWithRelatives(["a"], edges(["a", "b"]))).toEqual(new Set(["a", "b"]));
  });

  it("includes neighbors where the favorite is the edge target (direction-agnostic)", () => {
    expect(favoritesWithRelatives(["a"], edges(["b", "a"]))).toEqual(new Set(["a", "b"]));
  });

  it("collects 1-hop neighbors on both sides but does not go transitive", () => {
    // a—b—c: starring `b` pulls in a and c, but starring `a` only pulls in b.
    const e = edges(["a", "b"], ["b", "c"]);
    expect(favoritesWithRelatives(["b"], e)).toEqual(new Set(["a", "b", "c"]));
    expect(favoritesWithRelatives(["a"], e)).toEqual(new Set(["a", "b"]));
  });

  it("unions relatives across multiple favorites and dedupes", () => {
    const e = edges(["a", "x"], ["b", "x"], ["b", "y"]);
    expect(favoritesWithRelatives(["a", "b"], e)).toEqual(new Set(["a", "b", "x", "y"]));
  });
});

describe("favoriteRowClass", () => {
  const favs = new Set(["a", "b"]);

  it("marks a starred bead when highlighting is enabled", () => {
    expect(favoriteRowClass("a", favs, true)).toBe("favorite");
  });

  it("does not mark a non-starred bead (e.g. a tag-along relative)", () => {
    expect(favoriteRowClass("x", favs, true)).toBe("");
  });

  it("returns no class when highlighting is disabled, even for a favorite", () => {
    expect(favoriteRowClass("a", favs, false)).toBe("");
  });

  it("returns no class for an empty favorites set", () => {
    expect(favoriteRowClass("a", new Set(), true)).toBe("");
  });
});
