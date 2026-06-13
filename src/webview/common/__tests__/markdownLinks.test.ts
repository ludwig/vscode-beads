import { classifyHref, parseFilePath } from "../markdownLinks";

describe("classifyHref", () => {
  it("treats http(s) URLs as safe external links", () => {
    expect(classifyHref("https://example.com/x")).toEqual({
      kind: "external",
      url: "https://example.com/x",
    });
    expect(classifyHref("http://example.com")).toEqual({
      kind: "external",
      url: "http://example.com",
    });
  });

  it("treats mailto as a safe external link", () => {
    expect(classifyHref("mailto:luis@bumo.com")).toEqual({
      kind: "external",
      url: "mailto:luis@bumo.com",
    });
  });

  it("rejects dangerous/unknown schemes as unsafe", () => {
    expect(classifyHref("javascript:alert(1)")).toEqual({ kind: "unsafe" });
    expect(classifyHref("vscode://settings")).toEqual({ kind: "unsafe" });
    expect(classifyHref("file:///etc/passwd")).toEqual({ kind: "unsafe" });
    expect(classifyHref("data:text/html,<script>")).toEqual({ kind: "unsafe" });
  });

  it("ignores empty and in-page anchors", () => {
    expect(classifyHref("")).toEqual({ kind: "unsafe" });
    expect(classifyHref(null)).toEqual({ kind: "unsafe" });
    expect(classifyHref("#section")).toEqual({ kind: "unsafe" });
  });

  it("ignores protocol-relative network links", () => {
    expect(classifyHref("//evil.com")).toEqual({ kind: "unsafe" });
  });

  it("treats relative and absolute paths as workspace files", () => {
    expect(classifyHref("./src/config.ts")).toEqual({
      kind: "file",
      path: "./src/config.ts",
      line: undefined,
    });
    expect(classifyHref("/abs/path.md")).toEqual({
      kind: "file",
      path: "/abs/path.md",
      line: undefined,
    });
  });

  it("extracts a #L<n> line anchor from file links", () => {
    expect(classifyHref("./src/config.ts#L42")).toEqual({
      kind: "file",
      path: "./src/config.ts",
      line: 42,
    });
  });

  it("trims surrounding whitespace before classifying", () => {
    expect(classifyHref("  https://example.com  ")).toEqual({
      kind: "external",
      url: "https://example.com",
    });
  });
});

describe("parseFilePath", () => {
  it("returns the bare path when there is no line anchor", () => {
    expect(parseFilePath("docs/readme.md")).toEqual({ path: "docs/readme.md", line: undefined });
  });

  it("parses a trailing #L<n> anchor", () => {
    expect(parseFilePath("a/b.ts#L7")).toEqual({ path: "a/b.ts", line: 7 });
  });
});
