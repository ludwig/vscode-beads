/**
 * Shared extension identity constants.
 *
 * Centralizes the in-code identity strings so they live in one place rather
 * than scattered literals. Note these are independent of the marketplace
 * `publisher`/`name` in package.json (which form the install id): the config
 * namespace and command prefix are defined by `contributes.*` and stay `beads`
 * regardless of how the fork is branded.
 */

import * as os from "os";
import * as path from "path";
import { resolveEnvVariables } from "./utils/resolve-env-variables";

/** VS Code settings + command namespace (matches `contributes.configuration`). */
export const CONFIG_NAMESPACE = "beads";

/** The `beads.projectsRoot` setting key (declared in package.json). */
export const PROJECTS_ROOT_SETTING = "projectsRoot";

/** Prefix for `console.*` diagnostics emitted by the extension. */
export const LOG_PREFIX = "[beads]";

/**
 * Default root directory scanned for Beads projects: each immediate child
 * holding a `.beads/` directory is auto-discovered as a project. Used as the
 * fallback when `beads.projectsRoot` is unset (vs-2re).
 */
export const DEFAULT_PROJECTS_ROOT = path.join(os.homedir(), "beads");

/**
 * Resolve a configured `beads.projectsRoot` value to an absolute directory:
 * expands `${env:VAR}` placeholders and a leading `~`/`~/`, and falls back to
 * DEFAULT_PROJECTS_ROOT when blank. Pure + VS Code-free so it's unit-testable
 * (vs-2re).
 */
export function resolveProjectsRoot(configured: string | undefined): string {
  const expanded = resolveEnvVariables(configured ?? "").trim();
  if (!expanded) return DEFAULT_PROJECTS_ROOT;
  if (expanded === "~") return os.homedir();
  if (expanded.startsWith("~/") || expanded.startsWith("~\\")) {
    return path.join(os.homedir(), expanded.slice(2));
  }
  return expanded;
}
