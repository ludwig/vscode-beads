/**
 * Beads - TypeScript Data Models
 *
 * These types mirror the Beads issue schema as exposed by `bd list --json` and `bd show --json`.
 * The extension normalizes CLI output into these internal types.
 *
 * Status Mapping (beads canonical statuses):
 * - "open" -> "open"
 * - "in_progress" / "in-progress" / "active" -> "in_progress"
 * - "blocked" -> "blocked"
 * - "closed" / "done" / "completed" / "cancelled" -> "closed"
 * - anything else -> throws error
 *
 * Priority Mapping:
 * - Beads uses 0-4 where 0 is highest priority (P0/Critical)
 * - 0: Critical/P0, 1: High/P1, 2: Medium/P2, 3: Low/P3, 4: None/P4
 */

import { LOG_PREFIX } from "../constants";

// The webview↔extension protocol and the data shapes it carries live in the
// shared contract — the single source of truth for both sides (see
// src/shared/contract.ts). Re-exported here so existing `./types` importers in
// the extension keep working unchanged.
export type {
  BeadStatus,
  BeadPriority,
  DependencyType,
  DoltMode,
  BeadComment,
  BeadDependency,
  Bead,
  BeadsProject,
  BeadsSummary,
  WebviewSettings,
  DependencyGraph,
  CreateBeadFields,
  IssuesFilter,
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from "../shared/contract";

import type { Bead, BeadStatus, BeadPriority, DependencyType } from "../shared/contract";

// Human-readable priority labels
export const PRIORITY_LABELS: Record<BeadPriority, string> = {
  0: "Critical",
  1: "High",
  2: "Medium",
  3: "Low",
  4: "None",
};

// Status display labels for the UI
export const STATUS_LABELS: Record<BeadStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  blocked: "Blocked",
  closed: "Closed",
};

// Backend dependency format (before normalization)
export interface BackendBeadDependency {
  id: string;
  dependency_type: string; // relationship: blocks, related, parent-child, etc.
  issue_type?: string;     // bead type: bug, feature, task, epic, chore
  title?: string;
  status?: string;
  priority?: number;
}

// Result from `bd info --json`
export interface BeadsInfo {
  version?: string;
  database?: string;
  issue_count?: number;
  [key: string]: unknown;
}

// Legacy backend process info
export interface BackendProcessInfo {
  pid: number;
  database: string;
  working_dir?: string;
  status?: string;
  started_at?: string;
  [key: string]: unknown;
}

// CLI command result
export interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  stderr?: string;
}

// Filter options for bead listing
export interface BeadFilters {
  status?: BeadStatus[];
  priority?: BeadPriority[];
  labels?: string[];
  type?: string[];
  assignee?: string[];
  search?: string;
}

// Sort options for bead listing
export interface BeadSort {
  field: "status" | "priority" | "updatedAt" | "createdAt" | "title";
  direction: "asc" | "desc";
}

/**
 * Normalizes a status string from Beads CLI to internal BeadStatus
 */
// Track warned statuses to avoid spam
const warnedStatuses = new Set<string>();

export function normalizeStatus(status: string | undefined): BeadStatus | null {
  if (!status) {
    if (!warnedStatuses.has("__missing__")) {
      warnedStatuses.add("__missing__");
      console.warn(`${LOG_PREFIX} Bead missing status field - skipping`);
    }
    return null;
  }
  const normalized = status.toLowerCase().replace(/-/g, "_");
  switch (normalized) {
    case "open":
      return "open";
    case "in_progress":
    case "active":
      return "in_progress";
    case "blocked":
      return "blocked";
    case "closed":
    case "done":
    case "completed":
    case "cancelled":
    case "canceled":
      return "closed";
    default:
      if (!warnedStatuses.has(status)) {
        warnedStatuses.add(status);
        console.warn(`${LOG_PREFIX} Unknown bead status "${status}" - skipping`);
      }
      return null;
  }
}

/**
 * Normalizes a priority value from Beads CLI to internal BeadPriority
 */
