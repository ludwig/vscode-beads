import { normalizeStatus, normalizeBead, statusLabel } from "../types";
import {
  statusCategory,
  isClosedStatus,
  isBuiltInStatus,
  BUILTIN_STATUSES,
  BUILTIN_STATUS_CATEGORY,
} from "../../shared/contract";

describe("normalizeStatus", () => {
  it("maps all seven bd built-in statuses to themselves", () => {
    for (const s of BUILTIN_STATUSES) {
      expect(normalizeStatus(s)).toBe(s);
    }
  });

  it("normalizes spelling variants of the built-ins", () => {
    expect(normalizeStatus("in-progress")).toBe("in_progress");
    expect(normalizeStatus("active")).toBe("in_progress");
    expect(normalizeStatus("Open")).toBe("open");
    expect(normalizeStatus("done")).toBe("closed");
    expect(normalizeStatus("completed")).toBe("closed");
    expect(normalizeStatus("cancelled")).toBe("closed");
    expect(normalizeStatus("canceled")).toBe("closed");
  });

  // Regression for vs-dz9: a custom (user-defined) status must NEVER be nulled,
  // because a null status causes the bead to be silently dropped from the UI.
  it("passes custom statuses through as their normalized string (never null)", () => {
    expect(normalizeStatus("in_review")).toBe("in_review");
    expect(normalizeStatus("In-Review")).toBe("in_review");
    expect(normalizeStatus("waiting_on_design")).toBe("waiting_on_design");
  });

  it("returns null only when the status is missing/empty", () => {
    expect(normalizeStatus(undefined)).toBeNull();
    expect(normalizeStatus("")).toBeNull();
  });
});

describe("normalizeBead — vs-dz9 drop regression", () => {
  function raw(status: string) {
    return { id: "vs-1", title: "T", status, priority: 2 };
  }

  it.each(["deferred", "pinned", "hooked"])(
    "does not drop a bead with the built-in status %s",
    (status) => {
      const bead = normalizeBead(raw(status));
      expect(bead).not.toBeNull();
      expect(bead?.status).toBe(status);
    }
  );

  it("does not drop a bead with a custom status", () => {
    const bead = normalizeBead(raw("in_review"));
    expect(bead).not.toBeNull();
    expect(bead?.status).toBe("in_review");
  });

  it("drops a bead only when status is missing", () => {
    expect(normalizeBead({ id: "vs-1", title: "T" })).toBeNull();
  });
});

describe("statusCategory", () => {
  it("mirrors bd's BuiltInStatusCategory for every built-in", () => {
    expect(BUILTIN_STATUS_CATEGORY).toEqual({
      open: "active",
      in_progress: "wip",
      blocked: "wip",
      hooked: "wip",
      closed: "done",
      deferred: "frozen",
      pinned: "frozen",
    });
    for (const s of BUILTIN_STATUSES) {
      expect(statusCategory(s)).toBe(BUILTIN_STATUS_CATEGORY[s]);
    }
  });

  it("treats custom statuses as unspecified", () => {
    expect(statusCategory("in_review")).toBe("unspecified");
  });
});

describe("isClosedStatus", () => {
  it("is true only for the done category (closed)", () => {
    expect(isClosedStatus("closed")).toBe(true);
    expect(isClosedStatus("open")).toBe(false);
    expect(isClosedStatus("deferred")).toBe(false);
    expect(isClosedStatus("pinned")).toBe(false);
    expect(isClosedStatus("hooked")).toBe(false);
    expect(isClosedStatus("in_review")).toBe(false);
  });
});

describe("isBuiltInStatus / statusLabel", () => {
  it("recognizes the seven built-ins and rejects custom", () => {
    for (const s of BUILTIN_STATUSES) {
      expect(isBuiltInStatus(s)).toBe(true);
    }
    expect(isBuiltInStatus("in_review")).toBe(false);
  });

  it("humanizes custom statuses for display", () => {
    expect(statusLabel("deferred")).toBe("Deferred");
    expect(statusLabel("in_review")).toBe("In Review");
    expect(statusLabel("waiting-on-design")).toBe("Waiting On Design");
  });
});
