/**
 * styled-jsx's `<style jsx>` attribute, used by components/DeathScreen.tsx.
 *
 * Next enables styled-jsx by default, so the Next app's typecheck accepts this attribute
 * without help. In the standalone the attribute is inert (the Vite build has no styled-jsx
 * transform) — this only keeps the type checker honest about markup that really exists.
 *
 * The `import "react"` is LOAD-BEARING, not a stray: it makes this file a module, which is
 * what turns `declare module "react"` into an AUGMENTATION of React's types. Without it the
 * declaration is read as an ambient module that REPLACES them wholesale, and every hook and
 * type the shared components import from react ("has no exported member 'useEffect'")
 * vanishes at once. Same reason the CSS-module wildcard can't live in this file.
 */
import "react";

declare module "react" {
  interface StyleHTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}
