import { pulseOnReveal, RevealPulseTarget } from "../pulseOnReveal";

function makeTarget(visible: boolean): RevealPulseTarget & {
  pulseCalls: number;
  pulseWhenReadyCalls: number;
} {
  return {
    visible,
    pulseCalls: 0,
    pulseWhenReadyCalls: 0,
    pulse() {
      this.pulseCalls++;
    },
    pulseWhenReady() {
      this.pulseWhenReadyCalls++;
    },
  };
}

describe("pulseOnReveal (vs-1vxq)", () => {
  it("pulses immediately when the view is already visible", () => {
    const t = makeTarget(true);
    pulseOnReveal(t);
    expect(t.pulseCalls).toBe(1);
    expect(t.pulseWhenReadyCalls).toBe(0);
  });

  it("arms pulse-when-ready when the view is hidden/closed", () => {
    const t = makeTarget(false);
    pulseOnReveal(t);
    expect(t.pulseCalls).toBe(0);
    expect(t.pulseWhenReadyCalls).toBe(1);
  });

  it("never fires both paths for a single reveal", () => {
    for (const visible of [true, false]) {
      const t = makeTarget(visible);
      pulseOnReveal(t);
      expect(t.pulseCalls + t.pulseWhenReadyCalls).toBe(1);
    }
  });
});
