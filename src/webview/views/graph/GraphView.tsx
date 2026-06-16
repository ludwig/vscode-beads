/**
 * GraphView — the dependency Graph subview of the bottom PanelShell. Renders
 * beads as React Flow nodes and dependency edges with per-relationship styling,
 * switchable between a layered (dagre) and force-directed (d3-force) layout.
 *
 * Pure renderer: it receives the assembled graph + callbacks as props and owns
 * only view-local UI state (layout mode, focus toggle, hover). Edges are fetched
 * lazily — it calls onRequestGraph() on mount so the provider only pays for the
 * dependency fetch when the Graph tab is actually opened.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import { GitBranch, Network, Crosshair, Wand2, Filter } from "lucide-react";
import { Bead, DependencyGraph, STATUS_COLORS, vscode } from "../../types";
import { Loading } from "../../common/Loading";
import { ErrorMessage } from "../../common/ErrorMessage";
import { BeadNode, type BeadNodeData } from "./BeadNode";
import { ContextMenu, type ContextMenuItem } from "../../common/ContextMenu";
import { layeredLayout, forceLayout, type LayoutEdge } from "./layout";
import {
  edgeStyle,
  neighborhood,
  EDGE_TYPE_ORDER,
  EDGE_STYLES,
  CONNECT_DEP_OPTIONS,
  connectionToAddDependency,
} from "./graphModel";

type LayoutMode = "layered" | "force";

interface GraphViewProps {
  graph: DependencyGraph | null;
  loading: boolean;
  error: string | null;
  selectedBeadId: string | null;
  /** A bead to focus the neighborhood on (e.g. from a "View in graph" action). */
  focusBeadId: string | null;
  /**
   * Ids matching the current Issues filter/search, or null when unknown. The
   * "Filtered" toggle scopes the graph to this set; null disables the toggle.
   */
  filteredBeadIds: string[] | null;
  onOpenBead: (beadId: string) => void;
  onRequestGraph: () => void;
  onRetry: () => void;
}

const nodeTypes = { bead: BeadNode };

