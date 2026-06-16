import { NavigationHistory } from "../NavigationHistory";

describe("NavigationHistory", () => {
  it("starts empty", () => {
    const h = new NavigationHistory();
    expect(h.current()).toBeNull();
    expect(h.canBack()).toBe(false);
    expect(h.canForward()).toBe(false);
  });

  it("records visits and tracks the current entry", () => {
    const h = new NavigationHistory();
    h.record("a");
    h.record("b");
    h.record("c");
    expect(h.current()).toBe("c");
    expect(h.canBack()).toBe(true);
    expect(h.canForward()).toBe(false);
  });

  it("walks back and forward along the trail", () => {
    const h = new NavigationHistory();
    ["a", "b", "c"].forEach((id) => h.record(id));
    expect(h.back()).toBe("b");
    expect(h.back()).toBe("a");
    expect(h.canBack()).toBe(false);
    expect(h.back()).toBeNull();
    expect(h.forward()).toBe("b");
    expect(h.forward()).toBe("c");
    expect(h.canForward()).toBe(false);
    expect(h.forward()).toBeNull();
  });

  it("ignores re-recording the current entry (no dup step)", () => {
    const h = new NavigationHistory();
    h.record("a");
    h.record("a");
    expect(h.canBack()).toBe(false);
    expect(h.current()).toBe("a");
  });

  it("truncates the forward branch on a new navigation", () => {
    const h = new NavigationHistory();
    ["a", "b", "c"].forEach((id) => h.record(id));
    h.back(); // at b
    h.record("d"); // new branch from b
    expect(h.current()).toBe("d");
    expect(h.canForward()).toBe(false);
    expect(h.back()).toBe("b");
    expect(h.back()).toBe("a");
  });

  it("allows revisiting an earlier bead as a fresh step", () => {
    const h = new NavigationHistory();
    h.record("a");
    h.record("b");
    h.record("a"); // navigating back to 'a' by link is a new step, not a no-op
    expect(h.current()).toBe("a");
    expect(h.back()).toBe("b");
    expect(h.back()).toBe("a");
  });

  it("resets to empty", () => {
    const h = new NavigationHistory();
    ["a", "b"].forEach((id) => h.record(id));
    h.reset();
    expect(h.current()).toBeNull();
    expect(h.canBack()).toBe(false);
    expect(h.canForward()).toBe(false);
  });
});
