import { beadDocPath, beadIdFromPath, renderBeadMarkdown } from "../beadMarkdown";
import { BeadsIssue } from "../../backend/BeadsBackend";

describe("beadMarkdown path round-trip (vs-ab3)", () => {
  it("builds a /<id>.md path and recovers the id", () => {
    for (const id of ["vs-ab3", "vs-fkb", "foo-123", "vs-8i1.1.1"]) {
      expect(beadDocPath(id)).toBe(`/${id}.md`);
      expect(beadIdFromPath(beadDocPath(id))).toBe(id);
    }
  });

  it("strips a leading slash and the .md suffix only", () => {
    expect(beadIdFromPath("/vs-ab3.md")).toBe("vs-ab3");
    // no leading slash, no suffix
    expect(beadIdFromPath("vs-ab3")).toBe("vs-ab3");
  });
});

function issue(overrides: Partial<BeadsIssue> = {}): BeadsIssue {
  return {
    id: "vs-ab3",
    title: "Spike",
    status: "in_progress",
    priority: 2,
    issue_type: "task",
    created_at: "2026-06-19T00:00:00Z",
    updated_at: "2026-06-19T00:00:00Z",
    ...overrides,
  };
}

describe("renderBeadMarkdown (vs-ab3)", () => {
  it("renders an id+title heading and a P-labelled meta line", () => {
    const md = renderBeadMarkdown(issue());
    expect(md).toContain("# vs-ab3 — Spike");
    expect(md).toContain("**Type:** task");
    expect(md).toContain("**Status:** in_progress");
    expect(md).toContain("**Priority:** P2");
  });

  it("falls back to the raw priority when out of the labelled range", () => {
    expect(renderBeadMarkdown(issue({ priority: 9 }))).toContain("**Priority:** 9");
  });

  it("includes optional sections only when present and non-empty", () => {
    const full = renderBeadMarkdown(
      issue({
        description: "the desc",
        design: "the design",
        acceptance_criteria: "the AC",
        notes: "the notes",
      })
    );
    expect(full).toContain("## Description");
    expect(full).toContain("the desc");
    expect(full).toContain("## Design");
    expect(full).toContain("## Acceptance Criteria");
    expect(full).toContain("## Notes");

    const bare = renderBeadMarkdown(issue({ description: "   " }));
    expect(bare).not.toContain("## Description");
    expect(bare).not.toContain("## Design");
  });

  it("renders dependencies and comments when present", () => {
    const md = renderBeadMarkdown(
      issue({
        dependencies: [{ id: "vs-fkb", dependency_type: "parent-child", title: "Epic" }],
        comments: [{ id: "c1", author: "luis", text: "line one\nline two", created_at: "2026-06-19" }],
      })
    );
    expect(md).toContain("## Dependencies");
    expect(md).toContain("parent-child → vs-fkb — Epic");
    expect(md).toContain("## Comments");
    expect(md).toContain("> **luis**");
    expect(md).toContain("> line one\n> line two");
  });
});
