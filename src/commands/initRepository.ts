/**
 * `beads.initRepository` — create and initialize a new Beads board from the
 * extension, so users never have to drop to a terminal (epic vs-r6a1).
 *
 * Native QuickPick flow (the "quick path" of the Hybrid design): preflight bd →
 * name → mode → confirm → init → verify → activate. The Project Switcher's
 * empty-state CTA routes here too.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { BeadsProjectManager } from "../backend/BeadsProjectManager";
import { Logger } from "../utils/logger";
import { BEADS_INSTALL_DOCS_URL, BREW_INSTALL_COMMAND, detectBd } from "../backend/bdInstall";
import { InitMode, runBdInit, validateRepoName, verifyInit } from "../backend/repositoryInitializer";

/**
 * Verify the `bd` CLI is runnable; if not, surface `brew install beads`
 * guidance (with a copy action) and return false. Shared by the QuickPick
 * command and the wizard opener (vs-r6a1.1). Never throws.
 */
export async function ensureBdInstalled(bdPath: string): Promise<boolean> {
  const detection = await detectBd(bdPath);
  if (detection.installed) return true;
  const COPY = `Copy "${BREW_INSTALL_COMMAND}"`;
  const choice = await vscode.window.showErrorMessage(
    `Beads CLI not found (tried '${bdPath}'). Install it, then try again.`,
    COPY,
    "Learn More"
  );
  if (choice === COPY) {
    await vscode.env.clipboard.writeText(BREW_INSTALL_COMMAND);
    vscode.window.showInformationMessage(`Copied to clipboard: ${BREW_INSTALL_COMMAND}`);
  } else if (choice === "Learn More") {
    void vscode.env.openExternal(vscode.Uri.parse(BEADS_INSTALL_DOCS_URL));
  }
  return false;
}

/** Home-abbreviate an absolute path for compact display (e.g. ~/beads/foo). */
function toDisplayPath(absPath: string): string {
  const home = os.homedir();
  return absPath === home || absPath.startsWith(home + path.sep)
    ? `~${absPath.slice(home.length)}`
    : absPath;
}

export async function runInitRepositoryCommand(deps: {
  projectManager: BeadsProjectManager;
  log: Logger;
}): Promise<void> {
  const { projectManager } = deps;
  const log = deps.log.child("InitRepo");
  const bdPath = projectManager.getBdPath();

  // 1. Preflight: don't attempt init if bd isn't installed (vs-r6a1.1).
  if (!(await ensureBdInstalled(bdPath))) return;

  // 2. Name (validated live; also rejects an existing board at the target).
  const root = projectManager.getProjectsRoot();
  const name = await vscode.window.showInputBox({
    title: "Initialize Beads Board (1/2)",
    prompt: `New board will be created under ${toDisplayPath(root)}`,
    placeHolder: "my-project",
    ignoreFocusOut: true,
    validateInput: (value) => {
      const result = validateRepoName(value);
      if (!result.ok) return result.reason;
      const target = path.join(root, value.trim());
      if (fs.existsSync(path.join(target, ".beads"))) {
        return `A Beads board already exists at ${toDisplayPath(target)}.`;
      }
      return undefined;
    },
  });
  if (!name) return; // cancelled
  const boardName = name.trim();
  const target = path.join(root, boardName);

  // 3. Mode (server recommended — it's the extension-tested path).
  interface ModeItem extends vscode.QuickPickItem {
    mode: InitMode;
  }
  const modeItems: ModeItem[] = [
    {
      label: "$(server) Server",
      description: "Managed sql-server (recommended)",
      detail: "Runs a managed Dolt sql-server on an ephemeral port — the extension-tested layout.",
      mode: "server",
    },
    {
      label: "$(database) Embedded",
      description: "In-process Dolt",
      detail: "No external server or port. Lighter weight; opened via the CLI-safe path.",
      mode: "embedded",
    },
  ];
  const picked = await vscode.window.showQuickPick(modeItems, {
    title: "Initialize Beads Board (2/2)",
    placeHolder: "Choose a storage mode",
    ignoreFocusOut: true,
  });
  if (!picked) return;

  // 4. Confirm (modal — this writes to disk and may start a server).
  const CREATE = "Create Board";
  const confirm = await vscode.window.showInformationMessage(
    `Create a ${picked.mode} Beads board "${boardName}" at ${toDisplayPath(target)}?`,
    { modal: true },
    CREATE
  );
  if (confirm !== CREATE) return;

  // 5. Create → init → verify → activate, with progress.
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Initializing Beads board "${boardName}"`,
      cancellable: false,
    },
    async (progress) => {
      const onLog: (line: string) => void = (line) => log.info(line);
      try {
        log.info(`Initializing board "${boardName}" (${picked.mode}) at ${target}`);
        progress.report({ message: "Creating directory…" });
        await fs.promises.mkdir(target, { recursive: true });

        progress.report({ message: `Running bd init (${picked.mode})…` });
        const init = await runBdInit({ bdPath, cwd: target, mode: picked.mode, onLog });
        if (init.output) log.info(`bd init output:\n${init.output}`);
        if (!init.ok) {
          showFailure(deps.log, "bd init failed.", init.output);
          return;
        }

        progress.report({ message: "Verifying…" });
        const verify = await verifyInit({ bdPath, cwd: target, mode: picked.mode, onLog });
        if (!verify.ok) {
          showFailure(deps.log, "Board initialized but verification failed.", verify.details);
          return;
        }

        progress.report({ message: "Activating…" });
        const activated = await projectManager.discoverAndActivateProjectAt(target);
        if (!activated) {
          vscode.window.showWarningMessage(
            `Board created at ${toDisplayPath(target)}, but it couldn't be auto-activated. Pick it from the project switcher.`
          );
          return;
        }
        vscode.window.showInformationMessage(`Beads board "${boardName}" is ready.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showFailure(deps.log, "Failed to initialize Beads board.", message);
      }
    }
  );
}

/** Show an error with a "Show Output" action that reveals the Beads channel. */
function showFailure(log: Logger, summary: string, detail: string): void {
  log.error(`${summary} ${detail}`);
  const SHOW = "Show Output";
  void vscode.window.showErrorMessage(`${summary} See Output > Beads for details.`, SHOW).then((choice) => {
    if (choice === SHOW) log.show();
  });
}
