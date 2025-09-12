import React from 'react';

interface EnemyHealthDisplayProps {
  health: number;
  maxHealth: number;
  className?: string;
}

const EnemyHealthDisplay: React.FC<EnemyHealthDisplayProps> = ({ 
  health, 
  maxHealth,
  className = '' 
}) => {
  // Clamp health between 0 and maxHealth
  const clampedHealth = Math.max(0, Math.min(maxHealth, health));
  
  const hearts = [];
  for (let i = 0; i < maxHealth; i++) {
    if (i < clampedHealth) {
      hearts.push(
        <img 
          key={i} 
          src="/images/presentational/heart-moss-red.png" 
          alt="❤️" 
          className="w-3 h-3"
        />
      );
    } else {
      hearts.push(
        <img 
          key={i} 
          src="/images/presentational/heart-moss-green.png" 
          alt="🤍" 
          className="w-3 h-3"
        />
      );
    }
  }

  return (
    <div className={`flex gap-0.5 text-xs ${className}`}>
      {hearts}
    </div>
  );
};

export default EnemyHealthDisplay;
