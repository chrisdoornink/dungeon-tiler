import { canSee, calculateDistance } from "../../lib/line_of_sight";

describe("Line of Sight Utilities", () => {
  describe("canSee function", () => {
    it("should return true when there are no obstacles between two points", () => {
      // Simple 5x5 grid with no walls
      const grid = [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
      ];
      
      // Points on opposite sides of the grid
      const from = [0, 0]; // Top-left
      const to = [4, 4]; // Bottom-right
      
      expect(canSee(grid, from, to)).toBe(true);
    });
    
    it("should return false when there is a wall directly between two points", () => {
      // 5x5 grid with a wall in the middle
      const grid = [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0], // Wall at [2, 2]
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
      ];
      
      // Points on opposite sides of the wall
      const from = [0, 0]; // Top-left
      const to = [4, 4]; // Bottom-right
      
      expect(canSee(grid, from, to)).toBe(false);
    });
    
    it("should return true when points are adjacent", () => {
      const grid = [
        [0, 0, 0],
        [0, 1, 0], // Wall at [1, 1]
        [0, 0, 0],
      ];
      
      // Adjacent points
      const from = [0, 0];
      const to = [0, 1];
      
      expect(canSee(grid, from, to)).toBe(true);
    });
    
    it("should return true when looking at self", () => {
      const grid = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];
      
      const position = [1, 1];
      
      expect(canSee(grid, position, position)).toBe(true);
    });
    
    it("should handle horizontal walls correctly", () => {
      const grid = [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1], // Horizontal wall
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
      ];
      
      // Points on opposite sides of the wall
      const from = [1, 2]; // Above wall
      const to = [3, 2]; // Below wall
      
      expect(canSee(grid, from, to)).toBe(false);
    });
    
    it("should handle vertical walls correctly", () => {
      const grid = [
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0], // Vertical wall
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0],
      ];
      
      // Points on opposite sides of the wall
      const from = [2, 1]; // Left of wall
      const to = [2, 3]; // Right of wall
      
      expect(canSee(grid, from, to)).toBe(false);
    });
    
    it("should handle diagonal walls correctly", () => {
      const grid = [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 1, 0],
        [0, 0, 1, 0, 0], // Diagonal wall pattern
        [0, 1, 0, 0, 0],
        [0, 0, 0, 0, 0],
      ];
      
      // Points on opposite sides of the diagonal wall
      const from = [0, 0]; // Top-left
      const to = [4, 4]; // Bottom-right
      
      expect(canSee(grid, from, to)).toBe(false);
    });
    
    it("should handle complex wall arrangements", () => {
      // Create a grid with a complex wall arrangement and a hole in the middle
      const grid = [
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 1, 0, 0, 0],
        [0, 0, 1, 1, 1, 0, 0],
        [0, 1, 1, 0, 1, 1, 0], // Complex wall arrangement with a hole at [3,3]
        [0, 0, 1, 1, 1, 0, 0],
        [0, 0, 0, 1, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
      ];
      
      // Points that should not have line of sight (diagonal through walls)
      const from = [0, 0]; // Top-left
      const to = [6, 6]; // Bottom-right
      
      expect(canSee(grid, from, to)).toBe(false);
      
      // Points that should have line of sight through the hole
      // This is a straight horizontal line through the hole at [3,3]
      const from2 = [3, 0]; // Left middle
      const to2 = [3, 6]; // Right middle
      
      // Verify the grid has the expected layout
      expect(grid[3][0]).toBe(0); // Start point is floor
      expect(grid[3][1]).toBe(1); // Wall
      expect(grid[3][2]).toBe(1); // Wall
      expect(grid[3][3]).toBe(0); // Hole (floor)
      expect(grid[3][4]).toBe(1); // Wall
      expect(grid[3][5]).toBe(1); // Wall
      expect(grid[3][6]).toBe(0); // End point is floor
      
      expect(canSee(grid, from2, to2)).toBe(true);
    });
  });
  
  describe("calculateDistance function", () => {
    it("should calculate Manhattan distance correctly", () => {
      const from = [0, 0];
      const to = [3, 4];
      
      // Manhattan distance = |x2 - x1| + |y2 - y1| = |3 - 0| + |4 - 0| = 3 + 4 = 7
      expect(calculateDistance(from, to, "manhattan")).toBe(7);
    });
    
    it("should calculate Euclidean distance correctly", () => {
      const from = [0, 0];
      const to = [3, 4];
      
      // Euclidean distance = sqrt((x2 - x1)² + (y2 - y1)²) = sqrt(3² + 4²) = sqrt(9 + 16) = sqrt(25) = 5
      expect(calculateDistance(from, to, "euclidean")).toBe(5);
    });
    
    it("should calculate Chebyshev distance correctly", () => {
      const from = [0, 0];
      const to = [3, 4];
      
      // Chebyshev distance = max(|x2 - x1|, |y2 - y1|) = max(|3 - 0|, |4 - 0|) = max(3, 4) = 4
      expect(calculateDistance(from, to, "chebyshev")).toBe(4);
    });
    
    it("should default to Manhattan distance when no method is specified", () => {
      const from = [0, 0];
      const to = [3, 4];
      
      expect(calculateDistance(from, to)).toBe(7); // Manhattan distance
    });
    
    it("should return 0 for the same point", () => {
      const point = [5, 5];
      
      expect(calculateDistance(point, point, "manhattan")).toBe(0);
      expect(calculateDistance(point, point, "euclidean")).toBe(0);
      expect(calculateDistance(point, point, "chebyshev")).toBe(0);
    });
    
    it("should handle negative coordinates", () => {
      const from = [-2, -3];
      const to = [1, 2];
      
      // Manhattan: |-2 - 1| + |-3 - 2| = 3 + 5 = 8
      expect(calculateDistance(from, to, "manhattan")).toBe(8);
      
      // Euclidean: sqrt((1-(-2))² + (2-(-3))²) = sqrt(3² + 5²) = sqrt(9 + 25) = sqrt(34) ≈ 5.83
      expect(calculateDistance(from, to, "euclidean")).toBeCloseTo(5.83, 1);
      
      // Chebyshev: max(|1-(-2)|, |2-(-3)|) = max(3, 5) = 5
      expect(calculateDistance(from, to, "chebyshev")).toBe(5);
    });
  });
});
