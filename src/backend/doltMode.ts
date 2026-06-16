// src/backend/doltMode.ts
import * as fs from "fs";
import * as path from "path";

// DoltMode is defined in the shared contract (it travels on BeadsProject in the
// webview↔extension protocol); re-export it here so existing `./doltMode`
// importers keep working.
import type { DoltMode } from "../shared/contract";
export type { DoltMode };
export type BackendKind = "sql" | "cli";

/** Pluggable inputs so detection is unit-testable without fs or the CLI. */
export interface DoltModeProbe {
  /** Raw contents of .beads/metadata.json, or null if absent/unreadable. */
  readMetadata(): Promise<string | null>;
  /** Output of `bd dolt show`, used only as a fallback. */
  doltShow(): Promise<string>;
}

/**
 * Detect a repo's Dolt mode. Rule: only a confirmed "server" routes to the SQL
 * backend; everything else (including the undetermined default) is the
 * CLI-safe "embedded" path. This makes the safe path the default.
 */
export async function detectDoltMode(probe: DoltModeProbe): Promise<DoltMode> {
  const raw = await probe.readMetadata();
  if (raw) {
    try {
      const meta = JSON.parse(raw) as { dolt_mode?: unknown };
      if (meta.dolt_mode === "server") return "server";
      if (meta.dolt_mode === "embedded") return "embedded";
    } catch {
      // malformed metadata → fall through to the CLI probe
    }
  }

  try {
    const show = await probe.doltShow();
    if (/mode:\s*server/i.test(show) || /dolt server:\s*running/i.test(show)) {
      return "server";
    }
    if (/embedded/i.test(show)) return "embedded";
  } catch {
    // bd unavailable → safe default below
  }

  return "embedded";
}

/** SQL backend only for confirmed server mode; embedded uses the CLI backend. */
export function backendKindForMode(mode: DoltMode): BackendKind {
  return mode === "server" ? "sql" : "cli";
}

/** Build a filesystem/CLI-backed probe for a real project. */
export function createDoltModeProbe(params: {
  beadsDir: string;
  doltShow: () => Promise<string>;
}): DoltModeProbe {
  return {
    async readMetadata() {
      try {
        return await fs.promises.readFile(path.join(params.beadsDir, "metadata.json"), "utf8");
      } catch {
        return null;
      }
    },
    doltShow: params.doltShow,
  };
}
