import { BeadsIssue } from "../backend/BeadsBackend";

/**
 * Pure (vscode-free) helpers behind the virtual `bead:` documents
 * (spike vs-ab3 / epic vs-fkb). Kept separate from BeadDocumentProvider so the
 * id/path round-trip and markdown rendering are unit-testable without a vscode
 * stub — matching the repo convention (cf. pulseOnReveal, NavigationHistory).
 */

/** Path portion of a bead's virtual-doc URI: `/<id>.md`. */
export function beadDocPath(beadId: string): string {
  return `/${beadId}.md`;
}

/** Inverse of {@link beadDocPath}: recover the bead id from a `bead:` URI path. */
export function beadIdFromPath(path: string): string {
  return path.replace(/^\//, "").replace(/\.md$/, "");
}

const PRIORITY_LABELS = ["P0 (Critical)", "P1", "P2", "P3", "P4 (None)"];

/**
 * Render a bead as a self-contained markdown document. This is the text Claude
 * Code would seed — plain markdown, NOT the rendered webview (the spike's known
 * tradeoff for approach A). Keep it readable as a standalone artifact.
 */
export function renderBeadMarkdown(issue: BeadsIssue): string {
  const lines: string[] = [];
  lines.push(`# ${issue.id} — ${issue.title}`);
  lines.push("");

  const priority =
    typeof issue.priority === "number" && PRIORITY_LABELS[issue.priority]
      ? PRIORITY_LABELS[issue.priority]
      : String(issue.priority);
  const meta: string[] = [
    `**Type:** ${issue.issue_type}`,
    `**Status:** ${issue.status}`,
    `**Priority:** ${priority}`,
  ];
  if (issue.assignee) meta.push(`**Assignee:** ${issue.assignee}`);
  if (issue.labels?.length) meta.push(`**Labels:** ${issue.labels.join(", ")}`);
  lines.push(meta.join("  \n"));
  lines.push("");

  if (issue.description?.trim()) {
    lines.push("## Description", "", issue.description.trim(), "");
  }
  if (issue.design?.trim()) {
    lines.push("## Design", "", issue.design.trim(), "");
  }
  if (issue.acceptance_criteria?.trim()) {
    lines.push("## Acceptance Criteria", "", issue.acceptance_criteria.trim(), "");
  }
  if (issue.notes?.trim()) {
    lines.push("## Notes", "", issue.notes.trim(), "");
  }

  const deps = issue.dependencies ?? [];
  const dependents = issue.dependents ?? [];
  if (deps.length || dependents.length) {
    lines.push("## Dependencies", "");
    for (const d of deps) {
      lines.push(`- ${d.dependency_type ?? "depends on"} → ${d.id}${d.title ? ` — ${d.title}` : ""}`);
    }
    for (const d of dependents) {
      lines.push(`- ${d.id}${d.title ? ` — ${d.title}` : ""} → ${d.dependency_type ?? "depends on"} this`);
    }
    lines.push("");
  }

  const comments = issue.comments ?? [];
  if (comments.length) {
    lines.push("## Comments", "");
    for (const c of comments) {
      lines.push(`> **${c.author}** (${c.created_at}):`);
      lines.push(`> ${c.text.replace(/\n/g, "\n> ")}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
