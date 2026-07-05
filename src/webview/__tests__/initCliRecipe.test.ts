import { equivalentCliMarkdown } from "../initCliRecipe";

describe("equivalentCliMarkdown", () => {
  const target = "/Users/me/beads/my-project";

  it("wraps the recipe in a fenced bash block", () => {
    const md = equivalentCliMarkdown(target, "server");
    expect(md.startsWith("```bash\n")).toBe(true);
    expect(md.endsWith("\n```")).toBe(true);
  });

  it("quotes the target path in mkdir/cd so paths with spaces survive", () => {
    const spaced = "/Users/me/My Beads/proj";
    const md = equivalentCliMarkdown(spaced, "embedded");
    expect(md).toContain(`mkdir -p "${spaced}"`);
    expect(md).toContain(`cd "${spaced}"`);
  });

  it("server mode uses `bd init --server` and verifies with dolt status + list", () => {
    const md = equivalentCliMarkdown(target, "server");
    expect(md).toContain("bd init --server --non-interactive");
    expect(md).toContain("bd dolt status");
    expect(md).toContain("bd list");
    // must NOT drop the --server flag
    expect(md).not.toMatch(/bd init --non-interactive/);
  });

  it("embedded mode uses plain `bd init` and verifies with list only", () => {
    const md = equivalentCliMarkdown(target, "embedded");
    expect(md).toContain("bd init --non-interactive");
    expect(md).not.toContain("--server");
    expect(md).not.toContain("bd dolt status");
    expect(md).toContain("bd list");
  });
});
