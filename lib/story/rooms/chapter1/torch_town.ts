import { FLOOR, WALL, TileSubtype, Direction } from "../../../map";
import { NPC } from "../../../npc";
import type { StoryRoom } from "../types";

export function buildTorchTown(): StoryRoom {
  const SIZE = 35;
  const tiles: number[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => WALL)
  );
  const subtypes: number[][][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => [] as number[])
  );

  const ensureSubtype = (y: number, x: number, subtype: TileSubtype) => {
    const cell = subtypes[y][x] ?? [];
    if (!cell.includes(subtype)) {
      subtypes[y][x] = [...cell, subtype];
    }
  };

  const grassMargin = 2;
  const wallThickness = 2;
  const wallMin = grassMargin;
  const wallMax = SIZE - grassMargin - 1;

  for (let layer = 0; layer < wallThickness; layer++) {
    const top = wallMin + layer;
    const bottom = wallMax - layer;
    for (let x = wallMin; x <= wallMax; x++) {
      tiles[top][x] = WALL;
      subtypes[top][x] = [];
      tiles[bottom][x] = WALL;
      subtypes[bottom][x] = [];
    }
    for (let y = wallMin; y <= wallMax; y++) {
      const left = wallMin + layer;
      const right = wallMax - layer;
      tiles[y][left] = WALL;
      subtypes[y][left] = [];
      tiles[y][right] = WALL;
      subtypes[y][right] = [];
    }
  }

  for (let y = wallMin + wallThickness; y <= wallMax - wallThickness; y++) {
    for (let x = wallMin + wallThickness; x <= wallMax - wallThickness; x++) {
      tiles[y][x] = FLOOR;
      if (!subtypes[y][x]) subtypes[y][x] = [];
    }
  }

  const entryColumn = wallMin + 1;
  const transitionRow = SIZE - 1;
  const corridorRows = [
    wallMax - 2,
    wallMax - 1,
    wallMax,
    transitionRow - 1,
    transitionRow,
  ];
  for (const row of corridorRows) {
    if (tiles[row]?.[entryColumn] !== undefined) {
      tiles[row][entryColumn] = FLOOR;
      subtypes[row][entryColumn] = [];
    }
  }
  const spawnRow = transitionRow - 1;
  ensureSubtype(transitionRow, entryColumn, TileSubtype.ROOM_TRANSITION);

  const entryPoint: [number, number] = [spawnRow, entryColumn];
  const transitionToPrevious: [number, number] = [transitionRow, entryColumn];
  const entryFromNext: [number, number] = [entryPoint[0], entryPoint[1]];

  type DoorOrientation = "north" | "south" | "east" | "west";
  const buildStructure = (
    top: number,
    left: number,
    width: number,
    height: number,
    options: {
      doorOrientation?: DoorOrientation;
      doorOffset?: number;
      doorSubtypes?: TileSubtype[];
    } = {}
  ): [number, number] => {
    for (let y = top; y < top + height; y++) {
      for (let x = left; x < left + width; x++) {
        tiles[y][x] = WALL;
        subtypes[y][x] = [];
      }
    }
    const orientation = options.doorOrientation ?? "south";
    const offset = options.doorOffset ?? 0;
    let doorRow = top + height - 1;
    let doorCol = left + Math.floor(width / 2);
    switch (orientation) {
      case "north":
        doorRow = top;
        doorCol = left + Math.floor(width / 2) + offset;
        break;
      case "south":
        doorRow = top + height - 1;
        doorCol = left + Math.floor(width / 2) + offset;
        break;
      case "west":
        doorRow = top + Math.floor(height / 2) + offset;
        doorCol = left;
        break;
      case "east":
        doorRow = top + Math.floor(height / 2) + offset;
        doorCol = left + width - 1;
        break;
    }
    doorRow = Math.max(top, Math.min(top + height - 1, doorRow));
    doorCol = Math.max(left, Math.min(left + width - 1, doorCol));
    const doorSubtypes =
      options.doorSubtypes ?? [TileSubtype.DOOR, TileSubtype.ROOM_TRANSITION];
    subtypes[doorRow][doorCol] = [...doorSubtypes];

    return [doorRow, doorCol];
  };

  const clearRect = (top: number, left: number, width: number, height: number) => {
    for (let y = top; y < top + height; y++) {
      for (let x = left; x < left + width; x++) {
        if (tiles[y]?.[x] !== undefined) {
          tiles[y][x] = FLOOR;
          if (!subtypes[y][x]) subtypes[y][x] = [];
        }
      }
    }
  };

  const outlineRect = (
    top: number,
    left: number,
    width: number,
    height: number
  ) => {
    for (let y = top; y < top + height; y++) {
      for (let x = left; x < left + width; x++) {
        if (
          tiles[y]?.[x] !== undefined &&
          (y === top || y === top + height - 1 || x === left || x === left + width - 1)
        ) {
          tiles[y][x] = WALL;
          subtypes[y][x] = [];
        }
      }
    }
  };

  const createFencedArea = (
    top: number,
    left: number,
    width: number,
    height: number
  ) => {
    if (width <= 0 || height <= 0) return;
    outlineRect(top, left, width, height);
    if (width > 2 && height > 2) {
      clearRect(top + 1, left + 1, width - 2, height - 2);
    }
  };

  const innerMin = wallMin + wallThickness;
  const innerMax = wallMax - wallThickness;
  const centerY = Math.floor((innerMin + innerMax) / 2);
  const centerX = Math.floor((innerMin + innerMax) / 2);
  const plazaRadius = 2;
  for (let y = centerY - plazaRadius; y <= centerY + plazaRadius; y++) {
    for (let x = centerX - plazaRadius; x <= centerX + plazaRadius; x++) {
      if (tiles[y]?.[x] !== undefined) {
        tiles[y][x] = FLOOR;
        if (!subtypes[y][x]) subtypes[y][x] = [];
      }
    }
  }
  subtypes[centerY][centerX] = [TileSubtype.CHECKPOINT];

  const library = {
    width: 5,
    height: 5,
    top: innerMin + 2,
    left: centerX - 2,
  } as const;
  const libraryDoor = buildStructure(library.top, library.left, library.width, library.height, {
    doorOrientation: "south",
  });

  const store = {
    width: 5,
    height: 4,
    top: library.top + library.height + 2,
    left: centerX - 2,
  } as const;
  const storeDoor = buildStructure(store.top, store.left, store.width, store.height, {
    doorOrientation: "south",
  });

  const guardTower = {
    width: 4,
    height: 5,
    top: innerMin + 1,
    left: innerMax - 4 - 1,
  } as const;
  const guardTowerDoor = buildStructure(
    guardTower.top,
    guardTower.left,
    guardTower.width,
    guardTower.height,
    {
      doorOrientation: "west",
      doorSubtypes: [TileSubtype.DOOR],
    }
  );

  const smithy = {
    width: 4,
    height: 4,
    top: store.top + store.height + 1,
    left: centerX - 5,
  } as const;
  const smithyDoor = buildStructure(
    smithy.top,
    smithy.left,
    smithy.width,
    smithy.height,
    {
      doorOrientation: "north",
      doorSubtypes: [TileSubtype.DOOR],
    }
  );

  const trainingYard = {
    top: guardTower.top + 1,
    left: guardTower.left - 4,
    width: 4,
    height: 4,
  } as const;
  clearRect(trainingYard.top, trainingYard.left, trainingYard.width, trainingYard.height);

  const herbGarden = {
    top: smithy.top - 2,
    left: smithy.left + smithy.width + 2,
    width: 4,
    height: 3,
  } as const;
  createFencedArea(herbGarden.top, herbGarden.left, herbGarden.width, herbGarden.height);
  const herbGateY = herbGarden.top + Math.floor(herbGarden.height / 2);
  if (tiles[herbGateY]?.[herbGarden.left] !== undefined) {
    tiles[herbGateY][herbGarden.left] = FLOOR;
    if (!subtypes[herbGateY][herbGarden.left]) {
      subtypes[herbGateY][herbGarden.left] = [];
    }
  }

  const farmland = {
    top: innerMax - 6,
    left: innerMin + 6,
    width: 7,
    height: 5,
  } as const;
  createFencedArea(farmland.top, farmland.left, farmland.width, farmland.height);
  const farmlandGateY = farmland.top;
  const farmlandGateX = farmland.left + Math.floor(farmland.width / 2);
  if (tiles[farmlandGateY]?.[farmlandGateX] !== undefined) {
    tiles[farmlandGateY][farmlandGateX] = FLOOR;
    subtypes[farmlandGateY][farmlandGateX] = [];
  }

  const carpenterYard = {
    top: farmland.top - 3,
    left: herbGarden.left,
    width: 3,
    height: 4,
  } as const;
  clearRect(carpenterYard.top, carpenterYard.left, carpenterYard.width, carpenterYard.height);

  const weavingYard = {
    top: smithy.top + smithy.height,
    left: innerMin + 2,
    width: 4,
    height: 3,
  } as const;
  clearRect(weavingYard.top, weavingYard.left, weavingYard.width, weavingYard.height);

  const fishingJetty = {
    top: innerMax - 1,
    left: innerMin + 2,
    width: 4,
    height: 2,
  } as const;
  clearRect(fishingJetty.top, fishingJetty.left, fishingJetty.width, fishingJetty.height);

  const homeAssignments: Record<string, string> = {};
  const residentHomes: Record<string, { door: [number, number]; label: string }> = {};
  const homeWidth = 4;
  const homeHeight = 3;
  const westHouseLeft = innerMin + 1;
  const eastHouseLeft = innerMax - homeWidth - 1;
  const homeDefinitions: Array<{
    key: string;
    label: string;
    top: number;
    left: number;
    orientation: DoorOrientation;
    residents: string[];
  }> = [
    {
      key: "eldra",
      label: "Eldra's Cottage",
      top: innerMin + 3,
      left: westHouseLeft,
      orientation: "east",
      residents: ["npc-eldra"],
    },
    {
      key: "maro-kira",
      label: "Maro & Kira",
      top: innerMin + 8,
      left: westHouseLeft,
      orientation: "east",
      residents: ["npc-maro", "npc-kira"],
    },
    {
      key: "rhett-mira",
      label: "Rhett & Mira",
      top: centerY + 2,
      left: westHouseLeft,
      orientation: "east",
      residents: ["npc-rhett", "npc-mira"],
    },
    {
      key: "haro-len",
      label: "Haro & Len",
      top: innerMax - homeHeight - 1,
      left: westHouseLeft,
      orientation: "east",
      residents: ["npc-haro", "npc-len"],
    },
    {
      key: "guard-barracks",
      label: "Guard Barracks",
      top: innerMin + 8,
      left: eastHouseLeft,
      orientation: "west",
      residents: ["npc-captain-bren", "npc-sela", "npc-thane"],
    },
    {
      key: "jorin-yanna",
      label: "Jorin & Yanna",
      top: centerY - 1,
      left: eastHouseLeft,
      orientation: "west",
      residents: ["npc-jorin", "npc-yanna"],
    },
    {
      key: "serin",
      label: "Serin's Hearth",
      top: centerY + 4,
      left: eastHouseLeft,
      orientation: "west",
      residents: ["npc-serin"],
    },
    {
      key: "fenna-arin",
      label: "Fenna, Tavi & Arin",
      top: innerMax - homeHeight - 1,
      left: eastHouseLeft,
      orientation: "west",
      residents: ["npc-old-fenna", "npc-tavi", "npc-arin"],
    },
    {
      key: "dara",
      label: "Spare House",
      top: farmland.top - 1,
      left: centerX + 4,
      orientation: "south",
      residents: ["npc-dara"],
    },
  ];

  for (const home of homeDefinitions) {
    const door = buildStructure(home.top, home.left, homeWidth, homeHeight, {
      doorOrientation: home.orientation,
    });
    homeAssignments[`${door[0]},${door[1]}`] = home.label;
    for (const resident of home.residents) {
      residentHomes[resident] = { door, label: home.label };
    }
  }

  const spriteFor = (slug: string) => `/images/npcs/torch-town/${slug}.png`;
  const getDoorFor = (id: string): [number, number] | undefined =>
    residentHomes[id]?.door;

  const makeTownNpc = (config: {
    id: string;
    name: string;
    slug?: string;
    position: [number, number];
    facing?: Direction;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): NPC => {
    const slug = config.slug ?? config.id.replace(/^npc-/, "");
    const home = residentHomes[config.id];
    return new NPC({
      id: config.id,
      name: config.name,
      sprite: spriteFor(slug),
      y: config.position[0],
      x: config.position[1],
      facing: config.facing ?? Direction.DOWN,
      canMove: false,
      interactionHooks: [
        {
          id: `${config.id}-greet`,
          type: "dialogue",
          description: `Talk to ${config.name}`,
          payload: { dialogueId: `torch-town-${slug}-default` },
        },
      ],
      actions: ["talk"],
      tags: config.tags,
      metadata: {
        ...(config.metadata ?? {}),
        homeDoor: home?.door,
        homeLabel: home?.label,
        spriteSlug: slug,
        area: "torch-town",
      },
    });
  };

  const torchTownNpcs: NPC[] = [];
  torchTownNpcs.push(
    makeTownNpc({
      id: "npc-old-fenna",
      name: "Old Fenna",
      slug: "old-fenna",
      position: [centerY, centerX],
      facing: Direction.DOWN,
      metadata: { role: "caretaker", worksite: "central-flame" },
    }),
    makeTownNpc({
      id: "npc-tavi",
      name: "Tavi",
      position: [centerY + 1, centerX + 2],
      facing: Direction.LEFT,
      metadata: { role: "child", favoriteSpot: "central-fire" },
    }),
    makeTownNpc({
      id: "npc-kira",
      name: "Kira",
      position: [store.top - 1, store.left + store.width + 1],
      facing: Direction.UP,
      metadata: { role: "teen", curiosity: "guard-watch" },
    }),
    makeTownNpc({
      id: "npc-captain-bren",
      name: "Captain Bren",
      slug: "captain-bren",
      position: [guardTower.top + 1, guardTower.left - 2],
      facing: Direction.RIGHT,
      metadata: { role: "guard-captain", worksite: "training-yard" },
      tags: ["guard"],
    }),
    makeTownNpc({
      id: "npc-sela",
      name: "Sela",
      position: [trainingYard.top + 2, trainingYard.left + 1],
      facing: Direction.UP,
      metadata: { role: "night-guard", secret: "drinks-with-maro" },
      tags: ["guard"],
    }),
    makeTownNpc({
      id: "npc-thane",
      name: "Thane",
      position: [guardTowerDoor[0], guardTowerDoor[1] - 1],
      facing: Direction.RIGHT,
      metadata: { role: "guard", demeanor: "stoic" },
      tags: ["guard"],
    }),
    makeTownNpc({
      id: "npc-jorin",
      name: "Jorin",
      position: [smithyDoor[0] - 1, smithyDoor[1]],
      facing: Direction.UP,
      metadata: { role: "blacksmith", worksite: "smithy" },
    }),
    makeTownNpc({
      id: "npc-yanna",
      name: "Yanna",
      position: [herbGarden.top + 1, herbGarden.left + 2],
      facing: Direction.RIGHT,
      metadata: { role: "herbalist", worksite: "herb-garden" },
    }),
    makeTownNpc({
      id: "npc-serin",
      name: "Serin",
      position: [
        getDoorFor("npc-serin")?.[0] ?? centerY + 4,
        (getDoorFor("npc-serin")?.[1] ?? eastHouseLeft) - 1,
      ],
      facing: Direction.LEFT,
      metadata: { role: "healer", worksite: "home-clinic" },
    }),
    makeTownNpc({
      id: "npc-rhett",
      name: "Rhett",
      position: [farmland.top + 2, farmland.left + 2],
      facing: Direction.UP,
      metadata: { role: "farmer", worksite: "fields" },
    }),
    makeTownNpc({
      id: "npc-mira",
      name: "Mira",
      position: [weavingYard.top + 1, weavingYard.left + 1],
      facing: Direction.RIGHT,
      metadata: { role: "weaver", worksite: "loom-yard" },
    }),
    makeTownNpc({
      id: "npc-lio",
      name: "Lio",
      position: [innerMin + 5, innerMin + 6],
      facing: Direction.RIGHT,
      metadata: { role: "hunter", habit: "forest-edge" },
    }),
    makeTownNpc({
      id: "npc-dara",
      name: "Dara",
      position: [
        (getDoorFor("npc-dara")?.[0] ?? farmland.top - 1) + 1,
        getDoorFor("npc-dara")?.[1] ?? centerX + 4,
      ],
      facing: Direction.LEFT,
      metadata: { role: "wanderer", favoriteSpot: "town-edge" },
    }),
    makeTownNpc({
      id: "npc-arin",
      name: "Arin",
      position: [carpenterYard.top + 1, carpenterYard.left + 1],
      facing: Direction.DOWN,
      metadata: { role: "carpenter", worksite: "carpenter-yard" },
    }),
    makeTownNpc({
      id: "npc-haro",
      name: "Haro",
      position: [fishingJetty.top, fishingJetty.left + 1],
      facing: Direction.RIGHT,
      metadata: { role: "fisher", worksite: "fishing-jetty" },
    }),
    makeTownNpc({
      id: "npc-len",
      name: "Len",
      position: [fishingJetty.top, fishingJetty.left + 2],
      facing: Direction.LEFT,
      metadata: { role: "fisher", worksite: "fishing-jetty" },
    })
  );

  const pointsOfInterest = {
    centralFire: { position: [centerY, centerX] as [number, number] },
    trainingYard,
    herbGarden,
    farmland,
    carpenterYard,
    weavingYard,
    fishingJetty,
    smithy: { ...smithy, door: smithyDoor },
    guardTower: { ...guardTower, door: guardTowerDoor },
  };

  return {
    id: "story-torch-town",
    mapData: { tiles, subtypes, environment: "outdoor" },
    entryPoint,
    entryFromNext,
    transitionToPrevious,
    npcs: torchTownNpcs,
    metadata: {
      homes: homeAssignments,
      residentHomes,
      pointsOfInterest,
      buildings: {
        libraryDoor,
        librarySize: [library.width, library.height],
        storeDoor,
        storeSize: [store.width, store.height],
        guardTowerDoor,
        guardTowerSize: [guardTower.width, guardTower.height],
        smithyDoor,
        smithySize: [smithy.width, smithy.height],
        homeSize: [homeWidth, homeHeight],
      },
    },
  };
}
