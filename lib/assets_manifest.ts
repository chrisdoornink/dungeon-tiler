// Centralized image manifest for blocking preloader
// Keep this list curated; include critical floors/walls/door, items, enemy sprites, hero poses

// Critical assets only - load the minimum needed to start the game
export const CRITICAL_ASSETS: string[] = [
  // Essential floors and walls. The cave floor is the generated sheet (lib/floor_sheet.ts);
  // floor-try-1 still paints platform slabs and the ?floor=classic fallback.
  "/images/floor/floor-try-1.png",
  "/images/floor/generated/cave-floor-sheet-v1.webp",
  "/images/wall/wall-0010.png",
  "/images/wall/wall-0110.png",
  "/images/wall/wall-0011.png",
  "/images/wall/wall-0111.png",

  // Exit and key items
  "/images/door/exit-dark.png",
  "/images/items/key-clean.png",
  "/images/items/exit-key-clean.png",

  // Essential hero poses (noflame = lit torch base; PixelFlame draws the fire)
  "/images/hero/hero-front-noflame-static-clean.png",
  "/images/hero/hero-right-noflame-static-clean.png",

  // One enemy for immediate gameplay
  "/images/enemies/fire-goblin/fire-goblin-front-base-clean.png",
];

// Full asset list for background loading after game starts
export const ASSET_URLS: string[] = [
  ...CRITICAL_ASSETS,
  
  // Additional floors
  "/images/floor/generated/grass-floor-sheet-v1.webp",
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
  // The open-abyss pit is a CSS mask: until it loads the whole pit is invisible, so it
  // must be cached before the first crack breaks.
  "/images/floor/abyss-pit-mask-v1.png",

  // Remaining walls
  "/images/wall/wall-0000.png",
  "/images/wall/wall-0001-thin-edge.png",
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
  "/images/roof/spanish-roof-main.png",
  "/images/roof/spanish-roof-back-overhang.png",
  "/images/roof/spanish-roof-front-overhang.png",

  // Lock (large file - load later)
  "/images/door/gold-chain-lock-clean.png",

  // Torch frames (large files - load later)
  "/images/items/wall-torch-1-clean.png",
  "/images/items/wall-torch-2-clean.png",
  "/images/items/wall-torch-2-base-clean.png",
  "/images/items/wall-torch-3-clean.png",

  // Remaining items
  "/images/door/exit-transparent.png",
  "/images/door/house-door-clean.png",
  "/images/items/closed-chest.png",
  "/images/items/opened-chest.png",
  "/images/items/switch.png",
  "/images/items/sword-clean.png",
  "/images/items/shield-clean.png",
  "/images/items/pot-1-clean.png",
  "/images/items/pot-2-clean.png",
  "/images/items/pot-3-clean.png",
  "/images/items/rock-1-clean-v2.png",
  "/images/items/rock-2-clean.png",
  "/images/items/food-1-clean.png",
  "/images/items/food-2-clean.png",
  "/images/items/food-3-clean.png",
  "/images/items/meds-1-clean.png",
  "/images/items/rune1.png",
  "/images/items/snake-medallion-blue-clean.png",
  "/images/items/heart-clean.png",
  "/images/items/pink-heart-clean.png",
  "/images/items/berry.png",
  "/images/items/amber-moth.png",
  "/images/items/bomb-black-clean.png",
  "/images/items/bomb-red-clean.png",
  "/images/items/bam1-clean.png",
  "/images/items/bam2-clean.png",
  "/images/items/bam3-clean.png",
  "/images/items/portal-static-clean.png",
  "/images/items/travel-sparkle-large-clean.png",
  "/images/items/travel-sparkle-small-clean.png",
  "/images/window.png",

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

  // Remaining enemies (large files - load later)
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
  "/images/enemies/fire-goblin/white-goblins-front-1-clean.png",
  "/images/enemies/fire-goblin/white-goblins-front-2-clean.png",
  "/images/enemies/fire-goblin/white-goblins-front-3-clean.png",
  "/images/enemies/fire-goblin/white-goblins-front-4-clean.png",
  "/images/enemies/fire-goblin/white-goblins-back-1-clean.png",
  "/images/enemies/fire-goblin/white-goblins-back-2-clean.png",
  "/images/enemies/fire-goblin/white-goblins-back-3-clean.png",
  "/images/enemies/fire-goblin/white-goblins-back-4-clean.png",

  // Remaining hero poses (in-game lit-torch sprites are the -noflame bases;
  // the flamed originals stay for menus/end screens)
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

  // NPC sprites
  "/images/npcs/boy-1-clean.png",
  "/images/npcs/boy-2-clean.png",
  "/images/npcs/boy-3-clean.png",
  "/images/npcs/boy-4-clean.png",
  "/images/npcs/girl-1-clean.png",
  "/images/npcs/girl-2-clean.png",
  "/images/npcs/girl-3-clean.png",
  "/images/npcs/girl-4-clean.png",
];
