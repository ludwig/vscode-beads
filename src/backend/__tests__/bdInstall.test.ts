// src/backend/__tests__/bdInstall.test.ts
// Covers the version-string parsing used by the bd preflight (vs-r6a1.1).
// detectBd() itself spawns a process and is covered by runtime smoke.
import { parseBdVersion, BREW_INSTALL_COMMAND } from "../bdInstall";

describe("parseBdVersion", () => {
  it("extracts the x.y.z triple from bd version output", () => {
    expect(parseBdVersion("bd version 1.0.5 (9a1c88b63: 9a1c88b63aee)")).toBe("1.0.5");
    expect(parseBdVersion("v0.51.0")).toBe("0.51.0");
  });

  it("returns undefined when no version is present", () => {
    expect(parseBdVersion("command not found")).toBeUndefined();
    expect(parseBdVersion("")).toBeUndefined();
  });
});

describe("BREW_INSTALL_COMMAND", () => {
  it("is the Homebrew one-liner we recommend", () => {
    expect(BREW_INSTALL_COMMAND).toBe("brew install beads");
  });
});
