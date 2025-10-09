import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CrosswordGrid from '@/components/crossword/CrosswordGrid';
import type { CrosswordPuzzle } from '@/lib/crossword/types';

describe('CrosswordGrid Hint System', () => {
  const mockPuzzle: CrosswordPuzzle = {
    dateKey: '2025-01-01',
    grid: [
      ['A', 'P', 'P', 'L', 'E', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
    ],
    placements: [
      {
        word: 'APPLE',
        clue: 'Common red or green fruit',
        hint: 'Keeps the doctor away',
        row: 0,
        col: 0,
        direction: 'across',
      },
    ],
  };

  describe('Hint Button Display', () => {
    it('should show hint button when clue has a hint', () => {
      render(<CrosswordGrid puzzle={mockPuzzle} />);
      const hintButton = screen.getByText('Hint');
      expect(hintButton).toBeInTheDocument();
    });

    it('should not show hint button when clue has no hint', () => {
      const puzzleWithoutHint: CrosswordPuzzle = {
        ...mockPuzzle,
        placements: [
          {
            word: 'APPLE',
            clue: 'Common red or green fruit',
            row: 0,
            col: 0,
            direction: 'across',
          },
        ],
      };
      render(<CrosswordGrid puzzle={puzzleWithoutHint} />);
      const hintButton = screen.queryByText('Hint');
      expect(hintButton).not.toBeInTheDocument();
    });
  });

  describe('Hint Reveal', () => {
    it('should reveal hint text when hint button is clicked', () => {
      render(<CrosswordGrid puzzle={mockPuzzle} />);
      
      const hintButton = screen.getByText('Hint');
      fireEvent.click(hintButton);

      expect(screen.getByText(/Keeps the doctor away/i)).toBeInTheDocument();
    });

    it('should show "Hint" button after hint is revealed', () => {
      render(<CrosswordGrid puzzle={mockPuzzle} />);
      
      const hintButton = screen.getByText('Hint');
      fireEvent.click(hintButton);

      const moreHintsButton = screen.getByText('Hint');
      expect(moreHintsButton).toBeInTheDocument();
    });

    it('should not allow clicking hint button again after revealed', () => {
      render(<CrosswordGrid puzzle={mockPuzzle} />);
      
      const hintButton = screen.getByText('Hint');
      fireEvent.click(hintButton);

      // Original hint button should be gone
      expect(screen.queryByText('Hint')).not.toBeInTheDocument();
    });
  });

  describe('Letter Reveal Functionality', () => {
    it('should reveal a letter when "Hint" is clicked', () => {
      const { container } = render(<CrosswordGrid puzzle={mockPuzzle} />);
      
      // First reveal the hint
      const hintButton = screen.getByText('Hint');
      fireEvent.click(hintButton);

      // Get all input cells before revealing
      const inputs = container.querySelectorAll('input[type="text"]');
      const filledBefore = Array.from(inputs).filter(
        (input) => (input as HTMLInputElement).value !== ''
      ).length;

      // Click "Hint"
      const moreHintsButton = screen.getByText('Hint');
      fireEvent.click(moreHintsButton);

      // Count filled cells after
      const filledAfter = Array.from(inputs).filter(
        (input) => (input as HTMLInputElement).value !== ''
      ).length;

      expect(filledAfter).toBe(filledBefore + 1);
    });

    it('should reveal correct letters from the word', () => {
      const { container } = render(<CrosswordGrid puzzle={mockPuzzle} />);
      
      // Reveal the hint
      const hintButton = screen.getByText('Hint');
      fireEvent.click(hintButton);

      // Click "Hint" to reveal a letter
      const moreHintsButton = screen.getByText('Hint');
      fireEvent.click(moreHintsButton);

      // Get all input values
      const inputs = container.querySelectorAll('input[type="text"]');
      const values = Array.from(inputs)
        .slice(0, 5) // First 5 cells are APPLE
        .map((input) => (input as HTMLInputElement).value);

      // At least one letter should be revealed
      const revealedLetters = values.filter((v) => v !== '');
      expect(revealedLetters.length).toBeGreaterThan(0);

      // All revealed letters should be from APPLE
      revealedLetters.forEach((letter) => {
        expect('APPLE').toContain(letter);
      });
    });

    it('should reveal multiple different letters on repeated clicks', () => {
      const { container } = render(<CrosswordGrid puzzle={mockPuzzle} />);
      
      // Reveal the hint
      const hintButton = screen.getByText('Hint');
      fireEvent.click(hintButton);

      const moreHintsButton = screen.getByText('Hint');
      
      // Click multiple times
      fireEvent.click(moreHintsButton);
      fireEvent.click(moreHintsButton);
      fireEvent.click(moreHintsButton);

      const inputs = container.querySelectorAll('input[type="text"]');
      const values = Array.from(inputs)
        .slice(0, 5)
        .map((input) => (input as HTMLInputElement).value);

      const filledCount = values.filter((v) => v !== '').length;
      expect(filledCount).toBeGreaterThanOrEqual(3);
    });

    it('should not reveal more letters when word is complete', () => {
      const { container } = render(<CrosswordGrid puzzle={mockPuzzle} />);
      
      // Reveal the hint
      const hintButton = screen.getByText('Hint');
      fireEvent.click(hintButton);

      const moreHintsButton = screen.getByText('Hint');
      
      // Click 5 times to reveal all letters
      for (let i = 0; i < 5; i++) {
        fireEvent.click(moreHintsButton);
      }

      const inputs = container.querySelectorAll('input[type="text"]');
      const valuesBefore = Array.from(inputs)
        .slice(0, 5)
        .map((input) => (input as HTMLInputElement).value);

      // Try clicking again
      fireEvent.click(moreHintsButton);

      const valuesAfter = Array.from(inputs)
        .slice(0, 5)
        .map((input) => (input as HTMLInputElement).value);

      // Values should be the same
      expect(valuesAfter).toEqual(valuesBefore);
    });
  });

  describe('Hint-Revealed Cell Styling', () => {
    it('should apply lavender background to hint-revealed cells', () => {
      const { container } = render(<CrosswordGrid puzzle={mockPuzzle} />);
      
      // Reveal the hint and a letter
      const hintButton = screen.getByText('Hint');
      fireEvent.click(hintButton);

      const moreHintsButton = screen.getByText('Hint');
      fireEvent.click(moreHintsButton);

      // Check that at least one cell has the lavender background color
      const inputs = container.querySelectorAll('input[type="text"]');
      const cellsWithLavenderBackground = Array.from(inputs).filter((input) => {
        const style = window.getComputedStyle(input);
        // The lavender color is #E6D4F5 which is rgb(230, 212, 245)
        return style.backgroundColor.toLowerCase().includes('230, 212, 245');
      });

      expect(cellsWithLavenderBackground.length).toBeGreaterThan(0);
    });

    it('should maintain sage background after blur', () => {
      const { container } = render(<CrosswordGrid puzzle={mockPuzzle} />);
      
      // Reveal hint and letter
      const hintButton = screen.getByText('Hint');
      fireEvent.click(hintButton);

      const moreHintsButton = screen.getByText('Hint');
      fireEvent.click(moreHintsButton);

      // Find a revealed cell
      const inputs = Array.from(container.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
      const revealedCell = inputs.find((input) => input.value !== '');
      
      expect(revealedCell).toBeDefined();
      
      if (revealedCell) {
        // Focus and blur the cell
        fireEvent.focus(revealedCell);
        fireEvent.blur(revealedCell);

        // Background should still be sage
        const style = window.getComputedStyle(revealedCell);
        expect(style.backgroundColor).not.toBe('rgb(255, 255, 255)'); // Not white
      }
    });
  });

  describe('Multiple Clues with Hints', () => {
    const multiCluePuzzle: CrosswordPuzzle = {
      dateKey: '2025-01-01',
      grid: [
        ['A', 'P', 'P', 'L', 'E', '', '', '', '', ''],
        ['R', '', '', '', '', '', '', '', '', ''],
        ['R', '', '', '', '', '', '', '', '', ''],
        ['O', '', '', '', '', '', '', '', '', ''],
        ['W', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
      ],
      placements: [
        {
          word: 'APPLE',
          clue: 'Common red or green fruit',
          hint: 'Keeps the doctor away',
          row: 0,
          col: 0,
          direction: 'across',
        },
        {
          word: 'ARROW',
          clue: 'Projectile shot from a bow',
          hint: 'Robin Hood\'s weapon',
          row: 0,
          col: 0,
          direction: 'down',
        },
      ],
    };

    it('should allow revealing hints for multiple clues independently', () => {
      render(<CrosswordGrid puzzle={multiCluePuzzle} />);
      
      const hintButtons = screen.getAllByText('Hint');
      expect(hintButtons).toHaveLength(2);

      // Reveal first hint
      fireEvent.click(hintButtons[0]);
      expect(screen.getByText(/Keeps the doctor away/i)).toBeInTheDocument();

      // Reveal second hint
      fireEvent.click(hintButtons[1]);
      expect(screen.getByText(/Robin Hood's weapon/i)).toBeInTheDocument();
    });

    it('should reveal letters independently for each clue', () => {
      const { container } = render(<CrosswordGrid puzzle={multiCluePuzzle} />);
      
      // Reveal both hints
      const hintButtons = screen.getAllByText('Hint');
      fireEvent.click(hintButtons[0]);
      fireEvent.click(hintButtons[1]);

      // Get both "Hint" buttons
      const moreHintsButtons = screen.getAllByText('Hint');
      expect(moreHintsButtons).toHaveLength(2);

      // Reveal a letter from first clue
      fireEvent.click(moreHintsButtons[0]);

      const inputs = container.querySelectorAll('input[type="text"]');
      const filledCount = Array.from(inputs).filter(
        (input) => (input as HTMLInputElement).value !== ''
      ).length;

      expect(filledCount).toBeGreaterThan(0);
    });
  });
});
