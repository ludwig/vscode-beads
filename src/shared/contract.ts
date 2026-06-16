/**
 * Shared webview↔extension contract — the SINGLE source of truth for the
 * message protocol and the data shapes those messages carry.
 *
 * Both the extension host (`src/backend/types.ts`) and the React webview
 * (`src/webview/types.ts`) re-export from this module, so a message variant or
 * a carried field can never drift between the two sides (it used to be
 * maintained by hand in both places, which compiled cleanly and only broke at
 * runtime).
 *
 * IMPORTANT: this module is a leaf — it MUST NOT import from `vscode`, Node
 * built-ins, or any extension/webview-only module. It is pure types plus
 * trivial value constants, safe to bundle into either side.
 */

// --- Enumerations -----------------------------------------------------------

// Bead status values (beads canonical statuses).
export type BeadStatus = "open" | "in_progress" | "blocked" | "closed";

// Priority levels (0 = highest/critical, 4 = lowest/none).
export type BeadPriority = 0 | 1 | 2 | 3 | 4;

// Dependency relationship types.
export type DependencyType = "blocks" | "parent-child" | "related" | "discovered-from";

// Backend storage mode for a project (detected on activation).
export type DoltMode = "embedded" | "server";

// --- Core data shapes -------------------------------------------------------

// Comment on a bead.
export interface BeadComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

// Dependency reference with summary info for display.
export interface BeadDependency {
  id: string;
  type?: string; // issue_type: bug, feature, task, epic, chore
  dependencyType?: DependencyType; // relationship type: blocks, parent-child, etc.
  title?: string;
  status?: BeadStatus;
  priority?: BeadPriority;
}

// Core Bead representing a single issue.
export interface Bead {
  id: string; // e.g., "bd-a1b2", including dotted child IDs
  title: string;
  description?: string;
  design?: string; // Design notes
  acceptanceCriteria?: string; // Acceptance criteria
  notes?: string; // Working notes
  type?: string; // Beads issue_type: bug, feature, task, epic, chore
  priority?: BeadPriority;
  status: BeadStatus;
  assignee?: string;
  labels?: string[];
  estimatedMinutes?: number; // Time estimate
  externalRef?: string; // External reference e.g., "gh-9", "jira-ABC"
  createdAt?: string; // ISO/RFC3339 timestamps
  updatedAt?: string;
  closedAt?: string;

  // Dependency relationships (with type for coloring)
  dependsOn?: BeadDependency[]; // Issues this bead depends on
  blocks?: BeadDependency[]; // Issues that depend on this bead

  // Comments
  comments?: BeadComment[];

  // UI-specific fields (not from CLI)
  sortOrder?: number;
  statusColumn?: string;
  // True while this bead was painted optimistically from the list row and the
  // authoritative `bd show` (deps + comments) has not yet returned (vs-7s7).
  partial?: boolean;
}

// A Beads project (database/workspace).
export interface BeadsProject {
  id: string; // Stable ID (hash of db path or root path)
  name: string; // Human-friendly label (folder name or config display name)
  rootPath: string; // Project root (VS Code workspace folder)
  displayPath?: string; // Home-abbreviated rootPath (e.g. "~/beads/vs")
  beadsDir: string; // Path to .beads directory
  source?: "workspace" | "setting" | "env" | "default";
  /**
   * Effective issue prefix: the explicit `issue-prefix` from
   * `.beads/config.yaml`, or the directory name when auto-detected.
   */
  prefix?: string;
  dbPath?: string; // Path to beads.db (if discovered)
  backendStatus: "running" | "stopped" | "unknown";
  backendPid?: number;
  doltMode?: DoltMode; // Detected on activation: "embedded" | "server"
  bdVersion?: string; // Detected `bd` CLI version (e.g. "1.0.5")
}

