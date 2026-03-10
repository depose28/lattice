import { create } from "zustand";
import type { LayoutNode, EdgeData, Discipline } from "@/lib/graph/types";
import type { OracleResult, OracleMessage } from "@/lib/graph/types";
import { EDGE_PARTICLE_COLORS } from "@/lib/constants";

// Per-node activation state
export interface NodeActivation {
  activation: number; // 0.0 resting → 1.0 peak
  fireTime: number; // timestamp (ms) when last fired, 0 = never
  decayPhase: number; // 0.0 = just fired → 1.0 = fully decayed
}

interface GraphState {
  // Data
  nodes: LayoutNode[];
  edges: EdgeData[];
  loading: boolean;
  loadProgress: number;

  // Activation state per node (keyed by node id)
  nodeActivations: Map<string, NodeActivation>;

  // App mode
  appMode: "explore" | "oracle";

  // Interaction
  hoveredNodeId: string | null;
  selectedNodeId: string | null;

  // Filters
  activeDisciplines: Set<Discipline>;
  activeEdgeTypes: Set<string>;
  highlightedEdgeType: string | null; // single type spotlight, null = none

  // Animation
  time: number; // elapsed time in seconds
  flyToDiscipline: Discipline | null;
  flyToNodeId: string | null; // search fly-to target

  // Navigation history
  navigationHistory: string[]; // stack of visited node IDs

  // Oracle mode
  oracleMode: boolean;
  oracleQuery: string;
  oracleResults: OracleResult[];
  oracleLoading: boolean;
  oraclePass: 0 | 1 | 2; // 0 = not loading, 1 = shortlisting, 2 = deep analysis
  oracleActivatedNodes: Set<string>; // node IDs activated by oracle
  cascadePhase: "idle" | "loading" | "cascading" | "settled" | "clearing";
  oracleFlyTarget: { x: number; y: number; z: number; distance: number } | null;
  oracleFocusedNodeId: string | null;
  oracleSynthesis: string;
  oracleConversation: OracleMessage[];

  // Camera
  flyToHome: boolean; // trigger camera reset to initial overview

  // Synapse mode — immersive exploration
  synapseMode: boolean;
  synapseFocusId: string | null;

  // API key (user-provided, stored in localStorage)
  apiKey: string | null;

  // Actions
  setApiKey: (key: string | null) => void;
  hydrateApiKey: () => void;
  setAppMode: (mode: GraphState["appMode"]) => void;
  setGraphData: (nodes: LayoutNode[], edges: EdgeData[]) => void;
  setLoading: (loading: boolean) => void;
  setLoadProgress: (count: number) => void;
  setHoveredNode: (id: string | null) => void;
  setSelectedNode: (id: string | null) => void;
  fireNode: (id: string, intensity?: number) => void;
  setTime: (time: number) => void;
  toggleDiscipline: (discipline: Discipline) => void;
  toggleEdgeType: (edgeType: string) => void;
  setHighlightedEdgeType: (edgeType: string | null) => void;
  setFlyToDiscipline: (discipline: Discipline | null) => void;
  setFlyToNode: (nodeId: string | null) => void;
  navigateToNode: (nodeId: string) => void; // push to history + select
  goBack: () => void;
  // Oracle
  setOracleLoading: (loading: boolean) => void;
  setOraclePass: (pass: 0 | 1 | 2) => void;
  setOracleResults: (query: string, synthesis: string, results: OracleResult[]) => void;
  addOracleActivatedNode: (nodeId: string) => void;
  setCascadePhase: (phase: GraphState["cascadePhase"]) => void;
  setOracleFlyTarget: (target: GraphState["oracleFlyTarget"]) => void;
  setOracleFocusedNodeId: (nodeId: string | null) => void;
  clearOracle: () => void;

  setFlyToHome: (flyToHome: boolean) => void;

  enterSynapseMode: (nodeId: string) => void;
  exitSynapseMode: () => void;
  synapseFlyTo: (nodeId: string) => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  loading: true,
  loadProgress: 0,
  nodeActivations: new Map(),
  appMode: "explore",
  hoveredNodeId: null,
  selectedNodeId: null,
  activeDisciplines: new Set<Discipline>([
    "Probability",
    "Investing",
    "Behavioral Economics",
    "Algorithms & Machine Learning",
    "Economics",
    "Financial Theory",
    "Mathematics",
    "Elementary Models",
    "Philosophy",
    "Game Theory",
  ]),
  activeEdgeTypes: new Set(
    Object.keys(EDGE_PARTICLE_COLORS).filter((t) => t !== "same_discipline_tfidf"),
  ),
  highlightedEdgeType: null,
  time: 0,
  flyToDiscipline: null,
  flyToNodeId: null,
  navigationHistory: [],
  oracleMode: false,
  oracleQuery: "",
  oracleResults: [],
  oracleLoading: false,
  oraclePass: 0,
  oracleActivatedNodes: new Set(),
  cascadePhase: "idle",
  oracleFlyTarget: null,
  oracleFocusedNodeId: null,
  oracleSynthesis: "",
  oracleConversation: [],

  flyToHome: false,

  synapseMode: false,
  synapseFocusId: null,

  apiKey: null,

