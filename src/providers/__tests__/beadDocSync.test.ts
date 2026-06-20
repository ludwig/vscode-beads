import {
  decideOnViewState,
  decideOnPanelDisposed,
  BeadDocSyncState,
} from "../beadDocSync";

describe("decideOnViewState", () => {
  const fresh = (activeBeadId: string | null = null): BeadDocSyncState => ({ activeBeadId });

  it("opens the bead doc when a bead panel becomes active", () => {
    expect(
      decideOnViewState(fresh(), { beadId: "vs-1", active: true, enabled: true })
    ).toEqual({ kind: "open", beadId: "vs-1", closePrev: null });
  });

  it("closes the previously-seeded doc when switching beads", () => {
    expect(
      decideOnViewState(fresh("vs-1"), { beadId: "vs-2", active: true, enabled: true })
    ).toEqual({ kind: "open", beadId: "vs-2", closePrev: "vs-1" });
  });

  it("dedups: re-focusing the already-seeded bead is a noop (no thrash)", () => {
    expect(
      decideOnViewState(fresh("vs-1"), { beadId: "vs-1", active: true, enabled: true })
    ).toEqual({ kind: "noop" });
  });

  it("ignores deactivation (only reacts to becoming active)", () => {
    expect(
      decideOnViewState(fresh("vs-1"), { beadId: "vs-2", active: false, enabled: true })
    ).toEqual({ kind: "noop" });
  });

  it("leaves the seed in place for a non-bead tab (Issues/Dashboard/…)", () => {
    expect(
      decideOnViewState(fresh("vs-1"), { beadId: null, active: true, enabled: true })
    ).toEqual({ kind: "noop" });
  });

  it("does nothing when auto-seed is disabled", () => {
    expect(
      decideOnViewState(fresh(), { beadId: "vs-1", active: true, enabled: false })
    ).toEqual({ kind: "noop" });
  });
});

describe("decideOnPanelDisposed", () => {
  it("closes the doc when the seeded bead's panel is disposed", () => {
    expect(decideOnPanelDisposed({ activeBeadId: "vs-1" }, "vs-1")).toEqual({
      kind: "close",
      beadId: "vs-1",
    });
  });

  it("leaves things alone when a different bead's panel is disposed", () => {
    expect(decideOnPanelDisposed({ activeBeadId: "vs-1" }, "vs-2")).toEqual({
      kind: "noop",
    });
  });

  it("is a noop when nothing is seeded", () => {
    expect(decideOnPanelDisposed({ activeBeadId: null }, "vs-1")).toEqual({
      kind: "noop",
    });
  });
});
