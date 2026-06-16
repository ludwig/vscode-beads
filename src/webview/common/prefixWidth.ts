/**
 * Project-prefix badge width
 *
 * Issue-prefix badges in the project switcher render `<prefix>-` (e.g. "vs-",
 * "foo-"). Left to size by content, each badge is as wide as its own text, so
 * the project-name column starts at a ragged x (vs-od3). To align the column we
 * size every badge to the widest prefix in the current set.
 *
 * Badges use a monospace font (`--vscode-editor-font-family`), so the shared
 * width is expressed in `ch` units: N `ch` is exactly N characters wide.
 */

/**
 * Computes the shared badge width, in `ch`, for a set of issue prefixes.
 *
 * Returns the character count of the widest rendered badge (`<prefix>-`,
 * including the trailing dash), or `null` when the set contains no prefix — in
 * which case no badge renders and no min-width should be applied.
 */
export function sharedPrefixWidthCh(prefixes: Iterable<string | null | undefined>): number | null {
  let max = 0;
  for (const prefix of prefixes) {
    if (!prefix) {
      continue;
    }
    // The badge renders `${prefix}-`, so the trailing dash adds one character.
    max = Math.max(max, prefix.length + 1);
  }
  return max > 0 ? max : null;
}
