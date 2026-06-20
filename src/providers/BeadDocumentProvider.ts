import * as vscode from "vscode";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { Logger } from "../utils/logger";
import { beadDocPath, beadIdFromPath, renderBeadMarkdown } from "./beadMarkdown";

/**
 * Virtual read-only documents for beads, exposed on the `bead:` URI scheme
 * (spike vs-ab3 / epic vs-fkb).
 *
 * Rationale: a custom WebviewPanel tab is NOT a TextEditor, so when one is
 * focused `vscode.window.activeTextEditor` doesn't point at it and Claude
 * Code's IDE integration can't seed the rendered bead content. A virtual
 * TextDocument opened via `showTextDocument` DOES become the active editor, so
 * its text is eligible to be auto-seeded on focus — the closest match to the
 * north star "just like an open file".
 *
 * URI shape: `bead:/<bead-id>.md` (e.g. `bead:/vs-ab3.md`). The `.md` suffix
 * picks the Markdown language so the content renders/seeds as markdown; the id
 * is parsed back out of the path on each content request, so the document is
 * always re-fetched fresh from the active backend.
 */
export const BEAD_SCHEME = "bead";

export class BeadDocumentProvider implements vscode.TextDocumentContentProvider {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  public readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(
    private readonly projectManager: BeadsProjectManager,
    private readonly log: Logger
  ) {}

  /** Build the canonical virtual-document URI for a bead id. */
  static uriFor(beadId: string): vscode.Uri {
    return vscode.Uri.parse(`${BEAD_SCHEME}:${beadDocPath(beadId)}`);
  }

  /** Parse the bead id back out of a `bead:/<id>.md` URI. */
  static idFromUri(uri: vscode.Uri): string {
    return beadIdFromPath(uri.path);
  }

  /**
   * Signal that a bead's virtual document content may have changed so any open
   * editor re-requests it (e.g. after an edit elsewhere). Unused by the
   * standalone spike command but wired for later auto-refresh.
   */
  public refresh(beadId: string): void {
    this.onDidChangeEmitter.fire(BeadDocumentProvider.uriFor(beadId));
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const beadId = BeadDocumentProvider.idFromUri(uri);
    const backend = this.projectManager.getBackend();
    if (!backend) {
      return `# ${beadId}\n\n_No active Beads project._`;
    }
    try {
      const issue = await backend.show(beadId);
      if (!issue) {
        return `# ${beadId}\n\n_Bead not found._`;
      }
      return renderBeadMarkdown(issue);
    } catch (err) {
      this.log.error(`BeadDocumentProvider: failed to load ${beadId}: ${err instanceof Error ? err.message : String(err)}`);
      return `# ${beadId}\n\n_Failed to load bead._`;
    }
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}
