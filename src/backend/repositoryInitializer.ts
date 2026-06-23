/**
 * Beads repository initialization (vs-r6a1.2 / vs-r6a1.3).
 *
 * Pure helpers (name validation + verification-output parsing) live here
 * alongside the impure orchestration (mkdir + `bd init` + verify) so the
 * parsing logic is unit-testable without a `bd` binary. The init command
 * (src/commands/initRepository.ts) drives the VS Code UI around these.
 *
 * Recipe (server mode), confirmed against bd 1.0.5:
 *   bd init --server --non-interactive
 *     → managed sql-server on an ephemeral port, data in .beads/dolt/,
 *       metadata.json dolt_mode=server (the extension-compatible layout).
 *   Verify: `bd dolt status` shows "running" + a Port line; metadata.json has
 *           dolt_mode=server; `bd list` returns "No issues found."
 */

import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as util from "util";

const execFileAsync = util.promisify(execFile);

// `bd init --server` starts a managed Dolt sql-server (and can install agent
// templates + make a git commit), so give it generous headroom.
const INIT_TIMEOUT_MS = 120000;
const VERIFY_TIMEOUT_MS = 30000;

export type InitMode = "server" | "embedded";

export interface NameValidation {
  ok: boolean;
  /** Human-readable reason when `ok` is false (suitable for an InputBox). */
  reason?: string;
}

/**
 * A board name becomes both the directory under the projects root and the
 * derived issue prefix, so it must be a single clean path segment: a leading
 * letter followed by letters, digits, hyphens, or underscores.
 */
export function validateRepoName(name: string): NameValidation {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: "Name cannot be empty." };
  if (/[\\/]/.test(trimmed)) return { ok: false, reason: "Name cannot contain slashes." };
  if (trimmed === "." || trimmed === "..") return { ok: false, reason: "Name cannot be '.' or '..'." };
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(trimmed)) {
    return {
      ok: false,
      reason: "Start with a letter, then use letters, digits, hyphens, or underscores.",
    };
  }
  return { ok: true };
}

/** True when `bd dolt status` reports a running server with a bound port. */
export function doltStatusIsRunning(text: string): boolean {
  return /Dolt server:\s*running/i.test(text) && /Port:\s*\d+/i.test(text);
}

/** True when .beads/metadata.json declares the extension-compatible server mode. */
export function metadataModeIsServer(metadataJson: string): boolean {
  try {
    const parsed = JSON.parse(metadataJson) as { dolt_mode?: string };
    return parsed.dolt_mode === "server";
  } catch {
    return false;
  }
}

/**
 * True when `bd list` output looks like a healthy, freshly-initialized board.
 * A new board reports "No issues found."; we only treat obvious error/uninit
 * text as unhealthy so a board that somehow already has issues still passes.
 */
export function listIsHealthy(text: string): boolean {
  if (/No issues found/i.test(text)) return true;
  return !/(^|\s)(error|failed)\b|not initialized/i.test(text);
}

export interface InitResult {
  ok: boolean;
  /** Combined stdout/stderr, for the output channel / failure surfacing. */
  output: string;
}

/**
 * Optional logging sink. A plain callback (not a Logger) so this module stays
 * VS Code-free and unit-testable; callers pass `(line) => log.info(line)` to
 * surface the bd commands + results in the Beads output channel (vs-r6a1.11).
 */
export type LogLine = (line: string) => void;

/** Run `bd init [--server] --non-interactive` with cwd = the new board dir. */
export async function runBdInit(opts: {
  bdPath: string;
  cwd: string;
  mode: InitMode;
  onLog?: LogLine;
}): Promise<InitResult> {
  const args = opts.mode === "server"
    ? ["init", "--server", "--non-interactive"]
    : ["init", "--non-interactive"];
  opts.onLog?.(`Running: ${opts.bdPath} ${args.join(" ")} (cwd=${opts.cwd})`);
  try {
    const { stdout, stderr } = await execFileAsync(opts.bdPath, args, {
      cwd: opts.cwd,
      timeout: INIT_TIMEOUT_MS,
      env: process.env,
    });
    opts.onLog?.(`bd init succeeded (${opts.mode} mode)`);
    return { ok: true, output: `${stdout}\n${stderr}`.trim() };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string };
    const output = (err.stderr || err.stdout || err.message || "").trim();
    opts.onLog?.(`bd init failed: ${output}`);
    return { ok: false, output };
  }
}

export interface VerifyResult {
  ok: boolean;
  checks: {
    /** Server running + port bound. null in embedded mode (not applicable). */
    doltStatus: boolean | null;
    /** metadata.json dolt_mode === "server". */
    metadataServerMode: boolean;
    /** `bd list` returned a healthy listing. */
    list: boolean;
  };
  /** Human-readable summary for failure messages / logs. */
  details: string;
}

/**
 * Verify a freshly-initialized board. In server mode all three signals from
 * the recipe must hold; in embedded mode there is no managed server/port, so a
 * healthy `bd list` is the bar.
 */
export async function verifyInit(opts: {
  bdPath: string;
  cwd: string;
  mode: InitMode;
  onLog?: LogLine;
}): Promise<VerifyResult> {
  let metadataServerMode = false;
  try {
    const metaPath = path.join(opts.cwd, ".beads", "metadata.json");
    metadataServerMode = metadataModeIsServer(await fs.promises.readFile(metaPath, "utf8"));
  } catch {
    metadataServerMode = false;
  }

  let doltStatus: boolean | null = null;
  if (opts.mode === "server") {
    try {
      opts.onLog?.(`Running: ${opts.bdPath} dolt status (cwd=${opts.cwd})`);
      const { stdout, stderr } = await execFileAsync(opts.bdPath, ["dolt", "status"], {
        cwd: opts.cwd,
        timeout: VERIFY_TIMEOUT_MS,
      });
      doltStatus = doltStatusIsRunning(`${stdout}\n${stderr}`);
    } catch {
      doltStatus = false;
    }
  }

  let list = false;
  try {
    opts.onLog?.(`Running: ${opts.bdPath} list (cwd=${opts.cwd})`);
    const { stdout, stderr } = await execFileAsync(opts.bdPath, ["list"], {
      cwd: opts.cwd,
      timeout: VERIFY_TIMEOUT_MS,
    });
    list = listIsHealthy(`${stdout}\n${stderr}`);
  } catch {
    list = false;
  }

  const ok = opts.mode === "server"
    ? doltStatus === true && metadataServerMode && list
    : list;

  const details = opts.mode === "server"
    ? `dolt server running: ${doltStatus} · metadata dolt_mode=server: ${metadataServerMode} · bd list healthy: ${list}`
    : `bd list healthy: ${list}`;

  opts.onLog?.(`Verify (${opts.mode}): ${details} → ${ok ? "OK" : "FAILED"}`);
  return { ok, checks: { doltStatus, metadataServerMode, list }, details };
}
