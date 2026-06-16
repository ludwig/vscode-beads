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

import React, { useState } from "react";
import { LayoutDashboard, ListTodo, RefreshCw, LucideIcon } from "lucide-react";
import { Bead, BeadsProject, BeadsSummary, IssuesFilter, WebviewSettings, vscode } from "../types";
import { DashboardView } from "./DashboardView";
import { IssuesView } from "./IssuesView";
import { Loading } from "../common/Loading";

type PanelTab = "issues" | "dashboard";

interface PanelShellProps {
  summary: BeadsSummary | null;
  beads: Bead[];
  loading: boolean;
  error: string | null;
  activeProject: BeadsProject | null;
  selectedBeadId: string | null;
  settings: WebviewSettings;
  issuesFilterRequest: { filter: IssuesFilter; seq: number } | null;
}

export function PanelShell({
  summary,
  beads,
  loading,
  error,
  activeProject,
  selectedBeadId,
  settings,
  issuesFilterRequest,
}: PanelShellProps): React.ReactElement {
  // Issues is the default view when the panel first opens.
  const [active, setActive] = useState<PanelTab>("issues");
  // A Dashboard card click flips to Issues and carries its filter in-shell.
  const [localFilter, setLocalFilter] = useState<{ filter: IssuesFilter; seq: number } | null>(null);

  const flipToIssues = (filter: IssuesFilter) => {
    setLocalFilter((prev) => ({ filter, seq: (prev?.seq ?? 0) + 1 }));
    setActive("issues");
  };

  const tabs: { id: PanelTab; label: string; Icon: LucideIcon }[] = [
    { id: "issues", label: "Issues", Icon: ListTodo },
    { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
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
            title="Refresh"
            aria-label="Refresh"
            onClick={() => vscode.postMessage({ type: "refresh" })}
          >
            <RefreshCw size={14} strokeWidth={2} />
          </button>
        </div>
      </nav>

      <div className="panel-shell-body">
        {active === "dashboard" ? (
          <DashboardView
            summary={summary}
            beads={beads}
            loading={loading}
            error={error}
            activeProject={activeProject}
            version={settings.extensionVersion}
            buildSha={settings.buildSha}
            buildDirty={settings.buildDirty}
            onSelectBead={(beadId) => vscode.postMessage({ type: "openBeadDetails", beadId })}
            onOpenIssues={(filter) => flipToIssues(filter)}
            onShowStatus={() => vscode.postMessage({ type: "showDoltStatus" })}
            onStartDolt={() => vscode.postMessage({ type: "startDoltServer" })}
            onStopDolt={() => vscode.postMessage({ type: "stopDoltServer" })}
            onOpenDoltLog={() => vscode.postMessage({ type: "openDoltLog" })}
            onOpenProjectFolder={() => vscode.postMessage({ type: "openProjectFolder" })}
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
