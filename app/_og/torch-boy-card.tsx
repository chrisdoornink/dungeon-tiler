import type { CSSProperties } from "react";

/**
 * Shared social-card artwork for the OpenGraph + Twitter image routes. Rendered
 * to PNG at build time by `next/og`'s Satori engine, so only the flexbox subset
 * of CSS is available (every element with >1 child needs an explicit display,
 * and each text run lives in its own element).
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;

const root: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  padding: "80px",
  background:
    "linear-gradient(135deg, #1a1530 0%, #0d0b1a 60%, #05040a 100%)",
  color: "#f5f3ff",
  fontFamily: "sans-serif",
  overflow: "hidden",
};

const glow: CSSProperties = {
  position: "absolute",
  top: -140,
  right: -120,
  width: 560,
  height: 560,
  borderRadius: 9999,
  background:
    "radial-gradient(circle, rgba(249,214,92,0.38) 0%, rgba(249,214,92,0) 70%)",
  display: "flex",
};

export function TorchBoyCard() {
  return (
    <div style={root}>
      <div style={glow} />
      <div
        style={{
          display: "flex",
          fontSize: 30,
          letterSpacing: 10,
          color: "#f9d65c",
        }}
      >
        DAILY DUNGEON ROGUELITE
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 148,
          fontWeight: 800,
          lineHeight: 1,
          marginTop: 20,
          color: "#ffffff",
        }}
      >
        Torch Boy
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 46,
          marginTop: 28,
          color: "#c9c4e0",
        }}
      >
        A new dungeon. Every day.
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 44,
          width: 180,
          height: 8,
          borderRadius: 4,
          background: "#f9d65c",
        }}
      />
    </div>
  );
}
