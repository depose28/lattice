import { DISCIPLINE_COLORS } from "@/lib/constants";
import type { Discipline } from "@/lib/graph/types";

interface TooltipProps {
  name: string;
  discipline: string;
  x: number;
  y: number;
}

export function Tooltip({ name, discipline, x, y }: TooltipProps) {
  const discColor = DISCIPLINE_COLORS[discipline as Discipline] ?? "#3A5060";

  return (
    <div
      className="fixed pointer-events-none z-50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em]"
      style={{
        left: x + 14,
        top: y - 10,
        background: "rgba(7, 11, 15, 0.92)",
        border: "1px solid rgba(60, 90, 110, 0.25)",
        borderRadius: "3px",
      }}
    >
      <span className="text-[#8A9EAC]">{name}</span>
      <span className="mx-1.5 text-[#2A3B47]">·</span>
      <span style={{ color: discColor, opacity: 0.7 }}>{discipline}</span>
    </div>
  );
}
