"use client";

import { useGraphStore } from "@/store/graphStore";
import { DISCIPLINE_COLORS } from "@/lib/constants";
import type { Discipline } from "@/lib/graph/types";

const disciplines = Object.keys(DISCIPLINE_COLORS) as Discipline[];

export function DisciplineLegend() {
  const nodes = useGraphStore((s) => s.nodes);
  const setFlyToDiscipline = useGraphStore((s) => s.setFlyToDiscipline);

  if (nodes.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-20 space-y-0.5">
      {disciplines.map((d) => {
        const color = DISCIPLINE_COLORS[d];
        return (
          <button
            key={d}
            onClick={() => setFlyToDiscipline(d)}
            className="flex items-center gap-2 group"
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="font-mono text-[9px] text-[#445566] group-hover:text-[#6A8A9A] transition-colors">
              {d}
            </span>
          </button>
        );
      })}
    </div>
  );
}
