"use client";

import { useState } from "react";
import { useGraphStore } from "@/store/graphStore";
import { EDGE_PARTICLE_COLORS } from "@/lib/constants";

const edgeTypes = Object.keys(EDGE_PARTICLE_COLORS) as (keyof typeof EDGE_PARTICLE_COLORS)[];

const LABELS: Record<string, string> = {
  cross_discipline_tfidf: "Cross-discipline",
  structural_kinship: "Structural kinship",
  complementary: "Complementary",
  tensioning: "Tensioning",
  inversion: "Inversion",
  prerequisite: "Prerequisite",
  same_chapter: "Same chapter",
  same_discipline_tfidf: "Same discipline",
};

export function EdgeFilterPanel() {
  const [open, setOpen] = useState(false);
  const activeEdgeTypes = useGraphStore((s) => s.activeEdgeTypes);
  const toggleEdgeType = useGraphStore((s) => s.toggleEdgeType);
  const nodes = useGraphStore((s) => s.nodes);

  if (nodes.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-20">
      <button
        onClick={() => setOpen(!open)}
        className="font-mono text-[10px] text-[#6A8A9A] hover:text-[#A8B8C8] transition-colors px-2 py-1"
      >
        {open ? "— edges" : "+ edges"}
      </button>
      {open && (
        <div className="mt-1 bg-[#070B0F]/90 backdrop-blur-sm border border-[#1E2E3A] rounded p-2 space-y-1">
          {edgeTypes.map((type) => {
            const active = activeEdgeTypes.has(type);
            const color = EDGE_PARTICLE_COLORS[type];
            return (
              <button
                key={type}
                onClick={() => toggleEdgeType(type)}
                className="flex items-center gap-2 w-full text-left font-mono text-[10px] transition-opacity"
                style={{ opacity: active ? 1 : 0.3 }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span style={{ color: active ? "#A8B8C8" : "#445566" }}>
                  {LABELS[type] ?? type}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
