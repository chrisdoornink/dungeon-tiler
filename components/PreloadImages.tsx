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
      // Chest-reveal items + bomb (these popped in late when a chest opened)
      "/images/items/snake-medalion.png",
      "/images/items/heart.png",
      "/images/items/pink-heart.png",
      "/images/items/berry.png",
      "/images/items/bomb-black.png",
      "/images/items/bomb-red.png",
      // Bomb explosion frames
      "/images/items/bam1.png",
      "/images/items/bam2.png",
      "/images/items/bam3.png",
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
      "/images/items/wall-torch-2-base.png",
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
      "/images/enemies/fire-goblin/fire-goblin-front-base.png",
      "/images/enemies/fire-goblin/fire-goblin-right-base.png",
      "/images/enemies/fire-goblin/fire-goblin-back-base.png",
      "/images/enemies/fire-goblin/blue-goblin-front.png",
      "/images/enemies/fire-goblin/blue-goblin-right.png",
      "/images/enemies/fire-goblin/blue-goblin-back.png",
      "/images/enemies/fire-goblin/blue-goblin-front-spear.png",
      "/images/enemies/fire-goblin/blue-goblin-right-spear.png",
      "/images/enemies/fire-goblin/blue-goblin-back-spear.png",
      "/images/enemies/fire-goblin/brown-goblin-front.png",
      "/images/enemies/fire-goblin/brown-goblin-right.png",
      "/images/enemies/fire-goblin/brown-goblin-back.png",
      "/images/enemies/fire-goblin/brown-goblin-front-knives.png",
      "/images/enemies/fire-goblin/brown-goblin-right-knives.png",
      "/images/enemies/fire-goblin/brown-goblin-back-knives.png",
      "/images/enemies/fire-goblin/pink-goblin-ringless-front.png",
      "/images/enemies/fire-goblin/pink-goblin-ringless-left.png",
      "/images/enemies/fire-goblin/pink-goblin-ringless-back.png",
      "/images/enemies/fire-goblin/pink-ring-no-sparkle.png",
      "/images/enemies/fire-goblin/blue-ring-no-sparkle.png",
      "/images/enemies/fire-goblin/green-goblin-front.png",
      "/images/enemies/fire-goblin/green-goblin-right.png",
      "/images/enemies/fire-goblin/green-goblin-back.png",
      "/images/enemies/lantern-wisp.png",

      // Hero base poses (commonly visible on load). In-game lit-torch poses
      // use the -noflame bases (PixelFlame draws the fire); the flamed
      // originals stay for menus/end screens.
      "/images/hero/hero-front-noflame-static.png",
      "/images/hero/hero-right-noflame-static.png",
      "/images/hero/hero-back-noflame-static.png",
      "/images/hero/hero-front-sword-noflame-static.png",
      "/images/hero/hero-right-sword-noflame-static.png",
      "/images/hero/hero-back-sword-noflame-static.png",
      "/images/hero/hero-front-shield-noflame-static.png",
      "/images/hero/hero-right-shield-noflame-static.png",
      "/images/hero/hero-back-shield-noflame-static.png",
      "/images/hero/hero-front-shield-sword-noflame-static.png",
      "/images/hero/hero-right-shield-sword-noflame-static.png",
      "/images/hero/hero-back-shield-sword-noflame-static.png",
      "/images/hero/hero-front-static.png",
      "/images/hero/hero-right-static.png",
      "/images/hero/hero-back-static.png",
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
