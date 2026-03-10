"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useGraphStore } from "@/store/graphStore";
import { useOracle } from "@/hooks/useOracle";
import { DISCIPLINE_COLORS } from "@/lib/constants";
import type { Discipline, OracleResult, OracleRole } from "@/lib/graph/types";
import { playFireSound } from "@/lib/audio";
import { ApiKeyModal } from "@/components/ui/ApiKeyModal";

const ROLE_CONFIG: Record<OracleRole, { label: string; description: string; color: string; icon: string }> = {
  supporting: { label: "Supporting", description: "Models that reinforce your direction", color: "#5DBF6E", icon: "+" },
  challenging: { label: "Challenging", description: "Models that push back on your assumptions", color: "#E8614A", icon: "\u00d7" },
  process: { label: "Process", description: "Frameworks for how to think about it", color: "#8CB4CC", icon: "\u2192" },
};

export function OraclePanel() {
  const [query, setQuery] = useState("");
  const [followUpQuery, setFollowUpQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [shareCopied, setShareCopied] = useState(false);
  const [synthCollapsed, setSynthCollapsed] = useState(false);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const followUpRef = useRef<HTMLInputElement>(null);
  const focusedCardRef = useRef<HTMLDivElement>(null);
  const { submitQuery, submitFollowUp, clearOracle } = useOracle();

  const appMode = useGraphStore((s) => s.appMode);
  const oracleMode = useGraphStore((s) => s.oracleMode);
  const oracleLoading = useGraphStore((s) => s.oracleLoading);
  const oracleResults = useGraphStore((s) => s.oracleResults);
  const oracleQuery = useGraphStore((s) => s.oracleQuery);
  const oracleSynthesis = useGraphStore((s) => s.oracleSynthesis);
  const cascadePhase = useGraphStore((s) => s.cascadePhase);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const fireNode = useGraphStore((s) => s.fireNode);
  const setFlyToNode = useGraphStore((s) => s.setFlyToNode);
  const setAppMode = useGraphStore((s) => s.setAppMode);
  const setOracleFocusedNodeId = useGraphStore((s) => s.setOracleFocusedNodeId);
  const apiKey = useGraphStore((s) => s.apiKey);
  const hydrateApiKey = useGraphStore((s) => s.hydrateApiKey);

  // Hydrate API key from localStorage on mount
  useEffect(() => { hydrateApiKey(); }, [hydrateApiKey]);

  const { flatResults, grouped } = useMemo(() => {
    const groups: Record<OracleRole, OracleResult[]> = {
      supporting: [],
      challenging: [],
      process: [],
    };
    for (const r of oracleResults) {
      const role = r.role && r.role in groups ? r.role : "supporting";
      groups[role].push(r);
    }
    const flat = [...groups.supporting, ...groups.challenging, ...groups.process];
    return { flatResults: flat, grouped: groups };
  }, [oracleResults]);

  // Auto-run oracle from URL ?q= param
  const autoRunRef = useRef(false);
  useEffect(() => {
    if (autoRunRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q && q.trim()) {
      autoRunRef.current = true;
      const check = setInterval(() => {
        const nodes = useGraphStore.getState().nodes;
        if (nodes.length > 0) {
          clearInterval(check);
          setAppMode("oracle");
          setQuery(q.trim());
          submitQuery(q.trim()).catch((err) => {
            setError(err instanceof Error ? err.message : "Oracle request failed");
          });
        }
      }, 200);
      return () => clearInterval(check);
    }
  }, [setAppMode, submitQuery]);

  useEffect(() => {
    if (appMode === "oracle" && !oracleMode && inputRef.current) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [appMode, oracleMode]);

  useEffect(() => {
    setFocusedIndex(0);
    setFollowUpQuery("");
    setSynthCollapsed(false);
  }, [oracleResults]);

  // Fly to focused node when index changes
  useEffect(() => {
    if (flatResults.length > 0 && cascadePhase === "settled") {
      const result = flatResults[focusedIndex];
      if (result) {
        setFlyToNode(result.nodeId);
        setOracleFocusedNodeId(result.nodeId);
        fireNode(result.nodeId, 1.0);
      }
    }
  }, [focusedIndex, cascadePhase, flatResults, setFlyToNode, setOracleFocusedNodeId, fireNode]);

  // Scroll focused card into view
  useEffect(() => {
    if (focusedCardRef.current) {
      focusedCardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusedIndex]);

  // Arrow keys to cycle
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (oracleMode && flatResults.length > 0 && cascadePhase === "settled") {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          e.preventDefault();
          setFocusedIndex((i) => Math.min(i + 1, flatResults.length - 1));
        } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          e.preventDefault();
          setFocusedIndex((i) => Math.max(i - 1, 0));
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [oracleMode, flatResults, cascadePhase]);

  const handleSubmit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || oracleLoading) return;
    setError(null);
    try {
      await submitQuery(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Oracle request failed");
    }
  }, [query, oracleLoading, submitQuery]);

  const handleFollowUp = useCallback(async () => {
    const trimmed = followUpQuery.trim();
    if (!trimmed || oracleLoading) return;
    setError(null);
    try {
      await submitFollowUp(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Follow-up failed");
    }
  }, [followUpQuery, oracleLoading, submitFollowUp]);

  function handleExplore(nodeId: string) {
    setSelectedNode(nodeId);
    fireNode(nodeId, 0.8);
    playFireSound(0.7);
  }

  function handleFocusCard(flatIdx: number) {
    setFocusedIndex(flatIdx);
    const result = flatResults[flatIdx];
    if (result) {
      setFlyToNode(result.nodeId);
      setOracleFocusedNodeId(result.nodeId);
      fireNode(result.nodeId, 1.0);
      playFireSound(0.4);
    }
  }

  if (appMode !== "oracle") return null;

  // ─── Results panel ───
  if (oracleMode && oracleResults.length > 0) {
    let flatOffset = 0;

    return (
      <div
        className="fixed top-3 left-3 bottom-3 w-[500px] z-30 flex flex-col rounded-xl"
        style={{
          background: "rgba(7, 11, 15, 0.96)",
          border: "1px solid rgba(60, 90, 110, 0.12)",
        }}
      >
        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Query hero ── */}
          <div className="px-10 pt-14 pb-8">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-2 h-2 rounded-full" style={{ background: "#E8A030" }} />
              <span className="font-mono text-[10px] text-[#E8A030] tracking-[0.15em] uppercase">
                Oracle
              </span>
            </div>
            <h1 className="font-sans text-[17px] font-medium leading-[1.4] text-[#E4EDF3]">
              {oracleQuery}
            </h1>
          </div>

          {/* ── Synthesis ── */}
          {oracleSynthesis && (
            <div className="px-10 pb-8">
              <div
                className="pl-5"
                style={{ borderLeft: "2px solid rgba(232, 160, 48, 0.3)" }}
              >
                <p className="font-sans text-[12.5px] leading-[1.8] text-[#9AB0C0]">
                  {synthCollapsed && oracleSynthesis.length > 250
                    ? oracleSynthesis.slice(0, oracleSynthesis.lastIndexOf(" ", 250)) + "..."
                    : oracleSynthesis}
                </p>
                {oracleSynthesis.length > 250 && (
                  <button
                    onClick={() => setSynthCollapsed(!synthCollapsed)}
                    className="font-mono text-[9px] text-[#E8A030] tracking-wider mt-3
                      hover:text-[#FFE566] transition-colors"
                  >
                    {synthCollapsed ? "Read more" : "Show less"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Divider ── */}
          <div className="mx-10 h-px" style={{ background: "#1A2830" }} />

          {/* ── Model groups ── */}
          <div className="px-10 pt-8 pb-10">
            <div className="flex items-center gap-2.5 mb-6">
              <span className="font-mono text-[10px] text-[#5A7A8A] tracking-[0.12em] uppercase">
                {flatResults.length} models
              </span>
              <div className="flex-1 h-px" style={{ background: "#1A2830" }} />
            </div>

            {(["supporting", "challenging", "process"] as OracleRole[]).map((role) => {
              const group = grouped[role];
              if (group.length === 0) return null;
              const config = ROLE_CONFIG[role];
              const groupStartIdx = flatOffset;
              flatOffset += group.length;

              return (
                <div key={role} className="mb-8 last:mb-0">
                  {/* Group header */}
                  <div className="flex items-center gap-3 mb-1.5">
                    <span
                      className="font-mono text-[11px] font-medium tracking-[0.1em] uppercase"
                      style={{ color: config.color }}
                    >
                      {config.label}
                    </span>
                    <span className="font-mono text-[10px]" style={{ color: `${config.color}60` }}>
                      {group.length}
                    </span>
                  </div>
                  <p className="font-mono text-[9px] text-[#4A6070] mb-4">
                    {config.description}
                  </p>

                  {/* Model cards */}
                  <div
                    className="rounded-lg overflow-hidden"
                    style={{ border: "1px solid #141E28" }}
                  >
                    {group.map((result, groupIdx) => {
                      const flatIdx = groupStartIdx + groupIdx;
                      const isFocused = flatIdx === focusedIndex;
                      const dc = DISCIPLINE_COLORS[result.discipline as Discipline] ?? "#4A6070";
                      const isLast = groupIdx === group.length - 1;

                      return (
                        <div
                          key={result.nodeId}
                          ref={isFocused ? focusedCardRef : undefined}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleFocusCard(flatIdx)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleFocusCard(flatIdx); }}
                          className="w-full text-left cursor-pointer transition-all duration-200"
                          style={{
                            borderBottom: isLast ? "none" : "1px solid #141E28",
                            borderLeft: isFocused ? `3px solid ${config.color}` : "3px solid transparent",
                            background: isFocused ? "rgba(12, 18, 24, 0.8)" : "transparent",
                          }}
                        >
                          {/* Collapsed row */}
                          <div
                            className="flex items-center gap-3 px-5"
                            style={{ padding: isFocused ? "14px 20px 0 17px" : "12px 20px 12px 17px" }}
                          >
                            <span
                              className="w-[6px] h-[6px] rounded-full flex-shrink-0"
                              style={{ background: dc, opacity: isFocused ? 1 : 0.4 }}
                            />
                            <span
                              className="font-sans flex-1 truncate"
                              style={{
                                fontSize: isFocused ? "14px" : "13px",
                                color: isFocused ? "#E4EDF3" : "#8CA0AE",
                                fontWeight: isFocused ? 500 : 400,
                              }}
                            >
                              {result.name}
                            </span>
                            <span
                              className="font-mono text-[9px] tracking-wider uppercase flex-shrink-0"
                              style={{ color: isFocused ? dc : "#3A5060" }}
                            >
                              {result.discipline.split(" ")[0]}
                            </span>
                          </div>

                          {/* Expanded detail */}
                          {isFocused && (
                            <div className="px-5 pb-5 pt-4" style={{ paddingLeft: "17px" }}>
                              {/* Question — the hero of the card */}
                              {result.question && (
                                <p className="font-sans text-[14px] leading-[1.7] italic text-[#C8DAE6] mb-4 ml-[18px]">
                                  &ldquo;{result.question}&rdquo;
                                </p>
                              )}

                              {/* Insight */}
                              {(result.stance || result.application) && (
                                <p className="font-sans text-[12.5px] leading-[1.8] text-[#7A9AAA] mb-5 ml-[18px]">
                                  {result.stance || result.application}
                                </p>
                              )}

                              {/* Actions row */}
                              <div className="flex items-center justify-between ml-[18px]">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleExplore(result.nodeId);
                                  }}
                                  className="flex items-center gap-2 font-mono text-[10px] tracking-widest
                                    uppercase transition-all duration-200 hover:gap-3 group"
                                  style={{ color: dc }}
                                >
                                  <span>Explore in graph</span>
                                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                                    className="transition-transform group-hover:translate-x-0.5">
                                    <path d="M3 1L7 5L3 9" stroke="currentColor" strokeWidth="1.2"
                                      strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </button>
                                <span className="font-mono text-[9px] text-[#2A3B47]">
                                  {flatIdx + 1}/{flatResults.length}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Fixed footer ── */}
        <div
          className="flex-shrink-0 px-10 py-5"
          style={{ borderTop: "1px solid #1A2830" }}
        >
          {/* Follow-up input */}
          {cascadePhase === "settled" && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-lg mb-4"
              style={{
                background: "rgba(12, 18, 24, 0.7)",
                border: "1px solid rgba(60, 90, 110, 0.15)",
              }}
            >
              <input
                ref={followUpRef}
                type="text"
                value={followUpQuery}
                onChange={(e) => setFollowUpQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleFollowUp();
                  }
                }}
                placeholder="Ask a follow-up..."
                disabled={oracleLoading}
                className="flex-1 bg-transparent font-sans text-[13px] text-[#B0C8D8]
                  placeholder-[#3A5060] outline-none disabled:opacity-50"
              />
              <button
                onClick={handleFollowUp}
                disabled={oracleLoading || !followUpQuery.trim()}
                className="font-mono text-[9px] text-[#4A6A7A] hover:text-[#8CB4CC]
                  tracking-wider uppercase transition-colors disabled:opacity-30"
              >
                Send
              </button>
            </div>
          )}

          {error && (
            <div className="mb-3">
              <span className="font-mono text-[10px] text-[#E8614A]">{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-[#3A5060] tracking-wider">
              <span className="text-[#5A7A8A]">{"\u2191\u2193"}</span> browse
            </span>
            <div className="flex items-center gap-5">
              <button
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("q", oracleQuery);
                  navigator.clipboard.writeText(url.toString());
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 2000);
                }}
                className="font-mono text-[10px] text-[#4A6A7A] hover:text-[#8CB4CC]
                  tracking-widest uppercase transition-colors"
              >
                {shareCopied ? "Copied!" : "Share"}
              </button>
              <button
                onClick={() => setKeyModalOpen(true)}
                className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest uppercase
                  transition-colors"
                style={{ color: apiKey ? "#4A6A7A" : "#E8A030" }}
              >
                <span
                  className="w-[4px] h-[4px] rounded-full"
                  style={{ background: apiKey ? "#5DBF6E" : "#4A6070" }}
                />
                Key
              </button>
              <button
                onClick={clearOracle}
                className="font-mono text-[10px] text-[#4A6A7A] hover:text-[#8CB4CC]
                  tracking-widest uppercase transition-colors"
              >
                New query
              </button>
            </div>
          </div>
        </div>

        <ApiKeyModal open={keyModalOpen} onClose={() => setKeyModalOpen(false)} />
      </div>
    );
  }

  // ─── Oracle input (with inline API key setup) ───
  return (
    <>
      <OracleInputCard
        query={query}
        setQuery={setQuery}
        error={error}
        apiKey={apiKey}
        oracleLoading={oracleLoading}
        inputRef={inputRef}
        onSubmit={handleSubmit}
        onEscape={() => {
          setAppMode("explore");
          setQuery("");
          setError(null);
        }}
        onOpenKeyModal={() => setKeyModalOpen(true)}
      />

      <ApiKeyModal open={keyModalOpen} onClose={() => setKeyModalOpen(false)} />
    </>
  );
}

// ─── Oracle input card (top-left, inline API key) ───
function OracleInputCard({
  query, setQuery, error, apiKey, oracleLoading, inputRef, onSubmit, onEscape, onOpenKeyModal,
}: {
  query: string;
  setQuery: (q: string) => void;
  error: string | null;
  apiKey: string | null;
  oracleLoading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: () => void;
  onEscape: () => void;
  onOpenKeyModal: () => void;
}) {
  const setApiKey = useGraphStore((s) => s.setApiKey);
  const [keyInput, setKeyInput] = useState("");
  const [keyValidation, setKeyValidation] = useState<"idle" | "validating" | "valid" | "invalid">("idle");
  const [keyError, setKeyError] = useState("");

  const PLACEHOLDERS = [
    "Equity in a pre-revenue startup vs. a safe salary bump?",
    "We\u2019re profitable but growing slowly \u2014 should we raise?",
    "My cofounder wants to pivot but we just hit PMF",
  ] as const;
  const [placeholderIdx] = useState(() => Math.floor(Math.random() * PLACEHOLDERS.length));

  async function handleSaveKey() {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setKeyValidation("validating");
    setKeyError("");
    try {
      const res = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "X-Anthropic-Api-Key": trimmed },
      });
      const data = await res.json();
      if (data.valid) {
        setKeyValidation("valid");
        setApiKey(trimmed);
      } else {
        setKeyValidation("invalid");
        setKeyError(data.error ?? "Invalid API key");
      }
    } catch {
      setKeyValidation("invalid");
      setKeyError("Could not validate. Check your connection.");
    }
  }

  const hasKey = !!apiKey || keyValidation === "valid";

  return (
    <div className="fixed top-6 left-6 z-30 w-[460px]">
      <div
        className="rounded-xl transition-all duration-300"
        style={{
          background: "rgba(7, 11, 15, 0.95)",
          border: "1px solid rgba(60, 90, 110, 0.15)",
          boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
        }}
      >
        <div className="p-8">
          {/* Header row */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: oracleLoading ? "#FFE566" : "#E8A030",
                  boxShadow: "0 0 8px rgba(232, 160, 48, 0.3)",
                  animation: oracleLoading ? "oraclePulse 1s ease-in-out infinite" : "none",
                }}
              />
              <span className="font-mono text-[10px] text-[#E8A030] tracking-[0.15em] uppercase">
                Oracle
              </span>
            </div>
            <button
              onClick={onEscape}
              className="text-[#3A5060] hover:text-[#6A8A9A] transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>

          {/* Loading state — replaces description + input while processing */}
          {oracleLoading ? (
            <OracleLoadingStages query={query} />
          ) : (
            <>
              {/* Description */}
              <p className="font-sans text-[13px] leading-[1.75] text-[#8CA0B0] mb-8">
                Describe a decision or situation you&apos;re facing. The Oracle
                will surface the most relevant mental models — what supports
                your thinking, what challenges it, and how to approach it.
              </p>

              {/* Query input */}
              <div className="mb-2">
                <div
                  className="rounded-lg px-5 py-4 transition-opacity duration-200"
                  style={{
                    background: "rgba(15, 22, 30, 0.7)",
                    border: "1px solid rgba(80, 110, 130, 0.15)",
                    opacity: hasKey ? 1 : 0.35,
                  }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSubmit();
                      else if (e.key === "Escape") onEscape();
                    }}
                    placeholder={hasKey
                      ? PLACEHOLDERS[placeholderIdx]
                      : "Add your API key below to get started..."
                    }
                    disabled={!hasKey}
                    className="w-full bg-transparent font-sans text-[14px] leading-relaxed text-[#C8DAE6]
                      placeholder-[#3A5060] outline-none disabled:cursor-default"
                  />
                </div>

                {/* Hint line */}
                {hasKey && (
                  <div className="flex items-center justify-between mt-2.5 px-1">
                    <span className="font-mono text-[9px] text-[#3A5060]">
                      <span className="text-[#5A7A8A]">{"\u21b5"}</span> to submit
                    </span>
                    <button
                      onClick={onSubmit}
                      disabled={!query.trim()}
                      className="font-mono text-[9px] text-[#5A7A8A] hover:text-[#E8A030]
                        tracking-wider uppercase transition-colors disabled:opacity-0"
                    >
                      Submit
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <p className="font-mono text-[10px] text-[#E8614A] mt-3 px-1">
              {error}
            </p>
          )}

          {/* ── Divider ── */}
          <div className="h-px my-6" style={{ background: "#151E28" }} />

          {/* ── API key section ── */}
          {hasKey ? (
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2.5">
                <span className="w-[6px] h-[6px] rounded-full bg-[#5DBF6E]" />
                <span className="font-mono text-[10px] text-[#5A7A8A] tracking-wider">
                  API key active
                </span>
              </div>
              <button
                onClick={onOpenKeyModal}
                className="font-mono text-[9px] text-[#2A3B47] hover:text-[#6A8A9A]
                  tracking-wider transition-colors"
              >
                Change key
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2.5 mb-4 px-1">
                <span className="w-[6px] h-[6px] rounded-full bg-[#4A6070]" />
                <span className="font-mono text-[10px] text-[#6A8A9A] tracking-wider">
                  Anthropic API key required
                </span>
              </div>

              {/* Key input row */}
              <div className="flex items-center gap-2.5 mb-3">
                <input
                  type="text"
                  value={keyInput}
                  onChange={(e) => {
                    setKeyInput(e.target.value);
                    setKeyValidation("idle");
                    setKeyError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveKey();
                  }}
                  placeholder="sk-ant-api03-..."
                  className="flex-1 rounded-lg px-4 py-3 bg-transparent font-mono text-[12px]
                    text-[#B0C8D8] placeholder-[#2A3B47] outline-none"
                  style={{
                    background: "rgba(15, 22, 30, 0.7)",
                    border: keyValidation === "invalid"
                      ? "1px solid rgba(232, 97, 74, 0.4)"
                      : "1px solid rgba(60, 90, 110, 0.12)",
                  }}
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  onClick={handleSaveKey}
                  disabled={!keyInput.trim() || keyValidation === "validating"}
                  className="rounded-lg px-5 py-3 font-mono text-[10px] tracking-wider uppercase
                    transition-all duration-200 disabled:opacity-30 flex-shrink-0"
                  style={{
                    background: "rgba(232, 160, 48, 0.12)",
                    color: "#E8A030",
                    border: "1px solid rgba(232, 160, 48, 0.15)",
                  }}
                >
                  {keyValidation === "validating" ? "Checking..." : "Save"}
                </button>
              </div>

              {keyError && (
                <p className="font-mono text-[10px] text-[#E8614A] mb-3 px-1">
                  {keyError}
                </p>
              )}

              <p className="font-mono text-[9px] text-[#3A5060] leading-relaxed px-1">
                Get yours at console.anthropic.com. Stored in your browser only.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Loading stages animation (two-pass architecture) ───
const PASS1_STAGES = [
  { at: 0, text: "Parsing your question…", icon: "◇" },
  { at: 1.5, text: "Scanning all 700 mental models…", icon: "◈" },
  { at: 4, text: "Shortlisting the 25 most relevant…", icon: "◆" },
] as const;

const PASS2_STAGES = [
  { at: 0, text: "Loading full model profiles & connections…", icon: "◇" },
  { at: 3, text: "Mapping graph edges between candidates…", icon: "◈" },
  { at: 6, text: "Analyzing tensions and complementary pairs…", icon: "◆" },
  { at: 10, text: "Classifying models by role…", icon: "◇" },
  { at: 14, text: "Composing your thinking framework…", icon: "◈" },
] as const;

function OracleLoadingStages({ query }: { query: string }) {
  const oraclePass = useGraphStore((s) => s.oraclePass);
  const [elapsed, setElapsed] = useState(0);
  const [pass2Start, setPass2Start] = useState<number | null>(null);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
    setPass2Start(null);
  }, []);

  // Track when pass 2 starts
  useEffect(() => {
    if (oraclePass === 2 && pass2Start === null) {
      setPass2Start(Date.now());
    }
  }, [oraclePass, pass2Start]);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((Date.now() - startRef.current) / 1000);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const isPass2 = oraclePass === 2;
  const stages = isPass2 ? PASS2_STAGES : PASS1_STAGES;
  const stageElapsed = isPass2 && pass2Start !== null
    ? (Date.now() - pass2Start) / 1000
    : elapsed;

  // Find current stage within the active pass
  let stageIdx = 0;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stageElapsed >= stages[i].at) {
      stageIdx = i;
      break;
    }
  }
  const stage = stages[stageIdx];

  // Progress: Pass 1 fills 0–40%, Pass 2 fills 40–90%
  let progress: number;
  if (!isPass2) {
    const pass1Progress = Math.min(stageElapsed / 8, 1);
    progress = pass1Progress * 40;
  } else {
    const pass2Progress = Math.min(stageElapsed / 20, 1);
    progress = 40 + pass2Progress * 50;
  }

  const formatTime = (s: number) => {
    const secs = Math.floor(s);
    return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  return (
    <div>
      {/* User's query */}
      <p className="font-sans text-[14px] leading-[1.6] text-[#C8DAE6] mb-6">
        {query}
      </p>

      {/* Pass indicator */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span
            className="w-[6px] h-[6px] rounded-full"
            style={{ background: isPass2 ? "#5DBF6E" : "#E8A030", boxShadow: !isPass2 ? "0 0 6px rgba(232,160,48,0.4)" : "none" }}
          />
          <span className="font-mono text-[9px] tracking-wider uppercase" style={{ color: isPass2 ? "#5DBF6E" : "#E8A030" }}>
            Pass 1 — Shortlist
          </span>
          {isPass2 && <span className="font-mono text-[9px] text-[#5DBF6E]">✓</span>}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-[6px] h-[6px] rounded-full"
            style={{ background: isPass2 ? "#E8A030" : "#2A3B47", boxShadow: isPass2 ? "0 0 6px rgba(232,160,48,0.4)" : "none" }}
          />
          <span className="font-mono text-[9px] tracking-wider uppercase" style={{ color: isPass2 ? "#E8A030" : "#3A5060" }}>
            Pass 2 — Deep analysis
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div
          className="h-[3px] rounded-full overflow-hidden"
          style={{ background: "#0C1318" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #E8A030, #FFE566)",
            }}
          />
        </div>
      </div>

      {/* Stage message */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2.5">
          <span
            className="font-mono text-[11px] text-[#E8A030]"
            style={{ animation: "oraclePulse 1.5s ease-in-out infinite" }}
          >
            {stage.icon}
          </span>
          <span className="font-sans text-[13px] text-[#8CA0B0] transition-all duration-300">
            {stage.text}
          </span>
        </div>
        <span className="font-mono text-[11px] tabular-nums text-[#4A6070]">
          {formatTime(elapsed)}
        </span>
      </div>

      {/* Completed stages checklist */}
      <div className="space-y-2.5">
        {/* Show completed Pass 1 stages when in Pass 2 */}
        {isPass2 && PASS1_STAGES.map((s, i) => (
          <div
            key={`p1-${i}`}
            className="flex items-center gap-2.5"
          >
            <span className="font-mono text-[10px] text-[#5DBF6E]">✓</span>
            <span className="font-mono text-[10px] text-[#6A8A9A]">{s.text}</span>
          </div>
        ))}

        {/* Current pass stages */}
        {stages.map((s, i) => {
          const done = i < stageIdx;
          const active = i === stageIdx;
          if (i > stageIdx + 1) return null;
          return (
            <div
              key={`p${oraclePass}-${i}`}
              className="flex items-center gap-2.5 transition-all duration-300"
              style={{ opacity: active ? 1 : 0.15 }}
            >
              <span className="font-mono text-[10px]" style={{ color: done ? "#5DBF6E" : active ? "#E8A030" : "#2A3B47" }}>
                {done ? "✓" : active ? "›" : "·"}
              </span>
              <span className="font-mono text-[10px]" style={{ color: done ? "#6A8A9A" : active ? "#8CA0B0" : "#2A3B47" }}>
                {s.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
