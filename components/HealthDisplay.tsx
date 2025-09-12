import React from 'react';

interface HealthDisplayProps {
  health: number;
  maxHealth?: number;
  className?: string;
}

const HealthDisplay: React.FC<HealthDisplayProps> = ({ 
  health, 
  maxHealth = 5, 
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
          src="/images/presentational/heart-red.png" 
          alt="❤️" 
          className="w-4 h-4"
        />
      );
    } else {
      hearts.push(
        <img 
          key={i} 
          src="/images/presentational/heart-empty.png" 
          alt="🤍" 
          className="w-4 h-4"
        />
      );
    }
  }

  return (
    <div className={`flex gap-1 ${className}`}>
      {hearts}
    </div>
  );
};

export default HealthDisplay;
