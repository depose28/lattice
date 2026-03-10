"use client";

import { useGraphStore } from "@/store/graphStore";
import { DISCIPLINE_COLORS, EDGE_PARTICLE_COLORS } from "@/lib/constants";
import type { Discipline, EdgeType } from "@/lib/graph/types";
import { playFireSound } from "@/lib/audio";

// Human-readable edge type labels + short descriptions
const EDGE_META: Record<string, { label: string; verb: string }> = {
  cross_discipline_tfidf: {
    label: "Cross-discipline",
    verb: "Shares core concepts across fields",
  },
  structural_kinship: {
    label: "Structural kinship",
    verb: "Similar underlying structure",
  },
  complementary: {
    label: "Complementary",
    verb: "Strengthens when combined",
  },
  tensioning: {
    label: "Tension",
    verb: "Creates productive friction",
  },
  inversion: {
    label: "Inversion",
    verb: "Opposite perspective",
  },
  prerequisite: {
    label: "Prerequisite",
    verb: "Builds understanding for",
  },
  same_chapter: {
    label: "Same chapter",
    verb: "Grouped in source material",
  },
  same_discipline_tfidf: {
    label: "Same discipline",
    verb: "Related within the same field",
  },
};

/**
 * Clean the summary text from nodes.json.
 * Strips "Title [Name]" prefix and "Model" headers.
 */
function cleanSummary(raw: string): string {
  let text = raw;

  // Pattern: "Title [anything]Model[content]" or "Title [anything]The..."
  const titleModelMatch = text.match(/^Title\s+.+?(?:Model|Concept|Framework|Principle|Theory|Bias|Effect|Law|Rule|Paradox|Heuristic)\s*/i);
  if (titleModelMatch) {
    text = text.slice(titleModelMatch[0].length);
  } else {
    // Fallback: strip "Title " and everything until first sentence that starts with uppercase after it
    const simpleTitle = text.match(/^Title\s+[^.]+?\s*(?=[A-Z])/);
    if (simpleTitle) {
      text = text.slice(simpleTitle[0].length);
    }
  }

  // Capitalize first letter
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Source data is truncated at 300 chars — check if it ends mid-sentence
  const endsClean = /[.!?]$/.test(text.trim());
  if (!endsClean) {
    // Find last complete sentence
    const lastPeriod = text.lastIndexOf(". ");
    const lastExcl = text.lastIndexOf("! ");
    const lastQ = text.lastIndexOf("? ");
    const lastSentenceEnd = Math.max(lastPeriod, lastExcl, lastQ);

    if (lastSentenceEnd > text.length * 0.4) {
      // Cut after last complete sentence if we keep a decent amount
      text = text.slice(0, lastSentenceEnd + 1);
    } else {
      // Keep the full text, just clean the trailing word fragment
      const lastSpace = text.lastIndexOf(" ");
      if (lastSpace > 40) {
        text = text.slice(0, lastSpace) + "…";
      }
    }
  }

  return text;
}

