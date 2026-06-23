/**
 * BoardInitWizard — the polished editor-tab UI for creating a Beads board
 * (vs-r6a1.8). Renders a form (name → derived prefix → location → storage mode)
 * and, once a create is submitted, a progress/verify screen. The heavy lifting
 * (mkdir / bd init / verify / activate) runs in the extension
 * (BoardInitWizardViewProvider); this component only collects input and
 * reflects the phases it posts back.
 */

import React, { useState } from "react";
import { AlertCircle, Database, FolderGit2, Loader, Server } from "lucide-react";
import { InitBoardMode, InitWizardPhase } from "../types";

interface BoardInitWizardProps {
  projectsRoot: string;
  phase: InitWizardPhase;
  message?: string;
  onSubmit: (name: string, mode: InitBoardMode) => void;
  onCancel: () => void;
  onChangeRoot: () => void;
}

/**
 * Mirror of the backend's validateRepoName (repositoryInitializer.ts) for
 * instant feedback. The extension re-validates authoritatively on submit, so
 * this only needs to be good enough to guide the user.
 */
function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null; // empty isn't an "error" — just keeps submit disabled
  if (/[\\/]/.test(trimmed)) return "Name cannot contain slashes.";
  if (trimmed === "." || trimmed === "..") return "Name cannot be '.' or '..'.";
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(trimmed)) {
    return "Start with a letter, then letters, digits, hyphens, or underscores.";
  }
  return null;
}

const PHASE_LABEL: Record<Exclude<InitWizardPhase, "form" | "error">, string> = {
  creating: "Creating directory…",
  initializing: "Running bd init…",
  verifying: "Verifying…",
  activating: "Activating…",
};

function joinPath(root: string, name: string): string {
  if (!root) return name;
  const sep = root.includes("\\") ? "\\" : "/";
  return `${root.replace(/[/\\]+$/, "")}${sep}${name}`;
}

export function BoardInitWizard({
  projectsRoot,
  phase,
  message,
  onSubmit,
  onCancel,
  onChangeRoot,
}: BoardInitWizardProps): React.ReactElement {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<InitBoardMode>("server");

  const trimmed = name.trim();
  const nameError = validateName(name);
  const canSubmit = trimmed.length > 0 && !nameError;
  const busy = phase !== "form" && phase !== "error";
  const target = joinPath(projectsRoot, trimmed || "<name>");

  const submit = () => {
    if (canSubmit && !busy) onSubmit(trimmed, mode);
  };

  return (
    <div className="init-wizard">
      <header className="init-wizard-header">
        <span className="init-wizard-mark" aria-hidden="true">
          <FolderGit2 size={18} strokeWidth={2} />
        </span>
        <div>
          <h2 className="init-wizard-title">Initialize a Beads board</h2>
          <p className="init-wizard-subtitle">
            Creates a new board directory and runs <code>bd init</code> for you.
          </p>
        </div>
      </header>

      {busy ? (
        <div className="init-wizard-progress">
          <Loader size={20} className="init-wizard-spinner" />
          <div className="init-wizard-progress-text">
            <span className="init-wizard-progress-label">
              {PHASE_LABEL[phase as Exclude<InitWizardPhase, "form" | "error">]}
            </span>
            {message && <span className="init-wizard-progress-detail">{message}</span>}
          </div>
        </div>
      ) : (
        <div className="init-wizard-body">
          {phase === "error" && message && (
            <div className="init-wizard-error" role="alert">
              <AlertCircle size={15} strokeWidth={2} />
              <span>{message}</span>
            </div>
          )}

          <div className="init-wizard-field">
            <label className="init-wizard-label" htmlFor="iw-name">
              Board name
            </label>
            <input
              id="iw-name"
              className="create-input"
              value={name}
              autoFocus
              spellCheck={false}
              placeholder="my-project"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
            {nameError ? (
              <span className="init-wizard-hint init-wizard-hint-error">{nameError}</span>
            ) : (
              <span className="init-wizard-hint">
                Issue prefix:{" "}
                <code>{trimmed ? `${trimmed}-` : "—"}</code>
                {trimmed && <span className="init-wizard-hint-muted"> (e.g. {trimmed}-a3f2)</span>}
              </span>
            )}
          </div>

          <div className="init-wizard-field">
            <span className="init-wizard-label">Where</span>
            <div className="init-wizard-where">
              <code className="init-wizard-path" title={target}>
                {target}
              </code>
              <button type="button" className="init-wizard-link" onClick={onChangeRoot}>
                Change root…
              </button>
            </div>
          </div>

          <div className="init-wizard-field">
            <span className="init-wizard-label">Storage mode</span>
            <div className="init-wizard-modes">
              <button
                type="button"
                className={`init-wizard-mode ${mode === "server" ? "is-selected" : ""}`}
                onClick={() => setMode("server")}
                aria-pressed={mode === "server"}
              >
                <Server size={15} strokeWidth={2} />
                <span className="init-wizard-mode-text">
                  <span className="init-wizard-mode-name">Server</span>
                  <span className="init-wizard-mode-desc">Managed sql-server — recommended</span>
                </span>
              </button>
              <button
                type="button"
                className={`init-wizard-mode ${mode === "embedded" ? "is-selected" : ""}`}
                onClick={() => setMode("embedded")}
                aria-pressed={mode === "embedded"}
              >
                <Database size={15} strokeWidth={2} />
                <span className="init-wizard-mode-text">
                  <span className="init-wizard-mode-name">Embedded</span>
                  <span className="init-wizard-mode-desc">In-process Dolt, no server/port</span>
                </span>
              </button>
            </div>
          </div>

          <div className="init-wizard-actions">
            <button type="button" className="btn btn-sm" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!canSubmit}
              onClick={submit}
            >
              Create board
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
