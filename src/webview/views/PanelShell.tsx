/**
 * PanelShell - a single embeddable surface for the bottom Panel that hosts the
 * Dashboard and Issues subviews behind an in-view nav row (room for a future
 * Graph/Tree tab). One webview, one panel tab — the nav buttons live IN the
 * view (not the panel tab bar), and clicking a Dashboard card flips to the
 * Issues subview with the matching filter applied.
 *
 * The components themselves are not tied to VS Code's collapsible view model;
 * this shell just routes between them client-side.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { LayoutDashboard, ListTodo, Workflow, RefreshCw, ExternalLink, LucideIcon } from "lucide-react";
import { Bead, BeadsSummary, DependencyGraph, IssuesFilter, WebviewSettings, vscode } from "../types";
import { DashboardView } from "./DashboardView";
import { IssuesView } from "./IssuesView";
import { GraphView } from "./graph/GraphView";
import { Loading } from "../common/Loading";

type PanelTab = "issues" | "dashboard" | "graph";

interface PanelShellProps {
  summary: BeadsSummary | null;
  beads: Bead[];
  graph: DependencyGraph | null;
  loading: boolean;
  error: string | null;
  selectedBeadId: string | null;
  settings: WebviewSettings;
  issuesFilterRequest: { filter: IssuesFilter; seq: number } | null;
  showGraphRequest: { beadId: string; seq: number } | null;
}

export function PanelShell({
  summary,
  beads,
  graph,
  loading,
  error,
  selectedBeadId,
  settings,
  issuesFilterRequest,
  showGraphRequest,
}: PanelShellProps): React.ReactElement {
  // Issues is the default view when the panel first opens.
  const [active, setActive] = useState<PanelTab>("issues");
  // A Dashboard card click flips to Issues and carries its filter in-shell.
  const [localFilter, setLocalFilter] = useState<{ filter: IssuesFilter; seq: number } | null>(null);
  // Bead to focus on the Graph tab, set by a "View in graph" deep-link. Carried
  // into GraphView (which auto-enables Focus when it arrives).
  const [graphFocusId, setGraphFocusId] = useState<string | null>(null);

  // A "View in graph" deep-link: flip to the Graph tab and focus the bead.
  // Keyed on `seq` so a repeat request for the same bead still re-fires.
  const lastShowGraphSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!showGraphRequest || lastShowGraphSeq.current === showGraphRequest.seq) {
      return;
    }
    lastShowGraphSeq.current = showGraphRequest.seq;
    setGraphFocusId(showGraphRequest.beadId);
    setActive("graph");
  }, [showGraphRequest]);

  const flipToIssues = (filter: IssuesFilter) => {
    setLocalFilter((prev) => ({ filter, seq: (prev?.seq ?? 0) + 1 }));
    setActive("issues");
  };

  // Lazily ask the provider for the dependency graph; only fired when the Graph
  // tab is opened so the default Issues/Dashboard path pays no extra fetch.
  const requestGraph = useCallback(() => vscode.postMessage({ type: "requestGraph" }), []);

  const tabs: { id: PanelTab; label: string; Icon: LucideIcon }[] = [
    { id: "issues", label: "Issues", Icon: ListTodo },
    { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { id: "graph", label: "Graph", Icon: Workflow },
  ];

  return (
    <div className="panel-shell">
      <nav className="panel-shell-nav" role="tablist">
        <div className="panel-shell-tabs">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active === id}
              className={`panel-shell-tab ${active === id ? "active" : ""}`}
              onClick={() => setActive(id)}
            >
              <Icon size={15} strokeWidth={2} className="panel-shell-tab-icon" />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="panel-shell-actions">
          <button
            type="button"
            className="panel-shell-action"
            title={`Open ${tabs.find((t) => t.id === active)?.label ?? "view"} in an editor tab`}
            aria-label="Open in editor tab"
            onClick={() => vscode.postMessage({ type: "openViewInTab", view: active })}
          >
            <ExternalLink size={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="panel-shell-action"
            title="Refresh"
            aria-label="Refresh"
            onClick={() => vscode.postMessage({ type: "refresh" })}
          >
            <RefreshCw size={14} strokeWidth={2} />
          </button>
        </div>
      </nav>

      <div className="panel-shell-body">
        {active === "graph" ? (
          <GraphView
            graph={graph}
            loading={loading}
            error={error}
            selectedBeadId={selectedBeadId}
            focusBeadId={graphFocusId}
            onOpenBead={(beadId) => vscode.postMessage({ type: "openBeadDetails", beadId })}
            onRequestGraph={requestGraph}
            onRetry={() => vscode.postMessage({ type: "refresh" })}
          />
        ) : active === "dashboard" ? (
          <DashboardView
            summary={summary}
            beads={beads}
            loading={loading}
            error={error}
            version={settings.extensionVersion}
            buildSha={settings.buildSha}
            buildDirty={settings.buildDirty}
            onSelectBead={(beadId) => vscode.postMessage({ type: "openBeadDetails", beadId })}
            onOpenIssues={(filter) => flipToIssues(filter)}
            onRetry={() => vscode.postMessage({ type: "refresh" })}
          />
        ) : loading && beads.length === 0 ? (
          <Loading />
        ) : (
          <IssuesView
            beads={beads}
            loading={loading}
            error={error}
            selectedBeadId={selectedBeadId}
            tooltipHoverDelay={settings.tooltipHoverDelay}
            issuesFilterRequest={localFilter ?? issuesFilterRequest}
            onSelectBead={(beadId) => vscode.postMessage({ type: "openBeadDetails", beadId })}
            onUpdateBead={(beadId, updates) => vscode.postMessage({ type: "updateBead", beadId, updates })}
            onRetry={() => vscode.postMessage({ type: "refresh" })}
          />
        )}
      </div>
    </div>
  );
}
