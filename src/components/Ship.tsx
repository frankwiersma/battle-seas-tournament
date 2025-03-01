import React from "react";
import { useDrag } from "react-dnd";
import { motion } from "framer-motion";
import { RotateCw, Move } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface ShipProps {
  id: string;
  length: number;
  isVertical?: boolean;
  onRotate?: () => void;
  isPlaced?: boolean;
}

// Ship name mapping based on length and ID
const getShipName = (length: number, id: string): string => {
  // Use the last character of the ID to differentiate between ships of the same length
  const idSuffix = id.slice(-1);
  
  switch (length) {
    case 5: return "Dreadnought";
    case 4: return "Destroyer";
    case 3: 
      return idSuffix === "1" ? "Cruiser" : "Frigate";
    case 2:
      return idSuffix === "1" ? "Patrol Boat" : "Submarine";
    case 1: return "Scout";
    default: return "Vessel";
  }
};

const Ship: React.FC<ShipProps> = ({ id, length, isVertical = false, onRotate, isPlaced = false }) => {
  const isMobile = useIsMobile();
  // Create a ref for the drag handle
  const dragRef = React.useRef(null);
  
  const [{ isDragging }, drag] = useDrag(() => ({
    type: "SHIP",
    item: { id, length, isVertical },
    canDrag: !isPlaced,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [id, length, isVertical, isPlaced]);

  // Apply the drag ref to our ref
  drag(dragRef);

  const shipClasses = `
    flex ${isVertical ? "flex-col" : "flex-row"}
    ${isDragging ? "opacity-50" : "opacity-100"}
    ${isPlaced ? "cursor-not-allowed opacity-75" : "cursor-move"}
    relative transition-all duration-300 group
  `;

  const shipName = getShipName(length, id);
  
  const cellSize = isMobile ? "w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16" : "w-16 h-16";
  const iconSize = isMobile ? "w-5 h-5" : "w-6 h-6";

  return (
    <div className="relative pt-6 px-1 pb-1">
      <div 
        ref={dragRef}
        className={shipClasses}
        style={{ 
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation'
        }}
        data-vertical={isVertical}
        data-ship-length={length}
      >
        {!isPlaced && (
          <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 px-2 py-0.5 bg-blue-600/90 text-white text-xs font-medium rounded-full shadow-md z-10 whitespace-nowrap">
            {shipName}
          </div>
        )}
        
        {[...Array(length)].map((_, i) => (
          <div
            key={i}
            className={`${cellSize} bg-accent/80 rounded-lg border border-white/20 shadow-lg touch-manipulation relative`}
          >
            {!isPlaced && i === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-500/20 rounded-lg">
                <Move className={iconSize + " text-white"} />
              </div>
            )}
            
            {!isPlaced && i === length - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onRotate) onRotate();
                }}
                className="absolute inset-0 flex items-center justify-center bg-blue-500/20 rounded-lg hover:bg-blue-500/40 transition-colors"
                style={{ WebkitTapHighlightColor: 'transparent' }}
                aria-label="Rotate ship"
              >
                <RotateCw className={iconSize + " text-white"} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Ship;
