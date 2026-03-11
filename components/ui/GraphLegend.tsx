"use client";

import { useState, useEffect, useMemo } from "react";
import { useGraphStore } from "@/store/graphStore";
import { DISCIPLINE_COLORS, EDGE_PARTICLE_COLORS } from "@/lib/constants";
import type { Discipline } from "@/lib/graph/types";

const disciplines = Object.keys(DISCIPLINE_COLORS) as Discipline[];

// Only show edge types that are interesting to explore
// (skip same_discipline_tfidf — hidden by default and not interesting)
const edgeTypes = Object.keys(EDGE_PARTICLE_COLORS).filter(
  (t) => t !== "same_discipline_tfidf",
) as (keyof typeof EDGE_PARTICLE_COLORS)[];

const EDGE_LABELS: Record<string, string> = {
  cross_discipline_tfidf: "Cross-discipline",
  structural_kinship: "Structural kinship",
  complementary: "Complementary",
  tensioning: "Tension",
  inversion: "Inversion",
  prerequisite: "Prerequisite",
  same_chapter: "Same chapter",
};

export function GraphLegend() {
  const [edgesOpen, setEdgesOpen] = useState(false);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const activeDisciplines = useGraphStore((s) => s.activeDisciplines);
  const toggleDiscipline = useGraphStore((s) => s.toggleDiscipline);
  const highlightedEdgeType = useGraphStore((s) => s.highlightedEdgeType);
  const setHighlightedEdgeType = useGraphStore((s) => s.setHighlightedEdgeType);
  const oracleMode = useGraphStore((s) => s.oracleMode);
  const appMode = useGraphStore((s) => s.appMode);

  // Pre-compute edge counts by type (must be before early return — Rules of Hooks)
  const edgeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of edges) {
      counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    }
    return counts;
  }, [edges]);

  const hasDisciplineFilter = activeDisciplines.size > 0;

  // Show "click to filter" hint until first interaction
  const [hintVisible, setHintVisible] = useState(true);
  useEffect(() => {
    if (hasDisciplineFilter || highlightedEdgeType !== null) {
      setHintVisible(false);
    }
  }, [hasDisciplineFilter, highlightedEdgeType]);

  if (nodes.length === 0) return null;

  // Hide when oracle results are showing (panel overlaps)
  const oracleResultsVisible = oracleMode && appMode === "oracle";

  return (
    <div
      className="fixed left-5 z-20 select-none transition-all duration-500"
      style={{
        top: "50%",
        transform: "translateY(-50%)",
        opacity: oracleResultsVisible ? 0 : 1,
        pointerEvents: oracleResultsVisible ? "none" : "auto",
      }}
    >
      {/* Disciplines */}
      <div className="space-y-1.5 mb-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#6A8A9A] block mb-2">
          Disciplines
        </span>
        {disciplines.map((d) => {
          const color = DISCIPLINE_COLORS[d];
          const isActive = activeDisciplines.has(d);
          const isDimmed = hasDisciplineFilter && !isActive;

          return (
            <button
              key={d}
              onClick={() => toggleDiscipline(d)}
              className="flex items-center gap-2.5 group w-full text-left"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0 transition-all duration-200"
                style={{
                  backgroundColor: color,
                  opacity: isDimmed ? 0.2 : 1,
                  boxShadow: isActive ? `0 0 6px ${color}` : "none",
                }}
              />
              <span
                className="font-mono text-[12px] transition-all duration-200"
                style={{
                  color: isActive ? color : isDimmed ? "#2A3B47" : "#7A9AAA",
                }}
              >
                {d}
              </span>
            </button>
          );
        })}
        {hintVisible && (
          <p className="font-mono text-[9px] text-[#4A6A7A] mt-2 tracking-wide">
            Click to filter the graph
          </p>
        )}
      </div>

      {/* Edge types — collapsible, highlight mode */}
      <div>
        <button
          onClick={() => setEdgesOpen(!edgesOpen)}
          className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#6A8A9A] hover:text-[#8CB4CC] transition-colors mb-2 block"
        >
          {edgesOpen ? "— Connections" : "+ Connections"}
        </button>
        {edgesOpen && (
          <div className="space-y-1.5">
            {edgeTypes.map((type) => {
              const isHighlighted = highlightedEdgeType === type;
              const hasSomeHighlight = highlightedEdgeType !== null;
              const color = EDGE_PARTICLE_COLORS[type];
              const count = edgeCounts.get(type) ?? 0;

              return (
                <button
                  key={type}
                  onClick={() => setHighlightedEdgeType(type)}
                  className="flex items-center gap-2.5 w-full text-left group"
                >
                  <span
                    className="flex-shrink-0 rounded-full transition-all duration-200"
                    style={{
                      width: "6px",
                      height: "6px",
                      backgroundColor: color,
                      opacity: isHighlighted ? 1 : hasSomeHighlight ? 0.15 : 0.7,
                      boxShadow: isHighlighted ? `0 0 6px ${color}` : "none",
                    }}
                  />
                  <span
                    className="font-mono text-[11px] transition-all duration-200 flex-1"
                    style={{
                      color: isHighlighted
                        ? color
                        : hasSomeHighlight
                          ? "#2A3B47"
                          : "#7A9AAA",
                    }}
                  >
                    {EDGE_LABELS[type] ?? type}
                  </span>
                  <span
                    className="font-mono text-[10px] tabular-nums transition-all duration-200"
                    style={{
                      color: isHighlighted ? "#6A8A9A" : "#4A6070",
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
