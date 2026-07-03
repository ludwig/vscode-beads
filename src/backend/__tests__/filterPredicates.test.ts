import {
  matchStatus,
  matchType,
  matchPriority,
  matchLabels,
  matchAssignee,
  matchSearch,
  NOT_CLOSED,
  UNLABELED,
  UNASSIGNED,
} from "../filterPredicates";
import type { Bead } from "../../shared/contract";

const bead = (over: Partial<Bead> = {}): Bead =>
  ({
    id: "vs-1",
    title: "Fix the thing",
    status: "open",
    priority: 2,
    type: "task",
    labels: ["ui"],
    assignee: "luis",
    description: "",
    ...over,
  }) as Bead;

describe("filterPredicates", () => {
  it("empty filter is a no-op (matches everything)", () => {
    expect(matchStatus(bead(), [])).toBe(true);
    expect(matchSearch(bead(), "")).toBe(true);
  });

  it("NOT_CLOSED excludes only the closed category", () => {
    expect(matchStatus(bead({ status: "open" }), [NOT_CLOSED])).toBe(true);
    // "closed" is the only built-in status whose category is "done" (see
    // BUILTIN_STATUS_CATEGORY in contract.ts) — the plan's original test used
    // "done" as the status literal, but "done" isn't a recognized status at
    // all (falls back to the "unspecified" category, so it's NOT excluded by
    // NOT_CLOSED). Fixed to use the real closed status.
    expect(matchStatus(bead({ status: "closed" }), [NOT_CLOSED])).toBe(false);
  });

  it("status matches explicit membership when NOT_CLOSED absent", () => {
    expect(matchStatus(bead({ status: "open" }), ["open", "in_progress"])).toBe(true);
    expect(matchStatus(bead({ status: "closed" }), ["open"])).toBe(false);
  });

  it("labels: __unlabeled__ matches beads with no labels", () => {
    expect(matchLabels(bead({ labels: [] }), [UNLABELED])).toBe(true);
    expect(matchLabels(bead({ labels: ["ui"] }), [UNLABELED])).toBe(false);
    expect(matchLabels(bead({ labels: ["ui", "bug"] }), ["bug"])).toBe(true);
  });

  it("assignee: __unassigned__ matches empty assignee", () => {
    expect(matchAssignee(bead({ assignee: undefined }), [UNASSIGNED])).toBe(true);
    expect(matchAssignee(bead({ assignee: "luis" }), ["ana"])).toBe(false);
  });

  it("search matches id/title/description/labels, case-insensitive", () => {
    expect(matchSearch(bead({ title: "Fix Login" }), "login")).toBe(true);
    expect(matchSearch(bead({ labels: ["backend"] }), "back")).toBe(true);
    expect(matchSearch(bead({ description: "OAuth flow" }), "oauth")).toBe(true);
    expect(matchSearch(bead(), "zzz")).toBe(false);
  });

  it("matchType and matchPriority are no-ops on empty filters and match on membership", () => {
    expect(matchType(bead({ type: "bug" }), [])).toBe(true);
    expect(matchType(bead({ type: "bug" }), ["bug", "task"])).toBe(true);
    expect(matchType(bead({ type: "bug" }), ["task"])).toBe(false);

    expect(matchPriority(bead({ priority: 0 }), [])).toBe(true);
    expect(matchPriority(bead({ priority: 0 }), [0, 1])).toBe(true);
    expect(matchPriority(bead({ priority: 3 }), [0, 1])).toBe(false);
  });
});
