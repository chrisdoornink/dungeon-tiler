// Canonical per-colour GLYPHS — a cave-art symbol unique to each switch colour, for anywhere a colour
// must be shown as a MARK rather than a swatch (cipher-room murals today; reusable on switches, HUD,
// etc. later). One entry per palette index (parallel to TOGGLE_STATE_COLORS in lib/map/machinery):
//
//   0 blue -> water (two wavy lines)   1 green -> leaf (outline + midrib)
//   2 violet -> spiral                 3 rose  -> sun (ring + rays)
//
// The shapes are deliberately mnemonic where a colour has an obvious natural sign, so a glyph both
// identifies the colour AND is memorable. KEEP THESE STABLE across releases — players learn them, and
// the whole point is that the same colour always draws the same mark everywhere it appears.
//
// Each glyph is a list of STROKED SVG paths in a 0 0 24 24 viewBox (cave art is carved line, not fill).
export const COLOR_GLYPHS: ReadonlyArray<ReadonlyArray<string>> = [
  // 0 — water
  ["M3 9 q2.75 -3 5.5 0 t5.5 0 t5.5 0", "M3 15 q2.75 -3 5.5 0 t5.5 0 t5.5 0"],
  // 1 — leaf
  ["M12 3 C6 8 6 15 12 21 C18 15 18 8 12 3 Z", "M12 6 L12 18"],
  // 2 — spiral
  ["M12 12 c0 -1.6 2.4 -1.6 2.4 0 c0 2.6 -4 2.6 -4 0 c0 -3.8 5.6 -3.8 5.6 0 c0 5 -7.2 5 -7.2 0"],
  // 3 — sun
  [
    "M12 8.4 a3.6 3.6 0 1 0 0.01 0 Z",
    "M12 1.5 L12 4.3 M12 19.7 L12 22.5 M1.5 12 L4.3 12 M19.7 12 L22.5 12 M4.8 4.8 L6.8 6.8 M17.2 17.2 L19.2 19.2 M19.2 4.8 L17.2 6.8 M4.8 19.2 L6.8 17.2",
  ],
] as const;

/** Total distinct glyphs available (matches the switch-colour palette size). */
export const COLOR_GLYPH_COUNT = COLOR_GLYPHS.length;
