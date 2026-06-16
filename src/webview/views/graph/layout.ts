/**
 * Pure graph-layout helpers for the dependency Graph view. Each takes the node
 * ids + edges and returns a position per node. No React, no DOM — deterministic
 * and unit-testable (d3-force seeds via phyllotaxis, not RNG).
 *
 * Edge direction follows the { from: dependent, to: dependency } convention
 * from the backend; layered layout ranks `from` above `to` (matching the
 * `bd … --format dot` Graphviz output).
 */

import dagre from "dagre";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
} from "d3-force";

export interface LayoutEdge {
  from: string;
  to: string;
}

export interface Point {
  x: number;
  y: number;
}

export type Positions = Map<string, Point>;

// Card footprint — kept in sync with BeadNode's CSS so layouts leave room.
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 88;

/** Keep only edges whose endpoints are both present (and not self-loops). */
function validEdges(ids: ReadonlySet<string>, edges: LayoutEdge[]): LayoutEdge[] {
  return edges.filter((e) => e.from !== e.to && ids.has(e.from) && ids.has(e.to));
}

/** Layered DAG layout (dagre). Handles cycles, orphans, and empty input. */
export function layeredLayout(
  nodeIds: string[],
  edges: LayoutEdge[],
  direction: "TB" | "LR" = "TB",
): Positions {
  const positions: Positions = new Map();
  if (nodeIds.length === 0) return positions;

  const ids = new Set(nodeIds);
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 70, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const id of nodeIds) {
    g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of validEdges(ids, edges)) {
    g.setEdge(e.from, e.to);
  }

  dagre.layout(g);

  for (const id of nodeIds) {
    const node = g.node(id);
    // dagre returns the node center; React Flow positions by top-left corner.
    positions.set(id, { x: node.x - NODE_WIDTH / 2, y: node.y - NODE_HEIGHT / 2 });
  }
  return positions;
}

interface ForceNode extends SimulationNodeDatum {
  id: string;
}

/** Force-directed (freeform) layout (d3-force), run to a fixed settled state. */
export function forceLayout(nodeIds: string[], edges: LayoutEdge[]): Positions {
  const positions: Positions = new Map();
  if (nodeIds.length === 0) return positions;

  const ids = new Set(nodeIds);
  const nodes: ForceNode[] = nodeIds.map((id) => ({ id }));
  const links = validEdges(ids, edges).map((e) => ({ source: e.from, target: e.to }));

  const simulation = forceSimulation(nodes)
    .force("link", forceLink(links).id((d) => (d as ForceNode).id).distance(160).strength(0.5))
    .force("charge", forceManyBody().strength(-600))
    .force("center", forceCenter(0, 0))
    .force("collide", forceCollide(Math.max(NODE_WIDTH, NODE_HEIGHT) / 2 + 12))
    .stop();

  // Run the simulation synchronously to a deterministic settled state.
  const iterations = Math.max(120, Math.min(400, nodes.length * 12));
  for (let i = 0; i < iterations; i++) simulation.tick();

  for (const node of nodes) {
    positions.set(node.id, { x: node.x ?? 0, y: node.y ?? 0 });
  }
  return positions;
}
