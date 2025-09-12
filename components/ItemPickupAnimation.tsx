import React, { useEffect, useState } from "react";

interface ItemPickupAnimationProps {
  isTriggered: boolean;
  itemType: string;
  onAnimationComplete?: () => void;
}

const ItemPickupAnimation: React.FC<ItemPickupAnimationProps> = ({
  isTriggered,
  itemType,
  onAnimationComplete,
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

  // Get the appropriate item image based on type
  const getItemImage = (type: string) => {
    switch (type) {
      case "key":
        return "/images/items/key.png";
      case "exitKey":
        return "/images/items/exit-key.png";
      case "sword":
        return "/images/items/sword.png";
      case "shield":
        return "/images/items/shield.png";
      case "rock":
        return "/images/items/rock-1.png";
      case 'rune':
        return '/images/items/rune1.png';
      case 'food':
        return '/images/items/food-1.png';
      default:
        return '/images/items/key.png';
    }
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      <img
        src={getItemImage(itemType)}
        alt={itemType}
        className="w-8 h-8 animate-item-pickup-center"
      />
    </div>
  );
};

export default ItemPickupAnimation;
