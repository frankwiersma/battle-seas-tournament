
import React from "react";
import { useDrag } from "react-dnd";
import { motion } from "framer-motion";
import { RotateCw } from "lucide-react";

interface ShipProps {
  id: string;
  length: number;
  isVertical?: boolean;
  onRotate?: () => void;
  isPlaced?: boolean;
}

const Ship: React.FC<ShipProps> = ({ id, length, isVertical = false, onRotate, isPlaced = false }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: "SHIP",
    item: { id, length, isVertical },
    canDrag: !isPlaced,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const shipClasses = `
    relative cursor-move transition-all duration-300 group
    ${isVertical ? "flex-col" : "flex-row"}
    ${isDragging ? "opacity-50" : "opacity-100"}
    ${isPlaced ? "cursor-not-allowed opacity-75" : ""}
  `;

  return (
    <motion.div
      ref={drag}
      className={`flex ${shipClasses}`}
      whileHover={{ scale: isPlaced ? 1 : 1.05 }}
      whileTap={{ scale: isPlaced ? 1 : 0.95 }}
    >
      {Array(length)
        .fill(null)
        .map((_, i) => (
          <div
            key={i}
            className="w-16 h-16 bg-accent/80 rounded-lg border border-white/20 shadow-lg"
          />
        ))}
      {!isPlaced && (
        <button
          onClick={onRotate}
          className="absolute -right-12 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors opacity-0 group-hover:opacity-100"
        >
          <RotateCw className="w-6 h-6 text-white" />
        </button>
      )}
    </motion.div>
  );
};

export default Ship;
