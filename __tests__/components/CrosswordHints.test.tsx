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
    it('should show hint buttons when clue has a hint', () => {
      render(<CrosswordGrid puzzle={mockPuzzle} />);
      const hintButtons = screen.getAllByText('Hint');
      // Should have 2 buttons: clue hint + letter reveal
      expect(hintButtons).toHaveLength(2);
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
      // Should only have letter reveal hint button, not clue hint button
      const hintButtons = screen.getAllByText('Hint');
      expect(hintButtons).toHaveLength(1); // Only letter reveal button
    });
  });

  describe('Hint Reveal', () => {
    it('should reveal hint text when hint button is clicked', () => {
      render(<CrosswordGrid puzzle={mockPuzzle} />);
      
      const hintButtons = screen.getAllByText('Hint');
      // Click the first button (clue hint)
      fireEvent.click(hintButtons[0]);

      expect(screen.getByText(/Keeps the doctor away/i)).toBeInTheDocument();
    });

    it('should show only letter reveal button after clue hint is revealed', () => {
      render(<CrosswordGrid puzzle={mockPuzzle} />);
      
      const hintButtons = screen.getAllByText('Hint');
      // Click the first button (clue hint)
      fireEvent.click(hintButtons[0]);

      // After revealing clue hint, should only have 1 button (letter reveal)
      const remainingButtons = screen.getAllByText('Hint');
      expect(remainingButtons).toHaveLength(1);
      // And the clue hint text should be visible
      expect(screen.getByText(/Keeps the doctor away/i)).toBeInTheDocument();
    });
  });

  describe('Letter Reveal Functionality', () => {
    it('should reveal a letter when letter reveal hint is clicked', () => {
      const { container } = render(<CrosswordGrid puzzle={mockPuzzle} />);
      
      // Get all input cells before revealing
      const inputs = container.querySelectorAll('input[type="text"]');
      const filledBefore = Array.from(inputs).filter(
        (input) => (input as HTMLInputElement).value !== ''
      ).length;

      // Click the letter reveal hint button (second button)
      const hintButtons = screen.getAllByText('Hint');
      fireEvent.click(hintButtons[1]);

      // Count filled cells after
      const filledAfter = Array.from(inputs).filter(
        (input) => (input as HTMLInputElement).value !== ''
      ).length;

      expect(filledAfter).toBe(filledBefore + 1);
    });

    it('should reveal correct letters from the word', () => {
      const { container } = render(<CrosswordGrid puzzle={mockPuzzle} />);
      
      // Click the letter reveal button (second button)
      const hintButtons = screen.getAllByText('Hint');
      fireEvent.click(hintButtons[1]);

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
      
      const hintButtons = screen.getAllByText('Hint');
      const letterRevealButton = hintButtons[1];
      
      // Click multiple times
      fireEvent.click(letterRevealButton);
      fireEvent.click(letterRevealButton);
      fireEvent.click(letterRevealButton);

      const inputs = container.querySelectorAll('input[type="text"]');
      const values = Array.from(inputs)
        .slice(0, 5)
        .map((input) => (input as HTMLInputElement).value);

      const filledCount = values.filter((v) => v !== '').length;
      expect(filledCount).toBeGreaterThanOrEqual(3);
    });

    it('should not reveal more letters when word is complete', () => {
      const { container } = render(<CrosswordGrid puzzle={mockPuzzle} />);
      
      const hintButtons = screen.getAllByText('Hint');
      const letterRevealButton = hintButtons[1];
      
      // Click 5 times to reveal all letters
      for (let i = 0; i < 5; i++) {
        fireEvent.click(letterRevealButton);
      }

      const inputs = container.querySelectorAll('input[type="text"]');
      const valuesBefore = Array.from(inputs)
        .slice(0, 5)
        .map((input) => (input as HTMLInputElement).value);

      // Try clicking again
      fireEvent.click(letterRevealButton);

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
      
      // Click letter reveal button
      const hintButtons = screen.getAllByText('Hint');
      fireEvent.click(hintButtons[1]);

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
      
      // Click letter reveal button
      const hintButtons = screen.getAllByText('Hint');
      fireEvent.click(hintButtons[1]);

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
      // Should have 4 buttons: 2 clue hints + 2 letter reveals
      expect(hintButtons).toHaveLength(4);

      // Reveal first clue hint (button 0)
      fireEvent.click(hintButtons[0]);
      expect(screen.getByText(/Keeps the doctor away/i)).toBeInTheDocument();

      // Reveal second clue hint (button 2 - after first clue's letter reveal button)
      fireEvent.click(hintButtons[2]);
      expect(screen.getByText(/Robin Hood's weapon/i)).toBeInTheDocument();
    });

    it('should reveal letters independently for each clue', () => {
      const { container } = render(<CrosswordGrid puzzle={multiCluePuzzle} />);
      
      const hintButtons = screen.getAllByText('Hint');
      
      // Click letter reveal button for first clue (button 1)
      fireEvent.click(hintButtons[1]);

      const inputs = container.querySelectorAll('input[type="text"]');
      const filledCount = Array.from(inputs).filter(
        (input) => (input as HTMLInputElement).value !== ''
      ).length;

      expect(filledCount).toBeGreaterThan(0);
    });
  });
});
