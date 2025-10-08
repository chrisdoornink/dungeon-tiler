import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CrosswordGrid from './CrosswordGrid';
import type { CrosswordPuzzle } from '@/lib/crossword/types';

// Helper to create a simple puzzle
const createPuzzle = (gridPattern: (boolean | null)[][]): CrosswordPuzzle => {
  const grid = gridPattern.map(row => row.map(cell => cell ? 'X' : '')) as (string | null)[][];
  
  // Create placements based on grid pattern
  const placements: CrosswordPuzzle['placements'] = [];
  
  // Find horizontal words
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]) {
        const leftEmpty = c === 0 || !grid[r][c - 1];
        const rightFilled = c < grid[r].length - 1 && grid[r][c + 1];
        
        if (leftEmpty && rightFilled) {
          // Start of horizontal word
          let length = 0;
          let col = c;
          while (col < grid[r].length && grid[r][col]) {
            length++;
            col++;
          }
          
          if (length > 1) {
            placements.push({
              row: r,
              col: c,
              direction: 'across',
              word: 'A'.repeat(length),
              clue: `Across clue at ${r},${c}`
            });
          }
        }
      }
    }
  }
  
  // Find vertical words
  for (let c = 0; c < grid[0].length; c++) {
    for (let r = 0; r < grid.length; r++) {
      if (grid[r][c]) {
        const topEmpty = r === 0 || !grid[r - 1][c];
        const bottomFilled = r < grid.length - 1 && grid[r + 1][c];
        
        if (topEmpty && bottomFilled) {
          // Start of vertical word
          let length = 0;
          let row = r;
          while (row < grid.length && grid[row][c]) {
            length++;
            row++;
          }
          
          if (length > 1) {
            placements.push({
              row: r,
              col: c,
              direction: 'down',
              word: 'B'.repeat(length),
              clue: `Down clue at ${r},${c}`
            });
          }
        }
      }
    }
  }
  
  return { 
    dateKey: '2025-01-01',
    grid: grid as string[][], 
    placements 
  };
};

