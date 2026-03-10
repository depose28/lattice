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

  const isExplore = appMode === "explore";
  const isOracle = appMode === "oracle";

  return (
    <div
      className="fixed top-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full px-2 py-2"
      style={{
        background: "rgba(7, 11, 15, 0.88)",
        border: "1px solid rgba(60, 90, 110, 0.2)",
        backdropFilter: "blur(10px)",
      }}
    >
      <button
        onClick={() => setAppMode("oracle")}
        className="relative px-9 py-3 rounded-full font-mono text-[14px] tracking-widest
          uppercase transition-all duration-300"
        style={{
          color: isOracle ? "#E8A030" : "#4A6A7A",
          background: isOracle ? "rgba(232, 160, 48, 0.12)" : "transparent",
          boxShadow: isOracle ? "0 0 16px rgba(232, 160, 48, 0.1)" : "none",
        }}
      >
        Oracle
      </button>

      <div
        className="w-px h-5 mx-0.5 flex-shrink-0"
        style={{ background: "rgba(60, 90, 110, 0.25)" }}
      />

      <button
        onClick={() => setAppMode("explore")}
        className="relative px-9 py-3 rounded-full font-mono text-[14px] tracking-widest
          uppercase transition-all duration-300"
        style={{
          color: isExplore ? "#B0C8D8" : "#4A6A7A",
          background: isExplore ? "rgba(42, 59, 71, 0.4)" : "transparent",
        }}
      >
        Explore
      </button>
    </div>
  );
}
