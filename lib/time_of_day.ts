export type DayPhaseId = "day" | "dusk" | "night" | "dawn";

import type { CSSProperties } from "react";

export interface DayPhaseConfig {
  id: DayPhaseId;
  duration: number;
  label: string;
  icon: string;
  meterColor: string;
  meterGradient?: string;
  overlay?: {
    color: string;
    opacity: number;
    blendMode?: CSSProperties["mixBlendMode"];
  };
  allowsFullVisibility: boolean;
}

export const DAY_PHASES: DayPhaseConfig[] = [
  {
    id: "day",
    duration: 6, // Reduced from 300 for testing (50x faster)
    label: "Day",
    icon: "\u2600\ufe0f",
    meterColor: "#f8d66d",
    meterGradient: "linear-gradient(90deg, #f8d66d 0%, #ffd281 100%)",
    overlay: {
      color: "#ffd470",
      opacity: 0.1,
      blendMode: "soft-light",
    },
    allowsFullVisibility: true,
  },
  {
    id: "dusk",
    duration: 1, // Reduced from 50 for testing (50x faster)
    label: "Dusk",
    icon: "\ud83c\udf05",
    meterColor: "#ff8a65",
    meterGradient: "linear-gradient(90deg, #ff8a65 0%, #ff6f61 100%)",
    overlay: {
      color: "#ff715a",
      opacity: 0.22,
      blendMode: "multiply",
    },
    allowsFullVisibility: true,
  },
  {
    id: "night",
    duration: 6, // Reduced from 300 for testing (50x faster)
    label: "Night",
    icon: "\ud83c\udf19",
    meterColor: "#4a64d8",
    meterGradient: "linear-gradient(90deg, #4a64d8 0%, #2b3a7a 100%)",
    overlay: {
      color: "#101b3f",
      opacity: 0.4,
      blendMode: "multiply",
    },
    allowsFullVisibility: false,
  },
  {
    id: "dawn",
    duration: 1, // Reduced from 50 for testing (50x faster)
    label: "Dawn",
    icon: "\ud83c\udf04",
    meterColor: "#ffa65c",
    meterGradient: "linear-gradient(90deg, #ffa65c 0%, #ffd07f 100%)",
    overlay: {
      color: "#ff9b63",
      opacity: 0.18,
      blendMode: "screen",
    },
    allowsFullVisibility: true,
  },
];

export const DAY_PHASE_CONFIG: Record<DayPhaseId, DayPhaseConfig> = DAY_PHASES.reduce(
  (acc, phase) => {
    acc[phase.id] = phase;
    return acc;
  },
  {} as Record<DayPhaseId, DayPhaseConfig>
);

export const DAY_CYCLE_TOTAL_STEPS = DAY_PHASES.reduce(
  (sum, phase) => sum + phase.duration,
  0
);

export interface TimeOfDayState {
  /**
   * Current phase of the cycle.
   */
  phase: DayPhaseId;
  /**
   * Steps taken inside the current phase (0-indexed).
   */
  stepInPhase: number;
  /**
   * Steps taken within the active cycle (wraps around DAY_CYCLE_TOTAL_STEPS).
   */
  cycleStep: number;
  /**
   * Number of full cycles completed since the run started.
   */
  cycleCount: number;
}

export function createInitialTimeOfDay(): TimeOfDayState {
  return {
    phase: DAY_PHASES[0]?.id ?? "day",
    stepInPhase: 0,
    cycleStep: 0,
    cycleCount: 0,
  };
}

function resolvePhaseFromStep(step: number): { phase: DayPhaseConfig; stepInPhase: number } {
  let remaining = step;
  for (const phase of DAY_PHASES) {
    if (remaining < phase.duration) {
      return { phase, stepInPhase: remaining };
    }
    remaining -= phase.duration;
  }
  // Safety fallback (should not hit due to modulo arithmetic)
  const lastPhase = DAY_PHASES[DAY_PHASES.length - 1];
  return { phase: lastPhase, stepInPhase: Math.min(remaining, lastPhase.duration - 1) };
}

export function advanceTimeOfDay(
  state: TimeOfDayState | undefined,
  steps: number = 1
): TimeOfDayState {
  const safeState = state ?? createInitialTimeOfDay();
  if (steps <= 0) {
    return { ...safeState };
  }

  const newCycleStepRaw = safeState.cycleStep + steps;
  const additionalCycles = Math.floor(newCycleStepRaw / DAY_CYCLE_TOTAL_STEPS);
  const newCycleStep = newCycleStepRaw % DAY_CYCLE_TOTAL_STEPS;
  const { phase, stepInPhase } = resolvePhaseFromStep(newCycleStep);

  return {
    phase: phase.id,
    stepInPhase,
    cycleStep: newCycleStep,
    cycleCount: safeState.cycleCount + additionalCycles,
  };
}

export function getPhaseProgress(state: TimeOfDayState): number {
  const config = DAY_PHASE_CONFIG[state.phase];
  if (!config || config.duration <= 0) return 0;
  return Math.min(1, Math.max(0, state.stepInPhase / config.duration));
}

export function isCommuteWindow(state: TimeOfDayState): boolean {
  return state.phase === "dusk" || state.phase === "dawn";
}
