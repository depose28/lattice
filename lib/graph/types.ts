import { DISCIPLINE_COLORS, EDGE_PARTICLE_COLORS } from "@/lib/constants";

// Discipline names — derived from the constants source of truth
export type Discipline = keyof typeof DISCIPLINE_COLORS;

// Edge relationship types — derived from the constants source of truth
export type EdgeType = keyof typeof EDGE_PARTICLE_COLORS;

// Raw node from nodes.json
export interface NodeData {
  id: string;
  name: string;
  discipline: Discipline;
  chapter: string;
  degree: number;
  summary: string;
}

// Raw edge from edges.json
export interface EdgeData {
  source: string;
  target: string;
  type: EdgeType;
  strength: number;
  label: string;
}

// 3D position after force layout
export interface NodePosition {
  x: number;
  y: number;
  z: number;
}

// Node with computed layout position
export interface LayoutNode extends NodeData {
  position: NodePosition;
  radius: number; // computed from degree
}

// Oracle model roles — how a model relates to the user's decision
export type OracleRole = "supporting" | "challenging" | "process";

// Oracle API response — a ranked model with actionable insights
export interface OracleResult {
  nodeId: string;
  name: string;
  discipline: Discipline;
  relevance: number; // 0–1, used for activation intensity
  role: OracleRole; // supporting, challenging, or process
  question: string; // one concrete question this model prompts you to ask
  stance: string; // what this model argues for/against — direct and specific
  application?: string; // deprecated, kept for backward compat
}

// Oracle API response envelope
export interface OracleResponse {
  query: string;
  synthesis: string; // 3-5 sentence framework weaving the top models together
  results: OracleResult[];
}

// Conversation message for follow-up queries
export interface OracleMessage {
  role: "user" | "assistant";
  content: string;
}
