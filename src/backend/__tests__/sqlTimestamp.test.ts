import { normalizeSqlTimestamp } from "../sqlTimestamp";

describe("normalizeSqlTimestamp", () => {
  it("stamps a bare SQL datetime as explicit UTC", () => {
    expect(normalizeSqlTimestamp("2026-06-16 10:59:45")).toBe("2026-06-16T10:59:45Z");
  });

  it("preserves fractional seconds", () => {
    expect(normalizeSqlTimestamp("2026-06-16 10:59:45.123")).toBe("2026-06-16T10:59:45.123Z");
  });

  it("parses to the correct UTC instant (not shifted by local offset)", () => {
    const ms = new Date(normalizeSqlTimestamp("2026-06-16 10:59:45")).getTime();
    expect(ms).toBe(Date.UTC(2026, 5, 16, 10, 59, 45));
  });

  it("passes through values that already carry a Z designator", () => {
    expect(normalizeSqlTimestamp("2026-06-16T10:59:45Z")).toBe("2026-06-16T10:59:45Z");
  });

  it("passes through values that already carry a numeric offset", () => {
    expect(normalizeSqlTimestamp("2026-06-16T10:59:45+02:00")).toBe("2026-06-16T10:59:45+02:00");
    expect(normalizeSqlTimestamp("2026-06-16T10:59:45-0700")).toBe("2026-06-16T10:59:45-0700");
  });

  it("converts Date objects via toISOString", () => {
    const d = new Date(Date.UTC(2026, 5, 16, 10, 59, 45));
    expect(normalizeSqlTimestamp(d)).toBe("2026-06-16T10:59:45.000Z");
  });

  it("returns empty string for null/undefined/blank", () => {
    expect(normalizeSqlTimestamp(null)).toBe("");
    expect(normalizeSqlTimestamp(undefined)).toBe("");
    expect(normalizeSqlTimestamp("   ")).toBe("");
  });
});
