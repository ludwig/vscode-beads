/**
 * WebviewHost — a thin adapter that lets the view providers drive either a
 * sidebar `WebviewView` or an editor-area `WebviewPanel` through one interface.
 *
 * Both expose an identical `.webview`; they differ only in how visibility,
 * reveal, and disposal are surfaced. Normalizing those three lets
 * BaseViewProvider be host-agnostic so the same provider logic backs the
 * sidebar views and the editor tabs (vs-ask, vs-fx4).
 */

import * as vscode from "vscode";

export interface WebviewHost {
  readonly webview: vscode.Webview;
  /** Whether the host is currently visible to the user. */
  readonly visible: boolean;
  /** Bring the host to the foreground (focus the view / reveal the tab). */
  reveal(preserveFocus?: boolean): void;
  /** Fires whenever the host's visibility changes. */
  onDidChangeVisibility(listener: () => void): vscode.Disposable;
  /** Fires when the host goes away (panel closed). Views never dispose. */
  onDidDispose(listener: () => void): vscode.Disposable;
}

/** Adapt a sidebar `WebviewView`. */
export function hostFromView(view: vscode.WebviewView): WebviewHost {
  return {
    webview: view.webview,
    get visible() {
      return view.visible;
    },
    reveal(preserveFocus?: boolean) {
      view.show(preserveFocus);
    },
    onDidChangeVisibility(listener) {
      return view.onDidChangeVisibility(listener);
    },
    onDidDispose(listener) {
      return view.onDidDispose(listener);
    },
  };
}

/** Adapt an editor-area `WebviewPanel`. */
export function hostFromPanel(panel: vscode.WebviewPanel): WebviewHost {
  return {
    webview: panel.webview,
    get visible() {
      return panel.visible;
    },
    reveal(preserveFocus?: boolean) {
      panel.reveal(undefined, preserveFocus);
    },
    onDidChangeVisibility(listener) {
      // Panels report visibility via view-state changes.
      return panel.onDidChangeViewState(() => listener());
    },
    onDidDispose(listener) {
      return panel.onDidDispose(listener);
    },
  };
}
