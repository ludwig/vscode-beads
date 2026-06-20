import { needsDependencyGraph } from "../dependencyGraphGate";

describe("needsDependencyGraph (vs-mbqc)", () => {
  it("requests the graph when a filter is active and the graph is missing", () => {
    // The regression: a restored-active Favorites/Ready filter on mount with no
    // graph yet must trigger a fetch, or favorites render without relatives.
    expect(needsDependencyGraph(true, false)).toBe(true);
  });

  it("does not request when the filter is active but the graph is already loaded", () => {
    expect(needsDependencyGraph(true, true)).toBe(false);
  });

  it("does not request when no graph-dependent filter is active", () => {
    expect(needsDependencyGraph(false, false)).toBe(false);
    expect(needsDependencyGraph(false, true)).toBe(false);
  });
});
