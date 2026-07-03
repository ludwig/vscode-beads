import type { Bead } from "../../shared/contract";
import { computeFacets } from "../facets";
import { UNLABELED, UNASSIGNED } from "../../backend/filterPredicates";

const bead = (over: Partial<Bead>): Bead => ({
  id: over.id ?? "b-1",
  title: over.title ?? "t",
  status: over.status ?? "open",
  ...over,
});

describe("computeFacets", () => {
  const beads: Bead[] = [
    bead({ id: "a", status: "open", type: "bug", priority: 0, assignee: "luis", labels: ["ui", "x"] }),
    bead({ id: "b", status: "open", type: "task", priority: 0, assignee: "luis", labels: ["ui"] }),
    bead({ id: "c", status: "closed", type: "bug", priority: 2, labels: [] }),
    bead({ id: "d", status: "open", labels: undefined }),
  ];
  const f = computeFacets(beads);

  it("counts statuses across all beads", () => {
    expect(f.statuses).toEqual([
      { value: "open", count: 3 },
      { value: "closed", count: 1 },
    ]);
  });

  it("counts types, skipping beads with no type", () => {
    expect(f.types).toEqual([
      { value: "bug", count: 2 },
      { value: "task", count: 1 },
    ]);
  });

  it("buckets unassigned beads under the sentinel", () => {
    const luis = f.assignees.find((o) => o.value === "luis");
    const unassigned = f.assignees.find((o) => o.value === UNASSIGNED);
    expect(luis?.count).toBe(2);
    expect(unassigned?.count).toBe(2); // c and d have no assignee
  });

  it("buckets beads with no labels under the unlabeled sentinel", () => {
    const ui = f.labels.find((o) => o.value === "ui");
    const unlabeled = f.labels.find((o) => o.value === UNLABELED);
    expect(ui?.count).toBe(2);
    expect(unlabeled?.count).toBe(2); // c ([]) and d (undefined)
  });

  it("counts priorities, skipping beads with no priority", () => {
    expect(f.priorities).toEqual([
      { value: 0, count: 2 },
      { value: 2, count: 1 },
    ]);
  });

  it("sorts options by count desc then value asc", () => {
    const many: Bead[] = [
      bead({ id: "1", type: "z" }),
      bead({ id: "2", type: "a" }),
      bead({ id: "3", type: "a" }),
    ];
    expect(computeFacets(many).types).toEqual([
      { value: "a", count: 2 },
      { value: "z", count: 1 },
    ]);
  });
});
