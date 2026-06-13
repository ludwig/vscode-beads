// Stamp build identity into dist/build-info.json at compile time.
//
// The installed .vsix is a frozen snapshot with no git access, so we capture
// the commit SHA + dirty state here (at build time, inside the repo) and the
// extension reads this file at activation to report exactly what's running.
// dist/ is gitignored, so regenerating every build creates no churn.

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
writeFileSync(join(distDir, "build-info.json"), `${JSON.stringify({ sha, dirty, builtAt }, null, 2)}\n`);

console.log(`build-info: ${sha}${dirty ? "-dirty" : ""} @ ${builtAt}`);
