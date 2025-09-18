import React, { useEffect, useState } from 'react';
import Image from 'next/image';

interface HeartPopAnimationProps {
  isTriggered: boolean;
  onAnimationComplete?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const HeartPopAnimation: React.FC<HeartPopAnimationProps> = ({
  isTriggered,
  onAnimationComplete,
  className = '',
  style = {}
}) => {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isTriggered) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setIsAnimating(false);
        onAnimationComplete?.();
      }, 600); // Animation duration

      return () => clearTimeout(timer);
    }
  }, [isTriggered, onAnimationComplete]);

  if (!isAnimating) return null;

  return (
    <div className={`absolute pointer-events-none ${className}`} style={style}>
      <Image
        src="/images/presentational/heart-red.png"
        alt="❤️"
        width={16}
        height={16}
        className="w-4 h-4 animate-heart-pop"
        sizes="16px"
      />
    </div>
  );
};

export default HeartPopAnimation;
