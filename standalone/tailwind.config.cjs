/** @type {import('tailwindcss').Config} */
// Mirrors the root tailwind.config.js (stock Tailwind 3, no custom theme) but points
// content scanning at the shared engine so the utility classes used by GameView /
// TilemapGrid / HUD components get generated into the standalone bundle.
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../components/**/*.{js,ts,jsx,tsx}",
    "../lib/**/*.{js,ts,jsx,tsx}",
    "../app/globals.css",
  ],
  theme: { extend: {} },
  plugins: [],
};
