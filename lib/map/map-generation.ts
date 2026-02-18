import { FLOOR, WALL, GRID_SIZE, MIN_ROOM_SIZE, MAX_ROOM_SIZE, dx, dy } from "./constants";

/**
 * Returns a square grid size [width, height] for a given floor.
 * Starts at 16×16 on floor 1 and grows by 1 each floor, capping at 25×25.
 */
export function gridSizeForFloor(floor: number): [number, number] {
  const size = Math.min(15 + floor, 25);
  return [size, size];
}

export type Room = {
  x: number;
  y: number;
  width: number;
  height: number;
};

let LAST_ROOMS: Room[] = [];

export function getLastRooms(): Room[] {
  return LAST_ROOMS.map((r) => ({ ...r }));
}

export function generateMap(gridW: number = GRID_SIZE, gridH: number = GRID_SIZE): number[][] {
  const grid: number[][] = [];

  for (let y = 0; y < gridH; y++) {
    const row: number[] = [];
    for (let x = 0; x < gridW; x++) {
      row.push(WALL);
    }
    grid.push(row);
  }

  const numRooms = 2 + Math.floor(Math.random() * 3); // 2-4 rooms
  const rooms: Room[] = [];

  for (let i = 0; i < numRooms; i++) {
    let attempts = 0;
    let roomPlaced = false;

    while (!roomPlaced && attempts < 20) {
      const width =
        MIN_ROOM_SIZE +
        Math.floor(Math.random() * (MAX_ROOM_SIZE - MIN_ROOM_SIZE + 1));
      const height =
        MIN_ROOM_SIZE +
        Math.floor(Math.random() * (MAX_ROOM_SIZE - MIN_ROOM_SIZE + 1));

      const x = 1 + Math.floor(Math.random() * (gridW - width - 2));
      const y = 1 + Math.floor(Math.random() * (gridH - height - 2));

      const newRoom: Room = { x, y, width, height };

      let overlaps = false;
      for (const room of rooms) {
        if (roomsOverlap(newRoom, room)) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        rooms.push(newRoom);
        carveRoom(grid, newRoom);
        roomPlaced = true;
      }

      attempts++;
    }
  }

  for (let i = 0; i < rooms.length - 1; i++) {
    const roomA = rooms[i];
    const roomB = rooms[i + 1];
    createCorridor(grid, roomA, roomB);
  }

  enforcePerimeterWalls(grid, gridW, gridH);
  adjustFloorPercentage(grid, gridW, gridH);
  ensureFloorsConnected(grid);

  LAST_ROOMS = rooms.map((r) => ({ ...r }));
  return grid;
}

export function areAllFloorsConnected(grid: number[][]): boolean {
  const regions = findFloorRegions(grid);
  return regions.length === 1;
}

export function countRooms(grid: number[][]): number {
  return findFloorRegions(grid).length;
}

function roomsOverlap(a: Room, b: Room): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

function carveRoom(grid: number[][], room: Room): void {
  for (let y = room.y; y < room.y + room.height; y++) {
    for (let x = room.x; x < room.x + room.width; x++) {
      grid[y][x] = FLOOR;
    }
  }
}

function createCorridor(grid: number[][], roomA: Room, roomB: Room): void {
  const x1 = Math.floor(roomA.x + roomA.width / 2);
  const y1 = Math.floor(roomA.y + roomA.height / 2);
  const x2 = Math.floor(roomB.x + roomB.width / 2);
  const y2 = Math.floor(roomB.y + roomB.height / 2);

  if (Math.random() < 0.5) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      grid[y1][x] = FLOOR;
    }
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      grid[y][x2] = FLOOR;
    }
  } else {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      grid[y][x1] = FLOOR;
    }
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      grid[y2][x] = FLOOR;
    }
  }
}

function enforcePerimeterWalls(grid: number[][], gridW: number = GRID_SIZE, gridH: number = GRID_SIZE): void {
  for (let x = 0; x < gridW; x++) {
    if (Math.random() < 0.7) {
      grid[0][x] = WALL;
      grid[gridH - 1][x] = WALL;
    }
  }

  for (let y = 0; y < gridH; y++) {
    if (Math.random() < 0.7) {
      grid[y][0] = WALL;
      grid[y][gridW - 1] = WALL;
    }
  }
}

function ensureFloorsConnected(grid: number[][]): void {
  const regions = findFloorRegions(grid);
  if (regions.length <= 1) return;
  for (let i = 1; i < regions.length; i++) {
    connectRegions(grid, regions[0], regions[i]);
  }
}

function findFloorRegions(grid: number[][]): Array<Array<[number, number]>> {
  const height = grid.length;
  const width = grid[0].length;
  const visited = Array(height)
    .fill(0)
    .map(() => Array(width).fill(false));
  const regions: Array<Array<[number, number]>> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] === FLOOR && !visited[y][x]) {
        const region: Array<[number, number]> = [];
        const queue: Array<[number, number]> = [[y, x]];
        visited[y][x] = true;

        while (queue.length > 0) {
          const [cy, cx] = queue.shift()!;
          region.push([cy, cx]);

          for (let dir = 0; dir < 4; dir++) {
            const ny = cy + dy[dir];
            const nx = cx + dx[dir];

            if (
              ny >= 0 &&
              ny < height &&
              nx >= 0 &&
              nx < width &&
              grid[ny][nx] === FLOOR &&
              !visited[ny][nx]
            ) {
              queue.push([ny, nx]);
              visited[ny][nx] = true;
            }
          }
        }

        regions.push(region);
      }
    }
  }

  return regions;
}

function connectRegions(
  grid: number[][],
  regionA: Array<[number, number]>,
  regionB: Array<[number, number]>
): void {
  let minDist = Infinity;
  let bestPair: [[number, number], [number, number]] | null = null;

  for (const [y1, x1] of regionA) {
    for (const [y2, x2] of regionB) {
      const dist = Math.abs(y2 - y1) + Math.abs(x2 - x1);
      if (dist < minDist) {
        minDist = dist;
        bestPair = [
          [y1, x1],
          [y2, x2],
        ];
      }
    }
  }

  if (bestPair) {
    const [[y1, x1], [y2, x2]] = bestPair;

    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      grid[y1][x] = FLOOR;
    }

    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      grid[y][x2] = FLOOR;
    }
  }
}

function adjustFloorPercentage(grid: number[][], gridW: number = GRID_SIZE, gridH: number = GRID_SIZE): void {
  let floorCount = 0;
  const totalTiles = gridW * gridH;

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      if (grid[y][x] === FLOOR) floorCount++;
    }
  }

  const minFloor = Math.ceil(totalTiles * 0.5);
  const maxFloor = Math.floor(totalTiles * 0.75);

  if (floorCount < minFloor) {
    while (floorCount < minFloor) {
      const x = 1 + Math.floor(Math.random() * (gridW - 2));
      const y = 1 + Math.floor(Math.random() * (gridH - 2));

      if (grid[y][x] === WALL) {
        grid[y][x] = FLOOR;
        floorCount++;
      }
    }
  } else if (floorCount > maxFloor) {
    while (floorCount > maxFloor) {
      const x = 1 + Math.floor(Math.random() * (gridW - 2));
      const y = 1 + Math.floor(Math.random() * (gridH - 2));

      if (grid[y][x] === FLOOR) {
        grid[y][x] = WALL;
        floorCount--;
      }
    }
  }
}
