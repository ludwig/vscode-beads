/**
 * Regression coverage for the filter-bar preset-label derivation
 * (`matchStatusPreset`). The dropdown label must be derived PURELY from the
 * status column — never a stored `activePreset` string — so a follower tab that
 * inherits a foreign/stale preset id (e.g. the "custom" sentinel from an empty
 * shared spec) never gets stuck on "Custom" when nothing narrows the status.
 */

import { matchStatusPreset } from "../filterPresets";
import { NOT_CLOSED } from "../../backend/filterPredicates";
import type { BeadStatus } from "../../shared/contract";

describe("matchStatusPreset", () => {
  it("empty status ⇒ the 'All' preset (never Custom)", () => {
    expect(matchStatusPreset([])?.id).toBe("all");
    expect(matchStatusPreset([])?.label).toBe("All");
  });

  it("the ¬closed sentinel ⇒ the 'Not Closed' preset", () => {
    expect(matchStatusPreset([NOT_CLOSED as BeadStatus])?.id).toBe("not-closed");
  });

  it("an exact multi-status set ⇒ that preset, order-independent", () => {
    expect(matchStatusPreset(["in_progress", "blocked"] as BeadStatus[])?.id).toBe("active");
    expect(matchStatusPreset(["blocked", "in_progress"] as BeadStatus[])?.id).toBe("active");
  });

  it("single concrete statuses ⇒ their presets", () => {
    expect(matchStatusPreset(["blocked"] as BeadStatus[])?.id).toBe("blocked");
    expect(matchStatusPreset(["closed"] as BeadStatus[])?.id).toBe("closed");
  });

  it("an unmatched status set ⇒ undefined (renders as 'Custom')", () => {
    expect(matchStatusPreset(["open"] as BeadStatus[])).toBeUndefined();
    // A superset of a preset is still custom — must be an EXACT set match.
    expect(matchStatusPreset(["in_progress", "blocked", "open"] as BeadStatus[])).toBeUndefined();
  });
});
