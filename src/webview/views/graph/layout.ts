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
import { hierarchy as d3hierarchy, tree as d3tree } from "d3-hierarchy";

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

// Spacing between grid-packed orphan cards.
const GRID_GAP_X = 28;
const GRID_GAP_Y = 24;
// Vertical gap between the connected DAG and the orphan grid below it.
const ORPHAN_BLOCK_GAP = 60;

/**
 * Layered DAG layout (dagre) for the connected beads, with edgeless "orphan"
 * beads packed into a compact grid below — instead of dagre stringing every
 * disconnected node into one very wide top row. Handles cycles and empty input.
 */
export function layeredLayout(
  nodeIds: string[],
  edges: LayoutEdge[],
  direction: "TB" | "LR" = "TB",
): Positions {
  const positions: Positions = new Map();
  if (nodeIds.length === 0) return positions;

  const ids = new Set(nodeIds);
  const valid = validEdges(ids, edges);

  // Split connected (has at least one edge) from orphan (edgeless) nodes.
  const connected = new Set<string>();
  for (const e of valid) {
    connected.add(e.from);
    connected.add(e.to);
  }
  const connectedIds = nodeIds.filter((id) => connected.has(id));
  const orphanIds = nodeIds.filter((id) => !connected.has(id));

  // Lay out the connected sub-graph with dagre. Track its extent so the orphan
  // grid can sit directly beneath it.
  let connectedBottom = 0;
  let connectedRight = NODE_WIDTH;
  if (connectedIds.length > 0) {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: direction, nodesep: 40, ranksep: 70, marginx: 20, marginy: 20 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const id of connectedIds) {
      g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
    for (const e of valid) {
      g.setEdge(e.from, e.to);
    }
    dagre.layout(g);
    for (const id of connectedIds) {
      const node = g.node(id);
      // dagre returns the node center; React Flow positions by top-left corner.
      const x = node.x - NODE_WIDTH / 2;
      const y = node.y - NODE_HEIGHT / 2;
      positions.set(id, { x, y });
      connectedBottom = Math.max(connectedBottom, y + NODE_HEIGHT);
      connectedRight = Math.max(connectedRight, x + NODE_WIDTH);
    }
  }

  // Pack orphans into a roughly-square grid whose width tracks the connected
  // graph's width (so the whole thing stays compact rather than sprawling).
  if (orphanIds.length > 0) {
    const widthBudget = connectedIds.length > 0 ? connectedRight : 0;
    const colsByWidth = Math.floor((widthBudget + GRID_GAP_X) / (NODE_WIDTH + GRID_GAP_X));
    // At least a square grid, but widen to fill the connected graph's width so
    // the orphan block sits compactly beneath it instead of as a tall column.
    const sqrtCols = Math.ceil(Math.sqrt(orphanIds.length));
    const cols = Math.max(1, colsByWidth, sqrtCols);
    const startY = connectedIds.length > 0 ? connectedBottom + ORPHAN_BLOCK_GAP : 20;
    orphanIds.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions.set(id, {
        x: 20 + col * (NODE_WIDTH + GRID_GAP_X),
        y: startY + row * (NODE_HEIGHT + GRID_GAP_Y),
      });
    });
  }

  return positions;
}

interface ForceNode extends SimulationNodeDatum {
  id: string;
}

