// Shared build/version identity, populated once at activation and read by the
// view providers so the Dashboard can report exactly what's running. The SHA
// comes from dist/build-info.json (stamped at compile time by
// scripts/gen-build-info.mjs); the version comes from package.json at runtime.

export interface AppInfo {
  /** Extension version from package.json (e.g. "0.14.0"). */
  version: string;
  /** Short git SHA at build time, or "unknown". */
  sha: string;
  /** True when built with uncommitted changes. */
  dirty: boolean;
  /** ISO build timestamp, or null when unknown. */
  builtAt: string | null;
  /** On-disk size of the built extension + webview bundle, in bytes (0 if unknown). */
  bundleBytes: number;
}

let current: AppInfo = { version: "unknown", sha: "unknown", dirty: false, builtAt: null, bundleBytes: 0 };

export function setAppInfo(info: AppInfo): void {
  current = info;
}

export function getAppInfo(): AppInfo {
  return current;
}