export function normalizePriority(
  priority: number | string | undefined
): BeadPriority {
  if (priority === undefined || priority === null) {
    return 4; // Default to "None"
  }
  const num =
    typeof priority === "string" ? parseInt(priority, 10) : priority;
  if (isNaN(num) || num < 0) {
    return 4;
  }
  if (num > 4) {
    return 4;
  }
  return num as BeadPriority;
}

/**
 * Converts a raw bead object from CLI JSON to internal Bead type.
 * Returns null if status is invalid (bead will be skipped).
 */
export function normalizeBead(raw: Record<string, unknown>): Bead | null {
  const status = normalizeStatus(raw.status as string | undefined);
  if (status === null) {
    return null;
  }
  return {
    id: String(raw.id || raw.ID || ""),
    title: String(raw.title || raw.Title || raw.summary || "Untitled"),
    description: raw.description
      ? String(raw.description)
      : raw.body
        ? String(raw.body)
        : undefined,
    type: raw.type ? String(raw.type) : raw.category ? String(raw.category) : undefined,
    priority: normalizePriority(raw.priority as number | string | undefined),
    status,
    assignee: raw.assignee
      ? String(raw.assignee)
      : raw.assigned_to
        ? String(raw.assigned_to)
        : undefined,
    labels: Array.isArray(raw.labels)
      ? raw.labels.map(String)
      : raw.tags
        ? (raw.tags as string[]).map(String)
        : undefined,
    createdAt: raw.created_at
      ? String(raw.created_at)
      : raw.createdAt
        ? String(raw.createdAt)
        : undefined,
    updatedAt: raw.updated_at
      ? String(raw.updated_at)
      : raw.updatedAt
        ? String(raw.updatedAt)
        : undefined,
    closedAt: raw.closed_at
      ? String(raw.closed_at)
      : raw.closedAt
        ? String(raw.closedAt)
        : undefined,
    dependsOn: Array.isArray(raw.depends_on)
      ? raw.depends_on.map((id) => ({ id: String(id) }))
      : Array.isArray(raw.dependsOn)
        ? raw.dependsOn.map((id) => ({ id: String(id) }))
        : undefined,
    blocks: Array.isArray(raw.blocks)
      ? raw.blocks.map((id) => ({ id: String(id) }))
      : undefined,
  };
}

/**
 * Converts a backend issue to webview Bead format.
 * Returns null if status is invalid (bead will be skipped).
 */
export function issueToWebviewBead(issue: {
  id: string;
  title: string;
  description?: string;
  design?: string;
  acceptance_criteria?: string;
  notes?: string;
  status: string;
  priority: number;
  issue_type: string;
  assignee?: string;
  labels?: string[];
  estimated_minutes?: number;
  external_ref?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  dependencies?: BackendBeadDependency[];
  dependents?: BackendBeadDependency[];
  comments?: Array<{ id: string; author: string; text: string; created_at: string }>;
}): Bead | null {
  const status = normalizeStatus(issue.status);
  if (status === null) {
    return null;
  }
  return {
    id: issue.id,
    title: issue.title,
    description: issue.description,
    design: issue.design,
    acceptanceCriteria: issue.acceptance_criteria,
    notes: issue.notes,
    type: issue.issue_type,
    priority: normalizePriority(issue.priority),
    status,
    assignee: issue.assignee,
    labels: issue.labels,
    estimatedMinutes: issue.estimated_minutes,
    externalRef: issue.external_ref,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at,
    dependsOn: issue.dependencies?.map((d) => ({
      id: d.id,
      type: d.issue_type,
      dependencyType: d.dependency_type as DependencyType | undefined,
      title: d.title,
      status: d.status ? normalizeStatus(d.status) ?? undefined : undefined,
      priority: d.priority !== undefined ? normalizePriority(d.priority) : undefined,
    })),
    blocks: issue.dependents?.map((d) => ({
      id: d.id,
      type: d.issue_type,
      dependencyType: d.dependency_type as DependencyType | undefined,
      title: d.title,
      status: d.status ? normalizeStatus(d.status) ?? undefined : undefined,
      priority: d.priority !== undefined ? normalizePriority(d.priority) : undefined,
    })),
    comments: issue.comments?.map((c) => ({
      id: c.id,
      author: c.author,
      text: c.text,
      createdAt: c.created_at,
    })),
  };
}