export function InfoPanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const fireNode = useGraphStore((s) => s.fireNode);
  const storeNavigate = useGraphStore((s) => s.navigateToNode);
  const goBack = useGraphStore((s) => s.goBack);
  const navigationHistory = useGraphStore((s) => s.navigationHistory);
  const synapseMode = useGraphStore((s) => s.synapseMode);

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const canGoBack = navigationHistory.length > 0;

  const allConnections = edges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => {
      const neighborId = e.source === node.id ? e.target : e.source;
      const neighbor = nodes.find((n) => n.id === neighborId);
      return { edge: e, neighbor };
    })
    .filter((c) => c.neighbor)
    .sort((a, b) => b.edge.strength - a.edge.strength);

  const topConnections = allConnections.slice(0, 8);

  // Group by type for the breakdown
  const byType = new Map<string, typeof allConnections>();
  for (const conn of allConnections) {
    const t = conn.edge.type;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(conn);
  }

  const disciplineColor =
    DISCIPLINE_COLORS[node.discipline as Discipline] ?? "#4A6070";
  const summary = cleanSummary(node.summary);

  function navigateToNode(nodeId: string) {
    storeNavigate(nodeId);
    fireNode(nodeId, 1.0);
    playFireSound(0.7);
  }

  return (
    <div
      className="fixed top-0 right-0 h-full w-[360px] z-40 flex flex-col
        transition-transform duration-300 ease-out"
      style={{
        background: "rgba(7, 11, 15, 0.94)",
        borderLeft: "1px solid rgba(60, 90, 110, 0.15)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* ── Top section: model info ── */}
      <div className="flex-shrink-0 px-7 pt-8 pb-10">
        {/* Top bar: back + close */}
        <div className="flex items-center justify-between mb-6">
          {canGoBack ? (
            <button
              onClick={() => {
                goBack();
                playFireSound(0.5);
              }}
              className="flex items-center gap-1.5 text-[#5A7A8A] hover:text-[#8CB4CC] transition-colors"
              aria-label="Go back"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M7 1L3 5L7 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-mono text-[9px] tracking-wider">Back</span>
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={() => setSelectedNode(null)}
            className="w-6 h-6 flex items-center justify-center
              text-[#4A6070] hover:text-[#8CB4CC] transition-colors"
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        {/* Discipline color accent */}
        <div
          className="w-8 h-[2px] mb-5 rounded-full"
          style={{ background: disciplineColor }}
        />

        {/* Name */}
        <h2
          className="font-sans text-[20px] font-medium leading-snug mb-3"
          style={{ color: "#E4EDF3" }}
        >
          {node.name}
        </h2>

        {/* Meta line */}
        <div className="flex items-center gap-2 mb-6">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.1em]"
            style={{ color: disciplineColor }}
          >
            {node.discipline}
          </span>
          <span className="text-[10px]" style={{ color: "#2A3B47" }}>·</span>
          <span
            className="font-mono text-[10px]"
            style={{ color: "#5A7A8A" }}
          >
            {node.degree} connections
          </span>
        </div>

        {/* Summary */}
        <p
          className="font-sans text-[14px] leading-[1.85] mb-0"
          style={{ color: "#9AB0C0" }}
        >
          {summary}
        </p>
      </div>

      {/* ── Spacer + Divider ── */}
      <div className="flex-shrink-0 px-7">
        <div className="h-8" />
        <div className="h-px" style={{ background: "#1A2830" }} />
        <div className="h-8" />
      </div>

      {/* ── Bottom section: connections (scrollable) ── */}
      <div className="flex-1 overflow-y-auto px-7 pb-6">
        {topConnections.length > 0 && (
          <section className="mb-6">
            <SectionHeader>Connections</SectionHeader>

            <div className="space-y-3">
              {topConnections.map(({ edge, neighbor }) => {
                if (!neighbor) return null;
                const nColor =
                  DISCIPLINE_COLORS[neighbor.discipline as Discipline] ?? "#4A6070";
                const eColor =
                  EDGE_PARTICLE_COLORS[edge.type as EdgeType] ?? "#445566";
                const meta = EDGE_META[edge.type];
                const pct = Math.round(edge.strength * 100);

                return (
                  <button
                    key={edge.source + "-" + edge.target}
                    onClick={() => navigateToNode(neighbor.id)}
                    className="w-full text-left group"
                  >
                    {/* Row 1: name + type */}
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-[5px] h-[5px] rounded-full flex-shrink-0"
                        style={{ background: nColor }}
                      />
                      <span
                        className="font-sans text-[12px] truncate
                          group-hover:text-[#D0E0EA] transition-colors"
                        style={{ color: "#8CA0AE" }}
                      >
                        {neighbor.name}
                      </span>
                      <span
                        className="font-mono text-[8px] tracking-[0.03em] flex-shrink-0"
                        style={{ color: "#4A6070" }}
                      >
                        {meta?.label ?? edge.type.replace(/_/g, " ")}
                      </span>
                    </div>

                    {/* Row 2: strength bar with % inside */}
                    <div className="flex items-center gap-2 ml-[13px]">
                      <div
                        className="flex-1 h-[6px] rounded-full overflow-hidden"
                        style={{ background: "#0C1318" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-300
                            group-hover:brightness-125"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${eColor}50, ${eColor})`,
                          }}
                        />
                      </div>
                      <span
                        className="font-mono text-[10px] tabular-nums flex-shrink-0 w-[22px]"
                        style={{ color: "#5A7A8A" }}
                      >
                        {pct}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Footer hint */}
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid #1A2830" }}>
          <p className="font-mono text-[9px] leading-relaxed" style={{ color: "#3A5060" }}>
            Click any connection to navigate there.
            {!synapseMode && " Double-click a node for Synapse Mode."}
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-3 h-px" style={{ background: "#2A3B47" }} />
      <h3
        className="font-mono text-[9px] uppercase tracking-[0.15em]"
        style={{ color: "#5A7A8A" }}
      >
        {children}
      </h3>
      <div className="flex-1 h-px" style={{ background: "#2A3B47" }} />
    </div>
  );
}
