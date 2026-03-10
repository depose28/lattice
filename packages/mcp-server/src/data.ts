import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// --- Types ---

export interface Node {
  id: string;
  name: string;
  discipline: string;
  chapter: string;
  degree: number;
  summary: string;
}

export interface Edge {
  source: string;
  target: string;
  type: string;
  strength: number;
  label: string;
}

export const EDGE_TYPES = [
  "complementary",
  "structural_kinship",
  "tensioning",
  "prerequisite",
  "inversion",
  "cross_discipline_tfidf",
  "same_discipline_tfidf",
  "same_chapter",
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];

// --- Data loading ---

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

const nodes: Node[] = JSON.parse(
  readFileSync(join(dataDir, "nodes.json"), "utf-8")
);
const edges: Edge[] = JSON.parse(
  readFileSync(join(dataDir, "edges.json"), "utf-8")
);

// --- Indexes ---

const nodeById = new Map<string, Node>();
for (const node of nodes) {
  nodeById.set(node.id, node);
}

// Adjacency: for each node id, list of { neighborId, edge }
interface Connection {
  neighborId: string;
  edge: Edge;
}

const adjacency = new Map<string, Connection[]>();
for (const edge of edges) {
  if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
  if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
  adjacency.get(edge.source)!.push({ neighborId: edge.target, edge });
  adjacency.get(edge.target)!.push({ neighborId: edge.source, edge });
}

// Search index: lowercase name + summary for each node
const searchIndex = nodes.map((n) => ({
  node: n,
  text: `${n.name.toLowerCase()} ${n.summary.toLowerCase()}`,
  nameLower: n.name.toLowerCase(),
}));

// --- Query functions ---

export function searchModels(query: string, limit = 10): Node[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const scored: Array<{ node: Node; score: number }> = [];

  for (const entry of searchIndex) {
    let score = 0;
    let allTermsMatch = true;

    for (const term of terms) {
      const nameIdx = entry.nameLower.indexOf(term);
      const textIdx = entry.text.indexOf(term);

      if (textIdx === -1) {
        allTermsMatch = false;
        break;
      }

      // Name matches score higher than summary matches
      if (nameIdx !== -1) {
        score += 10;
        // Exact start-of-word bonus
        if (nameIdx === 0 || entry.nameLower[nameIdx - 1] === " ") {
          score += 5;
        }
      } else {
        score += 1;
      }
    }

    if (!allTermsMatch) continue;

    // Bonus for shorter names (more specific matches)
    score += Math.max(0, 5 - entry.node.name.length / 10);
    // Bonus for higher degree (more connected = more important)
    score += entry.node.degree / 20;

    scored.push({ node: entry.node, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.node);
}

export function getModel(id: string): Node | undefined {
  return nodeById.get(id);
}

export function getConnections(
  id: string
): Array<{ neighbor: Node; edgeType: string; strength: number }> {
  const conns = adjacency.get(id);
  if (!conns) return [];

  return conns
    .map((c) => {
      const neighbor = nodeById.get(c.neighborId);
      if (!neighbor) return null;
      return {
        neighbor,
        edgeType: c.edge.type,
        strength: c.edge.strength,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => b.strength - a.strength);
}

export function listDisciplines(): Array<{
  discipline: string;
  count: number;
}> {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    counts.set(node.discipline, (counts.get(node.discipline) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([discipline, count]) => ({ discipline, count }))
    .sort((a, b) => b.count - a.count);
}

export function getModelsByDiscipline(discipline: string): Node[] {
  const lowerDiscipline = discipline.toLowerCase();
  return nodes.filter((n) => n.discipline.toLowerCase() === lowerDiscipline);
}

export function findRelated(
  id: string,
  edgeType?: string
): Array<{ neighbor: Node; edgeType: string; strength: number }> {
  const conns = getConnections(id);
  if (!edgeType) return conns;
  return conns.filter((c) => c.edgeType === edgeType);
}

export function getAllNodes(): Node[] {
  return nodes;
}
