// Tile type definition
export type TileType = {
  id: number;
  name: string;
  color: string;
  walkable: boolean;
};

// Map of tile types by ID
export const tileTypes: Record<number, TileType> = {
  0: { id: 0, name: 'floor', color: '#ccc', walkable: true },
  1: { id: 1, name: 'wall', color: '#333', walkable: false },
  2: { id: 2, name: 'door', color: '#aa7', walkable: false },
  3: { id: 3, name: 'key', color: '#ff0', walkable: true },
};

// Static tilemap example
const staticTilemap = [
  [1, 1, 1, 1, 1],
  [1, 0, 0, 2, 1],
  [1, 0, 3, 0, 1],
  [1, 1, 1, 1, 1],
];

/**
 * Generate a tilemap
 * Currently returns a static map, but will be extended for rule-based generation
 */
export function generateMap(): number[][] {
  return staticTilemap;
}
