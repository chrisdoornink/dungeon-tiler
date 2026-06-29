import React, { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import HeartPopAnimation from './HeartPopAnimation';

interface HealthDisplayProps {
  health: number;
  maxHealth?: number;
  bonusHearts?: number; // temporary pink overheal hearts drawn after the normal row
  className?: string;
  isPoisoned?: boolean; // when true, tint filled hearts to indicate poison
}

const HealthDisplay: React.FC<HealthDisplayProps> = ({
  health,
  maxHealth = 5,
  bonusHearts = 0,
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

  // Temporary pink overheal hearts (from the pink flaming heart prize) are drawn after the
  // normal row. They are always "filled" — they only exist while held — and use the pink
  // HUD heart asset so they read as a distinct bonus buffer.
  const safeBonus = Math.max(0, Math.floor(bonusHearts));
  for (let b = 0; b < safeBonus; b++) {
    hearts.push(
      <Image
        key={`bonus-${b}`}
        src="/images/presentational/heart-pink.png"
        alt="💗"
        width={16}
        height={16}
        className="w-4 h-4"
        sizes="16px"
        // Tiny pixel-art icon: skip the Next optimizer so the raw sprite is served
        // (crisper, and avoids a stale cached /_next/image entry when the art changes).
        unoptimized
      />
    );
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
