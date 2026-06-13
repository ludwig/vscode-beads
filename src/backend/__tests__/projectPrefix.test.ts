// src/backend/__tests__/projectPrefix.test.ts
import { parseConfiguredPrefix } from "../projectPrefix";

describe("parseConfiguredPrefix", () => {
  it("returns undefined for null/empty contents", () => {
    expect(parseConfiguredPrefix(null)).toBeUndefined();
    expect(parseConfiguredPrefix("")).toBeUndefined();
  });

  it("ignores the commented-out default line", () => {
    expect(parseConfiguredPrefix('# issue-prefix: ""')).toBeUndefined();
    expect(parseConfiguredPrefix("  # issue-prefix: bd")).toBeUndefined();
  });

  it("reads a double-quoted prefix", () => {
    expect(parseConfiguredPrefix('issue-prefix: "bd"')).toBe("bd");
  });

  it("reads a single-quoted prefix", () => {
    expect(parseConfiguredPrefix("issue-prefix: 'vs'")).toBe("vs");
  });

  it("reads an unquoted prefix", () => {
    expect(parseConfiguredPrefix("issue-prefix: bd")).toBe("bd");
  });

  it("strips an inline comment on an unquoted value", () => {
    expect(parseConfiguredPrefix("issue-prefix: bd   # the prefix")).toBe("bd");
  });

  it("treats an explicit empty string as unset", () => {
    expect(parseConfiguredPrefix('issue-prefix: ""')).toBeUndefined();
  });

  it("finds the prefix among many lines", () => {
    const yaml = ["# Beads Configuration File", "", "json: false", 'issue-prefix: "bd"', "events-export: false"].join("\n");
    expect(parseConfiguredPrefix(yaml)).toBe("bd");
  });

  it("skips a commented line and uses the real one", () => {
    const yaml = ['# issue-prefix: ""', 'issue-prefix: "real"'].join("\n");
    expect(parseConfiguredPrefix(yaml)).toBe("real");
  });
});
