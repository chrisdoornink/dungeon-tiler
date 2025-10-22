# Visual Map Reference

This document describes the visual map system used for creating story rooms.

## Overview

The visual map system allows you to create rooms using ASCII characters in a readable format. Spaces are **ignored** during parsing, so you can format your maps for readability.

## Character Legend

### Terrain Types
- `.` = Floor (tile type 0)
- `#` = Wall (tile type 1)
- `T` = Tree (tile type 6)
- `h` = House wall (tile type 1 - same as wall)
- `R` = Roof (tile type 4)

### Enemies
- `G` = Goblin (spawns on floor)
- `S` = Snake (spawns on floor)
- `W` = Wisp/Ghost (spawns on floor)

### Interactive Objects
- `@` = Town sign (subtype on floor)
- `d` = Door (wall tile with door subtype)
- `f` = Torch on floor tile
- `w` = Torch on wall tile

### Pots (with contents)
- `r` = Pot with rune inside
- `p` = Pot with food inside
- `s` = Pot with snake inside

### Transitions
- `0`-`9` = Room transitions (10 available)
- `A`-`Z` = Room transitions (26 available, excluding G, S, T, W which are used for other purposes)
- Total: 32+ unique transitions per room

## Usage Examples

### Basic Room Example

```typescript
const VISUAL_MAP = [
  "# # T T T T T T T T",
  "# # . . . . . . . T",
  "# # f G . . . . . T",
  "# # . . . . d . . T",
  "# # . . . p . . 0 T",
];
```

This creates:
- Walls (`#`) and trees (`T`) around the edges
- A goblin (`G`) in the middle
- A torch (`f`) on the floor
- A door (`d`)
- A pot with food (`p`)
- A transition point (`0`) that connects to another room

### House Structure Example

To create a house that looks like the Torch Town houses (roof on top, walls on bottom with door):

```typescript
const VISUAL_MAP = [
  ". . R R R R . .",  // Roof tiles on top
  ". . R R R R . .",  // Roof tiles
  ". . R R R R . .",  // Roof tiles
  ". . h d d h . .",  // House wall with doors
  ". . . . . . . .",  // Floor around house
];
```

This creates a 4-wide, 4-tall house with:
- **Top 3 rows**: Roof tiles (`R`) - renders as orange tiled roof
- **Bottom row**: House wall (`h`) with doors (`d`) - both are wall tiles

**Important**: For proper house rendering:
- Use `R` (roof, type 4) for the top and side portions
- Use `h` (wall, type 1) for the bottom/front wall
- Use `d` (wall with door subtype) for door positions in the front wall
- Both `h` and `d` create wall tiles - `d` just adds the door subtype for interaction

## Notes

- **Spaces are ignored**: `"# # T T"` is the same as `"##TT"`
- **Transitions must be defined**: Each transition character (0-9, A-Z) must have a corresponding entry in the `TRANSITIONS` object
- **Coordinates are 0-indexed**: Top-left is `[0, 0]`, use hover coordinates in dev mode to verify positions
- **Enemies spawn on floor tiles**: The parser automatically sets the tile to floor (0) when placing enemies
