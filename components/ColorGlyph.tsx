import React from "react";
import { COLOR_GLYPHS } from "../lib/color_glyphs";

/**
 * Renders the canonical cave-art glyph for a switch colour (see lib/color_glyphs). Stroked line with a
 * faint carved-shadow so it reads as chiselled into stone rather than printed. Reusable anywhere a
 * colour needs to be shown as a mark — the mural legend is the first user.
 */
export function ColorGlyph({
  colorIndex,
  color,
  size = 16,
  strokeWidth = 1.8,
  opacity = 1,
  className,
  title,
}: {
  colorIndex: number;
  color: string;
  size?: number | string;
  strokeWidth?: number;
  opacity?: number;
  className?: string;
  title?: string;
}) {
  const paths = COLOR_GLYPHS[colorIndex] ?? [];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ opacity, filter: "drop-shadow(0.5px 0.5px 0 rgba(0,0,0,0.55))", overflow: "visible" }}
      role="img"
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export default ColorGlyph;