// Summary statistics for the dashboard.
export interface BeadsSummary {
  total: number;
  byStatus: Record<BeadStatus, number>;
  byPriority: Record<BeadPriority, number>;
  readyCount: number;
  blockedCount: number;
  inProgressCount: number;
}

// Settings passed to the webview.
export interface WebviewSettings {
  renderMarkdown: boolean;
  userId: string;
  tooltipHoverDelay: number; // 0 = disabled
  extensionVersion: string; // e.g. "0.14.0"
  buildSha: string; // short git SHA at build time, or "unknown"
  buildDirty: boolean; // built with uncommitted changes
}

// Placeholder for the (not yet implemented) graph view.
export interface DependencyGraph {
  nodes: Bead[];
  edges: { from: string; to: string; type: DependencyType }[];
}

// Fields for creating a new bead from the UI (camelCase, normalized to
// CreateIssueArgs in the provider).
export interface CreateBeadFields {
  title: string;
  type?: string;
  priority?: BeadPriority;
  description?: string;
  design?: string;
  acceptanceCriteria?: string;
  assignee?: string;
  labels?: string[];
}

/**
 * A drill-in filter pushed to the Issues view from elsewhere (e.g. a Dashboard
 * card or breakdown badge). Only the named dimensions are set; the rest are
 * cleared so the resulting list matches the slice that was clicked.
 */
export interface IssuesFilter {
  statuses?: BeadStatus[];
  labels?: string[];
  types?: string[];
}

// --- Message protocol -------------------------------------------------------

// Messages sent from the extension host to the webview.
export type ExtensionToWebviewMessage =
  | { type: "setViewType"; viewType: string }
  | { type: "setProject"; project: BeadsProject | null }
  | { type: "setBeads"; beads: Bead[] }
  | { type: "setBead"; bead: Bead | null }
  | { type: "setSelectedBeadId"; beadId: string | null }
  | { type: "setSummary"; summary: BeadsSummary | null }
  | { type: "setGraph"; graph: DependencyGraph }
  | { type: "setProjects"; projects: BeadsProject[] }
  | { type: "setLoading"; loading: boolean }
  | { type: "setError"; error: string | null }
  | { type: "setSettings"; settings: WebviewSettings }
  | { type: "setCreateMode"; value: boolean }
  | { type: "applyIssuesFilter"; filter: IssuesFilter }
  | { type: "showGraph"; beadId: string }
  | { type: "refresh" }
  | { type: "showToast"; text: string };

// Messages sent from the webview to the extension host.
export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "selectProject"; projectId: string; projectRootPath?: string }
  | { type: "showProjectMenu"; projectId: string }
  | { type: "showDoltStatus" }
  | { type: "startDoltServer" }
  | { type: "stopDoltServer" }
  | { type: "openDoltLog" }
  | { type: "openProjectFolder" }
  | { type: "selectBead"; beadId: string }
  | { type: "updateBead"; beadId: string; updates: Partial<Bead> }
  | { type: "deleteBead"; beadId: string }
  | { type: "addDependency"; beadId: string; targetId: string; dependencyType: DependencyType; reverse: boolean }
  | { type: "removeDependency"; beadId: string; dependsOnId: string }
  | { type: "addComment"; beadId: string; text: string }
  | { type: "openBeadDetails"; beadId: string }
  | { type: "openBeadInTab"; beadId: string }
  | { type: "clearActiveBead" }
  | { type: "copyText"; text: string; label?: string }
  | { type: "viewInGraph"; beadId: string }
  | { type: "requestGraph" }
  | { type: "openViewInTab"; view: "issues" | "dashboard" | "graph" }
  | { type: "copyBeadId"; beadId: string }
  | { type: "createBead"; fields: CreateBeadFields }
  | { type: "startCreate" }
  | { type: "cancelCreate" }
  | { type: "openFile"; filePath: string; line?: number }
  | { type: "openExternal"; url: string }
  | { type: "openIssuesWithFilter"; filter: IssuesFilter };
