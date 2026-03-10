"use client";

import { useState, useRef, useEffect } from "react";
import { useGraphStore } from "@/store/graphStore";

interface ApiKeyModalProps {
  open: boolean;
  onClose: () => void;
}

type ValidationState = "idle" | "validating" | "valid" | "invalid";

export function ApiKeyModal({ open, onClose }: ApiKeyModalProps) {
  const storedKey = useGraphStore((s) => s.apiKey);
  const setApiKey = useGraphStore((s) => s.setApiKey);

  const [inputValue, setInputValue] = useState("");
  const [validation, setValidation] = useState<ValidationState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setInputValue(storedKey ?? "");
      setValidation(storedKey ? "valid" : "idle");
      setErrorMsg("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, storedKey]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSave() {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    setValidation("validating");
    setErrorMsg("");

    try {
      const res = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "X-Anthropic-Api-Key": trimmed },
      });
      const data = await res.json();

      if (data.valid) {
        setValidation("valid");
        setApiKey(trimmed);
        // Close after brief success feedback
        setTimeout(() => onClose(), 600);
      } else {
        setValidation("invalid");
        setErrorMsg(data.error ?? "Invalid API key");
      }
    } catch {
      setValidation("invalid");
      setErrorMsg("Could not validate key. Check your connection.");
    }
  }

  function handleRemove() {
    setApiKey(null);
    setInputValue("");
    setValidation("idle");
    setErrorMsg("");
  }

  // Mask key for display: show first 8 and last 4 chars
  function maskKey(key: string): string {
    if (key.length <= 16) return key;
    return key.slice(0, 8) + "\u2022".repeat(8) + key.slice(-4);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: "rgba(0, 0, 0, 0.6)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50
          w-[420px] rounded-xl overflow-hidden"
        style={{
          background: "rgba(10, 16, 22, 0.98)",
          border: "1px solid rgba(60, 90, 110, 0.2)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
      >
        <div className="px-7 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-mono text-[10px] text-[#E8A030] tracking-[0.15em] uppercase">
              API Key
            </h2>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center text-[#3A5060] hover:text-[#6A8A9A] transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>

          {/* Description */}
          <p className="font-sans text-[12px] leading-[1.7] text-[#6A8090] mb-5">
            Enter your Anthropic API key to use Oracle mode. Your key is stored
            in your browser only and sent directly to Anthropic&apos;s API through
            this app&apos;s server. It is never logged or stored server-side.
          </p>

          {/* Input */}
          <div className="mb-4">
            <label className="font-mono text-[9px] text-[#4A6070] tracking-wider uppercase block mb-2">
              Anthropic API Key
            </label>
            <div
              className="flex items-center gap-2 rounded-lg px-4 py-3"
              style={{
                background: "rgba(15, 22, 30, 0.8)",
                border: validation === "invalid"
                  ? "1px solid rgba(232, 97, 74, 0.4)"
                  : validation === "valid"
                    ? "1px solid rgba(93, 191, 110, 0.3)"
                    : "1px solid rgba(60, 90, 110, 0.15)",
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={storedKey && inputValue === storedKey ? maskKey(inputValue) : inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setValidation("idle");
                  setErrorMsg("");
                }}
                onFocus={() => {
                  // Show full key on focus if editing stored key
                  if (storedKey && inputValue === storedKey) {
                    setInputValue(storedKey);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
                placeholder="sk-ant-api03-..."
                className="flex-1 bg-transparent font-mono text-[12px] text-[#B0C8D8]
                  placeholder-[#2A3B47] outline-none"
                spellCheck={false}
                autoComplete="off"
              />
              {validation === "valid" && (
                <div className="w-2 h-2 rounded-full bg-[#5DBF6E] flex-shrink-0" />
              )}
              {validation === "validating" && (
                <div
                  className="w-2 h-2 rounded-full bg-[#E8A030] flex-shrink-0"
                  style={{ animation: "oraclePulse 1s ease-in-out infinite" }}
                />
              )}
            </div>
          </div>

          {/* Error message */}
          {errorMsg && (
            <p className="font-mono text-[10px] text-[#E8614A] mb-4">
              {errorMsg}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={!inputValue.trim() || validation === "validating"}
              className="flex-1 py-2.5 rounded-lg font-mono text-[10px] tracking-wider uppercase
                transition-all duration-200 disabled:opacity-30"
              style={{
                background: "rgba(232, 160, 48, 0.15)",
                color: "#E8A030",
                border: "1px solid rgba(232, 160, 48, 0.2)",
              }}
            >
              {validation === "validating" ? "Validating..." : validation === "valid" ? "Saved" : "Save & Validate"}
            </button>
            {storedKey && (
              <button
                onClick={handleRemove}
                className="py-2.5 px-4 rounded-lg font-mono text-[10px] tracking-wider uppercase
                  text-[#4A6070] hover:text-[#E8614A] transition-colors"
                style={{
                  border: "1px solid rgba(60, 90, 110, 0.12)",
                }}
              >
                Remove
              </button>
            )}
          </div>

          {/* Privacy note */}
          <p className="font-mono text-[8px] text-[#2A3B47] leading-relaxed mt-5">
            Get your key at console.anthropic.com. Your key is stored in
            localStorage and never leaves your browser except to call the
            Anthropic API via this app&apos;s server.
          </p>
        </div>
      </div>
    </>
  );
}
