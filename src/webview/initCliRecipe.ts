/**
 * initCliRecipe — the raw `bd` CLI recipe equivalent to what the Initialize
 * Board wizard runs under the hood, per storage mode (vs-4sz5).
 *
 * Kept in lockstep with the backend (src/backend/repositoryInitializer.ts):
 * runBdInit uses `bd init --server --non-interactive` (server) /
 * `bd init --non-interactive` (embedded); verifyInit checks `bd dolt status`
 * (+ `bd list`) for server and `bd list` for embedded. This is
 * documentation/transparency only — it doesn't drive init behavior.
 */

import { InitBoardMode } from "./types";

/** A fenced markdown `bash` block reproducing the init for `target` in `mode`. */
export function equivalentCliMarkdown(target: string, mode: InitBoardMode): string {
  const q = `"${target}"`;
  const lines =
    mode === "server"
      ? [
          "# 1 · Create the board directory",
          `mkdir -p ${q}`,
          `cd ${q}`,
          "",
          "# 2 · Initialize a managed Dolt sql-server board",
          "bd init --server --non-interactive",
          "",
          "# 3 · Verify (server is up, board is empty)",
          "bd dolt status",
          "bd list",
        ]
      : [
          "# 1 · Create the board directory",
          `mkdir -p ${q}`,
          `cd ${q}`,
          "",
          "# 2 · Initialize an in-process (embedded) Dolt board",
          "bd init --non-interactive",
          "",
          "# 3 · Verify (board is empty)",
          "bd list",
        ];
  return ["```bash", ...lines, "```"].join("\n");
}
