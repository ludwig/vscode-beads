import { buildForest, filterForest, type TreeNode } from "../treeModel";
import type { Bead } from "../../../types";

function bead(id: string, title = id): Bead {
  return { id, title, status: "open", priority: 2, type: "task" } as Bead;
}

function typedBead(id: string, type: string): Bead {
  return { id, title: id, status: "open", priority: 2, type } as Bead;
}

// parent-child edge: from=child, to=parent
function pc(child: string, parent: string) {
  return { from: child, to: parent, type: "parent-child" as const };
}

const ids = (nodes: TreeNode[]): string[] => nodes.map((n) => n.bead.id);

describe("buildForest", () => {
  it("nests children under their parent", () => {
    const forest = buildForest([bead("p"), bead("c1"), bead("c2")], [pc("c1", "p"), pc("c2", "p")]);
    expect(ids(forest)).toEqual(["p"]);
    expect(ids(forest[0].children)).toEqual(["c1", "c2"]);
  });

  it("treats beads with no parent as roots, sorted by id", () => {
    const forest = buildForest([bead("b"), bead("a")], []);
    expect(ids(forest)).toEqual(["a", "b"]);
  });

  it("builds a multi-level hierarchy", () => {
    const forest = buildForest(
      [bead("root"), bead("mid"), bead("leaf")],
      [pc("mid", "root"), pc("leaf", "mid")],
    );
    expect(ids(forest)).toEqual(["root"]);
    expect(ids(forest[0].children)).toEqual(["mid"]);
    expect(ids(forest[0].children[0].children)).toEqual(["leaf"]);
  });

  it("ignores non-parent-child edges for hierarchy", () => {
    const forest = buildForest(
      [bead("a"), bead("b")],
      [{ from: "a", to: "b", type: "blocks" }],
    );
    expect(ids(forest)).toEqual(["a", "b"]); // both roots; blocks doesn't nest
  });

  it("keeps only the first parent when a child has several", () => {
    const forest = buildForest(
      [bead("p1"), bead("p2"), bead("c")],
      [pc("c", "p1"), pc("c", "p2")],
    );
    // c nests under p1 (first wins); p2 is a childless root
    const p1 = forest.find((n) => n.bead.id === "p1")!;
    const p2 = forest.find((n) => n.bead.id === "p2")!;
    expect(ids(p1.children)).toEqual(["c"]);
    expect(ids(p2.children)).toEqual([]);
  });

  it("does not infinitely recurse on a cycle", () => {
    const forest = buildForest([bead("a"), bead("b")], [pc("a", "b"), pc("b", "a")]);
    // a's parent is b (first edge), b's parent is a (second) → b has no
    // recorded parent only if... both get a parent, so neither is a root.
    // The build still terminates; assert it returns without throwing.
    expect(Array.isArray(forest)).toBe(true);
  });

  it("ignores edges referencing absent beads", () => {
    const forest = buildForest([bead("a")], [pc("a", "ghost")]);
    expect(ids(forest)).toEqual(["a"]);
  });

  it("sorts by type rank (epics first) then id, at every level", () => {
    const epicFirst = (t: string | undefined) => (t === "epic" ? 0 : 1);
    const forest = buildForest(
      [typedBead("z-epic", "epic"), typedBead("a-task", "task"), typedBead("m-epic", "epic")],
      [],
      epicFirst,
    );
    // both epics precede the task, even though 'a-task' sorts first by id
    expect(ids(forest)).toEqual(["m-epic", "z-epic", "a-task"]);
  });
});

describe("filterForest", () => {
  const forest = buildForest(
    [bead("epic-1", "Login epic"), bead("task-2", "Add button"), bead("task-3", "Fix bug")],
    [pc("task-2", "epic-1"), pc("task-3", "epic-1")],
  );

  it("returns the forest unchanged for an empty query", () => {
    expect(filterForest(forest, "  ")).toBe(forest);
  });

  it("keeps a matching node and its ancestors", () => {
    const out = filterForest(forest, "button");
    expect(ids(out)).toEqual(["epic-1"]); // ancestor kept
    expect(ids(out[0].children)).toEqual(["task-2"]); // match kept, sibling dropped
  });

  it("matches on id as well as title", () => {
    const out = filterForest(forest, "task-3");
    expect(ids(out[0].children)).toEqual(["task-3"]);
  });

  it("keeps a parent that matches even with no matching children", () => {
    const out = filterForest(forest, "login");
    expect(ids(out)).toEqual(["epic-1"]);
    expect(ids(out[0].children)).toEqual(["task-2", "task-3"]); // parent match keeps subtree
  });

  it("drops everything when nothing matches", () => {
    expect(filterForest(forest, "zzz")).toEqual([]);
  });
});
