import React, { useCallback, useState } from "react";
// The whole point of the spike: import the SHARED engine unchanged.
import GameView from "../../components/GameView";

type Phase = "start" | "playing" | "over";

// Inline styles on the shell so the start screen doesn't depend on Tailwind.
const shell: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#1c1830",
  color: "#f5f3ff",
  fontFamily: "monospace",
  textAlign: "center",
  padding: 16,
};

export default function EndlessApp() {
  const [phase, setPhase] = useState<Phase>("start");
  const [runId, setRunId] = useState(0);

  const start = useCallback(() => {
    setRunId((n) => n + 1);
    setPhase("playing");
  }, []);

  const onRunOver = useCallback(() => setPhase("over"), []);

  if (phase === "playing") {
    // key={runId} forces a fresh engine mount so "Descend again" re-initializes.
    return <GameView key={runId} storageSlot="endless" onDailyComplete={onRunOver} />;
  }

  return (
    <div style={shell}>
      <div style={{ maxWidth: 440, display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fcd34d", margin: 0 }}>
          Endless Mode — Standalone Spike
        </h1>
        <p style={{ color: "#cbd5e1", lineHeight: 1.5, margin: 0 }}>
          Phase 0 portability test. Runs the shared <code>GameView</code> engine with
          no Next.js, no server, and no leaderboard — just to prove it plays.
        </p>
        {phase === "over" && (
          <p style={{ color: "#f87171", margin: 0 }}>
            Run ended. Descend again to verify a clean re-init.
          </p>
        )}
        <button
          onClick={start}
          style={{
            background: "#d97706",
            color: "#fff",
            fontWeight: 700,
            padding: "12px 24px",
            borderRadius: 8,
            border: 0,
            cursor: "pointer",
            fontSize: 16,
          }}
        >
          Descend
        </button>
      </div>
    </div>
  );
}
