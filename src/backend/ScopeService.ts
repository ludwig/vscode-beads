import * as vscode from "vscode";
import type { Bead, FilterSnapshot } from "../shared/contract";
import { resolveScope, type Edge } from "./resolveScope";

/**
 * Host-side authority for the LIVE "parent scope" — the matching bead-id set of
 * the shared (panel) filter. Owns the shared {@link FilterSnapshot} and
 * recomputes the scope via the pure {@link resolveScope} whenever any input
 * changes (beads, favorites, mask, or the spec), firing a change event so every
 * webview can be updated live. This is what makes masking a favorite (or any
 * shared-filter edit) propagate to Kanban/Tree/Graph — panel-embedded AND
 * editor-tab — without depending on which view happens to be mounted.
 *
 * Inputs are injected as thin accessors so the service stays decoupled from the
 * project manager / favorites service (and the heavy logic is already covered by
 * resolveScope's unit tests). The vscode EventEmitter is the only host coupling,
 * mirroring FavoritesService.
 */
export interface ScopeDeps {
  getBeads: () => Bead[];
  getEdges: () => Edge[];
  getFavoriteIds: () => string[];
  getMaskedIds: () => string[];
}

const EMPTY_SPEC: FilterSnapshot = {
  columnFilters: [],
  globalFilter: "",
  activePreset: "custom",
  readyOnly: false,
  favoritesOnly: false,
};

export class ScopeService {
  private spec: FilterSnapshot = EMPTY_SPEC;
  private scope: string[] | null = null;
  private readonly _onDidChange = new vscode.EventEmitter<string[] | null>();

  /** Fires with the live parent scope (id set, or null = all) whenever it changes. */
  public readonly onDidChange = this._onDidChange.event;

  constructor(private readonly deps: ScopeDeps) {}

  /** The current parent scope (null = no active filter → all beads). */
  current(): string[] | null {
    return this.scope;
  }

  /** The current shared filter spec (host authority; e.g. for the dashboard star). */
  currentSpec(): FilterSnapshot {
    return this.spec;
  }

  /** Replace the shared filter spec (from the panel Issues view) and recompute. */
  setSharedFilter(spec: FilterSnapshot): void {
    this.spec = spec;
    this.recompute();
  }

  /** On project switch: reset to no filter, then recompute + fire. */
  setActiveProject(): void {
    this.spec = EMPTY_SPEC;
    this.recompute();
  }

  /** Re-resolve from current inputs and fire. Cheap + idempotent. */
  recompute(): void {
    this.scope = resolveScope({
      beads: this.deps.getBeads(),
      edges: this.deps.getEdges(),
      favoriteIds: this.deps.getFavoriteIds(),
      maskedIds: this.deps.getMaskedIds(),
      spec: this.spec,
    });
    this._onDidChange.fire(this.scope);
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
