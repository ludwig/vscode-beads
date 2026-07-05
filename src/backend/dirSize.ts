import * as fs from "fs";
import * as path from "path";

/** Recursively sum the byte sizes of every file under `dir` (0 on any error). */
export async function dirSizeBytes(dir: string): Promise<number> {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        total += await dirSizeBytes(full);
      } else if (entry.isFile()) {
        total += (await fs.promises.stat(full)).size;
      }
    } catch {
      // Skip entries that vanish or can't be stat'd mid-walk.
    }
  }
  return total;
}