function GraphCanvas({
  graph,
  selectedBeadId,
  focusBeadId,
  filteredBeadIds,
  onOpenBead,
}: Omit<GraphViewProps, "loading" | "error" | "onRequestGraph" | "onRetry">): React.ReactElement {
  const [mode, setMode] = useState<LayoutMode>("layered");
  const [focusEnabled, setFocusEnabled] = useState(false);
  // Scope the graph to the current Issues filter slice (vs-v07). Composes with
  // Focus: the filter narrows the candidate set, focus narrows to a
  // neighborhood within it.
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; bead: Bead } | null>(null);
  // Drawing a new edge (vs-caz): React Flow fires onConnect on a valid drop,
  // then onConnectEnd with the pointer event — pair them to pop a relationship
  // picker at the drop point. Clicking an existing edge offers removal.
  const pendingConn = useRef<{ source: string; target: string } | null>(null);
  const [connMenu, setConnMenu] = useState<{ x: number; y: number; source: string; target: string } | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<{ x: number; y: number; source: string; target: string } | null>(null);
  const closeMenus = useCallback(() => {
    setMenu(null);
    setConnMenu(null);
    setEdgeMenu(null);
  }, []);
  // Bumped by Auto Layout to seed a new force-layout variant.
  const [layoutSeed, setLayoutSeed] = useState(0);
  // Selection is local to the canvas: a single click highlights + becomes the
  // focus root without navigating away (double-click opens details). Falls back
  // to the externally-selected bead until the user clicks a node here.
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const rf = useReactFlow();

  // A "view in graph" target arrives → focus on it automatically.
  useEffect(() => {
    if (focusBeadId) {
      setLocalSelectedId(focusBeadId);
      setFocusEnabled(true);
    }
  }, [focusBeadId]);

  const activeId = localSelectedId ?? selectedBeadId;
  // The neighborhood root only matters when Focus is on. Gating on this (rather
  // than activeId directly) keeps the visible set identity stable when merely
  // selecting a node with Focus off — so a plain click doesn't relayout/refit.
  const focusRoot = focusEnabled ? activeId : null;

  // The candidate beads the graph draws from: the whole board, or — when the
  // Filtered toggle is on and we have a filter slice — just the matching beads.
  // Everything downstream (visible set, layout, neighborhood) works off this.
  const filterActive = filterEnabled && filteredBeadIds != null;
  const beads: Bead[] = useMemo(() => {
    const all = graph?.nodes ?? [];
    if (!filterActive) return all;
    const allowed = new Set(filteredBeadIds);
    return all.filter((b) => allowed.has(b.id));
  }, [graph, filterActive, filteredBeadIds]);
  const layoutEdges: LayoutEdge[] = useMemo(
    () => (graph?.edges ?? []).map((e) => ({ from: e.from, to: e.to })),
    [graph],
  );

  // Which beads are visible (focus neighborhood vs the whole board), as a stable
  // content key. Keying on the sorted id list (not the Set identity) means
  // selecting another node *within the same focused neighborhood* doesn't
  // produce a new set — so it never triggers a needless relayout/refit/zoom.
  const visibleKey = useMemo(() => {
    const allIds = beads.map((b) => b.id);
    if (focusRoot) {
      const hood = neighborhood(focusRoot, allIds, layoutEdges);
      if (hood.size > 0) return [...hood].sort().join(",");
    }
    return [...allIds].sort().join(",");
  }, [beads, layoutEdges, focusRoot]);

  const visibleIds = useMemo(
    () => new Set(visibleKey ? visibleKey.split(",") : []),
    [visibleKey],
  );

  // Layout positions — recomputed only when the visible graph or mode changes.
  const positioned = useMemo(() => {
    const ids = beads.filter((b) => visibleIds.has(b.id)).map((b) => b.id);
    const edges = layoutEdges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));
    const positions = mode === "layered" ? layeredLayout(ids, edges) : forceLayout(ids, edges, layoutSeed);
    return { ids: new Set(ids), positions };
  }, [beads, layoutEdges, visibleIds, mode, layoutSeed]);

  // Nodes never dim — hovering only emphasizes the hovered node's own edges, so
  // the board stays fully visible as the mouse moves.
  const computedNodes: Node<BeadNodeData>[] = useMemo(() => {
    return beads
      .filter((b) => positioned.ids.has(b.id))
      .map((bead) => ({
        id: bead.id,
        type: "bead",
        position: positioned.positions.get(bead.id) ?? { x: 0, y: 0 },
        selected: bead.id === activeId,
        data: { bead, dimmed: false },
      }));
  }, [beads, positioned, activeId]);

  const computedEdges: Edge[] = useMemo(() => {
    return (graph?.edges ?? [])
      .filter((e) => positioned.ids.has(e.from) && positioned.ids.has(e.to))
      .map((e) => {
        const st = edgeStyle(e.type);
        const incident = hoveredId != null && (e.from === hoveredId || e.to === hoveredId);
        const baseWidth = st.bold ? 2.5 : 1.5;
        return {
          id: `${e.from}->${e.to}:${e.type}`,
          source: e.from,
          target: e.to,
          style: {
            stroke: st.color,
            strokeWidth: incident ? baseWidth + 1.5 : baseWidth,
            strokeDasharray: st.dashed ? "6 4" : undefined,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: st.color },
        } satisfies Edge;
      });
  }, [graph, positioned, hoveredId]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<BeadNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => setNodes(computedNodes), [computedNodes, setNodes]);
  useEffect(() => setEdges(computedEdges), [computedEdges, setEdges]);

  // Auto Layout: in force mode, seed a fresh variant; in layered mode (canonical
  // shape) just re-apply the computed layout, discarding manual drags. Either
  // way the positioned memo recomputes → nodes reset → refit.
  const autoLayout = useCallback(() => {
    if (mode === "force") {
      setLayoutSeed((s) => s + 1);
    } else {
      setNodes(computedNodes);
    }
    requestAnimationFrame(() => rf.fitView({ padding: 0.2, duration: 200 }));
  }, [mode, computedNodes, setNodes, rf]);

  // Click gesture router: React Flow fires click + dblclick on every press, so
  // count clicks within a short window and act once it settles — 1 = select,
  // 2 = Show Details (sidebar), 3 = open in an editor tab.
  const clickRef = useRef<{ id: string; count: number; timer: ReturnType<typeof setTimeout> | null }>({
    id: "",
    count: 0,
    timer: null,
  });
  const handleNodeClick = useCallback(
    (id: string) => {
      setLocalSelectedId(id); // immediate selection feedback on the first click
      const c = clickRef.current;
      if (c.id !== id) {
        c.id = id;
        c.count = 0;
      }
      c.count += 1;
      if (c.timer) clearTimeout(c.timer);
      c.timer = setTimeout(() => {
        const n = c.count;
        c.count = 0;
        c.id = "";
        c.timer = null;
        if (n >= 3) vscode.postMessage({ type: "openBeadInTab", beadId: id });
        else if (n === 2) onOpenBead(id);
      }, 320);
    },
    [onOpenBead],
  );

  useEffect(() => () => {
    if (clickRef.current.timer) clearTimeout(clickRef.current.timer);
  }, []);

  // Edge creation: stash the connection on a valid drop, then open the picker
  // at the pointer once the gesture ends.
  const onConnect = useCallback((c: Connection) => {
    if (c.source && c.target && c.source !== c.target) {
      pendingConn.current = { source: c.source, target: c.target };
    }
  }, []);
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    const pc = pendingConn.current;
    pendingConn.current = null;
    if (!pc) return;
    const point = "changedTouches" in event ? event.changedTouches[0] : event;
    setConnMenu({ x: point.clientX, y: point.clientY, source: pc.source, target: pc.target });
  }, []);
  // Create the dependency the user drew. The provider re-pushes the graph, so
  // the authoritative edge replaces nothing optimistic — just close the picker.
  const createDependency = useCallback(
    (source: string, target: string, type: (typeof CONNECT_DEP_OPTIONS)[number]["type"]) => {
      vscode.postMessage({ type: "addDependency", ...connectionToAddDependency(source, target, type) });
      setConnMenu(null);
    },
    [],
  );
  const removeDependency = useCallback((source: string, target: string) => {
    vscode.postMessage({ type: "removeDependency", beadId: source, dependsOnId: target });
    setEdgeMenu(null);
  }, []);

  // Refit the viewport whenever the visible set or layout changes — otherwise
  // a focus-narrowed subgraph (or a layout swap) can land off-screen.
  useEffect(() => {
    const raf = requestAnimationFrame(() => rf.fitView({ padding: 0.2, duration: 200 }));
    return () => cancelAnimationFrame(raf);
  }, [rf, mode, visibleIds]);

  const hasFocusTarget = Boolean(activeId);

  return (
    <div className="graph-view">
      <div className="graph-toolbar">
        <div className="graph-layout-toggle" role="radiogroup" aria-label="Graph layout">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "layered"}
            className={`graph-toggle-btn ${mode === "layered" ? "active" : ""}`}
            onClick={() => setMode("layered")}
            title="Layered (hierarchical) layout"
          >
            <GitBranch size={14} strokeWidth={2} />
            <span>Layered</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "force"}
            className={`graph-toggle-btn ${mode === "force" ? "active" : ""}`}
            onClick={() => setMode("force")}
            title="Force-directed (freeform) layout"
          >
            <Network size={14} strokeWidth={2} />
            <span>Force</span>
          </button>
        </div>
        <button
          type="button"
          className={`graph-toggle-btn ${focusEnabled ? "active" : ""}`}
          onClick={() => setFocusEnabled((v) => !v)}
          disabled={!hasFocusTarget}
          title={
            hasFocusTarget
              ? "Show only the selected bead's dependency neighborhood"
              : "Select a bead to focus its neighborhood"
          }
        >
          <Crosshair size={14} strokeWidth={2} />
          <span>Focus</span>
        </button>
        <button
          type="button"
          className={`graph-toggle-btn ${filterActive ? "active" : ""}`}
          onClick={() => setFilterEnabled((v) => !v)}
          disabled={filteredBeadIds == null}
          title={
            filteredBeadIds == null
              ? "Open the Issues tab and set a filter to scope the graph"
              : "Scope the graph to the current Issues filter"
          }
        >
          <Filter size={14} strokeWidth={2} />
          <span>Filtered</span>
        </button>
        <button
          type="button"
          className="graph-toggle-btn"
          onClick={autoLayout}
          title={
            mode === "force"
              ? "Shuffle a new force-layout variant and fit to view"
              : "Re-apply the layout and fit to view (resets manual drags)"
          }
        >
          <Wand2 size={14} strokeWidth={2} />
          <span>Auto Layout</span>
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onNodeClick={(_, node) => handleNodeClick(node.id)}
        onNodeMouseEnter={(_, node) => setHoveredId(node.id)}
        onNodeMouseLeave={() => setHoveredId(null)}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY, bead: (node.data as BeadNodeData).bead });
        }}
        onEdgeClick={(event, edge) => {
          event.stopPropagation();
          setEdgeMenu({ x: event.clientX, y: event.clientY, source: edge.source, target: edge.target });
        }}
        onPaneClick={closeMenus}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => STATUS_COLORS[(n.data as BeadNodeData).bead.status] || "#888888"}
          nodeStrokeColor="var(--vscode-contrastBorder, transparent)"
          nodeStrokeWidth={3}
          nodeBorderRadius={3}
          maskColor="rgba(0, 0, 0, 0.45)"
        />
        <GraphLegend />
      </ReactFlow>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={buildMenuItems(menu.bead, focusEnabled, {
            onFocus: () => {
              setLocalSelectedId(menu.bead.id);
              setFocusEnabled(true);
            },
            onUnfocus: () => setFocusEnabled(false),
          })}
        />
      )}
      {connMenu && (
        <ContextMenu
          x={connMenu.x}
          y={connMenu.y}
          onClose={() => setConnMenu(null)}
          items={CONNECT_DEP_OPTIONS.map((opt) => ({
            label: opt.label,
            onSelect: () => createDependency(connMenu.source, connMenu.target, opt.type),
          }))}
        />
      )}
      {edgeMenu && (
        <ContextMenu
          x={edgeMenu.x}
          y={edgeMenu.y}
          onClose={() => setEdgeMenu(null)}
          items={[
            {
              label: "Remove dependency",
              onSelect: () => removeDependency(edgeMenu.source, edgeMenu.target),
            },
          ]}
        />
      )}
    </div>
  );
}

