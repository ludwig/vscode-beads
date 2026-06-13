// src/backend/projectPrefix.ts
//
// Parsing the explicitly-configured issue prefix out of a project's
// `.beads/config.yaml`. Kept as a pure function (no fs/CLI) so it is trivially
// unit-testable, mirroring the doltMode.ts probe pattern.
//
// Why config-only: `bd` auto-detects the prefix from the directory name when
// `issue-prefix` is unset, so the ONLY way a project's prefix differs from its
// folder name is an explicit override here. Reading the file (no `bd` spawn)
// is enough to know when a prefix badge is worth showing, and avoids paying the
// cold-spawn cost during discovery.

/**
 * Extract the explicit `issue-prefix` value from `.beads/config.yaml` contents.
 * Returns undefined when unset, commented out, empty, or the file is absent.
 */
export function parseConfiguredPrefix(configContents: string | null): string | undefined {
  if (!configContents) return undefined;

  for (const rawLine of configContents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = /^issue-prefix:\s*(.+)$/.exec(line);
    if (!match) continue;

    let value = match[1].trim();
    const quoted = /^(["'])(.*?)\1/.exec(value);
    if (quoted) {
      value = quoted[2];
    } else {
      // strip a trailing inline comment on unquoted values
      value = value.split("#")[0].trim();
    }

    value = value.trim();
    return value.length > 0 ? value : undefined;
  }

  return undefined;
}
