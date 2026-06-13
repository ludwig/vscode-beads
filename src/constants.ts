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

/** VS Code settings + command namespace (matches `contributes.configuration`). */
export const CONFIG_NAMESPACE = "beads";

/** Prefix for `console.*` diagnostics emitted by the extension. */
export const LOG_PREFIX = "[beads]";

/**
 * Default root directory scanned for Beads projects: each immediate child
 * holding a `.beads/` directory is auto-discovered as a project. Hardcoded for
 * now; vs-2re will expose this as a `beads.projectsRoot` setting.
 */
export const DEFAULT_PROJECTS_ROOT = path.join(os.homedir(), "beads");
