import React, { useEffect, useState } from "react";
import Image from "next/image";
import { assetUrl } from "../lib/asset_url";

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
        return assetUrl("/images/items/key.png");
      case "exitKey":
        return assetUrl("/images/items/exit-key.png");
      case "sword":
        return assetUrl("/images/items/sword.png");
      case "shield":
        return assetUrl("/images/items/shield.png");
      case "rock":
        return assetUrl("/images/items/rock-1.png");
      case 'rune':
        return assetUrl('/images/items/rune1.png');
      case 'bomb':
        return assetUrl('/images/items/bomb-black.png');
      case 'food':
        return assetUrl('/images/items/food-1.png');
      case 'pinkHeart':
        return assetUrl('/images/items/pink-heart.png');
      case 'berry':
        return assetUrl('/images/items/berry.png');
      default:
        return assetUrl('/images/items/key.png');
    }
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
      <Image
        src={getItemImage(itemType)}
        alt={itemType}
        width={32}
        height={32}
        className="w-8 h-8 animate-item-pickup-center"
        sizes="32px"
      />
    </div>
  );
};

export default ItemPickupAnimation;
