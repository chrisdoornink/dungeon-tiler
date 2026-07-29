import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "..");

// Rewrite absolute "/images/..." url()s baked into the extracted CSS (e.g. the item-icon
// backgrounds in Tile.module.css) so they resolve under a CDN subpath. The CSS bundle is
// emitted to <base>/assets/index-*.css while public/ is copied to <base>/images/, so the
// stylesheet must reach images one directory up: /images/ -> ../images/. JS asset paths
// are handled separately by assetUrl(); Vite's own url()s (fonts) are already relative.
function rewritePublicCssUrls(): Plugin {
  return {
    name: "rewrite-public-css-urls",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (
          file.type === "asset" &&
          file.fileName.endsWith(".css") &&
          typeof file.source === "string"
        ) {
          file.source = file.source.replace(
            /url\((['"]?)\/images\//g,
            "url($1../images/"
          );
        }
      }
    },
  };
}

// Standalone HTML5 build of endless mode. Imports the SHARED lib/ + components/ engine
// unchanged; the only deltas are three next/* shims (aliased below), a real Tailwind/
// PostCSS pipeline for app/globals.css, self-hosted fonts, and relative asset URLs
// (base:'./' + assetUrl() for JS + the CSS plugin above).
export default defineConfig({
  root: dirname,
  // Relative base so the bundle works from an arbitrary CDN subpath inside a portal iframe.
  base: "./",
  plugins: [react(), rewritePublicCssUrls()],
  publicDir: path.resolve(repoRoot, "public"),
  resolve: {
    // The shared components import bare "react" from repoRoot/node_modules; make sure
    // the entry resolves to that same single copy (no dual-React hook crashes).
    dedupe: ["react", "react-dom"],
    alias: {
      "next/image": path.resolve(dirname, "src/shims/next-image.tsx"),
      "next/link": path.resolve(dirname, "src/shims/next-link.tsx"),
      "next/navigation": path.resolve(dirname, "src/shims/next-navigation.ts"),
      // Drop posthog-js from the bundle: portals run their own consent/analytics, and a
      // kids-skewing iframe shouldn't ship third-party autocapture. Stub = no-op.
      "posthog-js": path.resolve(dirname, "src/shims/posthog-stub.ts"),
    },
  },
  // Vite auto-loads standalone/postcss.config.cjs (tailwindcss + autoprefixer), which
  // processes app/globals.css @tailwind directives into real utilities.
  server: {
    port: 4001,
    strictPort: true,
    // Allow serving the shared source and node_modules that live above standalone/.
    fs: { allow: [repoRoot] },
  },
});
