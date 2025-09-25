import React from "react";
import Image from "next/image";
import {
  DAY_PHASES,
  DAY_PHASE_CONFIG,
  DAY_CYCLE_TOTAL_STEPS,
  type TimeOfDayState,
} from "../lib/time_of_day";

type DayNightMeterVariant = 'rich' | 'minimal' | 'story';

interface DayNightMeterProps {
  timeOfDay: TimeOfDayState;
  className?: string;
  minimal?: boolean; // legacy: when true, hide labels/details and show only icon + meter
  variant?: DayNightMeterVariant; // preferred over `minimal`
  sunIconUrl?: string; // optional asset override for story variant
  moonIconUrl?: string; // optional asset override for story variant
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const DayNightMeter: React.FC<DayNightMeterProps> = ({ timeOfDay, className, minimal = false, variant = 'rich', sunIconUrl, moonIconUrl }) => {
  // Visual tweaks: treat dawn/dusk as day for appearance
  const visualPhaseId = (timeOfDay.phase === 'dawn' || timeOfDay.phase === 'dusk') ? 'day' : timeOfDay.phase;
  const phaseConfig = DAY_PHASE_CONFIG[visualPhaseId];
  const totalSteps = DAY_CYCLE_TOTAL_STEPS || 1;
  const cycleProgress = clamp(timeOfDay.cycleStep / totalSteps, 0, 1);
  const indicatorLeft = `${clamp(cycleProgress * 100, 1, 99)}%`;
  const stepsRemaining = phaseConfig
    ? Math.max(0, phaseConfig.duration - timeOfDay.stepInPhase)
    : 0;
  // Do not show commute window chip visually
  const commuteWindow = false;
  const cycleLabel = `Cycle ${timeOfDay.cycleCount + 1}`;
  const stepLabel = `Step ${timeOfDay.cycleStep + 1}/${totalSteps}`;

  // Determine effective variant (legacy minimal prop takes precedence)
  const mode: DayNightMeterVariant = minimal ? 'minimal' : variant;

  // Story variant: circular monochrome meter with sun (top), moon (bottom), and cycle number in center
  if (mode === 'story') {
    const size = 28; // tiny dial (kept same)
    const strokeTrack = 2;
    const strokeProgress = 2;
    const radius = (size / 2) - Math.max(strokeTrack, strokeProgress) - 2; // tight padding
    const circumference = 2 * Math.PI * radius;
    const progress = clamp(timeOfDay.cycleStep / (DAY_CYCLE_TOTAL_STEPS || 1), 0, 1);
    const dashArray = circumference.toFixed(2);
    const dashOffset = (circumference * (1 - progress)).toFixed(2);

    return (
      <div className={[className ?? ""].filter(Boolean).join(" ")}> 
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
          {/* Sun (top) */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden="true" style={{ top: -4 }}>
            {sunIconUrl ? (
              <Image src={sunIconUrl} alt="Sun" width={12} height={12} style={{ display: 'block' }} />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="4" fill="white" />
                <g stroke="white" strokeWidth="1.2">
                  <line x1="12" y1="2" x2="12" y2="5.2" />
                  <line x1="12" y1="18.8" x2="12" y2="22" />
                </g>
              </svg>
            )}
          </div>
          {/* Moon (bottom) */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" aria-hidden="true" style={{ bottom: -4 }}>
            {moonIconUrl ? (
              <Image src={moonIconUrl} alt="Moon" width={12} height={12} style={{ display: 'block' }} />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16.5 12c0-3.59-2.91-6.5-6.5-6.5c-.54 0-1.06.07-1.56.2A6.5 6.5 0 1 0 16.3 17.56c.13-.5.2-1.02.2-1.56z" fill="white" />
              </svg>
            )}
          </div>

          {/* SVG Ring */}
          <svg width={size} height={size} className="rotate-[-180deg]">
            {/* Track */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth={strokeTrack}
              fill="none"
            />
            {/* Progress */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="white"
              strokeWidth={strokeProgress}
              strokeLinecap="round"
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              fill="none"
            />
          </svg>

          {/* Center cycle count (tiny, system font) */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, sans-serif', fontSize: 7, lineHeight: '8px', fontWeight: 800 }}>
              {timeOfDay.cycleCount + 1}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Minimal monochrome rendering: slim bar, white icons, no labels
  if (mode === 'minimal') {
    return (
      <div
        className={[
          "min-w-[200px] rounded-md border border-white/10 bg-[#121212]/95 px-3 py-2 text-white shadow-lg shadow-black/40",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="relative mt-0.5 h-1.5 w-full overflow-visible rounded-full bg-white/15">
          {/* Sun icon (left/start) */}
          <div
            className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2"
            aria-hidden="true"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="4" fill="white" />
              <g stroke="white" strokeWidth="1.5">
                <line x1="12" y1="1.5" x2="12" y2="5" />
                <line x1="12" y1="19" x2="12" y2="22.5" />
                <line x1="1.5" y1="12" x2="5" y2="12" />
                <line x1="19" y1="12" x2="22.5" y2="12" />
                <line x1="4.2" y1="4.2" x2="6.7" y2="6.7" />
                <line x1="17.3" y1="17.3" x2="19.8" y2="19.8" />
                <line x1="17.3" y1="6.7" x2="19.8" y2="4.2" />
                <line x1="4.2" y1="19.8" x2="6.7" y2="17.3" />
              </g>
            </svg>
          </div>

          {/* Moon icon (midpoint) */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            aria-hidden="true"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M16.5 12c0-3.59-2.91-6.5-6.5-6.5c-.54 0-1.06.07-1.56.2A6.5 6.5 0 1 0 16.3 17.56c.13-.5.2-1.02.2-1.56z"
                fill="white"
              />
            </svg>
          </div>

          {/* Progress indicator */}
          <div
            className="absolute top-1/2 h-3 w-1 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.75)]"
            style={{ left: indicatorLeft, transform: "translate(-50%, -50%)" }}
            aria-hidden="true"
          />
        </div>
      </div>
    );
  }

  // Rich mode (default): colored phases and labels
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
            // Render dawn/dusk with the day gradient to avoid distinct visuals
            const isTwilight = phase.id === 'dawn' || phase.id === 'dusk';
            const dayGradient = DAY_PHASE_CONFIG['day'].meterGradient ?? DAY_PHASE_CONFIG['day'].meterColor;
            const gradient = isTwilight
              ? dayGradient
              : (phase.meterGradient ?? phase.meterColor);
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
