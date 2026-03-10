import { DISCIPLINE_COLORS, EDGE_PARTICLE_COLORS } from "@/lib/constants";
import type { NodeData, EdgeData } from "@/lib/graph/types";

const VALID_DISCIPLINES = new Set(Object.keys(DISCIPLINE_COLORS));
const VALID_EDGE_TYPES = new Set(Object.keys(EDGE_PARTICLE_COLORS));

function validateNodes(raw: unknown[]): NodeData[] {
  return raw.map((item, i) => {
    const node = item as Record<string, unknown>;
    if (
      typeof node.id !== "string" ||
      typeof node.name !== "string" ||
      typeof node.discipline !== "string" ||
      typeof node.chapter !== "string" ||
      typeof node.degree !== "number" ||
      typeof node.summary !== "string"
    ) {
      throw new Error(`Invalid node at index ${i}: missing or malformed fields`);
    }
    if (!VALID_DISCIPLINES.has(node.discipline)) {
      throw new Error(`Invalid discipline "${node.discipline}" on node ${node.id}`);
    }
    return node as unknown as NodeData;
  });
}

function validateEdges(raw: unknown[], nodeIds: Set<string>): EdgeData[] {
  return raw.map((item, i) => {
    const edge = item as Record<string, unknown>;
    if (
      typeof edge.source !== "string" ||
      typeof edge.target !== "string" ||
      typeof edge.type !== "string" ||
      typeof edge.strength !== "number"
    ) {
      throw new Error(`Invalid edge at index ${i}: missing or malformed fields`);
    }
    if (!nodeIds.has(edge.source)) {
      throw new Error(`Edge ${i}: unknown source node "${edge.source}"`);
    }
    if (!nodeIds.has(edge.target)) {
      throw new Error(`Edge ${i}: unknown target node "${edge.target}"`);
    }
    if (!VALID_EDGE_TYPES.has(edge.type)) {
      throw new Error(`Edge ${i}: unknown edge type "${edge.type}"`);
    }
    return edge as unknown as EdgeData;
  });
}

export interface GraphData {
  nodes: NodeData[];
  edges: EdgeData[];
}

export async function loadGraphData(): Promise<GraphData> {
  const [nodesRes, edgesRes] = await Promise.all([
    fetch("/data/nodes.json"),
    fetch("/data/edges.json"),
  ]);

  if (!nodesRes.ok) throw new Error(`Failed to fetch nodes.json: ${nodesRes.status}`);
  if (!edgesRes.ok) throw new Error(`Failed to fetch edges.json: ${edgesRes.status}`);

  const rawNodes = await nodesRes.json();
  const rawEdges = await edgesRes.json();

  if (!Array.isArray(rawNodes)) throw new Error("nodes.json is not an array");
  if (!Array.isArray(rawEdges)) throw new Error("edges.json is not an array");

  const nodes = validateNodes(rawNodes);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = validateEdges(rawEdges, nodeIds);

  return { nodes, edges };
}
