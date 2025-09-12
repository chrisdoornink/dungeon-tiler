import React from 'react';

interface EnemyHealthDisplayProps {
  health: number;
  className?: string;
}

const EnemyHealthDisplay: React.FC<EnemyHealthDisplayProps> = ({ 
  health, 
  className = '' 
}) => {
  // Only show hearts for positive health values
  const clampedHealth = Math.max(0, health);
  
  const hearts = [];
  for (let i = 0; i < clampedHealth; i++) {
    hearts.push(
      <span key={i} className="text-red-500">❤️</span>
    );
  }

  return (
    <div className={`flex gap-0.5 text-xs ${className}`}>
      {hearts}
    </div>
  );
};

export default EnemyHealthDisplay;
