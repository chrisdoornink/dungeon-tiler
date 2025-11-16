# Room Transition System

## Overview
There are two transition systems in the codebase:
1. **Old System** - Uses `transitionToPrevious`/`transitionToNext` (linear dungeon progression)
2. **New System** - Uses `otherTransitions` with visual maps (open world exploration)

## New System (Visual Maps + otherTransitions)

### How It Works
Each transition is **unidirectional**. To create a two-way connection, you define transitions in BOTH rooms.

### Example: Torch Town ↔ Outdoor Clearing

**In Torch Town (`torch_town_new.ts`):**
```typescript
const TRANSITIONS = {
  '1': { 
    roomId: 'story-outdoor-clearing',
    targetTransitionId: 'outdoor-torch'  // ID of partner transition
  }
};
// This creates a transition with id='1' at position [26, 17] (from visual map)
```

**In Outdoor Clearing (`outdoor_clearing.ts`):**
```typescript
otherTransitions: [
  {
    id: 'outdoor-torch',  // Unique ID for THIS transition
    roomId: "story-torch-town",
    position: [0, 12],  // Transition tile position in THIS room
    targetTransitionId: '1',  // ID of partner transition in Torch Town
  }
]
```

**How it works:**
1. Player steps on '1' tile `[26, 17]` in Torch Town
2. System looks up transition with `id='outdoor-torch'` in Outdoor Clearing
3. Player spawns at that transition's position: `[0, 12]` ✅
4. Return: Player steps on `[0, 12]` in Outdoor → finds `id='1'` in Torch Town → spawns at `[26, 17]` ✅

### Visual Map Markers

**Single-character transitions:**
- `'0'`-`'9'` - Numeric transitions (0-9)
- `'A'`, `'B'`, `'D'`, `'E'`, `'H'`-`'Z'` - Letter transitions (excluding C, F, G, S, T, W which are reserved)
- Each marker gets a `ROOM_TRANSITION` subtype
- The marker character maps to the TRANSITIONS object

**Multi-character transitions (NEW):**
- `[10]`, `[11]`, `[12]`, etc. - Use brackets for IDs with 2+ characters
- Allows unlimited transitions without using up letter characters
- Example: `[torch-entrance]`, `[cave-1]`, `[exit-north]`
- Brackets are stripped during parsing - only the ID inside is used

**Example with multi-character IDs:**
```typescript
// In visual map
const VISUAL_MAP = [
  "# # # # # # # # #",
  "# . . . . . . . #",
  "[10] . . . . . [11] #",  // Two transitions with IDs "10" and "11"
  "# # # # # # # # #",
];

const TRANSITIONS = {
  '10': { roomId: 'story-room-a', targetTransitionId: 'entrance-from-b' },
  '11': { roomId: 'story-room-c', targetTransitionId: 'west-door' },
};
```

### TransitionDefinition Type
```typescript
export interface TransitionDefinition {
  roomId: RoomId;              // Destination room ID
  targetTransitionId: string;  // ID of partner transition in destination
  offsetX?: number;            // Optional X offset from partner position (default: 0)
  offsetY?: number;            // Optional Y offset from partner position (default: 0)
}
```

### Position Offsets (NEW)
Offsets allow you to spawn the player slightly away from the transition tile to prevent immediate re-triggering:

```typescript
// Spawn 1 tile to the right of the partner transition
'0': { roomId: 'story-room-a', targetTransitionId: 'entrance', offsetX: 1 }

// Spawn 1 tile below the partner transition
'1': { roomId: 'story-room-b', targetTransitionId: 'exit', offsetY: 1 }

// Spawn diagonally (1 right, 1 down)
'2': { roomId: 'story-room-c', targetTransitionId: 'door', offsetX: 1, offsetY: 1 }
```

**Use case:** When you have multiple transitions in a row/column, offsets prevent the player from accidentally re-triggering when walking parallel to the transition line.

### Benefits of Partner Transition IDs
- ✅ **No duplicate coordinates** - Each position defined once
- ✅ **Self-documenting** - Clear which transitions connect
- ✅ **Maintainable** - Move a transition, both directions update automatically
- ✅ **Less error-prone** - Impossible to have mismatched spawn points

### Benefits
- ✅ Simpler - only one coordinate per transition
- ✅ Explicit - both directions are clearly defined
- ✅ Flexible - can have multiple exits to the same room
- ✅ Visual - transitions are visible in the map string

## Old System (Programmatic)

### How It Works
Uses `transitionToPrevious` and `transitionToNext` for linear progression.
Bidirectional transitions are created automatically.

### Used By
- Main dungeon: Entrance Hall → Ascent Corridor → Sanctum → Outdoor Clearing
- Bluff area: Bluff Passage → Bluff Caves → Serpent Den
- Torch Town buildings: Library, Store, Smithy, Guard Tower, Houses

### Keep This System
The old system is stable and used for the core dungeon progression. No need to refactor it.

## Migration Notes

### What Changed
1. Removed `returnPoint` from `TransitionDefinition`
2. Removed `returnEntryPoint` from `StoryRoomLink`
3. Return journeys are now separate transition entries

### Files Updated
- `/lib/story/rooms/types.ts` - Type definitions
- `/lib/story/rooms/room-builder.ts` - Builder logic
- `/lib/story/rooms/chapter1/torch_town_new.ts` - Example usage
- `/lib/story/rooms/chapter1/outdoor_clearing.ts` - Fixed existing transitions
- `/lib/story/story_mode.ts` - Transition processing

## Auto-Registration System

**All rooms' `otherTransitions` are automatically registered!**

When you add a new room to the `storyRooms` array in `story_mode.ts`, its transitions are automatically processed. No manual registration needed.

```typescript
// In story_mode.ts - just add your room to this array
const storyRooms: StoryRoom[] = [
  entrance,
  ascent,
  // ... other rooms ...
  yourNewRoom,  // ✅ Transitions automatically registered!
];
```

## Best Practices

### For New Rooms
1. Use visual maps with character-based transitions
2. Define transitions in BOTH directions (one in each room)
3. Add your room to the `storyRooms` array in `story_mode.ts`
4. Test both directions of travel

### No Manual Registration Required!
The system automatically processes all `otherTransitions` from all rooms in the `storyRooms` array.

### Debugging Transitions
Add this to your room builder:
```typescript
console.log('[ROOM_NAME] Other transitions:', room.otherTransitions);
for (let y = 0; y < tiles.length; y++) {
  for (let x = 0; x < tiles[y].length; x++) {
    if (subtypes[y]?.[x]?.includes(TileSubtype.ROOM_TRANSITION)) {
      console.log(`  Transition at (${y}, ${x})`);
    }
  }
}
```
