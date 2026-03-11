"use client";

import { useGraphStore } from "@/store/graphStore";

export function AutoRotateButton() {
  const autoRotate = useGraphStore((s) => s.autoRotate);
  const setAutoRotate = useGraphStore((s) => s.setAutoRotate);
  const nodes = useGraphStore((s) => s.nodes);

  if (nodes.length === 0) return null;

  return (
    <button
      onClick={() => setAutoRotate(!autoRotate)}
      className="fixed bottom-14 right-5 z-20 flex items-center gap-2.5 px-4 py-2 rounded-full
        transition-all duration-300 group"
      style={{
        background: autoRotate ? "rgba(140, 180, 204, 0.08)" : "rgba(7, 11, 15, 0.7)",
        border: autoRotate
          ? "1px solid rgba(140, 180, 204, 0.2)"
          : "1px solid rgba(60, 90, 110, 0.15)",
      }}
      title={autoRotate ? "Stop rotation" : "Auto-rotate graph"}
    >
      {autoRotate ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="2" y="1.5" width="3" height="9" rx="0.5" fill="#8CB4CC" />
          <rect x="7" y="1.5" width="3" height="9" rx="0.5" fill="#8CB4CC" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 1L10.5 6L2.5 11V1Z" fill="#5A7A8A" />
        </svg>
      )}
      <span
        className="font-mono text-[9px] tracking-[0.15em] uppercase"
        style={{ color: autoRotate ? "#8CB4CC" : "#4A6A7A" }}
      >
        Rotate
      </span>
    </button>
  );
}