/** Small deterministic PRNG so a given seed reproduces the same variant. */
function mulberry32(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Force-directed (freeform) layout (d3-force), run to a fixed settled state.
 * `seed` jitters the starting positions so each value yields a distinct but
 * reproducible variant (seed 0 = the canonical deterministic arrangement).
 */
export function forceLayout(nodeIds: string[], edges: LayoutEdge[], seed = 0): Positions {
  const positions: Positions = new Map();
  if (nodeIds.length === 0) return positions;

  const ids = new Set(nodeIds);
  const rand = mulberry32(seed);
  const spread = Math.max(200, nodeIds.length * 30);
  // Seed 0 leaves positions unset (d3's deterministic phyllotaxis); any other
  // seed scatters the start so the simulation settles to a different variant.
  const nodes: ForceNode[] = nodeIds.map((id) =>
    seed === 0 ? { id } : { id, x: (rand() - 0.5) * spread, y: (rand() - 0.5) * spread },
  );
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

interface HierNode {
  id: string;
  children: HierNode[];
}

/**
 * Build a parent/child forest from `hierEdges` (already filtered to the
 * hierarchy relation; convention from=child, to=parent). First parent wins;
 * back-edges are skipped (cycle guard). `participating` is every node that has
 * a parent or a child — the rest are isolated and handled as orphans.
 */
function buildHierarchy(
  nodeIds: string[],
  hierEdges: LayoutEdge[],
): { roots: HierNode[]; participating: Set<string> } {
  const ids = new Set(nodeIds);
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  for (const e of hierEdges) {
    const child = e.from;
    const parent = e.to;
    if (child === parent || !ids.has(child) || !ids.has(parent)) continue;
    if (parentOf.has(child)) continue; // first parent wins
    parentOf.set(child, parent);
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent)!.push(child);
  }
  const participating = new Set<string>([...parentOf.keys(), ...childrenOf.keys()]);
  const build = (id: string, ancestry: Set<string>): HierNode => {
    const kids = (childrenOf.get(id) ?? []).filter((c) => !ancestry.has(c)); // cycle guard
    const next = new Set(ancestry).add(id);
    return { id, children: kids.map((c) => build(c, next)) };
  };
  const roots = nodeIds
    .filter((id) => participating.has(id) && !parentOf.has(id))
    .map((id) => build(id, new Set()));
  return { roots, participating };
}

/** Pack a list of ids into a grid starting at (20, startY). */
function gridPack(ids: string[], startY: number, positions: Positions): void {
  if (ids.length === 0) return;
  const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
  ids.forEach((id, i) => {
    positions.set(id, {
      x: 20 + (i % cols) * (NODE_WIDTH + GRID_GAP_X),
      y: startY + Math.floor(i / cols) * (NODE_HEIGHT + GRID_GAP_Y),
    });
  });
}

const RANK_GAP = 70; // vertical gap between tree depths
const RADIAL_RING_GAP = NODE_WIDTH + 40; // radius added per depth

/**
 * Tidy-tree (Reingold–Tilford, via d3-hierarchy) layout of the parent/child
 * forest. Isolated beads (no parent-child edge) are gridded below. `hierEdges`
 * must already be filtered to the parent-child relation.
 */
export function treeLayout(nodeIds: string[], hierEdges: LayoutEdge[]): Positions {
  const positions: Positions = new Map();
  if (nodeIds.length === 0) return positions;

  const { roots } = buildHierarchy(nodeIds, hierEdges);

  let bottom = 0;
  if (roots.length > 0) {
    const layout = d3tree<HierNode>().nodeSize([NODE_WIDTH + GRID_GAP_X, NODE_HEIGHT + RANK_GAP]);
    const root = layout(d3hierarchy<HierNode>({ id: "__virtual__", children: roots }, (d) => d.children));
    const reals = root.descendants().filter((n) => n.data.id !== "__virtual__");
    // d3 places the virtual super-root one level above the real roots; normalize
    // so the topmost real node sits at the margin (x and y both >= 20).
    const minX = Math.min(...reals.map((n) => n.x));
    const minY = Math.min(...reals.map((n) => n.y));
    for (const n of reals) {
      const x = n.x - minX + 20;
      const y = n.y - minY + 20;
      positions.set(n.data.id, { x, y });
      bottom = Math.max(bottom, y + NODE_HEIGHT);
    }
  }

  // Grid anything the tree didn't place — isolated beads AND any node stranded
  // by a parent-child cycle (every node has a parent, so there's no root).
  const orphans = nodeIds.filter((id) => !positions.has(id));
  gridPack(orphans, positions.size > orphans.length ? bottom + ORPHAN_BLOCK_GAP : 20, positions);
  return positions;
}

/**
 * Radial tidy-tree layout (d3-hierarchy): roots near the center, descendants
 * fanning outward by depth. Isolated beads are gridded below the disc.
 * `hierEdges` must already be filtered to the parent-child relation.
 */
export function radialLayout(nodeIds: string[], hierEdges: LayoutEdge[]): Positions {
  const positions: Positions = new Map();
  if (nodeIds.length === 0) return positions;

  const { roots } = buildHierarchy(nodeIds, hierEdges);

  let bottom = 0;
  let maxR = 0;
  if (roots.length > 0) {
    const hier = d3hierarchy<HierNode>({ id: "__virtual__", children: roots }, (d) => d.children);
    const depth = Math.max(1, hier.height);
    const radius = depth * RADIAL_RING_GAP;
    const root = d3tree<HierNode>().size([2 * Math.PI, radius])(hier);
    const reals = root.descendants().filter((n) => n.data.id !== "__virtual__");
    // Polar (x = angle, y = radius) → cartesian, centered then shifted positive.
    const pts = reals.map((n) => {
      const angle = n.x;
      const r = n.y;
      maxR = Math.max(maxR, r);
      return { id: n.data.id, px: r * Math.cos(angle), py: r * Math.sin(angle) };
    });
    for (const p of pts) {
      const x = p.px + maxR + 20;
      const y = p.py + maxR + 20;
      positions.set(p.id, { x, y });
      bottom = Math.max(bottom, y + NODE_HEIGHT);
    }
  }

  const orphans = nodeIds.filter((id) => !positions.has(id));
  gridPack(orphans, positions.size > orphans.length ? bottom + ORPHAN_BLOCK_GAP : 20, positions);
  return positions;
}
