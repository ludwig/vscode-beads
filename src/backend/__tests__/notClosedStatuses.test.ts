import { deriveNotClosedStatuses, sameStatusSet } from "../notClosedStatuses";
import { BeadStatus, BUILTIN_STATUSES, isClosedStatus } from "../../shared/contract";

const beadsWith = (...statuses: (BeadStatus | undefined)[]) =>
  statuses.map((status) => ({ status }));

describe("deriveNotClosedStatuses", () => {
  it("returns the present statuses minus the closed (done) category", () => {
    const result = deriveNotClosedStatuses(beadsWith("open", "in_progress", "closed"));
    expect(result.sort()).toEqual(["in_progress", "open"]);
    expect(result).not.toContain("closed");
  });

  it("includes every non-closed built-in status (deferred/pinned/hooked too)", () => {
    const result = deriveNotClosedStatuses(beadsWith(...BUILTIN_STATUSES));
    const expected = BUILTIN_STATUSES.filter((s) => !isClosedStatus(s));
    expect(result.sort()).toEqual([...expected].sort());
    // Regression guard for the original bug: deferred/pinned/hooked must stay in.
    expect(result).toEqual(expect.arrayContaining(["deferred", "pinned", "hooked"]));
  });

  it("keeps unknown/custom statuses (unspecified category is not closed)", () => {
    const result = deriveNotClosedStatuses(beadsWith("triage", "open", "closed"));
    expect(result).toContain("triage");
    expect(result).toContain("open");
    expect(result).not.toContain("closed");
  });

  it("dedupes repeated statuses and preserves first-seen order", () => {
    expect(deriveNotClosedStatuses(beadsWith("open", "open", "in_progress", "open"))).toEqual([
      "open",
      "in_progress",
    ]);
  });

  it("ignores beads with no status", () => {
    expect(deriveNotClosedStatuses(beadsWith(undefined, "open", undefined))).toEqual(["open"]);
  });

  it("returns an empty set when everything present is closed", () => {
    expect(deriveNotClosedStatuses(beadsWith("closed", "closed"))).toEqual([]);
  });

  it("returns an empty set for no beads", () => {
    expect(deriveNotClosedStatuses([])).toEqual([]);
  });
});

describe("sameStatusSet", () => {
  it("is order-insensitive", () => {
    expect(sameStatusSet(["open", "blocked"], ["blocked", "open"])).toBe(true);
  });

  it("distinguishes different sets", () => {
    expect(sameStatusSet(["open"], ["open", "blocked"])).toBe(false);
    expect(sameStatusSet(["open"], ["blocked"])).toBe(false);
  });

  it("treats two empty sets as equal", () => {
    expect(sameStatusSet([], [])).toBe(true);
  });
});