  setApiKey: (key) => {
    if (typeof window !== "undefined") {
      if (key) {
        localStorage.setItem("lattice-anthropic-api-key", key);
      } else {
        localStorage.removeItem("lattice-anthropic-api-key");
      }
    }
    set({ apiKey: key });
  },
  hydrateApiKey: () => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("lattice-anthropic-api-key");
    if (stored) set({ apiKey: stored });
  },

  setAppMode: (mode) => set((state) => {
    if (mode === "explore" && state.oracleMode) {
      // Switching back to explore from oracle — full reset
      return {
        appMode: "explore",
        oracleMode: false,
        oracleQuery: "",
        oracleResults: [],
        oracleLoading: false,
        oraclePass: 0 as const,
        oracleActivatedNodes: new Set<string>(),
        cascadePhase: "idle" as const,
        oracleFlyTarget: null,
        oracleFocusedNodeId: null,
        oracleSynthesis: "",
        oracleConversation: [],
        selectedNodeId: null,
        flyToHome: true,
      };
    }
    return {
      appMode: mode,
      selectedNodeId: mode === "oracle" ? null : state.selectedNodeId,
    };
  }),
  setGraphData: (nodes, edges) => {
    const nodeActivations = new Map<string, NodeActivation>();
    for (const node of nodes) {
      nodeActivations.set(node.id, { activation: 0, fireTime: 0, decayPhase: 1 });
    }
    set({ nodes, edges, loading: false, nodeActivations });
  },
  setLoading: (loading) => set({ loading }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),
  setHoveredNode: (hoveredNodeId) => set({ hoveredNodeId }),
  setSelectedNode: (selectedNodeId) => set({ selectedNodeId }),
  fireNode: (id, intensity = 1.0) =>
    set((state) => {
      const newMap = new Map(state.nodeActivations);
      newMap.set(id, {
        activation: intensity,
        fireTime: performance.now() / 1000,
        decayPhase: 0,
      });
      return { nodeActivations: newMap };
    }),
  setTime: (time) => set({ time }),
  toggleDiscipline: (discipline) =>
    set((state) => {
      const next = new Set(state.activeDisciplines);
      if (next.has(discipline)) {
        next.delete(discipline);
      } else {
        next.add(discipline);
      }
      return { activeDisciplines: next };
    }),
  toggleEdgeType: (edgeType) =>
    set((state) => {
      const next = new Set(state.activeEdgeTypes);
      if (next.has(edgeType)) {
        next.delete(edgeType);
      } else {
        next.add(edgeType);
      }
      return { activeEdgeTypes: next };
    }),
  setHighlightedEdgeType: (edgeType) =>
    set((state) => ({
      highlightedEdgeType: state.highlightedEdgeType === edgeType ? null : edgeType,
    })),
  setFlyToDiscipline: (discipline) => set({ flyToDiscipline: discipline }),
  setFlyToNode: (nodeId) => set({ flyToNodeId: nodeId }),
  navigateToNode: (nodeId) =>
    set((state) => {
      const history = [...state.navigationHistory];
      if (state.selectedNodeId && state.selectedNodeId !== nodeId) {
        history.push(state.selectedNodeId);
        // Keep history bounded
        if (history.length > 50) history.shift();
      }
      return {
        selectedNodeId: nodeId,
        navigationHistory: history,
        flyToNodeId: nodeId,
      };
    }),
  goBack: () =>
    set((state) => {
      const history = [...state.navigationHistory];
      const prevId = history.pop() ?? null;
      return {
        selectedNodeId: prevId,
        navigationHistory: history,
        flyToNodeId: prevId,
        synapseFocusId: state.synapseMode ? prevId : state.synapseFocusId,
      };
    }),
  setOracleLoading: (loading) => set({ oracleLoading: loading, oracleMode: true, oraclePass: loading ? 1 : 0, cascadePhase: loading ? "loading" : "idle" }),
  setOraclePass: (pass) => set({ oraclePass: pass }),
  setOracleResults: (query, synthesis, results) => set((state) => {
    // Append to conversation history for follow-ups
    const conversation = [...state.oracleConversation];
    conversation.push({ role: "user", content: query });
    conversation.push({ role: "assistant", content: JSON.stringify({ synthesis, results: results.map((r) => r.name) }) });
    return {
      oracleQuery: query,
      oracleSynthesis: synthesis,
      oracleResults: results,
      oracleLoading: false,
      oraclePass: 0 as const,
      oracleConversation: conversation,
    };
  }),
  addOracleActivatedNode: (nodeId) =>
    set((state) => {
      const next = new Set(state.oracleActivatedNodes);
      next.add(nodeId);
      return { oracleActivatedNodes: next };
    }),
  setCascadePhase: (phase) => set({ cascadePhase: phase }),
  setOracleFlyTarget: (target) => set({ oracleFlyTarget: target }),
  setOracleFocusedNodeId: (nodeId) => set({ oracleFocusedNodeId: nodeId }),
  clearOracle: () =>
    set({
      appMode: "explore",
      oracleMode: false,
      oracleQuery: "",
      oracleResults: [],
      oracleLoading: false,
      oraclePass: 0 as const,
      oracleActivatedNodes: new Set(),
      cascadePhase: "idle",
      oracleFlyTarget: null,
      oracleFocusedNodeId: null,
      oracleSynthesis: "",
      oracleConversation: [],
      selectedNodeId: null,
      flyToHome: true,
    }),

  setFlyToHome: (flyToHome) => set({ flyToHome }),

  enterSynapseMode: (nodeId) =>
    set({ synapseMode: true, synapseFocusId: nodeId, selectedNodeId: nodeId }),
  exitSynapseMode: () =>
    set({ synapseMode: false, synapseFocusId: null }),
  synapseFlyTo: (nodeId) =>
    set((state) => {
      const history = [...state.navigationHistory];
      if (state.selectedNodeId && state.selectedNodeId !== nodeId) {
        history.push(state.selectedNodeId);
        if (history.length > 50) history.shift();
      }
      return { synapseFocusId: nodeId, selectedNodeId: nodeId, navigationHistory: history };
    }),
}));
