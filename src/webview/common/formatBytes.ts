/**
 * Human-readable byte sizes (B / KB / MB / GB). Shared by the Active Project
 * info rows and the Repository Details metric cards (vs-emyj). Handles small
 * sizes (a fresh .beads dir is well under a megabyte) where a MB-only formatter
 * would round to a misleading "0 MB".
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
