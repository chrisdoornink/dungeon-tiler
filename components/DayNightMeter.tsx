import React from "react";
import {
  DAY_PHASES,
  DAY_PHASE_CONFIG,
  DAY_CYCLE_TOTAL_STEPS,
  type TimeOfDayState,
} from "../lib/time_of_day";

interface DayNightMeterProps {
  timeOfDay: TimeOfDayState;
  className?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const DayNightMeter: React.FC<DayNightMeterProps> = ({ timeOfDay, className }) => {
  const phaseConfig = DAY_PHASE_CONFIG[timeOfDay.phase];
  const totalSteps = DAY_CYCLE_TOTAL_STEPS || 1;
  const cycleProgress = clamp(timeOfDay.cycleStep / totalSteps, 0, 1);
  const indicatorLeft = `${clamp(cycleProgress * 100, 1, 99)}%`;
  const stepsRemaining = phaseConfig
    ? Math.max(0, phaseConfig.duration - timeOfDay.stepInPhase)
    : 0;
  const commuteWindow = timeOfDay.phase === "dusk" || timeOfDay.phase === "dawn";
  const cycleLabel = `Cycle ${timeOfDay.cycleCount + 1}`;
  const stepLabel = `Step ${timeOfDay.cycleStep + 1}/${totalSteps}`;

  return (
    <div
      className={[
        "min-w-[220px] rounded-md border border-white/10 bg-[#121212]/95 px-3 py-2 text-white shadow-lg shadow-black/40",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center justify-between text-xs font-semibold tracking-wide">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="text-base">
            {phaseConfig?.icon ?? "\u2600\ufe0f"}
          </span>
          {phaseConfig?.label ?? "Day"}
        </span>
        <span className="text-[10px] font-normal text-white/70">
          {stepsRemaining} steps left
        </span>
      </div>
      <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-black/60">
        <div className="flex h-full w-full">
          {DAY_PHASES.map((phase, index) => {
            const gradient = phase.meterGradient ?? phase.meterColor;
            return (
              <div
                key={phase.id}
                className="h-full"
                style={{
                  flexGrow: phase.duration,
                  background: gradient,
                  boxShadow:
                    index < DAY_PHASES.length - 1
                      ? "inset -1px 0 0 rgba(0,0,0,0.35)"
                      : undefined,
                }}
              />
            );
          })}
        </div>
        <div
          className="absolute top-1/2 h-4 w-1.5 -translate-y-1/2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.85)]"
          style={{ left: indicatorLeft, transform: "translate(-50%, -50%)" }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-white/65">
        <span>
          {cycleLabel}
          <span className="mx-1 text-white/35">•</span>
          {stepLabel}
        </span>
        {commuteWindow && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 font-semibold uppercase tracking-wider text-amber-100">
            <span aria-hidden="true">🚶</span>
            Commute
          </span>
        )}
      </div>
    </div>
  );
};

export default DayNightMeter;
