"use client";

import { useEffect } from "react";
import { useGraphStore } from "@/store/graphStore";

export function ModeToggle() {
  const appMode = useGraphStore((s) => s.appMode);
  const setAppMode = useGraphStore((s) => s.setAppMode);
  const nodes = useGraphStore((s) => s.nodes);
  const oracleLoading = useGraphStore((s) => s.oracleLoading);

  // Tab key toggles mode (when not in an input)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        if (oracleLoading) return;
        const selectedNodeId = useGraphStore.getState().selectedNodeId;
        if (selectedNodeId) return;
        e.preventDefault();
        setAppMode(appMode === "explore" ? "oracle" : "explore");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appMode, setAppMode, oracleLoading]);

  if (nodes.length === 0) return null;
  if (oracleLoading) return null;

  const isOracle = appMode === "oracle";

  return (
    <div
      className="fixed top-5 left-1/2 -translate-x-1/2 z-30"
    >
      <div
        className="relative flex items-center rounded-lg overflow-hidden"
        style={{
          background: "rgba(7, 11, 15, 0.92)",
          border: "1px solid rgba(60, 90, 110, 0.18)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Sliding indicator */}
        <div
          className="absolute top-0 bottom-0 rounded-lg transition-all duration-300 ease-out"
          style={{
            width: "50%",
            left: isOracle ? "0%" : "50%",
            background: isOracle
              ? "rgba(232, 160, 48, 0.15)"
              : "rgba(140, 180, 204, 0.1)",
            borderBottom: isOracle
              ? "2px solid rgba(232, 160, 48, 0.6)"
              : "2px solid rgba(140, 180, 204, 0.4)",
          }}
        />

        <button
          onClick={() => setAppMode("oracle")}
          className="relative z-10 px-10 py-3 font-mono text-[12px] tracking-[0.2em]
            uppercase transition-colors duration-300"
          style={{
            color: isOracle ? "#E8A030" : "#4A6A7A",
          }}
        >
          Oracle
        </button>

        <button
          onClick={() => setAppMode("explore")}
          className="relative z-10 px-10 py-3 font-mono text-[12px] tracking-[0.2em]
            uppercase transition-colors duration-300"
          style={{
            color: !isOracle ? "#B0C8D8" : "#4A6A7A",
          }}
        >
          Explore
        </button>
      </div>
    </div>
  );
}
