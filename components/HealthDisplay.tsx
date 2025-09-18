import React, { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import HeartPopAnimation from './HeartPopAnimation';

interface HealthDisplayProps {
  health: number;
  maxHealth?: number;
  className?: string;
  isPoisoned?: boolean; // when true, tint filled hearts to indicate poison
}

const HealthDisplay: React.FC<HealthDisplayProps> = ({ 
  health, 
  maxHealth = 5, 
  className = '',
  isPoisoned = false,
}) => {
  const [previousHealth, setPreviousHealth] = useState(health);
  const [heartPopTrigger, setHeartPopTrigger] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clamp health between 0 and maxHealth
  const clampedHealth = Math.max(0, Math.min(maxHealth, health));

  // Detect health loss and trigger heart pop animation
  useEffect(() => {
    if (health < previousHealth) {
      setHeartPopTrigger(true);
    }
    setPreviousHealth(health);
  }, [health, previousHealth]);

  const handleAnimationComplete = () => {
    setHeartPopTrigger(false);
  };
  
  const hearts = [];
  for (let i = 0; i < maxHealth; i++) {
    if (i < clampedHealth) {
      hearts.push(
        <Image
          key={i}
          src={isPoisoned ? "/images/presentational/heart-poison-green.png" : "/images/presentational/heart-red.png"}
          alt={isPoisoned ? "💚" : "❤️"}
          width={16}
          height={16}
          className="w-4 h-4"
          sizes="16px"
        />
      );
    } else {
      hearts.push(
        <Image
          key={i}
          src="/images/presentational/heart-empty.png"
          alt="🤍"
          width={16}
          height={16}
          className="w-4 h-4"
          sizes="16px"
        />
      );
    }
  }

  return (
    <div ref={containerRef} className={`relative flex gap-1 ${className}`}>
      {hearts}
      {heartPopTrigger && (
        <HeartPopAnimation
          isTriggered={heartPopTrigger}
          onAnimationComplete={handleAnimationComplete}
          className="top-0"
          style={{ left: `${clampedHealth * 20}px` }}
        />
      )}
    </div>
  );
};

export default HealthDisplay;
