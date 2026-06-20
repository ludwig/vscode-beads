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

// bd's seven built-in statuses (Gas Town fork, internal/types/types.go).
//   - deferred = deliberately put on ice for later (backlog/icebox)
//   - pinned   = persistent bead that stays open indefinitely
//   - hooked   = work actively claimed by a worker
export type BuiltInStatus =
  | "open"
  | "in_progress"
  | "blocked"
  | "deferred"
  | "closed"
  | "pinned"
  | "hooked";

// A bead's status. Built-ins are first-class; user-defined custom statuses
// (configured via `bd config set status.custom "..."`) pass through as their
// raw normalized string so a bead is NEVER dropped for an unrecognized status.
// The `string & {}` keeps editor autocomplete for the built-ins while still
// accepting any string (TS literal-union widening trick — the `{}` is load-
// bearing here, not the "any non-nullish" footgun the lint rule guards against).
// eslint-disable-next-line @typescript-eslint/ban-types
export type BeadStatus = BuiltInStatus | (string & {});

// Ordered list of the built-in statuses, for iteration / default lane order.
export const BUILTIN_STATUSES: readonly BuiltInStatus[] = [
  "open",
  "in_progress",
  "blocked",
  "deferred",
  "closed",
  "pinned",
  "hooked",
];

// bd's behavioral category for a status — controls whether it shows in
// `bd ready` and default `bd list` (internal/types/types.go:StatusCategory).
//   - active : appears in `bd ready` and default `bd list`
//   - wip    : excluded from `bd ready`, visible in default `bd list`
//   - done   : excluded from both
//   - frozen : excluded from both (on ice)
//   - unspecified : custom status with no declared category (backward-compat)
export type StatusCategory = "active" | "wip" | "done" | "frozen" | "unspecified";

// SINGLE SOURCE OF TRUTH for built-in status → category, mirroring bd's
// BuiltInStatusCategory(). Every consumer (filters, Kanban lanes,
// Ready/Backlog/¬closed logic) should derive from category, not hardcoded
// status lists. Custom statuses default to "unspecified" until their category
// is learned from bd's `status.custom` config (future work: vs-f4o/vs-x6b).
export const BUILTIN_STATUS_CATEGORY: Record<BuiltInStatus, StatusCategory> = {
  open: "active",
  in_progress: "wip",
  blocked: "wip",
  hooked: "wip",
  closed: "done",
  deferred: "frozen",
  pinned: "frozen",
};

// True when `status` is one of bd's seven built-in statuses.
export function isBuiltInStatus(status: string): status is BuiltInStatus {
  return Object.prototype.hasOwnProperty.call(BUILTIN_STATUS_CATEGORY, status);
}

// Behavioral category for any status (built-in or custom). Unknown custom
// statuses are treated as "unspecified".
export function statusCategory(status: BeadStatus): StatusCategory {
  return isBuiltInStatus(status) ? BUILTIN_STATUS_CATEGORY[status] : "unspecified";
}

// A status counts as "closed" only when its category is "done". This lets the
// ¬closed / Not-Closed logic derive from category instead of a hardcoded list.
export function isClosedStatus(status: BeadStatus): boolean {
  return statusCategory(status) === "done";
}

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

/**
 * A favorite/starred bead as published to the views (vs-sd5.1). The persisted
 * truth is just the id (ordered, per project); the host resolves each id to
 * this lightweight summary from its bead cache so the Favorites section can
 * render id + title + type icon like the Active Bead card. Fields beyond `id`
 * are best-effort: a favorite whose row isn't cached yet resolves to `{ id }`.
 * Consumers that only need the id set use `favorites.map((f) => f.id)`.
 */
export interface FavoriteBead {
  id: string;
  title?: string;
  type?: string;
  status?: BeadStatus;
  priority?: BeadPriority;
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
  // Keyed by status string (built-in or custom) so custom statuses are counted
  // too; built-ins are always present (seeded to 0) so they render even at 0.
  byStatus: Record<string, number>;
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
  isEditorTab: boolean; // true when this webview is an editor-area tab, not a sidebar view
  bundleBytes: number; // on-disk size of the built extension + webview bundle (0 if unknown)
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
  | { type: "focusIssuesTab" }
  | { type: "focusKanbanTab" }
  | { type: "pulse" }
  | { type: "setMemoryUsage"; bytes: number }
  // The active project's favorites, in curated order, resolved to lightweight
  // summaries (id + title + type icon) for display (vs-sd5.1).
  | { type: "setFavorites"; favorites: FavoriteBead[] }
  // Per-tab Back/Forward enablement for an editor-tab Details view (vs-9u8).
  | { type: "setTabNavState"; canBack: boolean; canForward: boolean }
  // A one-time snapshot of the Issues filter (the matching bead ids), pushed to
  // a freshly-opened editor-tab Kanban/Tree/Graph view so it inherits the
  // panel's active filter instead of opening unfiltered (vs-nme). `null` = no
  // filter (show all).
  | { type: "seedFilter"; filteredBeadIds: string[] | null }
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
  | { type: "copyText"; text: string; label?: string; toast?: boolean }
  | { type: "viewInGraph"; beadId: string }
  | { type: "navigateBack" }
  | { type: "navigateForward" }
  | { type: "pickReadyBead" }
  | { type: "showIssues" }
  // Reveal the Beads panel shell with the Kanban tab focused (vs-6xf).
  | { type: "showKanban" }
  | { type: "requestGraph" }
  | {
      type: "openViewInTab";
      view: "issues" | "dashboard" | "graph" | "kanban" | "tree";
      // Snapshot of the currently-filtered bead ids, so the new editor tab can
      // inherit the panel's active filter (vs-nme). Omitted/null = no filter.
      filteredBeadIds?: string[] | null;
    }
  | { type: "copyBeadId"; beadId: string; toast?: boolean }
  | { type: "copyBeadJson"; beadId: string; toast?: boolean }
  | { type: "createBead"; fields: CreateBeadFields }
  | { type: "startCreate" }
  | { type: "cancelCreate" }
  | { type: "openFile"; filePath: string; line?: number }
  | { type: "openExternal"; url: string }
  | { type: "openIssuesWithFilter"; filter: IssuesFilter }
  // Star/unstar a bead in the active project's favorites set (vs-sd5.1).
  | { type: "toggleFavorite"; beadId: string }
  | { type: "removeFavorite"; beadId: string };
