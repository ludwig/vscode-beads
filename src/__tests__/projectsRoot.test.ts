// src/__tests__/projectsRoot.test.ts
// Covers resolveProjectsRoot: the pure resolution behind the beads.projectsRoot
// setting (vs-2re) — ~ / ${env:VAR} expansion + blank-falls-back-to-default.
import * as os from "os";
import * as path from "path";
import { resolveProjectsRoot, DEFAULT_PROJECTS_ROOT } from "../constants";

describe("resolveProjectsRoot", () => {
  it("falls back to the default when blank or undefined", () => {
    expect(resolveProjectsRoot(undefined)).toBe(DEFAULT_PROJECTS_ROOT);
    expect(resolveProjectsRoot("")).toBe(DEFAULT_PROJECTS_ROOT);
    expect(resolveProjectsRoot("   ")).toBe(DEFAULT_PROJECTS_ROOT);
  });

  it("expands a bare ~ to the home directory", () => {
    expect(resolveProjectsRoot("~")).toBe(os.homedir());
  });

  it("expands a leading ~/ to a home-relative path", () => {
    expect(resolveProjectsRoot("~/work/boards")).toBe(
      path.join(os.homedir(), "work/boards")
    );
  });

  it("passes through an absolute path unchanged", () => {
    expect(resolveProjectsRoot("/srv/beads")).toBe("/srv/beads");
  });

  it("expands ${env:VAR} placeholders", () => {
    process.env.BEADS_TEST_ROOT = "/tmp/from-env";
    try {
      expect(resolveProjectsRoot("${env:BEADS_TEST_ROOT}")).toBe("/tmp/from-env");
      expect(resolveProjectsRoot("${env:BEADS_TEST_ROOT}/sub")).toBe("/tmp/from-env/sub");
    } finally {
      delete process.env.BEADS_TEST_ROOT;
    }
  });

  it("trims surrounding whitespace before resolving", () => {
    expect(resolveProjectsRoot("  /srv/beads  ")).toBe("/srv/beads");
  });
});
