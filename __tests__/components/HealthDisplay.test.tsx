import React from 'react';
import { render, screen } from '@testing-library/react';
import HealthDisplay from '../../components/HealthDisplay';

describe('HealthDisplay', () => {
  it('should render 5 filled hearts for full health', () => {
    render(<HealthDisplay health={5} />);
    
    const hearts = screen.getAllByAltText('❤️');
    expect(hearts).toHaveLength(5);
  });

  it('should render 3 filled hearts and 2 empty hearts for 3 health', () => {
    render(<HealthDisplay health={3} />);
    
    const filledHearts = screen.getAllByAltText('❤️');
    const emptyHearts = screen.getAllByAltText('🤍');
    
    expect(filledHearts).toHaveLength(3);
    expect(emptyHearts).toHaveLength(2);
  });

  it('should render 5 empty hearts for 0 health', () => {
    render(<HealthDisplay health={0} />);
    
    const emptyHearts = screen.getAllByAltText('🤍');
    expect(emptyHearts).toHaveLength(5);
  });

  it('should handle health values above 5 by capping at 5 hearts', () => {
    render(<HealthDisplay health={7} />);
    
    const hearts = screen.getAllByAltText('❤️');
    expect(hearts).toHaveLength(5);
  });

  it('should handle negative health values by showing 5 empty hearts', () => {
    render(<HealthDisplay health={-1} />);
    
    const emptyHearts = screen.getAllByAltText('🤍');
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

  it('should render temporary pink bonus hearts after the normal row', () => {
    render(<HealthDisplay health={5} maxHealth={5} bonusHearts={3} />);

    const redHearts = screen.getAllByAltText('❤️');
    const pinkHearts = screen.getAllByAltText('💗');

    expect(redHearts).toHaveLength(5);
    expect(pinkHearts).toHaveLength(3);
  });

  it('should not render pink hearts when bonusHearts is 0', () => {
    render(<HealthDisplay health={4} maxHealth={5} bonusHearts={0} />);

    expect(screen.queryAllByAltText('💗')).toHaveLength(0);
  });

  it('should render pink bonus hearts alongside empty normal hearts', () => {
    render(<HealthDisplay health={2} maxHealth={5} bonusHearts={3} />);

    expect(screen.getAllByAltText('❤️')).toHaveLength(2); // filled normal
    expect(screen.getAllByAltText('🤍')).toHaveLength(3); // empty normal
    expect(screen.getAllByAltText('💗')).toHaveLength(3); // pink bonus
  });
});
