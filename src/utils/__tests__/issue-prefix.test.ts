import { deriveIssuePrefix } from "../issue-prefix";

describe("deriveIssuePrefix", () => {
  it("returns null for an empty list", () => {
    expect(deriveIssuePrefix([])).toBeNull();
  });

  it("derives the prefix from a single ID", () => {
    expect(deriveIssuePrefix(["vs-kmt"])).toBe("vs");
  });

  it("derives a shared prefix across many IDs", () => {
    expect(deriveIssuePrefix(["vs-kmt", "vs-0bq", "vs-266"])).toBe("vs");
  });

  it("ignores dotted child segments in the suffix", () => {
    expect(deriveIssuePrefix(["vs-kmt.1", "vs-kmt.2"])).toBe("vs");
  });

  it("handles multi-segment prefixes (splits on the final hyphen)", () => {
    expect(deriveIssuePrefix(["agent-beads-x1y2"])).toBe("agent-beads");
  });

  it("picks the most common prefix when the list is mixed", () => {
    expect(deriveIssuePrefix(["vs-1", "vs-2", "vs-3", "other-9"])).toBe("vs");
  });

  it("skips IDs with no hyphen or a leading hyphen", () => {
    expect(deriveIssuePrefix(["nohyphen", "-leading"])).toBeNull();
  });
});
