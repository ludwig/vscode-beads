/**
 * TreeView — the hierarchical Tree subview of the bottom PanelShell (vs-bw9).
 *
 * Renders beads in their parent/child hierarchy as an indented, collapsible
 * tree (file-explorer chrome) that conveys dependency lineage (gitk-ish), with
 * a filter line that narrows to matching beads while keeping the path to them.
 * Reuses the lazily-fetched dependency graph (same data as the Graph tab).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Search } from "lucide-react";
import {
  Bead,
  DependencyGraph,
  STATUS_COLORS,
  PRIORITY_COLORS,
  UNKNOWN_PRIORITY_COLOR,
  BeadPriority,
  getTypeSortOrder,
  vscode,
} from "../../types";
import { TypeIcon } from "../../common/TypeIcon";
import { Loading } from "../../common/Loading";
import { ErrorMessage } from "../../common/ErrorMessage";
import { ContextMenu, type ContextMenuItem } from "../../common/ContextMenu";
import { buildForest, filterForest, type TreeNode } from "./treeModel";

interface TreeViewProps {
  graph: DependencyGraph | null;
  loading: boolean;
  error: string | null;
  selectedBeadId: string | null;
  onSelectBead: (beadId: string) => void;
  onRequestGraph: () => void;
  onRetry: () => void;
}

export function TreeView({
  graph,
  loading,
  error,
  selectedBeadId,
  onSelectBead,
  onRequestGraph,
  onRetry,
}: TreeViewProps): React.ReactElement {
  // Lazily fetch the graph when this tab mounts (shares the Graph tab's data).
  useEffect(() => {
    onRequestGraph();
  }, [onRequestGraph]);

  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; bead: Bead } | null>(null);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openMenu = useCallback((x: number, y: number, bead: Bead) => {
    setMenu({ x, y, bead });
  }, []);

  const forest = useMemo(
    () => (graph ? buildForest(graph.nodes, graph.edges, getTypeSortOrder) : []),
    [graph],
  );
  const visible = useMemo(() => filterForest(forest, query), [forest, query]);
  // While filtering, ignore collapse state so matches are always revealed.
  const filtering = query.trim().length > 0;

  if (error) {
    return <ErrorMessage message={error} onRetry={onRetry} />;
  }
  if (!graph && loading) {
    return <Loading />;
  }

  return (
    <div className="beads-tree">
      <div className="beads-tree-filter">
        <Search size={13} strokeWidth={2} className="beads-tree-filter-icon" />
        <input
          type="text"
          className="beads-tree-filter-input"
          placeholder="Filter beads…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
      </div>
      <div className="beads-tree-body" role="tree">
        {visible.length === 0 ? (
          <div className="beads-tree-empty">{forest.length === 0 ? "No beads to show." : "No matches."}</div>
        ) : (
          visible.map((node) => (
            <TreeRow
              key={node.bead.id}
              node={node}
              depth={0}
              selectedBeadId={selectedBeadId}
              collapsed={collapsed}
              forceExpand={filtering}
              onToggle={toggle}
              onSelectBead={onSelectBead}
              onContextMenu={openMenu}
            />
          ))
        )}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={rowMenuItems(menu.bead)}
        />
      )}
    </div>
  );
}

function rowMenuItems(bead: Bead): ContextMenuItem[] {
  return [
    {
      label: "Open Details (editor tab)",
      onSelect: () => vscode.postMessage({ type: "openBeadInTab", beadId: bead.id }),
    },
    {
      label: "Show Details",
      onSelect: () => vscode.postMessage({ type: "openBeadDetails", beadId: bead.id }),
    },
    {
      label: "Focus on Graph",
      onSelect: () => vscode.postMessage({ type: "viewInGraph", beadId: bead.id }),
    },
    {
      label: "Copy ID",
      separatorBefore: true,
      onSelect: () => vscode.postMessage({ type: "copyBeadId", beadId: bead.id }),
    },
    {
      label: "Copy title",
      onSelect: () => vscode.postMessage({ type: "copyText", text: bead.title, label: "title" }),
    },
  ];
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  selectedBeadId: string | null;
  collapsed: Set<string>;
  forceExpand: boolean;
  onToggle: (id: string) => void;
  onSelectBead: (beadId: string) => void;
  onContextMenu: (x: number, y: number, bead: Bead) => void;
}

function TreeRow({
  node,
  depth,
  selectedBeadId,
  collapsed,
  forceExpand,
  onToggle,
  onSelectBead,
  onContextMenu,
}: TreeRowProps): React.ReactElement {
  const { bead, children } = node;
  const hasChildren = children.length > 0;
  const isCollapsed = !forceExpand && collapsed.has(bead.id);
  const isSelected = bead.id === selectedBeadId;
  const statusColor = STATUS_COLORS[bead.status] || "#888888";
  const priorityColor =
    bead.priority === undefined ? UNKNOWN_PRIORITY_COLOR : PRIORITY_COLORS[bead.priority as BeadPriority];

  return (
    <>
      <div
        className={`beads-tree-row${isSelected ? " selected" : ""}`}
        role="treeitem"
        aria-expanded={hasChildren ? !isCollapsed : undefined}
        aria-selected={isSelected}
        style={{ paddingLeft: depth * 16 }}
        onClick={() => onSelectBead(bead.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e.clientX, e.clientY, bead);
        }}
        title={`${bead.id} · ${bead.title}`}
      >
        <span
          className="beads-tree-twisty"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(bead.id);
          }}
        >
          {hasChildren ? (
            isCollapsed ? <ChevronRight size={13} strokeWidth={2} /> : <ChevronDown size={13} strokeWidth={2} />
          ) : null}
        </span>
        <span className="beads-tree-rail" style={{ backgroundColor: statusColor }} />
        {bead.type ? <TypeIcon type={bead.type} size={13} /> : null}
        <span className="beads-tree-id">{bead.id}</span>
        <span className="beads-tree-title">{bead.title}</span>
        <span className="beads-tree-priority" style={{ backgroundColor: priorityColor }} />
      </div>
      {hasChildren && !isCollapsed
        ? children.map((child) => (
            <TreeRow
              key={child.bead.id}
              node={child}
              depth={depth + 1}
              selectedBeadId={selectedBeadId}
              collapsed={collapsed}
              forceExpand={forceExpand}
              onToggle={onToggle}
              onSelectBead={onSelectBead}
              onContextMenu={onContextMenu}
            />
          ))
        : null}
    </>
  );
}
