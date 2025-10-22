import { buildRoom, type RoomConfig } from "../../../lib/story/rooms/room-builder";
import { TileSubtype } from "../../../lib/map";

describe("Random Item Placement", () => {
  it("should place random rocks on empty floor tiles", () => {
    const config: RoomConfig = {
      id: "test-room",
      size: 10,
      visualMap: [
        "# # # # # # # # # #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# # # # # # # # # #",
      ],
      transitions: {},
      metadata: {
        displayLabel: "Test Room",
        description: "A test room",
      },
      randomItems: [
        { subtype: TileSubtype.ROCK, count: 5 }
      ],
    };

    const room = buildRoom(config);

    // Count rocks placed
    let rockCount = 0;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const subtypes = room.mapData.subtypes[y]?.[x] || [];
        if (subtypes.includes(TileSubtype.ROCK)) {
          rockCount++;
        }
      }
    }

    expect(rockCount).toBe(5);
  });

  it("should not place items on walls or existing subtypes", () => {
    const config: RoomConfig = {
      id: "test-room-2",
      size: 10,
      visualMap: [
        "# # # # # # # # # #",
        "# f . . . . . . . #",
        "# . . . . . . . . #",
        "# . . G . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# # # # # # # # # #",
      ],
      transitions: {},
      metadata: {
        displayLabel: "Test Room 2",
        description: "A test room with obstacles",
      },
      randomItems: [
        { subtype: TileSubtype.ROCK, count: 10 }
      ],
    };

    const room = buildRoom(config);

    // Verify no rocks on torch tile (1,1)
    const torchSubtypes = room.mapData.subtypes[1]?.[1] || [];
    expect(torchSubtypes.includes(TileSubtype.ROCK)).toBe(false);

    // Verify no rocks on goblin tile (3,3)
    const goblinSubtypes = room.mapData.subtypes[3]?.[3] || [];
    expect(goblinSubtypes.includes(TileSubtype.ROCK)).toBe(false);

    // Count total rocks
    let rockCount = 0;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const subtypes = room.mapData.subtypes[y]?.[x] || [];
        if (subtypes.includes(TileSubtype.ROCK)) {
          rockCount++;
        }
      }
    }

    expect(rockCount).toBe(10);
  });

  it("should handle multiple item types", () => {
    const config: RoomConfig = {
      id: "test-room-3",
      size: 10,
      visualMap: [
        "# # # # # # # # # #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# . . . . . . . . #",
        "# # # # # # # # # #",
      ],
      transitions: {},
      metadata: {
        displayLabel: "Test Room 3",
        description: "A test room with multiple items",
      },
      randomItems: [
        { subtype: TileSubtype.ROCK, count: 3 },
        { subtype: TileSubtype.FOOD, count: 2 }
      ],
    };

    const room = buildRoom(config);

    // Count rocks and food
    let rockCount = 0;
    let foodCount = 0;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const subtypes = room.mapData.subtypes[y]?.[x] || [];
        if (subtypes.includes(TileSubtype.ROCK)) rockCount++;
        if (subtypes.includes(TileSubtype.FOOD)) foodCount++;
      }
    }

    expect(rockCount).toBe(3);
    expect(foodCount).toBe(2);
  });
});
