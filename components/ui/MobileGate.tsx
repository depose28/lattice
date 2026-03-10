"use client";

import { useState, useEffect } from "react";

export function MobileGate({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < 768);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (isMobile && !dismissed) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center px-8"
        style={{ background: "#070B0F" }}
      >
        <div className="max-w-sm text-center">
          <h1
            className="font-mono text-[11px] tracking-[0.3em] uppercase mb-6"
            style={{ color: "#5A7A8A" }}
          >
            Lattice
          </h1>
          <p className="font-sans text-[14px] leading-relaxed mb-4" style={{ color: "#6A8090" }}>
            This 3D neural graph is built for larger screens. For the full experience with
            orbit controls, node exploration, and the Oracle, please visit on a desktop or tablet.
          </p>
          <button
            onClick={() => setDismissed(true)}
            className="font-mono text-[10px] tracking-widest uppercase px-5 py-2 rounded-full
              transition-colors duration-200"
            style={{
              color: "#8CB4CC",
              border: "1px solid rgba(60, 90, 110, 0.3)",
              background: "rgba(15, 22, 30, 0.5)",
            }}
          >
            Continue anyway
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
