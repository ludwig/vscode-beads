/**
 * Webview-side type definitions.
 *
 * The webview↔extension protocol and the data shapes it carries come from the
 * shared contract — the single source of truth for both sides (see
 * src/shared/contract.ts). They are re-exported here (with the message unions
 * aliased to the webview's historical names) so existing webview imports keep
 * working. Only webview-only rendering concerns (colors, display labels, type
 * metadata, the VS Code API handle) are defined locally below.
 */

import type {
  BeadStatus,
  BuiltInStatus,
  BeadPriority,
  WebviewToExtensionMessage,
} from "../shared/contract";
import { isBuiltInStatus } from "../shared/contract";

export type {
  BeadStatus,
  BuiltInStatus,
  StatusCategory,
  BeadPriority,
  DependencyType,
  DependencyGraph,
  BeadComment,
  BeadDependency,
  Bead,
  BeadsProject,
  BeadsSummary,
  FavoriteBead,
  WebviewSettings,
  CreateBeadFields,
  IssuesFilter,
  // The webview historically named the two message unions ExtensionMessage /
  // WebviewMessage; keep those names as aliases over the shared contract.
  ExtensionToWebviewMessage as ExtensionMessage,
  WebviewToExtensionMessage as WebviewMessage,
} from "../shared/contract";

export {
  BUILTIN_STATUSES,
  BUILTIN_STATUS_CATEGORY,
  isBuiltInStatus,
  statusCategory,
  isClosedStatus,
} from "../shared/contract";

// Human-readable labels
export const PRIORITY_LABELS: Record<BeadPriority, string> = {
  0: "critical",
  1: "high",
  2: "medium",
  3: "low",
  4: "none",
};

export const STATUS_LABELS: Record<BuiltInStatus, string> = {
  open: "open",
  in_progress: "in progress",
  blocked: "blocked",
  deferred: "deferred",
  closed: "closed",
  pinned: "pinned",
  hooked: "hooked",
};

export const PRIORITY_COLORS: Record<BeadPriority, string> = {
  0: "#c75d5d", // Critical - muted red
  1: "#c2864e", // High - muted orange
  2: "#bcac63", // Medium - muted gold (was vivid yellow)
  3: "#6a9a6a", // Low - muted green
  4: "#888888", // None - gray
};

export const PRIORITY_TEXT_COLORS: Record<BeadPriority, string> = {
  0: "#ffffff", // white on red
  1: "#ffffff", // white on orange
  2: "#1a1a1a", // dark on yellow
  3: "#ffffff", // white on green
  4: "#ffffff", // white on gray
};

// Colors for unknown/undefined priority (shown as "P?")
export const UNKNOWN_PRIORITY_COLOR = "#6b7280"; // gray
export const UNKNOWN_PRIORITY_TEXT_COLOR = "#ffffff"; // white

export const STATUS_COLORS: Record<BuiltInStatus, string> = {
  open: "#54a088",        // muted green - ready to work (active)
  in_progress: "#5a82c2", // muted blue (wip)
  blocked: "#c25c5c",     // muted red (wip, stuck)
  hooked: "#56a0b0",      // muted cyan - claimed by a worker (wip)
  deferred: "#64748b",    // slate - on ice (frozen)
  pinned: "#c2a05a",      // muted amber - persistent (frozen; stands out less)
  closed: "#6b7280",      // gray (done)
};

// Color for an unknown/custom status with no assigned color.
export const UNKNOWN_STATUS_COLOR = "#888888";

// Turn a raw custom status (e.g. "in_review") into a webview label
// ("in review"), matching the lowercase built-in label convention.
export function humanizeStatus(status: string): string {
  return status.replace(/[_-]+/g, " ").trim();
}

// Display label for any status (built-in or custom).
export function statusLabel(status: BeadStatus): string {
  return isBuiltInStatus(status) ? STATUS_LABELS[status] : humanizeStatus(status);
}

// Display color for any status (built-in or custom).
export function statusColor(status: BeadStatus): string {
  return isBuiltInStatus(status) ? STATUS_COLORS[status] : UNKNOWN_STATUS_COLOR;
}

export type BeadType = "bug" | "feature" | "task" | "epic" | "chore" | "merge-request" | "molecule";

export const TYPE_LABELS: Record<BeadType, string> = {
  bug: "bug",
  feature: "feature",
  task: "task",
  epic: "epic",
  chore: "chore",
  "merge-request": "merge-request",
  molecule: "molecule",
};

// Desaturated/muted palette (vs-b4e) — calmer than the original vivid hues,
// hue identity preserved, chroma reduced. Yellows pulled toward muted gold so
// they stand out less. Text-contrast pairings (below) still hold.
export const TYPE_COLORS: Record<BeadType, string> = {
  bug: "#b5524e",           // muted red
  feature: "#5b9772",       // muted green
  task: "#bfa455",          // muted gold (was vivid yellow)
  epic: "#8a6fb0",          // muted purple
  chore: "#5a7cb0",         // muted blue
  "merge-request": "#5a9bbf", // muted sky
  molecule: "#56a298",      // muted teal
};

export const TYPE_TEXT_COLORS: Record<BeadType, string> = {
  bug: "#ffffff",
  feature: "#ffffff",
  task: "#1a1a1a",          // dark on yellow
  epic: "#ffffff",
  chore: "#ffffff",
  "merge-request": "#ffffff",
  molecule: "#ffffff",
};

// Colors for unknown/undefined type (shown with question mark icon)
export const UNKNOWN_TYPE_COLOR = "#888888"; // gray
export const UNKNOWN_TYPE_TEXT_COLOR = "#ffffff"; // white

// Sort order for type display (lower = first)
// Epic first, then feature (story), bug, task, chore, then newer workflow types
export const TYPE_SORT_ORDER: Record<string, number> = {
  epic: 0,
  feature: 1,
  bug: 2,
  task: 3,
  chore: 4,
  "merge-request": 5,
  molecule: 6,
};

// Default sort order for unknown types (sorts after known types)
export const UNKNOWN_TYPE_SORT_ORDER = 99;

/** Get sort order for a type (handles unknown types) */
export function getTypeSortOrder(type: string | undefined): number {
  if (!type) return UNKNOWN_TYPE_SORT_ORDER;
  return TYPE_SORT_ORDER[type] ?? UNKNOWN_TYPE_SORT_ORDER;
}

/** Sort labels alphabetically (case-insensitive) */
export function sortLabels(labels: string[] | undefined): string[] {
  if (!labels) return [];
  return [...labels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

// VS Code API interface for webview
declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: WebviewToExtensionMessage) => void;
      getState: () => unknown;
      setState: (state: unknown) => void;
    };
  }
}

export const vscode = window.acquireVsCodeApi();