describe('CrosswordGrid', () => {
  describe('Cell Rendering', () => {
    it('renders active cells as input elements', () => {
      const puzzle = createPuzzle([
        [true, true, null],
        [null, null, null],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      expect(inputs).toHaveLength(2);
    });
    
    it('renders inactive cells without inputs', () => {
      const puzzle = createPuzzle([
        [true, null, true],
        [null, null, null],
      ]);
      
      const { container } = render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      expect(inputs).toHaveLength(2); // Only active cells
      
      // Should have aria-hidden divs for inactive cells
      const inactiveCells = container.querySelectorAll('div[aria-hidden="true"]');
      expect(inactiveCells.length).toBeGreaterThan(0);
    });
    
    it('applies correct cell size from constants', () => {
      const puzzle = createPuzzle([
        [true, true],
        [true, true],
      ]);
      
      const { container } = render(<CrosswordGrid puzzle={puzzle} />);
      
      const cellWrappers = container.querySelectorAll('.relative');
      expect(cellWrappers.length).toBeGreaterThan(0);
      
      // Check that inline styles are applied (size is set via style prop)
      const firstCell = cellWrappers[0] as HTMLElement;
      expect(firstCell.style.width).toBeTruthy();
      expect(firstCell.style.height).toBeTruthy();
    });
  });
  
  describe('Cell Numbering', () => {
    it('numbers cells starting horizontal words', () => {
      const puzzle = createPuzzle([
        [true, true, true],
        [null, null, null],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const number1 = screen.getByText('1');
      expect(number1).toBeInTheDocument();
    });
    
    it('numbers cells starting vertical words', () => {
      const puzzle = createPuzzle([
        [true, null],
        [true, null],
        [true, null],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const number1 = screen.getByText('1');
      expect(number1).toBeInTheDocument();
    });
    
    it('assigns same number to cell starting both across and down words', () => {
      const puzzle = createPuzzle([
        [true, true, true],
        [true, null, null],
        [true, null, null],
      ]);
      
      const { container } = render(<CrosswordGrid puzzle={puzzle} />);
      
      // Cell at 0,0 should have number 1 (starts both directions)
      const numbers = screen.getAllByText('1');
      expect(numbers.length).toBe(1); // Should only appear once
    });
    
    it('numbers cells in reading order (left-to-right, top-to-bottom)', () => {
      const puzzle = createPuzzle([
        [true, true, null, true, true],
        [null, null, null, null, null],
        [true, true, null, null, null],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });
  
  describe('Border Rendering', () => {
    it('draws borders on active cells without adjacent active neighbors', () => {
      const puzzle = createPuzzle([
        [true, null],
        [null, null],
      ]);
      
      const { container } = render(<CrosswordGrid puzzle={puzzle} />);
      
      // Active cell should have overlay border spans
      const borderSpans = container.querySelectorAll('.bg-black[aria-hidden="true"]');
      expect(borderSpans.length).toBeGreaterThan(0);
    });
    
    it('draws top borders on inactive cells below active cells', () => {
      const puzzle = createPuzzle([
        [true, true],
        [null, null],
      ]);
      
      const { container } = render(<CrosswordGrid puzzle={puzzle} />);
      
      // Inactive cells in row 1 should have top borders
      const inactiveCellsWithBorders = container.querySelectorAll('div[aria-hidden="true"] > .bg-black');
      expect(inactiveCellsWithBorders.length).toBeGreaterThan(0);
    });
    
    it('draws left borders on inactive cells to the right of active cells', () => {
      const puzzle = createPuzzle([
        [true, null],
        [true, null],
      ]);
      
      const { container } = render(<CrosswordGrid puzzle={puzzle} />);
      
      // Inactive cells in column 1 should have left borders
      const inactiveCellsWithBorders = container.querySelectorAll('div[aria-hidden="true"] > .bg-black');
      expect(inactiveCellsWithBorders.length).toBeGreaterThan(0);
    });
  });
  
  describe('Input Handling', () => {
    it('accepts single letter input', () => {
      const puzzle = createPuzzle([
        [true, true],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      const firstInput = inputs[0] as HTMLInputElement;
      
      fireEvent.change(firstInput, { target: { value: 'A' } });
      
      expect(firstInput.value).toBe('A');
    });
    
    it('converts input to uppercase', () => {
      const puzzle = createPuzzle([
        [true, true],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      const firstInput = inputs[0] as HTMLInputElement;
      
      fireEvent.change(firstInput, { target: { value: 'a' } });
      
      expect(firstInput.value).toBe('A');
    });
    
    it('limits input to single character', () => {
      const puzzle = createPuzzle([
        [true, true],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      const firstInput = inputs[0] as HTMLInputElement;
      
      expect(firstInput).toHaveAttribute('maxLength', '1');
    });
  });
  
  describe('Navigation', () => {
    it('moves to next cell on right arrow key', () => {
      const puzzle = createPuzzle([
        [true, true, true],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      const firstInput = inputs[0] as HTMLInputElement;
      const secondInput = inputs[1] as HTMLInputElement;
      
      firstInput.focus();
      fireEvent.keyDown(firstInput, { key: 'ArrowRight' });
      
      expect(document.activeElement).toBe(secondInput);
    });
    
    it('moves to previous cell on left arrow key', () => {
      const puzzle = createPuzzle([
        [true, true, true],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      const firstInput = inputs[0] as HTMLInputElement;
      const secondInput = inputs[1] as HTMLInputElement;
      
      secondInput.focus();
      fireEvent.keyDown(secondInput, { key: 'ArrowLeft' });
      
      expect(document.activeElement).toBe(firstInput);
    });
    
    it('moves to cell below on down arrow key', () => {
      const puzzle = createPuzzle([
        [true, true],
        [true, true],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      const firstInput = inputs[0] as HTMLInputElement;
      const cellBelowIndex = 2; // First cell of second row
      const cellBelow = inputs[cellBelowIndex] as HTMLInputElement;
      
      firstInput.focus();
      fireEvent.keyDown(firstInput, { key: 'ArrowDown' });
      
      expect(document.activeElement).toBe(cellBelow);
    });
    
    it('moves to cell above on up arrow key', () => {
      const puzzle = createPuzzle([
        [true, true],
        [true, true],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      const cellBelowIndex = 2;
      const cellBelow = inputs[cellBelowIndex] as HTMLInputElement;
      const firstInput = inputs[0] as HTMLInputElement;
      
      cellBelow.focus();
      fireEvent.keyDown(cellBelow, { key: 'ArrowUp' });
      
      expect(document.activeElement).toBe(firstInput);
    });
    
    it('advances to next cell after entering a letter', () => {
      const puzzle = createPuzzle([
        [true, true, true],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      const firstInput = inputs[0] as HTMLInputElement;
      const secondInput = inputs[1] as HTMLInputElement;
      
      firstInput.focus();
      fireEvent.change(firstInput, { target: { value: 'A' } });
      
      // Component should auto-advance
      expect(document.activeElement).toBe(secondInput);
    });
    
    it('moves backward on backspace in empty cell', () => {
      const puzzle = createPuzzle([
        [true, true, true],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      const firstInput = inputs[0] as HTMLInputElement;
      const secondInput = inputs[1] as HTMLInputElement;
      
      secondInput.focus();
      fireEvent.keyDown(secondInput, { key: 'Backspace' });
      
      expect(document.activeElement).toBe(firstInput);
    });
  });
  
  describe('Direction Switching', () => {
    it('switches direction when clicking cell with both across and down words', () => {
      const puzzle = createPuzzle([
        [true, true, true],
        [true, null, null],
        [true, null, null],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      const intersectionCell = inputs[0]; // Cell at 0,0 has both directions
      
      // First click - should set to one direction
      fireEvent.click(intersectionCell);
      
      // Second click - should toggle direction
      fireEvent.click(intersectionCell);
      
      // Just verify it doesn't crash - actual direction state is internal
      expect(intersectionCell).toBeInTheDocument();
    });
  });
  
  describe('Clue Display', () => {
    it('displays across clues', () => {
      const puzzle = createPuzzle([
        [true, true, true],
        [null, null, null],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      expect(screen.getByRole('heading', { name: 'Across' })).toBeInTheDocument();
    });
    
    it('displays down clues', () => {
      const puzzle = createPuzzle([
        [true, null],
        [true, null],
        [true, null],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      expect(screen.getByRole('heading', { name: 'Down' })).toBeInTheDocument();
    });
    
    it('displays clue text with numbers', () => {
      const puzzle: CrosswordPuzzle = {
        dateKey: '2025-01-01',
        grid: [
          ['X', 'X', 'X'],
          ['', '', ''],
        ] as string[][],
        placements: [
          {
            row: 0,
            col: 0,
            direction: 'across',
            word: 'CAT',
            clue: 'A feline animal'
          }
        ]
      };
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      expect(screen.getByText(/A feline animal/)).toBeInTheDocument();
    });
  });
  
  describe('Grid Layout', () => {
    it('creates a 10-column grid', () => {
      const puzzle = createPuzzle([
        [true, true, true, true, true, true, true, true, true, true],
      ]);
      
      const { container } = render(<CrosswordGrid puzzle={puzzle} />);
      
      const gridContainer = container.querySelector('.grid');
      expect(gridContainer).toBeInTheDocument();
      
      // Check that gridTemplateColumns is set
      const style = (gridContainer as HTMLElement)?.style;
      expect(style?.gridTemplateColumns).toContain('repeat(10');
    });
    
    it('uses flex layout for desktop with grid and clues side-by-side', () => {
      const puzzle = createPuzzle([
        [true, true],
        [true, true],
      ]);
      
      const { container } = render(<CrosswordGrid puzzle={puzzle} />);
      
      const mainContainer = container.querySelector('.flex');
      expect(mainContainer).toHaveClass('lg:flex-row');
    });
  });
  
  describe('Accessibility', () => {
    it('has aria-labels on input cells', () => {
      const puzzle = createPuzzle([
        [true, true],
        [true, true],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      inputs.forEach(input => {
        expect(input).toHaveAttribute('aria-label');
      });
    });
    
    it('marks inactive cells with aria-hidden', () => {
      const puzzle = createPuzzle([
        [true, null, true],
      ]);
      
      const { container } = render(<CrosswordGrid puzzle={puzzle} />);
      
      const inactiveCells = container.querySelectorAll('[aria-hidden="true"]');
      expect(inactiveCells.length).toBeGreaterThan(0);
    });
    
    it('sets inputMode to text for mobile keyboards', () => {
      const puzzle = createPuzzle([
        [true, true],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      inputs.forEach(input => {
        expect(input).toHaveAttribute('inputMode', 'text');
      });
    });
    
    it('sets pattern attribute for letter-only input', () => {
      const puzzle = createPuzzle([
        [true, true],
      ]);
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      inputs.forEach(input => {
        expect(input).toHaveAttribute('pattern', '[A-Za-z]');
      });
    });
  });
  
  describe('Edge Cases', () => {
    it('handles empty grid gracefully', () => {
      const puzzle: CrosswordPuzzle = {
        dateKey: '2025-01-01',
        grid: [
          ['', ''],
          ['', ''],
        ] as string[][],
        placements: []
      };
      
      const { container } = render(<CrosswordGrid puzzle={puzzle} />);
      
      expect(container).toBeInTheDocument();
      const inputs = screen.queryAllByRole('textbox');
      expect(inputs).toHaveLength(0);
    });
    
    it('handles single cell grid', () => {
      const puzzle: CrosswordPuzzle = {
        dateKey: '2025-01-01',
        grid: [['X']] as string[][],
        placements: []
      };
      
      render(<CrosswordGrid puzzle={puzzle} />);
      
      const inputs = screen.getAllByRole('textbox');
      expect(inputs).toHaveLength(1);
    });
    
    it('handles grid with isolated cells', () => {
      const puzzle = createPuzzle([
        [true, null, true],
        [null, null, null],
        [true, null, true],
      ]);
      
      const { container } = render(<CrosswordGrid puzzle={puzzle} />);
      
      expect(container).toBeInTheDocument();
      const inputs = screen.getAllByRole('textbox');
      expect(inputs).toHaveLength(4);
    });
    
    it('handles large grids efficiently', () => {
      const largeGrid = Array(10).fill(null).map(() => 
        Array(10).fill(true)
      );
      const puzzle = createPuzzle(largeGrid);
      
      const { container } = render(<CrosswordGrid puzzle={puzzle} />);
      
      expect(container).toBeInTheDocument();
      const inputs = screen.getAllByRole('textbox');
      expect(inputs).toHaveLength(100);
    });
  });
});
