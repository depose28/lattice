"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useGraphStore } from "@/store/graphStore";
import { DISCIPLINE_COLORS } from "@/lib/constants";
import type { Discipline, LayoutNode } from "@/lib/graph/types";
import { playFireSound } from "@/lib/audio";

function fuzzyMatch(query: string, text: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact substring match — highest score
  if (t.includes(q)) {
    const idx = t.indexOf(q);
    // Bonus for matching at start or word boundary
    const startBonus = idx === 0 ? 100 : t[idx - 1] === " " ? 50 : 0;
    return { match: true, score: 200 + startBonus - idx };
  }

  // Fuzzy: all query chars appear in order
  let qi = 0;
  let consecutiveBonus = 0;
  let lastMatchIdx = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (ti === lastMatchIdx + 1) consecutiveBonus += 10;
      lastMatchIdx = ti;
      qi++;
    }
  }

  if (qi === q.length) {
    return { match: true, score: 50 + consecutiveBonus - lastMatchIdx };
  }

  return { match: false, score: 0 };
}

export function SearchBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const nodes = useGraphStore((s) => s.nodes);
  const appMode = useGraphStore((s) => s.appMode);
  const navigateToNode = useGraphStore((s) => s.navigateToNode);
  const fireNode = useGraphStore((s) => s.fireNode);

  const results: LayoutNode[] =
    query.length < 1
      ? []
      : nodes
          .map((n) => ({ node: n, ...fuzzyMatch(query, n.name) }))
          .filter((r) => r.match)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map((r) => r.node);

  // Global keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K or / (when not in input)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setQuery("");
        setSelectedIndex(0);
      } else if (e.key === "/" && !open && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setOpen(true);
        setQuery("");
        setSelectedIndex(0);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Reset index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  function selectResult(node: LayoutNode) {
    navigateToNode(node.id);
    fireNode(node.id, 1.0);
    playFireSound(1.0);
    setOpen(false);
    setQuery("");
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      selectResult(results[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  if (nodes.length === 0) return null;
  if (appMode !== "explore" && !open) return null;

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={() => {
          setOpen(true);
          setQuery("");
          setSelectedIndex(0);
        }}
        className="fixed top-5 right-5 z-30 flex items-center gap-3 px-6 py-3 rounded-xl
          transition-all duration-200 hover:bg-[#111E28]"
        style={{
          background: "rgba(10, 16, 22, 0.9)",
          border: "1px solid rgba(80, 110, 130, 0.25)",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 12 12" fill="none">
          <circle cx="5" cy="5" r="3.5" stroke="#6A8A9A" strokeWidth="1.2" />
          <path d="M8 8L11 11" stroke="#6A8A9A" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span className="font-mono text-[12px] text-[#6A8A9A] tracking-wider">
          Search models
        </span>
        <kbd className="font-mono text-[10px] text-[#4A6070] ml-4 px-2 py-1 rounded"
          style={{ border: "1px solid rgba(60, 90, 110, 0.2)" }}
        >⌘K</kbd>
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          style={{ background: "rgba(7, 11, 15, 0.7)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setOpen(false);
              setQuery("");
            }
          }}
        >
          <div
            className="w-full max-w-[440px] rounded-lg overflow-hidden"
            style={{
              background: "rgba(10, 16, 22, 0.98)",
              border: "1px solid rgba(60, 90, 110, 0.2)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
            }}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid #111E28" }}>
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
                <circle cx="5" cy="5" r="3.5" stroke="#4A6070" strokeWidth="1.2" />
                <path d="M8 8L11 11" stroke="#4A6070" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Search mental models..."
                className="flex-1 bg-transparent font-mono text-[13px] text-[#B0C8D8] placeholder-[#2A3B47] outline-none"
              />
              <kbd
                className="font-mono text-[9px] text-[#2A3B47] px-1.5 py-0.5 rounded"
                style={{ border: "1px solid #1E2E3A" }}
              >
                esc
              </kbd>
            </div>

            {/* Results */}
            {results.length > 0 && (
              <div className="max-h-[320px] overflow-y-auto py-1">
                {results.map((node, i) => {
                  const isSelected = i === selectedIndex;
                  const discColor = DISCIPLINE_COLORS[node.discipline as Discipline] ?? "#4A6070";
                  return (
                    <button
                      key={node.id}
                      onClick={() => selectResult(node)}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                      style={{
                        background: isSelected ? "rgba(42, 59, 71, 0.3)" : "transparent",
                      }}
                    >
                      <span
                        className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                        style={{ background: discColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-sans text-[13px] text-[#B0C8D8] block truncate">
                          {node.name}
                        </span>
                        <span
                          className="font-mono text-[9px] tracking-wide"
                          style={{ color: discColor, opacity: 0.7 }}
                        >
                          {node.discipline}
                        </span>
                      </div>
                      <span className="font-mono text-[9px] text-[#2A3B47] flex-shrink-0">
                        {node.degree} links
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {query.length >= 1 && results.length === 0 && (
              <div className="px-4 py-6 text-center">
                <span className="font-mono text-[11px] text-[#2A3B47]">No models found</span>
              </div>
            )}

            {/* Hint when empty */}
            {query.length === 0 && (
              <div className="px-4 py-4 text-center">
                <span className="font-mono text-[10px] text-[#1E2E3A]">
                  Type to search 700 mental models
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
