import React from 'react';
import { render, screen } from '@testing-library/react';
import EnemyHealthDisplay from '../../components/EnemyHealthDisplay';

describe('EnemyHealthDisplay', () => {
  it('should render 2 filled hearts for enemy with 2 health', () => {
    render(<EnemyHealthDisplay health={2} />);
    
    const hearts = screen.getAllByText('❤️');
    expect(hearts).toHaveLength(2);
  });

  it('should render 1 filled heart for enemy with 1 health', () => {
    render(<EnemyHealthDisplay health={1} />);
    
    const hearts = screen.getAllByText('❤️');
    expect(hearts).toHaveLength(1);
  });

  it('should render no hearts for enemy with 0 health', () => {
    render(<EnemyHealthDisplay health={0} />);
    
    const hearts = screen.queryAllByText('❤️');
    expect(hearts).toHaveLength(0);
  });

  it('should handle high health values by showing correct number of hearts', () => {
    render(<EnemyHealthDisplay health={5} />);
    
    const hearts = screen.getAllByText('❤️');
    expect(hearts).toHaveLength(5);
  });

  it('should handle negative health by showing no hearts', () => {
    render(<EnemyHealthDisplay health={-1} />);
    
    const hearts = screen.queryAllByText('❤️');
    expect(hearts).toHaveLength(0);
  });

  it('should apply custom className when provided', () => {
    const { container } = render(<EnemyHealthDisplay health={2} className="enemy-health" />);
    
    const healthDisplay = container.firstChild;
    expect(healthDisplay).toHaveClass('enemy-health');
  });

  it('should render smaller hearts for enemies', () => {
    const { container } = render(<EnemyHealthDisplay health={2} />);
    
    const healthDisplay = container.firstChild;
    expect(healthDisplay).toHaveClass('text-xs');
  });
});
