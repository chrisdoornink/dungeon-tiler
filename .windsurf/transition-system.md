# Room Transition System

## Overview
There are two transition systems in the codebase:
1. **Old System** - Uses `transitionToPrevious`/`transitionToNext` (linear dungeon progression)
2. **New System** - Uses `otherTransitions` with visual maps (open world exploration)

## New System (Visual Maps + otherTransitions)

### How It Works
Each transition is **unidirectional**. To create a two-way connection, you define transitions in BOTH rooms.

### Example: Torch Town ↔ Wilds Entrance

**In Torch Town (`torch_town_new.ts`):**
```typescript
const TRANSITIONS = {
  '0': { 
    roomId: 'story-the-wilds-entrance',
    target: [1, 17]  // Where player spawns in Wilds Entrance
  }
};
```

**In Wilds Entrance (`the_wilds_entrance.ts`):**
```typescript
const TRANSITIONS = {
  '0': { 
    roomId: 'story-torch-town',
    target: [32, 9]  // Where player spawns back in Torch Town
  }
};
```

### Visual Map Markers
- `'0'`, `'1'`, `'2'`, etc. - Transition tiles in the visual map
- Each marker gets a `ROOM_TRANSITION` subtype
- The marker character maps to the TRANSITIONS object

### TransitionDefinition Type
```typescript
export interface TransitionDefinition {
  roomId: RoomId;           // Destination room ID
  target: [number, number]; // Where player spawns in destination
}
```

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

## Best Practices

### For New Rooms
1. Use visual maps with character-based transitions
2. Define transitions in BOTH directions
3. Use descriptive room IDs
4. Test both directions of travel

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
