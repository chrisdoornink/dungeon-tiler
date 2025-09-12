import React from 'react';
import { render, screen } from '@testing-library/react';
import HealthDisplay from '../../components/HealthDisplay';

describe('HealthDisplay', () => {
  it('should render 5 filled hearts for full health', () => {
    render(<HealthDisplay health={5} />);
    
    const hearts = screen.getAllByText('❤️');
    expect(hearts).toHaveLength(5);
  });

  it('should render 3 filled hearts and 2 empty hearts for 3 health', () => {
    render(<HealthDisplay health={3} />);
    
    const filledHearts = screen.getAllByText('❤️');
    const emptyHearts = screen.getAllByText('🤍');
    
    expect(filledHearts).toHaveLength(3);
    expect(emptyHearts).toHaveLength(2);
  });

  it('should render 5 empty hearts for 0 health', () => {
    render(<HealthDisplay health={0} />);
    
    const emptyHearts = screen.getAllByText('🤍');
    expect(emptyHearts).toHaveLength(5);
  });

  it('should handle health values above 5 by capping at 5 hearts', () => {
    render(<HealthDisplay health={7} />);
    
    const hearts = screen.getAllByText('❤️');
    expect(hearts).toHaveLength(5);
  });

  it('should handle negative health values by showing 5 empty hearts', () => {
    render(<HealthDisplay health={-1} />);
    
    const emptyHearts = screen.getAllByText('🤍');
    expect(emptyHearts).toHaveLength(5);
  });

  it('should apply custom className when provided', () => {
    const { container } = render(<HealthDisplay health={3} className="custom-class" />);
    
    const healthDisplay = container.firstChild;
    expect(healthDisplay).toHaveClass('custom-class');
  });

  it('should render inline by default', () => {
    const { container } = render(<HealthDisplay health={3} />);
    
    const healthDisplay = container.firstChild;
    expect(healthDisplay).toHaveClass('flex');
  });
});
