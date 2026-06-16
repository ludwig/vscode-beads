import { parseDotEdges } from "../graphDot";

describe("parseDotEdges", () => {
  it("extracts edges with from/to/type from dot output", () => {
    const dot = `digraph dependencies {
  rankdir=TB;
  node [shape=box, style=rounded];

  "vs-a" [label="vs-a\\n[feature P1]\\nTitle\\n(open)", style="rounded,filled", fillcolor="white", fontcolor="black"];
  "vs-b" [label="vs-b", style="rounded,filled"];

  "vs-a" -> "vs-b" [label="blocks", color=red, style=bold];
}`;
    expect(parseDotEdges(dot)).toEqual([{ from: "vs-a", to: "vs-b", type: "blocks" }]);
  });

  it("handles every dependency type", () => {
    const dot = [
      `  "a" -> "b" [label="blocks", color=red, style=bold];`,
      `  "c" -> "d" [label="parent-child", color=blue, style=solid];`,
      `  "e" -> "f" [label="related", color=gray, style=dashed];`,
      `  "g" -> "h" [label="discovered-from", color=green, style=dashed];`,
    ].join("\n");
    expect(parseDotEdges(dot)).toEqual([
      { from: "a", to: "b", type: "blocks" },
      { from: "c", to: "d", type: "parent-child" },
      { from: "e", to: "f", type: "related" },
      { from: "g", to: "h", type: "discovered-from" },
    ]);
  });

  it("ignores node-declaration lines, the wrapper, and stray noise", () => {
    const dot = `digraph dependencies {
  node [shape=box];
  "lonely" [label="lonely"];
  warning: something printed to stderr
}`;
    expect(parseDotEdges(dot)).toEqual([]);
  });

  it("falls back to 'related' for an unknown edge label", () => {
    const dot = `  "a" -> "b" [label="mystery", color=black, style=solid];`;
    expect(parseDotEdges(dot)).toEqual([{ from: "a", to: "b", type: "related" }]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseDotEdges("")).toEqual([]);
  });
});
