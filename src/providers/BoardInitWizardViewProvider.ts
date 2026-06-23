/**
 * BoardInitWizardViewProvider — backs the polished "Initialize a Beads board"
 * editor-tab wizard (vs-r6a1.8). Same webview bundle + BaseViewProvider plumbing
 * as the other tabs; the React side renders a form (name / mode / location) and
 * a progress screen.
 *
 * On submit it drives the same backend the QuickPick flow uses
 * (runBdInit/verifyInit), posting `setInitProgress` per phase. On success it
 * discovers + activates the new board, shows a toast, and closes its own tab;
 * on failure it posts an `error` phase the form surfaces inline.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { BaseViewProvider } from "./BaseViewProvider";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { WebviewToExtensionMessage } from "../backend/types";
import { InitBoardMode } from "../shared/contract";
import { Logger } from "../utils/logger";
import { runBdInit, validateRepoName, verifyInit } from "../backend/repositoryInitializer";

export class BoardInitWizardViewProvider extends BaseViewProvider {
  protected readonly viewType = "beadsInitWizard";

  constructor(extensionUri: vscode.Uri, projectManager: BeadsProjectManager, logger: Logger) {
    super(extensionUri, projectManager, logger.child("InitWizard"));
  }

  protected async loadData(): Promise<void> {
    // Seed the form with the current projects root (the parent dir for the new
    // board); the React side composes <root>/<name> for the "Where" line.
    this.postMessage({ type: "setInitWizard", projectsRoot: this.projectManager.getProjectsRoot() });
  }

  protected async handleCustomMessage(message: WebviewToExtensionMessage): Promise<void> {
    if (message.type === "cancelInitBoard") {
      this._host?.close();
      return;
    }
    if (message.type === "submitInitBoard") {
      await this.runInit(message.name, message.mode);
    }
  }

  private async runInit(rawName: string, mode: InitBoardMode): Promise<void> {
    const log = this.log;
    const bdPath = this.projectManager.getBdPath();
    const root = this.projectManager.getProjectsRoot();
    const name = rawName.trim();

    const nameCheck = validateRepoName(name);
    if (!nameCheck.ok) {
      this.postProgress("error", nameCheck.reason ?? "Invalid name.");
      return;
    }
    const target = path.join(root, name);
    if (fs.existsSync(path.join(target, ".beads"))) {
      this.postProgress("error", `A Beads board already exists at ${target}.`);
      return;
    }

    try {
      this.postProgress("creating", "Creating directory…");
      await fs.promises.mkdir(target, { recursive: true });

      this.postProgress("initializing", `Running bd init (${mode})…`);
      const init = await runBdInit({ bdPath, cwd: target, mode });
      if (init.output) log.info(`bd init output:\n${init.output}`);
      if (!init.ok) {
        log.error(`bd init failed: ${init.output}`);
        this.postProgress("error", `bd init failed. ${firstLine(init.output)}`);
        return;
      }

      this.postProgress("verifying", "Verifying…");
      const verify = await verifyInit({ bdPath, cwd: target, mode });
      log.info(`Verification: ${verify.details}`);
      if (!verify.ok) {
        this.postProgress("error", `Initialized, but verification failed — ${verify.details}`);
        return;
      }

      this.postProgress("activating", "Activating…");
      const activated = await this.projectManager.discoverAndActivateProjectAt(target);

      // Success: announce, then dismiss the wizard tab.
      vscode.window.showInformationMessage(`Beads board "${name}" is ready.`);
      if (!activated) {
        vscode.window.showWarningMessage(
          `Board created at ${target}, but it couldn't be auto-activated. Pick it from the project switcher.`
        );
      }
      this._host?.close();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      log.error(`Init wizard failed: ${messageText}`);
      this.postProgress("error", messageText);
    }
  }

  private postProgress(phase: "creating" | "initializing" | "verifying" | "activating" | "error", message: string): void {
    this.postMessage({ type: "setInitProgress", phase, message });
  }
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "";
}
