"use client";

import { useEffect } from "react";

/**
 * Preloads frequently used images to warm the browser cache.
 * Runs once on app start. Keep the list curated to avoid over-downloading.
 */
export default function PreloadImages() {
  useEffect(() => {
    const urls: string[] = [
      // Floors (known variants)
      "/images/floor/floor-try-1.png",
      "/images/floor/generated/cave-floor-sheet-v1.webp",
      "/images/floor/floor-1000.png",
      "/images/floor/floor-1001.png",
      "/images/floor/floor-0001.png",
      "/images/floor/outdoor-floor-0000.png",
      "/images/floor/outdoor-floor-1000.png",
      "/images/floor/in-house-floor-0000.png",
      "/images/floor/in-house-floor-1000.png",
      "/images/floor/dirt-road-i.png",
      "/images/floor/dirt-road-r.png",
      "/images/floor/dirt-road-t.png",
      "/images/floor/dirt-road-end.png",

      // Walls (all 8 NESW variants implemented)
      "/images/wall/wall-0000.png",
      "/images/wall/wall-0001.png",
      "/images/wall/wall-0010.png",
      "/images/wall/wall-0011.png",
      "/images/wall/wall-0100.png",
      "/images/wall/wall-0101.png",
      "/images/wall/wall-0110.png",
      "/images/wall/wall-0111.png",
      "/images/wall/outdoor-wall-0000.png",
      "/images/wall/outdoor-wall-0001.png",
      "/images/wall/outdoor-wall-0010.png",
      "/images/wall/outdoor-wall-0011.png",
      "/images/wall/outdoor-wall-0100.png",
      "/images/wall/outdoor-wall-0101.png",
      "/images/wall/outdoor-wall-0110.png",
      "/images/wall/outdoor-wall-0111.png",
      "/images/roof/spanish-roof-main.png",
      "/images/roof/spanish-roof-back-overhang.png",
      "/images/roof/spanish-roof-front-overhang.png",

      // Exit + lock
      "/images/door/exit-dark.png",
      "/images/door/exit-transparent.png",
      "/images/door/house-door-clean.png",
      "/images/door/gold-chain-lock-clean.png",

      // Items seen early
      "/images/items/closed-chest.png",
      "/images/items/opened-chest.png",
      "/images/items/key-clean.png",
      "/images/items/exit-key-clean.png",
      "/images/items/switch.png",
      "/images/items/sword-clean.png",
      "/images/items/shield-clean.png",
      // Chest-reveal items + bomb (these popped in late when a chest opened)
      "/images/items/snake-medallion-blue-clean.png",
      "/images/items/heart-clean.png",
      "/images/items/pink-heart-clean.png",
      "/images/items/berry.png",
      "/images/items/amber-moth.png",
      "/images/items/bomb-black-clean.png",
      "/images/items/bomb-red-clean.png",
      // Bomb explosion frames
      "/images/items/bam1-clean.png",
      "/images/items/bam2-clean.png",
      "/images/items/bam3-clean.png",
      "/images/items/pot-1-clean.png",
      "/images/items/pot-2-clean.png",
      "/images/items/pot-3-clean.png",
      "/images/items/rock-1-clean.png",
      "/images/items/rock-2-clean.png",
      "/images/items/food-1-clean.png",
      "/images/items/food-2-clean.png",
      "/images/items/food-3-clean.png",
      "/images/items/meds-1-clean.png",
      "/images/items/rune1.png",
      "/images/window.png",
      "/images/items/wall-torch-1-clean.png",
      "/images/items/wall-torch-2-clean.png",
      "/images/items/wall-torch-2-base-clean.png",
      "/images/items/wall-torch-3-clean.png",

      // Flowers and bushes
      "/images/flowers/flowers-1-clean.png",
      "/images/flowers/flowers-2-clean.png",
      "/images/flowers/flowers-3-clean.png",
      "/images/flowers/flowers-4-clean.png",
      "/images/flowers/flowers-5-clean.png",
      "/images/flowers/bush-1-clean.png",

      // Hanging signs
      "/images/hanging-signs/store-clean.png",
      "/images/hanging-signs/library-clean.png",
      "/images/hanging-signs/workshop-clean.png",

      // Furniture
      "/images/items/bookshelf-clean.png",

      // Enemy sprites (all angles as defined in registry)
      "/images/enemies/fire-goblin/fire-goblin-front-clean.png",
      "/images/enemies/fire-goblin/fire-goblin-right-clean.png",
      "/images/enemies/fire-goblin/fire-goblin-back-clean.png",
      "/images/enemies/fire-goblin/fire-goblin-front-base-clean.png",
      "/images/enemies/fire-goblin/fire-goblin-right-base-clean.png",
      "/images/enemies/fire-goblin/fire-goblin-back-base-clean.png",
      "/images/enemies/fire-goblin/blue-goblin-front-clean.png",
      "/images/enemies/fire-goblin/blue-goblin-right-clean.png",
      "/images/enemies/fire-goblin/blue-goblin-back-clean.png",
      "/images/enemies/fire-goblin/blue-goblin-front-spear-clean.png",
      "/images/enemies/fire-goblin/blue-goblin-right-spear-clean.png",
      "/images/enemies/fire-goblin/blue-goblin-back-spear-clean.png",
      "/images/enemies/fire-goblin/brown-goblin-front-clean.png",
      "/images/enemies/fire-goblin/brown-goblin-right-clean.png",
      "/images/enemies/fire-goblin/brown-goblin-back-clean.png",
      "/images/enemies/fire-goblin/brown-goblin-front-knives-clean.png",
      "/images/enemies/fire-goblin/brown-goblin-right-knives-clean.png",
      "/images/enemies/fire-goblin/brown-goblin-back-knives-clean.png",
      "/images/enemies/fire-goblin/pink-goblin-ringless-front-clean.png",
      "/images/enemies/fire-goblin/pink-goblin-ringless-left-clean.png",
      "/images/enemies/fire-goblin/pink-goblin-ringless-back-clean.png",
      "/images/enemies/fire-goblin/pink-ring-no-sparkle.png",
      "/images/enemies/fire-goblin/blue-ring-no-sparkle.png",
      "/images/enemies/fire-goblin/green-goblin-front-clean.png",
      "/images/enemies/fire-goblin/green-goblin-right-clean.png",
      "/images/enemies/fire-goblin/green-goblin-back-clean.png",
      "/images/enemies/lantern-wisp-clean.png",

      // Hero base poses (commonly visible on load). In-game lit-torch poses
      // use the -noflame bases (PixelFlame draws the fire); the flamed
      // originals stay for menus/end screens.
      "/images/hero/hero-front-noflame-static-clean.png",
      "/images/hero/hero-right-noflame-static-clean.png",
      "/images/hero/hero-back-noflame-static-clean.png",
      "/images/hero/hero-front-sword-noflame-static-clean.png",
      "/images/hero/hero-right-sword-noflame-static-clean.png",
      "/images/hero/hero-back-sword-noflame-static-clean.png",
      "/images/hero/hero-front-shield-noflame-static-clean.png",
      "/images/hero/hero-right-shield-noflame-static-clean.png",
      "/images/hero/hero-back-shield-noflame-static-clean.png",
      "/images/hero/hero-front-shield-sword-noflame-static-clean.png",
      "/images/hero/hero-right-shield-sword-noflame-static-clean.png",
      "/images/hero/hero-back-shield-sword-noflame-static-clean.png",
      "/images/hero/hero-front-static-clean.png",
      "/images/hero/hero-right-static-clean.png",
      "/images/hero/hero-back-static-clean.png",
    ];

    urls.forEach((src) => {
      try {
        const img = new Image();
        img.decoding = "async";
        img.loading = "eager";
        img.src = src;
      } catch {}
    });
  }, []);

  return null;
}
