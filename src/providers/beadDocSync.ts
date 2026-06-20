/**
 * Pure (vscode-free) decision logic behind auto-seeding the active bead into
 * Claude Code's context (vs-nr3d / epic vs-fkb).
 *
 * The north star: focusing a bead webview tab should make that bead's content
 * present in Claude Code's session — without a manual command. Claude seeds
 * `vscode.window.activeTextEditor`; a WebviewPanel is not a TextEditor, so when
 * a bead webview is focused we open the bead's virtual `bead:` document beside
 * it (keeping webview focus). VS Code then reports that doc as the active text
 * editor ("the one that changed input most recently" when no editor has focus),
 * so Claude seeds it.
 *
 * This module owns only the *decisions* — what to do on a view-state change and
 * on a panel disposal — so they're unit-testable without a vscode stub (cf.
 * beadMarkdown, pulseOnReveal). The BeadPanelManager performs the resulting
 * vscode side effects (open / close editor).
 */

/** What the manager should do to the seeded bead doc(s) in response to an event. */
export type BeadDocSyncAction =
  | { kind: "noop" }
  /** Open `beadId`'s virtual doc (beside, focus preserved). `closePrev` is a
   *  previously-seeded bead whose doc should be closed first to avoid orphans. */
  | { kind: "open"; beadId: string; closePrev: string | null }
  /** Close `beadId`'s virtual doc (its bead tab went away). */
  | { kind: "close"; beadId: string };

/** Mutable seed state: the bead whose virtual doc we last auto-opened. */
export interface BeadDocSyncState {
  activeBeadId: string | null;
}

/**
 * Decide what to do when a webview panel's view state changes.
 *
 * - Only react to a panel BECOMING active (ignore deactivation / mere
 *   visibility changes) — this is what avoids focus ping-pong: opening the doc
 *   beside with focus preserved keeps the webview active, so the follow-up
 *   view-state event dedups to noop instead of looping.
 * - `beadId === null` means a non-bead tab (Issues / Dashboard / Graph / …):
 *   leave any existing seed in place rather than clearing it, so glancing at the
 *   Issues list doesn't drop the bead you were just on.
 * - Dedup: re-focusing the already-seeded bead is a noop.
 * - Disabled (`enabled === false`): never open.
 */
export function decideOnViewState(
  state: BeadDocSyncState,
  event: { beadId: string | null; active: boolean; enabled: boolean }
): BeadDocSyncAction {
  if (!event.active) return { kind: "noop" };
  if (!event.enabled) return { kind: "noop" };
  if (event.beadId === null) return { kind: "noop" };
  if (event.beadId === state.activeBeadId) return { kind: "noop" };
  return { kind: "open", beadId: event.beadId, closePrev: state.activeBeadId };
}

/**
 * Decide what to do when a bead webview panel is disposed (its tab closed).
 * Close the bead's auto-opened doc only if it's the one we're currently
 * seeding — a stale entry for some other bead is left untouched.
 */
export function decideOnPanelDisposed(
  state: BeadDocSyncState,
  closedBeadId: string
): BeadDocSyncAction {
  if (state.activeBeadId === closedBeadId) {
    return { kind: "close", beadId: closedBeadId };
  }
  return { kind: "noop" };
}
