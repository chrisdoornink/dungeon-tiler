import React, { useEffect, useState } from 'react';

interface DeathScreenProps {
  deathCause?: {
    type: 'enemy' | 'faulty_floor' | 'poison';
    enemyKind?: string;
  };
  onRestart: () => void;
}

export function DeathScreen({ deathCause, onRestart }: DeathScreenProps) {
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    // Trigger fade-in animation after mount
    const timer = setTimeout(() => setFadeIn(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Generate death message based on cause
  const getDeathMessage = () => {
    if (!deathCause) return 'You have fallen';
    
    switch (deathCause.type) {
      case 'faulty_floor':
        return 'You fell into the abyss';
      case 'poison':
        return 'The poison consumed you';
      case 'enemy':
        const enemyName = deathCause.enemyKind || 'enemy';
        const formattedName = enemyName
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        return `Slain by ${formattedName}`;
      default:
        return 'You have fallen';
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-1000 ${
        fadeIn ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        pointerEvents: 'all',
      }}
    >
      <div className="flex flex-col items-center justify-center gap-8 px-4">
        {/* Hovering Ghost Icon */}
        <div
          className="w-32 h-32 animate-float"
          style={{
            backgroundImage: 'url(/images/items/spirit.png)',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            filter: 'drop-shadow(0 0 20px rgba(147, 197, 253, 0.5))',
          }}
          aria-hidden="true"
        />

        {/* Game Over Text */}
        <div className="text-center space-y-4">
          <h1
            className="text-6xl font-bold text-red-500 tracking-wider"
            style={{
              fontFamily: '"Press Start 2P", "Courier New", monospace',
              textShadow: '4px 4px 0px rgba(0, 0, 0, 0.8)',
            }}
          >
            GAME OVER
          </h1>
          
          {/* Death Cause */}
          <p
            className="text-xl text-gray-300"
            style={{
              fontFamily: '"Press Start 2P", "Courier New", monospace',
              textShadow: '2px 2px 0px rgba(0, 0, 0, 0.8)',
            }}
          >
            {getDeathMessage()}
          </p>
        </div>

        {/* Restart Button */}
        <button
          type="button"
          onClick={onRestart}
          className="mt-8 px-8 py-4 text-lg font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl"
          style={{
            fontFamily: '"Press Start 2P", "Courier New", monospace',
            textShadow: '2px 2px 0px rgba(0, 0, 0, 0.5)',
          }}
        >
          Start From Last Save
        </button>
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