function buildMenuItems(
  bead: Bead,
  focusEnabled: boolean,
  handlers: { onFocus: () => void; onUnfocus: () => void },
): ContextMenuItem[] {
  return [
    focusEnabled
      ? { label: "Unfocus", onSelect: handlers.onUnfocus }
      : { label: "Focus", onSelect: handlers.onFocus },
    {
      label: "Open Details (editor tab)",
      separatorBefore: true,
      onSelect: () => vscode.postMessage({ type: "openBeadInTab", beadId: bead.id }),
    },
    {
      label: "Show Details",
      onSelect: () => vscode.postMessage({ type: "openBeadDetails", beadId: bead.id }),
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

function GraphLegend(): React.ReactElement {
  return (
    <div className="graph-legend">
      {EDGE_TYPE_ORDER.map((type) => {
        const st = EDGE_STYLES[type];
        return (
          <div key={type} className="graph-legend-row">
            <span
              className="graph-legend-line"
              style={{
                borderTopColor: st.color,
                borderTopWidth: st.bold ? 3 : 2,
                borderTopStyle: st.dashed ? "dashed" : "solid",
              }}
            />
            <span className="graph-legend-label">{st.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function GraphView(props: GraphViewProps): React.ReactElement {
  const { graph, loading, error, onRequestGraph, onRetry } = props;

  // Lazily ask the provider for the dependency graph when this tab mounts.
  useEffect(() => {
    onRequestGraph();
  }, [onRequestGraph]);

  if (error) {
    return <ErrorMessage message={error} onRetry={onRetry} />;
  }
  if (!graph && loading) {
    return <Loading />;
  }
  if (graph && graph.nodes.length === 0) {
    return <div className="graph-empty">No beads to graph.</div>;
  }

  return (
    <ReactFlowProvider>
      <GraphCanvas
        graph={graph}
        selectedBeadId={props.selectedBeadId}
        focusBeadId={props.focusBeadId}
        filteredBeadIds={props.filteredBeadIds}
        onOpenBead={props.onOpenBead}
      />
    </ReactFlowProvider>
  );
}
