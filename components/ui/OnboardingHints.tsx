"use client";

import { useState, useEffect } from "react";
import { useGraphStore } from "@/store/graphStore";

const STORAGE_KEY = "framewerk-onboarded";

const hints = [
  { key: "graph", text: "700 mental models connected by 2,796 semantic edges" },
  { key: "explore", text: "Click nodes to explore · Double-click for Synapse Mode flythrough" },
  { key: "oracle", text: "Switch to Oracle — describe a situation and get a thinking framework" },
  { key: "search", text: "⌘K to search · Filter by discipline · Spotlight edge types" },
];

export function OnboardingHints() {
  const loading = useGraphStore((s) => s.loading);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(STORAGE_KEY);
    if (seen) return;

    // Show hints shortly after loading finishes
    if (!loading) {
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  useEffect(() => {
    if (!visible) return;

    // Auto-dismiss after 12 seconds
    const timer = setTimeout(() => dismiss(), 12000);

    // Dismiss on any click or keypress
    function onInteract() {
      dismiss();
    }
    window.addEventListener("click", onInteract, { once: true });
    window.addEventListener("keydown", onInteract, { once: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, [visible]);

  function dismiss() {
    setDismissed(true);
    localStorage.setItem(STORAGE_KEY, "1");
  }

  if (!visible || dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center"
      style={{
        animation: "onboardingFadeIn 0.8s ease-out",
      }}
    >
      <div
        className="flex flex-col gap-3 px-6 py-5 rounded-lg pointer-events-auto"
        style={{
          background: "rgba(7, 11, 15, 0.92)",
          border: "1px solid rgba(60, 90, 110, 0.2)",
          backdropFilter: "blur(12px)",
          animation: dismissed ? "onboardingFadeOut 0.5s ease-in forwards" : undefined,
        }}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#3A5060] mb-1">
          Quick start
        </span>
        {hints.map((hint, i) => (
          <div
            key={hint.key}
            className="flex items-center gap-3"
            style={{
              animation: `onboardingSlideIn 0.4s ease-out ${i * 0.1}s both`,
            }}
          >
            <span
              className="w-1 h-1 rounded-full flex-shrink-0"
              style={{ background: "#4A6070" }}
            />
            <span className="font-mono text-[11px] text-[#7A8E9C]">
              {hint.text}
            </span>
          </div>
        ))}
        <span className="font-mono text-[9px] text-[#1E2E3A] mt-1 text-center">
          Click anywhere to dismiss
        </span>
      </div>

    </div>
  );
}
