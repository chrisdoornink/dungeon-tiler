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
      "/images/door/house-door.png",
      "/images/door/gold-chain-lock.png",

      // Items seen early
      "/images/items/closed-chest.png",
      "/images/items/opened-chest.png",
      "/images/items/key.png",
      "/images/items/exit-key.png",
      "/images/items/switch.png",
      "/images/items/sword.png",
      "/images/items/shield.png",
      "/images/items/pot-1.png",
      "/images/items/pot-2.png",
      "/images/items/pot-3.png",
      "/images/items/rock-1.png",
      "/images/items/rock-2.png",
      "/images/items/food-1.png",
      "/images/items/food-2.png",
      "/images/items/food-3.png",
      "/images/items/meds-1.png",
      "/images/items/rune1.png",
      "/images/window.png",
      "/images/items/wall-torch-1.png",
      "/images/items/wall-torch-2.png",
      "/images/items/wall-torch-3.png",

      // Flowers and bushes
      "/images/flowers/flowers-1.png",
      "/images/flowers/flowers-2.png",
      "/images/flowers/flowers-3.png",
      "/images/flowers/flowers-4.png",
      "/images/flowers/flowers-5.png",
      "/images/flowers/bush.png",

      // Hanging signs
      "/images/hanging-signs/store.png",
      "/images/hanging-signs/library.png",
      "/images/hanging-signs/workshop.png",

      // Furniture
      "/images/items/bookshelf.png",

      // Enemy sprites (all angles as defined in registry)
      "/images/enemies/fire-goblin/fire-goblin-front.png",
      "/images/enemies/fire-goblin/fire-goblin-right.png",
      "/images/enemies/fire-goblin/fire-goblin-back.png",
      "/images/enemies/fire-goblin/blue-goblin-front.png",
      "/images/enemies/fire-goblin/blue-goblin-right.png",
      "/images/enemies/fire-goblin/blue-goblin-back.png",
      "/images/enemies/fire-goblin/blue-goblin-front-spear.png",
      "/images/enemies/fire-goblin/blue-goblin-right-spear.png",
      "/images/enemies/fire-goblin/blue-goblin-back-spear.png",
      "/images/enemies/lantern-wisp.png",
      "/images/enemies/stone-exciter-front.png",
      "/images/enemies/stone-exciter-right.png",
      "/images/enemies/stone-exciter-back.png",

      // Hero base poses (commonly visible on load)
      "/images/hero/hero-front-static.png",
      "/images/hero/hero-right-static.png",
      "/images/hero/hero-back-static.png",
      "/images/hero/hero-front-sword-static.png",
      "/images/hero/hero-right-sword-static.png",
      "/images/hero/hero-back-sword-static.png",
      "/images/hero/hero-front-shield-static.png",
      "/images/hero/hero-right-shield-static.png",
      "/images/hero/hero-back-shield-static.png",
      "/images/hero/hero-front-shield-sword-static.png",
      "/images/hero/hero-right-shield-sword-static.png",
      "/images/hero/hero-back-shield-sword-static.png",
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
