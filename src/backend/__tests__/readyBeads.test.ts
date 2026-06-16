import { readyBeadIds, nextReadyBead } from "../readyBeads";
import type { Bead, BeadStatus } from "../../shared/contract";

function b(id: string, status: BeadStatus, priority?: number): Pick<Bead, "id" | "status" | "priority"> {
  return { id, status, priority };
}

describe("readyBeadIds", () => {
  it("returns open beads with no blockers", () => {
    const beads = [b("a", "open", 1), b("b", "in_progress", 0), b("c", "closed", 2)];
    expect(readyBeadIds(beads, [])).toEqual(["a"]);
  });

  it("excludes a bead blocked by an open blocker", () => {
    const beads = [b("a", "open", 1), b("blocker", "open", 1)];
    // a is blocked by blocker (a depends on blocker), blocker still open
    expect(readyBeadIds(beads, [{ from: "a", to: "blocker" }])).toEqual(["blocker"]);
  });

  it("includes a bead whose blocker is closed", () => {
    const beads = [b("a", "open", 1), b("done", "closed", 1)];
    expect(readyBeadIds(beads, [{ from: "a", to: "done" }])).toEqual(["a"]);
  });

  it("sorts by priority (P0 first) then id", () => {
    const beads = [b("low", "open", 3), b("z-hi", "open", 0), b("a-hi", "open", 0)];
    expect(readyBeadIds(beads, [])).toEqual(["a-hi", "z-hi", "low"]);
  });

  it("orders beads with no priority last", () => {
    const beads = [b("np", "open", undefined), b("p2", "open", 2)];
    expect(readyBeadIds(beads, [])).toEqual(["p2", "np"]);
  });
});

describe("nextReadyBead", () => {
  const beads = [b("a", "open", 0), b("b", "open", 1), b("c", "open", 2)];

  it("returns the first ready bead with no cursor", () => {
    expect(nextReadyBead(beads, [])).toBe("a");
  });

  it("advances to the next ready bead, cycling at the end", () => {
    expect(nextReadyBead(beads, [], "a")).toBe("b");
    expect(nextReadyBead(beads, [], "b")).toBe("c");
    expect(nextReadyBead(beads, [], "c")).toBe("a");
  });

  it("starts over when the cursor is no longer ready", () => {
    expect(nextReadyBead(beads, [], "gone")).toBe("a");
  });

  it("returns null when nothing is ready", () => {
    expect(nextReadyBead([b("x", "closed", 0)], [])).toBeNull();
  });
});
