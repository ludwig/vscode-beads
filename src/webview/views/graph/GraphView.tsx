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

import React, { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import { GitBranch, Network, Crosshair } from "lucide-react";
import { Bead, DependencyGraph, STATUS_COLORS } from "../../types";
import { Loading } from "../../common/Loading";
import { ErrorMessage } from "../../common/ErrorMessage";
import { BeadNode, type BeadNodeData } from "./BeadNode";
import { layeredLayout, forceLayout, type LayoutEdge } from "./layout";
import { edgeStyle, neighborhood, EDGE_TYPE_ORDER, EDGE_STYLES } from "./graphModel";

type LayoutMode = "layered" | "force";

interface GraphViewProps {
  graph: DependencyGraph | null;
  loading: boolean;
  error: string | null;
  selectedBeadId: string | null;
  /** A bead to focus the neighborhood on (e.g. from a "View in graph" action). */
  focusBeadId: string | null;
  onSelectBead: (beadId: string) => void;
  onOpenBead: (beadId: string) => void;
  onRequestGraph: () => void;
  onRetry: () => void;
}

const nodeTypes = { bead: BeadNode };

function GraphCanvas({
  graph,
  selectedBeadId,
  focusBeadId,
  onSelectBead,
  onOpenBead,
}: Omit<GraphViewProps, "loading" | "error" | "onRequestGraph" | "onRetry">): React.ReactElement {
  const [mode, setMode] = useState<LayoutMode>("layered");
  const [focusEnabled, setFocusEnabled] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // A "view in graph" target arrives → focus on it automatically.
  useEffect(() => {
    if (focusBeadId) setFocusEnabled(true);
  }, [focusBeadId]);

  const beads: Bead[] = useMemo(() => graph?.nodes ?? [], [graph]);
  const layoutEdges: LayoutEdge[] = useMemo(
    () => (graph?.edges ?? []).map((e) => ({ from: e.from, to: e.to })),
    [graph],
  );

  // Which beads are visible (focus neighborhood vs the whole board).
  const visibleIds = useMemo(() => {
    const allIds = beads.map((b) => b.id);
    const root = focusBeadId ?? selectedBeadId;
    if (focusEnabled && root) {
      const hood = neighborhood(root, allIds, layoutEdges);
      if (hood.size > 0) return hood;
    }
    return new Set(allIds);
  }, [beads, layoutEdges, focusEnabled, focusBeadId, selectedBeadId]);

  // Layout positions — recomputed only when the visible graph or mode changes.
  const positioned = useMemo(() => {
    const ids = beads.filter((b) => visibleIds.has(b.id)).map((b) => b.id);
    const edges = layoutEdges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));
    const positions = mode === "layered" ? layeredLayout(ids, edges) : forceLayout(ids, edges);
    return { ids: new Set(ids), positions };
  }, [beads, layoutEdges, visibleIds, mode]);

  // Highlight a hovered node's neighborhood; dim the rest.
  const highlightSet = useMemo(() => {
    if (!hoveredId) return null;
    return neighborhood(hoveredId, [...positioned.ids], layoutEdges);
  }, [hoveredId, positioned.ids, layoutEdges]);

  const computedNodes: Node<BeadNodeData>[] = useMemo(() => {
    return beads
      .filter((b) => positioned.ids.has(b.id))
      .map((bead) => ({
        id: bead.id,
        type: "bead",
        position: positioned.positions.get(bead.id) ?? { x: 0, y: 0 },
        selected: bead.id === selectedBeadId,
        data: { bead, dimmed: highlightSet ? !highlightSet.has(bead.id) : false },
      }));
  }, [beads, positioned, selectedBeadId, highlightSet]);

  const computedEdges: Edge[] = useMemo(() => {
    return (graph?.edges ?? [])
      .filter((e) => positioned.ids.has(e.from) && positioned.ids.has(e.to))
      .map((e) => {
        const st = edgeStyle(e.type);
        const lit = !highlightSet || (highlightSet.has(e.from) && highlightSet.has(e.to));
        return {
          id: `${e.from}->${e.to}:${e.type}`,
          source: e.from,
          target: e.to,
          style: {
            stroke: st.color,
            strokeWidth: st.bold ? 2.5 : 1.5,
            strokeDasharray: st.dashed ? "6 4" : undefined,
            opacity: lit ? 1 : 0.15,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: st.color },
        } satisfies Edge;
      });
  }, [graph, positioned, highlightSet]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<BeadNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => setNodes(computedNodes), [computedNodes, setNodes]);
  useEffect(() => setEdges(computedEdges), [computedEdges, setEdges]);

  const hasFocusTarget = Boolean(focusBeadId ?? selectedBeadId);

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
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onSelectBead(node.id)}
        onNodeDoubleClick={(_, node) => onOpenBead(node.id)}
        onNodeMouseEnter={(_, node) => setHoveredId(node.id)}
        onNodeMouseLeave={() => setHoveredId(null)}
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
        />
        <GraphLegend />
      </ReactFlow>
    </div>
  );
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
        onSelectBead={props.onSelectBead}
        onOpenBead={props.onOpenBead}
      />
    </ReactFlowProvider>
  );
}
