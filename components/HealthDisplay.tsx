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
        <span key={i} className="text-red-500">❤️</span>
      );
    } else {
      hearts.push(
        <span key={i} className="text-gray-400">🤍</span>
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
