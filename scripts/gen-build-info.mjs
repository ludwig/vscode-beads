// Stamp build identity into dist/build-info.json at compile time.
//
// The installed .vsix is a frozen snapshot with no git access, so we capture
// the commit SHA + dirty state here (at build time, inside the repo) and the
// extension reads this file at activation to report exactly what's running.
// dist/ is gitignored, so regenerating every build creates no churn.

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Bytes of a built file, or 0 if it isn't there yet. */
function sizeOf(path) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function sh(command) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

const sha = sh("git rev-parse --short HEAD") || "unknown";
const dirty = sh("git status --porcelain") !== "";
const builtAt = new Date().toISOString();

const distDir = join(process.cwd(), "dist");
mkdirSync(distDir, { recursive: true });

// Our extension's actual on-disk footprint: the bundled extension + webview
// (the only sizeable artifacts). An attributable "this is Beads" figure, unlike
// the shared-host RSS. Computed here since dist/ exists right after esbuild.
const bundleBytes =
  sizeOf(join(distDir, "extension.js")) +
  sizeOf(join(distDir, "webview", "main.js")) +
  sizeOf(join(distDir, "webview", "main.css"));

writeFileSync(
  join(distDir, "build-info.json"),
  `${JSON.stringify({ sha, dirty, builtAt, bundleBytes }, null, 2)}\n`,
);

console.log(`build-info: ${sha}${dirty ? "-dirty" : ""} @ ${builtAt} · bundle ${Math.round(bundleBytes / 1024)}KB`);
