import { sharedPrefixWidthCh } from "../prefixWidth";

describe("sharedPrefixWidthCh", () => {
  it("returns the widest rendered badge width, counting the trailing dash", () => {
    // "vs-" -> 3, "bd-" -> 3, "foo-" -> 4 ; widest is 4.
    expect(sharedPrefixWidthCh(["vs", "bd", "foo"])).toBe(4);
  });

  it("counts multi-segment prefixes by character length", () => {
    // "agent-beads-" -> 12 characters.
    expect(sharedPrefixWidthCh(["vs", "agent-beads"])).toBe(12);
  });

  it("ignores empty, null, and undefined prefixes", () => {
    expect(sharedPrefixWidthCh(["vs", null, undefined, ""])).toBe(3);
  });

  it("returns null when no usable prefix is present", () => {
    expect(sharedPrefixWidthCh([])).toBeNull();
    expect(sharedPrefixWidthCh([null, undefined, ""])).toBeNull();
  });

  it("handles a single prefix", () => {
    expect(sharedPrefixWidthCh(["vs"])).toBe(3);
  });
});
