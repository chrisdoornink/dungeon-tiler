/**
 * CSS-module declarations for the standalone typecheck.
 *
 * In the Next app these come free from `/// <reference types="next" />` in next-env.d.ts.
 * The standalone deliberately doesn't pull Next's global types in — the point of this build
 * is not needing Next — so what the shared engine actually leans on is spelled out here.
 *
 * This file MUST stay a global script (no top-level import/export): a wildcard ambient
 * module declaration is only legal outside a module. The styled-jsx augmentation, which
 * needs the opposite, therefore lives in its own file — see styled-jsx.d.ts.
 *
 * Tile, TilemapGrid, PixelFlame, DialogueOverlay, CoilwyrmStench and BedInteractionModal
 * each import a *.module.css. Vite handles these natively; tsc needs to be told they
 * resolve to a class-name map.
 */
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
