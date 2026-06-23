/**
 * Beads CLI installation preflight (vs-r6a1.1).
 *
 * A tiny, VS Code-free probe used before any init flow: is the `bd` binary
 * resolvable/runnable? If not, the caller surfaces `brew install beads`
 * guidance rather than attempting an init that can only fail.
 *
 * Kept separate from BeadsCommandRunner (which assumes an already-initialized
 * project) so the init command can check availability without constructing a
 * backend.
 */

import { execFile } from "child_process";
import * as util from "util";

const execFileAsync = util.promisify(execFile);
const VERSION_PROBE_TIMEOUT_MS = 10000;

/** The Homebrew one-liner we recommend when `bd` is missing. */
export const BREW_INSTALL_COMMAND = "brew install beads";

/** Where "Learn More" points for installation help. */
export const BEADS_INSTALL_DOCS_URL = "https://github.com/steveyegge/beads#installation";

export interface BdDetection {
  /** True when `bd version` (or `--version`) ran and looked like beads. */
  installed: boolean;
  /** Parsed semantic version (e.g. "1.0.5"), if one was found. */
  version?: string;
}

/** Extract the first `x.y.z` triple from version output. Exported for tests. */
export function parseBdVersion(text: string): string | undefined {
  const match = text.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : undefined;
}

/**
 * Probe whether the `bd` CLI at `bdPath` is runnable. Tries `version` then
 * `--version`; either succeeding means installed. Never throws.
 */
export async function detectBd(bdPath: string): Promise<BdDetection> {
  for (const args of [["version"], ["--version"]]) {
    try {
      const { stdout, stderr } = await execFileAsync(bdPath, args, {
        timeout: VERSION_PROBE_TIMEOUT_MS,
      });
      return { installed: true, version: parseBdVersion(`${stdout}\n${stderr}`) };
    } catch {
      continue;
    }
  }
  return { installed: false };
}
