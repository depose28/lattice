import { useCallback, useRef } from "react";
import { useGraphStore } from "@/store/graphStore";
import { playFireSound } from "@/lib/audio";
import type { OracleResponse } from "@/lib/graph/types";

// Build neighbor map once from edges for scan wave effect
function getNeighborMap(): Map<string, string[]> {
  const edges = useGraphStore.getState().edges;
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    if (!map.has(edge.source)) map.set(edge.source, []);
    if (!map.has(edge.target)) map.set(edge.target, []);
    map.get(edge.source)!.push(edge.target);
    map.get(edge.target)!.push(edge.source);
  }
  return map;
}

export function useOracle() {
  const cascadeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop scan animation
  function stopScan() {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  }

  // Start scan animation — fire random node clusters while API is loading
  function startScan() {
    stopScan();
    const nodes = useGraphStore.getState().nodes;
    if (nodes.length === 0) return;

    const neighborMap = getNeighborMap();
    let tick = 0;

    scanIntervalRef.current = setInterval(() => {
      const s = useGraphStore.getState();
      // Stop if no longer loading
      if (!s.oracleLoading) {
        stopScan();
        return;
      }

      // Pick a random seed node
      const seedIdx = Math.floor(Math.random() * nodes.length);
      const seedNode = nodes[seedIdx];
      const intensity = 0.3 + Math.random() * 0.25;

      // Fire the seed
      s.fireNode(seedNode.id, intensity);

      // Fire 1-3 neighbors with slight delay for wave effect
      const neighbors = neighborMap.get(seedNode.id) ?? [];
      const numNeighbors = Math.min(1 + Math.floor(Math.random() * 3), neighbors.length);
      const shuffled = [...neighbors].sort(() => Math.random() - 0.5);

      for (let n = 0; n < numNeighbors; n++) {
        const delay = 20 + n * 30;
        const neighborId = shuffled[n];
        const nIntensity = intensity * (0.6 + Math.random() * 0.3);
        const timer = setTimeout(() => {
          useGraphStore.getState().fireNode(neighborId, nIntensity);
        }, delay);
        cascadeTimers.current.push(timer);
      }

      // Subtle tick sound every 3rd fire
      if (tick % 3 === 0) {
        playFireSound(0.15 + Math.random() * 0.15);
      }
      tick++;
    }, 120);
  }

  // Shared cascade animation after results arrive
  function runCascade(results: OracleResponse["results"]) {
    const store = useGraphStore.getState();
    store.setCascadePhase("cascading");

    const timings: number[] = [];
    timings.push(500);
    timings.push(900);
    timings.push(1100);
    for (let i = 3; i < results.length; i++) {
      timings.push(1000 + i * 150);
    }

    for (let i = 0; i < results.length; i++) {
      const timer = setTimeout(() => {
        const s = useGraphStore.getState();
        const result = results[i];
        const intensity = Math.max(result.relevance * (1.0 - i * 0.02), 0.5);
        s.fireNode(result.nodeId, intensity);
        s.addOracleActivatedNode(result.nodeId);
        playFireSound(0.5 + result.relevance * 0.5);

        if (i === results.length - 1) {
          const settleTimer = setTimeout(() => {
            const state = useGraphStore.getState();
            state.setCascadePhase("settled");

            const oracleNodeIds = Array.from(state.oracleActivatedNodes);
            const allNodes = state.nodes;
            const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

            let cx = 0, cy = 0, cz = 0;
            let count = 0;
            for (const id of oracleNodeIds) {
              const node = nodeMap.get(id);
              if (node) { cx += node.position.x; cy += node.position.y; cz += node.position.z; count++; }
            }
            if (count > 0) {
              cx /= count; cy /= count; cz /= count;
              let maxDist = 0;
              for (const id of oracleNodeIds) {
                const node = nodeMap.get(id);
                if (node) {
                  const dx = node.position.x - cx, dy = node.position.y - cy, dz = node.position.z - cz;
                  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                  if (d > maxDist) maxDist = d;
                }
              }
              const framingDist = Math.max(maxDist * 2.5, 80);
              state.setOracleFlyTarget({ x: cx, y: cy, z: cz, distance: framingDist });
            }
          }, 1500);
          cascadeTimers.current.push(settleTimer);
        }
      }, timings[i]);
      cascadeTimers.current.push(timer);
    }
  }

  // Two-pass fetch: shortlist → deep analysis
  async function fetchAndCascade(query: string, history?: import("@/lib/graph/types").OracleMessage[]) {
    const apiKey = useGraphStore.getState().apiKey;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) {
      headers["X-Anthropic-Api-Key"] = apiKey;
    }

    const historyPayload = history && history.length > 0 ? history : undefined;

    // ── Pass 1: Shortlist 25 candidates from 700 ──
    useGraphStore.getState().setOraclePass(1);

    const shortlistRes = await fetch("/api/oracle/shortlist", {
      method: "POST",
      headers,
      body: JSON.stringify({ query, history: historyPayload }),
    });

    if (!shortlistRes.ok) {
      const err = await shortlistRes.json();
      throw new Error(err.error ?? "Oracle shortlist failed");
    }

    const { candidates } = await shortlistRes.json() as { candidates: string[] };

    // ── Pass 2: Deep analysis with enriched context ──
    useGraphStore.getState().setOraclePass(2);

    const analysisRes = await fetch("/api/oracle", {
      method: "POST",
      headers,
      body: JSON.stringify({ query, candidates, history: historyPayload }),
    });

    if (!analysisRes.ok) {
      const err = await analysisRes.json();
      throw new Error(err.error ?? "Oracle analysis failed");
    }

    const data: OracleResponse = await analysisRes.json();
    const results = data.results.slice(0, 15);

    stopScan();

    const store = useGraphStore.getState();
    store.setOracleResults(query, data.synthesis ?? "", results);
    runCascade(results);
  }

  const submitQuery = useCallback(async (query: string) => {
    const store = useGraphStore.getState();

    for (const timer of cascadeTimers.current) clearTimeout(timer);
    cascadeTimers.current = [];

    if (store.synapseMode) store.exitSynapseMode();

    store.setOracleLoading(true);
    store.setSelectedNode(null);
    startScan();

    try {
      await fetchAndCascade(query);
    } catch (error) {
      console.error("Oracle error:", error);
      stopScan();
      store.setCascadePhase("idle");
      store.setOracleLoading(false);
      throw error;
    }
  }, []);

  const submitFollowUp = useCallback(async (query: string) => {
    const store = useGraphStore.getState();

    for (const timer of cascadeTimers.current) clearTimeout(timer);
    cascadeTimers.current = [];

    // Reset activated nodes but keep conversation history
    store.setOracleLoading(true);
    store.setCascadePhase("loading");

    // Clear previous activated nodes for fresh cascade
    const prevConversation = store.oracleConversation;
    startScan();

    try {
      await fetchAndCascade(query, prevConversation);
    } catch (error) {
      console.error("Oracle follow-up error:", error);
      stopScan();
      store.setCascadePhase("idle");
      store.setOracleLoading(false);
      throw error;
    }
  }, []);

  const clearOracle = useCallback(() => {
    for (const timer of cascadeTimers.current) clearTimeout(timer);
    cascadeTimers.current = [];
    stopScan();

    const store = useGraphStore.getState();
    store.setCascadePhase("clearing");

    // Fade out over 1s, then reset
    const timer = setTimeout(() => {
      useGraphStore.getState().clearOracle();
    }, 1000);
    cascadeTimers.current.push(timer);
  }, []);

  return { submitQuery, submitFollowUp, clearOracle };
}
