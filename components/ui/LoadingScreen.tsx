"use client";

import { useEffect, useState } from "react";
import { useGraphStore } from "@/store/graphStore";
import { BACKGROUND_COLOR } from "@/lib/constants";

export function LoadingScreen() {
  const loading = useGraphStore((s) => s.loading);
  const loadProgress = useGraphStore((s) => s.loadProgress);
  const [fadeOut, setFadeOut] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!loading) {
      setFadeOut(true);
      const timer = setTimeout(() => setHidden(true), 800);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  if (hidden) return null;

  const progress = Math.min(loadProgress / 700, 1);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-700"
      style={{
        background: BACKGROUND_COLOR,
        opacity: fadeOut ? 0 : 1,
        pointerEvents: fadeOut ? "none" : "auto",
      }}
    >
      {/* Minimal neuron pulse */}
      <div className="relative w-16 h-16 mb-8">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, #2A3B47 0%, transparent 70%)",
            animation: "neuronPulse 2s ease-in-out infinite",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: `${4 + progress * 8}px`,
            height: `${4 + progress * 8}px`,
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: progress > 0.8 ? "#6A8A9A" : "#2A3B47",
            transition: "all 0.3s ease",
          }}
        />
        {/* Dendrite lines radiating outward */}
        {[0, 60, 120, 180, 240, 300].map((angle, i) => (
          <div
            key={angle}
            className="absolute"
            style={{
              width: "1px",
              height: `${progress * 20}px`,
              left: "50%",
              top: "50%",
              backgroundColor: "#1E2E3A",
              transform: `rotate(${angle}deg) translateY(-${4 + progress * 4}px)`,
              transformOrigin: "top center",
              opacity: progress > i * 0.15 ? 0.6 : 0,
              transition: "all 0.5s ease",
            }}
          />
        ))}
      </div>

      <p
        className="font-mono text-[10px] uppercase tracking-[0.2em] mb-3"
        style={{ color: "#3A5060" }}
      >
        Mapping neural lattice
      </p>

      {/* Progress bar */}
      <div
        className="w-32 h-px relative overflow-hidden"
        style={{ backgroundColor: "#111E28" }}
      >
        <div
          className="absolute inset-y-0 left-0 transition-all duration-300 ease-out"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: "#2A3B47",
          }}
        />
      </div>

      <p
        className="font-mono text-[9px] tracking-[0.15em] mt-2"
        style={{ color: "#1E2E3A" }}
      >
        {loadProgress} / 700
      </p>

    </div>
  );
}
