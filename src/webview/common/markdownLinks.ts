/**
 * Pure link-classification helpers for the Markdown component.
 *
 * Kept free of React and DOM APIs so the routing logic (external vs. workspace
 * file vs. unsafe) can be unit-tested under the node test environment.
 */

/** Schemes we are willing to hand to `vscode.env.openExternal`. */
const SAFE_EXTERNAL_SCHEMES = new Set(["http", "https", "mailto"]);

/** Matches a leading URI scheme, e.g. `https:`, `mailto:`, `javascript:`. */
const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;

export type LinkTarget =
  | { kind: "external"; url: string }
  | { kind: "file"; path: string; line?: number }
  | { kind: "unsafe" };

/**
 * Splits a workspace file href into its path and optional `#L<n>` line anchor.
 * e.g. `./src/config.ts#L42` -> `{ path: "./src/config.ts", line: 42 }`.
 */
export function parseFilePath(href: string): { path: string; line?: number } {
  const match = href.match(/^(.+?)(?:#L(\d+))?$/);
  if (!match) return { path: href };
  return { path: match[1], line: match[2] ? parseInt(match[2], 10) : undefined };
}

/**
 * Classify a markdown anchor's href into how the click should be handled:
 * - `external`: a safe http(s)/mailto URL → open in the system handler
 * - `file`: a relative/absolute workspace path → open in the editor
 * - `unsafe`: anything with a non-allowlisted scheme (javascript:, vscode:, …)
 *   or an empty/in-page anchor → ignore the click entirely
 */
export function classifyHref(rawHref: string | null | undefined): LinkTarget {
  const href = (rawHref ?? "").trim();
  // Empty or pure in-page anchors have no meaningful target in a webview.
  if (!href || href.startsWith("#")) return { kind: "unsafe" };

  const schemeMatch = href.match(SCHEME_RE);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    return SAFE_EXTERNAL_SCHEMES.has(scheme)
      ? { kind: "external", url: href }
      : { kind: "unsafe" };
  }

  // Protocol-relative URLs (`//host/...`) are network links, not files.
  if (href.startsWith("//")) return { kind: "unsafe" };

  const { path, line } = parseFilePath(href);
  return { kind: "file", path, line };
}
