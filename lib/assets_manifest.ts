// Centralized image manifest for blocking preloader
// Keep this list curated; include critical floors/walls/door, items, enemy sprites, hero poses

// Critical assets only - load the minimum needed to start the game
export const CRITICAL_ASSETS: string[] = [
  // Essential floors and walls
  "/images/floor/floor-try-1.png",
  "/images/floor/floor-1000.png",
  "/images/wall/wall-0010.png",
  "/images/wall/wall-0110.png",
  "/images/wall/wall-0011.png",
  "/images/wall/wall-0111.png",

  // Exit and key items
  "/images/door/exit-dark.png",
  "/images/items/key.png",
  "/images/items/exit-key.png",

  // Essential hero poses
  "/images/hero/hero-front-static.png",
  "/images/hero/hero-right-static.png",

  // One enemy for immediate gameplay
  "/images/enemies/fire-goblin/fire-goblin-front.png",
];

// Full asset list for background loading after game starts
export const ASSET_URLS: string[] = [
  ...CRITICAL_ASSETS,
  
  // Additional floors
  "/images/floor/floor-1001.png",
  "/images/floor/floor-0001.png",
  "/images/floor/outdoor-floor-0000.png",
  "/images/floor/outdoor-floor-1000.png",
  "/images/floor/in-house-floor-0000.png",
  "/images/floor/in-house-floor-1000.png",

  // Remaining walls
  "/images/wall/wall-0000.png",
  "/images/wall/wall-0001.png",
  "/images/wall/wall-0100.png",
  "/images/wall/wall-0101.png",
  "/images/wall/wall-0010.png",
  "/images/wall/wall-0011.png",
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

  // Lock (large file - load later)
  "/images/door/gold-chain-lock.png",

  // Torch frames (large files - load later)
  "/images/items/wall-torch-1.png",
  "/images/items/wall-torch-2.png",
  "/images/items/wall-torch-3.png",

  // Remaining items
  "/images/door/exit-transparent.png",
  "/images/door/house-door.png",
  "/images/items/closed-chest.png",
  "/images/items/opened-chest.png",
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

  // Remaining enemies (large files - load later)
  "/images/enemies/fire-goblin/fire-goblin-right.png",
  "/images/enemies/fire-goblin/fire-goblin-back.png",
  "/images/enemies/lantern-wisp.png",
  "/images/enemies/stone-exciter-front.png",
  "/images/enemies/stone-exciter-right.png",
  "/images/enemies/stone-exciter-back.png",

  // Remaining hero poses
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
