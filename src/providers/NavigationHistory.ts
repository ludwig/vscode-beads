/**
 * Browser-style navigation history for the Details view (vs-xzq).
 *
 * Records the beads the user visits as they click through dependencies/links,
 * with a cursor that Back/Forward move along. A *new* navigation truncates any
 * forward branch (exactly like a web browser). Pure and DOM-free so it can be
 * unit-tested; the command layer drives the actual view + Active Bead updates.
 */
export class NavigationHistory {
  private entries: string[] = [];
  private cursor = -1;

  /**
   * Record a user navigation to `id`. No-op if it's already the current entry
   * (re-selecting the shown bead shouldn't add a history step). Otherwise it
   * drops any forward branch and appends `id` as the new current entry.
   */
  record(id: string): void {
    if (this.current() === id) return;
    this.entries = this.entries.slice(0, this.cursor + 1);
    this.entries.push(id);
    this.cursor = this.entries.length - 1;
  }

  /** Move the cursor back one step and return that bead id, or null at the start. */
  back(): string | null {
    if (!this.canBack()) return null;
    this.cursor -= 1;
    return this.entries[this.cursor];
  }

  /** Move the cursor forward one step and return that bead id, or null at the end. */
  forward(): string | null {
    if (!this.canForward()) return null;
    this.cursor += 1;
    return this.entries[this.cursor];
  }

  canBack(): boolean {
    return this.cursor > 0;
  }

  canForward(): boolean {
    return this.cursor >= 0 && this.cursor < this.entries.length - 1;
  }

  /** The bead id at the cursor, or null when the history is empty. */
  current(): string | null {
    return this.cursor >= 0 ? this.entries[this.cursor] : null;
  }

  /** Clear all history (e.g. on project switch or cleared selection). */
  reset(): void {
    this.entries = [];
    this.cursor = -1;
  }
}
