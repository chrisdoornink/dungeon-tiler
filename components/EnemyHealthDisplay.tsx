import React from 'react';
import Image from 'next/image';

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
        <Image
          key={i}
          src="/images/presentational/heart-moss-red.png"
          alt="❤️"
          width={12}
          height={12}
          className="w-3 h-3"
          sizes="12px"
        />
      );
    } else {
      hearts.push(
        <Image
          key={i}
          src="/images/presentational/heart-moss-green.png"
          alt="🤍"
          width={12}
          height={12}
          className="w-3 h-3"
          sizes="12px"
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
