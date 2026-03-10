import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Lattice — 700 mental models as neurons";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#070B0F",
          fontFamily: "monospace",
        }}
      >
        {/* Decorative dots mimicking neural nodes */}
        {Array.from({ length: 40 }).map((_, i) => {
          const x = 100 + (i % 10) * 100 + (i * 37 % 60) - 30;
          const y = 80 + Math.floor(i / 10) * 120 + (i * 53 % 80) - 40;
          const size = 3 + (i * 7 % 5);
          const opacity = 0.08 + (i * 13 % 20) / 100;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: size,
                height: size,
                borderRadius: "50%",
                background: `rgba(42, 59, 71, ${opacity})`,
              }}
            />
          );
        })}

        {/* Three highlighted "fired" nodes */}
        <div
          style={{
            position: "absolute",
            left: 350,
            top: 200,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "#FFE566",
            boxShadow: "0 0 20px rgba(255, 229, 102, 0.5), 0 0 40px rgba(232, 160, 48, 0.3)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 600,
            top: 280,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#E8A030",
            boxShadow: "0 0 16px rgba(232, 160, 48, 0.4), 0 0 30px rgba(232, 160, 48, 0.2)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 820,
            top: 230,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#C47A20",
            boxShadow: "0 0 12px rgba(196, 122, 32, 0.4)",
          }}
        />

        {/* Connecting lines between fired nodes */}
        <svg
          style={{ position: "absolute", top: 0, left: 0 }}
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
        >
          <line x1="356" y1="206" x2="605" y2="285" stroke="#1E2E3A" strokeWidth="1" />
          <line x1="605" y1="285" x2="824" y2="234" stroke="#1E2E3A" strokeWidth="1" />
        </svg>

        {/* Title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 500,
              color: "#B0C8D8",
              letterSpacing: "0.2em",
              textTransform: "uppercase" as const,
            }}
          >
            LATTICE
          </div>
          <div
            style={{
              fontSize: 18,
              color: "#4A6070",
              letterSpacing: "0.15em",
            }}
          >
            700 mental models as neurons
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div style={{ fontSize: 12, color: "#2A3B47", letterSpacing: "0.12em" }}>
            EXPLORE
          </div>
          <div style={{ width: 1, height: 12, background: "#1E2E3A" }} />
          <div style={{ fontSize: 12, color: "#E8A030", letterSpacing: "0.12em" }}>
            ORACLE
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
