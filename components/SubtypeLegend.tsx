import React from 'react';

// Define the subtype entries
const subtypeInfo = {
  0: { name: 'None', color: 'transparent' },
  1: { name: 'Exit', color: '#4ade80' }, // Green
  2: { name: 'Door', color: '#a78bfa' }, // Purple
  3: { name: 'Key', color: '#facc15' },  // Yellow
  4: { name: 'Lock', color: '#f87171' },  // Red
  5: { name: 'Player', color: '#3b82f6' },  // Blue
  6: { name: 'Lightswitch', color: '#f59e0b' },  // Amber/Orange
  7: { name: 'Exit Key', color: '#818cf8' }  // Indigo
};

export const SubtypeLegend: React.FC = () => {
  return (
    <div className="mt-6 p-4 border border-gray-300 rounded-md">
      <h2 className="text-xl font-semibold mb-2">Tile Subtypes</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(subtypeInfo).map(([id, info]) => (
          <div key={`subtype-${id}`} className="flex items-center">
            <div 
              className="w-6 h-6 mr-2 border border-gray-300"
              style={{ backgroundColor: info.color }}
            ></div>
            <span>
              {id}: {info.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
