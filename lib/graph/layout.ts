import {
  forceSimulation,
  forceCenter,
  forceManyBody,
  forceLink,
} from "d3-force-3d";
import type { NodeData, EdgeData, LayoutNode, NodePosition } from "@/lib/graph/types";
import { NODE_MIN_RADIUS, NODE_MAX_RADIUS } from "@/lib/constants";

const CACHE_KEY = "lattice-layout-v4";
const SIM_ITERATIONS = 300;

interface SimNode {
  index?: number;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  id: string;
  discipline: string;
}

interface SimLink {
  source: string;
  target: string;
  edgeStrength: number;
}

interface CachedLayout {
  positions: Record<string, NodePosition>;
  version: string;
  nodeCount: number;
}

function computeRadius(degree: number, maxDegree: number): number {
  // Power curve: low-degree nodes stay small, high-degree hubs grow large
  const t = maxDegree > 0 ? degree / maxDegree : 0;
  return NODE_MIN_RADIUS + Math.pow(t, 0.4) * (NODE_MAX_RADIUS - NODE_MIN_RADIUS);
}

function getCachedLayout(nodeCount: number): Record<string, NodePosition> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedLayout = JSON.parse(raw);
    if (cached.version !== CACHE_KEY || cached.nodeCount !== nodeCount) return null;
    return cached.positions;
  } catch {
    return null;
  }
}

function setCachedLayout(positions: Record<string, NodePosition>, nodeCount: number): void {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedLayout = {
      positions,
      version: CACHE_KEY,
      nodeCount,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // localStorage full or unavailable
  }
}

function safeNum(v: number | undefined): number {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

export function computeLayout(
  nodes: NodeData[],
  edges: EdgeData[],
  onProgress?: (count: number) => void,
): LayoutNode[] {
  // Check cache first
  const maxDegree = Math.max(...nodes.map((n) => n.degree), 1);

  const cached = getCachedLayout(nodes.length);
  if (cached) {
    return nodes.map((node) => ({
      ...node,
      position: cached[node.id] ?? { x: 0, y: 0, z: 0 },
      radius: computeRadius(node.degree, maxDegree),
    }));
  }

  // Build simulation nodes — let d3 assign initial positions
  const simNodes: SimNode[] = nodes.map((n) => ({
    id: n.id,
    discipline: n.discipline,
  }));

  // Build simulation links — use 'edgeStrength' to avoid conflict with d3's 'strength'
  const simLinks: SimLink[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
    edgeStrength: e.strength,
  }));

  // Create link force first, configure id before adding to simulation
  const linkForce = forceLink<SimNode>(simLinks)
    .id((d: SimNode) => d.id)
    .distance(15)
    .strength((link: { edgeStrength: number }) => link.edgeStrength * 0.3);

  // Pass numDimensions=3 as constructor arg to ensure all forces initialize in 3D
  const simulation = forceSimulation<SimNode>(simNodes, 3)
    .force("center", forceCenter<SimNode>(0, 0, 0))
    .force("charge", forceManyBody<SimNode>().strength(-30).distanceMax(200))
    .force("link", linkForce)
    .stop();

  // Run simulation synchronously
  for (let i = 0; i < SIM_ITERATIONS; i++) {
    simulation.tick();
    if (onProgress && i % 10 === 0) {
      onProgress(Math.floor((i / SIM_ITERATIONS) * nodes.length));
    }
  }

  // Extract final positions with NaN guards
  const finalNodes = simulation.nodes();
  const positions: Record<string, NodePosition> = {};

  for (const sn of finalNodes) {
    positions[sn.id] = {
      x: safeNum(sn.x),
      y: safeNum(sn.y),
      z: safeNum(sn.z),
    };
  }

  // Cache for next load
  setCachedLayout(positions, nodes.length);

  if (onProgress) onProgress(nodes.length);

  return nodes.map((node) => ({
    ...node,
    position: positions[node.id] ?? { x: 0, y: 0, z: 0 },
    radius: computeRadius(node.degree, maxDegree),
  }));
}
