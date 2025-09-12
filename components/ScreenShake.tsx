import React, { useEffect, useRef } from 'react';

interface ScreenShakeProps {
  isShaking: boolean;
  intensity?: number;
  duration?: number;
  children: React.ReactNode;
}

export const ScreenShake: React.FC<ScreenShakeProps> = ({
  isShaking,
  intensity = 4,
  duration = 300,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isShaking || !containerRef.current) return;

    const container = containerRef.current;
    const startTime = Date.now();

    const shake = () => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / duration;

      if (progress >= 1) {
        // Reset transform when done
        container.style.transform = 'translate(0px, 0px)';
        return;
      }

      // Decrease intensity over time
      const currentIntensity = intensity * (1 - progress);
      
      // Random shake offset
      const x = (Math.random() - 0.5) * currentIntensity * 2;
      const y = (Math.random() - 0.5) * currentIntensity * 2;
      
      container.style.transform = `translate(${x}px, ${y}px)`;
      
      requestAnimationFrame(shake);
    };

    shake();
  }, [isShaking, intensity, duration]);

  return (
    <div ref={containerRef} style={{ transition: 'none' }}>
      {children}
    </div>
  );
};
