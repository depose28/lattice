"use client";

import { useEffect, useRef } from "react";
import { useGraphStore } from "@/store/graphStore";

export function ModeToggle() {
  const appMode = useGraphStore((s) => s.appMode);
  const setAppMode = useGraphStore((s) => s.setAppMode);
  const nodes = useGraphStore((s) => s.nodes);
  const oracleLoading = useGraphStore((s) => s.oracleLoading);
  const oracleRef = useRef<HTMLButtonElement>(null);
  const exploreRef = useRef<HTMLButtonElement>(null);

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
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-30">
      <div
        className="relative grid grid-cols-2 rounded-xl"
        style={{
          background: "rgba(7, 11, 15, 0.92)",
          border: "1px solid rgba(60, 90, 110, 0.15)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.3)",
        }}
      >
        <button
          ref={oracleRef}
          onClick={() => setAppMode("oracle")}
          className="relative px-10 py-3.5 rounded-xl font-mono text-[11px] tracking-[0.2em]
            uppercase transition-all duration-300 min-w-[130px] text-center"
          style={{
            color: isOracle ? "#E8A030" : "#3A5565",
            background: isOracle ? "rgba(232, 160, 48, 0.13)" : "transparent",
            border: isOracle ? "1px solid rgba(232, 160, 48, 0.25)" : "1px solid transparent",
          }}
        >
          Oracle
        </button>

        <button
          ref={exploreRef}
          onClick={() => setAppMode("explore")}
          className="relative px-10 py-3.5 rounded-xl font-mono text-[11px] tracking-[0.2em]
            uppercase transition-all duration-300 min-w-[130px] text-center"
          style={{
            color: !isOracle ? "#B0C8D8" : "#3A5565",
            background: !isOracle ? "rgba(140, 180, 204, 0.08)" : "transparent",
            border: !isOracle ? "1px solid rgba(140, 180, 204, 0.15)" : "1px solid transparent",
          }}
        >
          Explore
        </button>
      </div>
    </div>
  );
}
