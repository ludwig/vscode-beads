import { buildForest, filterForest, filterForestByIds, subtreeIds, type TreeNode } from "../treeModel";
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

  it("defaults to id order at every level", () => {
    const forest = buildForest(
      [typedBead("z-epic", "epic"), typedBead("a-task", "task"), typedBead("m-epic", "epic")],
      [],
    );
    expect(ids(forest)).toEqual(["a-task", "m-epic", "z-epic"]);
  });

  it("honors a custom comparator (e.g. type then id)", () => {
    const rank = (t?: string) => (t === "epic" ? 0 : 1);
    const byTypeThenId = (a: Bead, b: Bead) =>
      rank(a.type) - rank(b.type) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const forest = buildForest(
      [typedBead("z-epic", "epic"), typedBead("a-task", "task"), typedBead("m-epic", "epic")],
      [],
      byTypeThenId,
    );
    // epics first (by id within), then the task
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

describe("filterForestByIds", () => {
  // epic-1 ▸ {task-2, task-3 ▸ sub-4}, plus a standalone lone-5
  const forest = buildForest(
    [bead("epic-1"), bead("task-2"), bead("task-3"), bead("sub-4"), bead("lone-5")],
    [pc("task-2", "epic-1"), pc("task-3", "epic-1"), pc("sub-4", "task-3")],
  );

  it("keeps an allowed leaf and the ancestor path to it, dropping siblings", () => {
    const out = filterForestByIds(forest, new Set(["sub-4"]));
    expect(ids(out)).toEqual(["epic-1"]); // ancestor connector
    expect(ids(out[0].children)).toEqual(["task-3"]); // task-2 sibling dropped
    expect(ids(out[0].children[0].children)).toEqual(["sub-4"]);
  });

  it("does NOT drag along non-allowed descendants of an allowed node", () => {
    const out = filterForestByIds(forest, new Set(["task-3"]));
    expect(ids(out)).toEqual(["epic-1"]);
    expect(ids(out[0].children)).toEqual(["task-3"]);
    expect(out[0].children[0].children).toEqual([]); // sub-4 not in set → pruned
  });

  it("keeps a standalone allowed root", () => {
    const out = filterForestByIds(forest, new Set(["lone-5"]));
    expect(ids(out)).toEqual(["lone-5"]);
  });

  it("returns an empty forest when nothing is allowed", () => {
    expect(filterForestByIds(forest, new Set())).toEqual([]);
  });
});

describe("subtreeIds", () => {
  const forest = buildForest(
    [bead("root"), bead("mid"), bead("leaf"), bead("other")],
    [pc("mid", "root"), pc("leaf", "mid")],
  );

  it("includes the node and all its descendants", () => {
    expect([...subtreeIds(forest, "root")].sort()).toEqual(["leaf", "mid", "root"]);
  });

  it("returns just the node for a leaf", () => {
    expect([...subtreeIds(forest, "leaf")]).toEqual(["leaf"]);
  });

  it("returns an empty set for an unknown id", () => {
    expect(subtreeIds(forest, "ghost").size).toBe(0);
  });

  it("supports the reparent cycle guard (descendant is illegal target)", () => {
    // dropping 'root' onto 'leaf' is illegal: leaf is in root's subtree
    expect(subtreeIds(forest, "root").has("leaf")).toBe(true);
    // dropping 'root' onto 'other' is fine: other is not a descendant
    expect(subtreeIds(forest, "root").has("other")).toBe(false);
  });
});
