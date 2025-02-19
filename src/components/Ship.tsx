
import React from "react";
import { useDrag } from "react-dnd";
import { motion } from "framer-motion";

interface ShipProps {
  length: number;
  isVertical?: boolean;
}

const Ship: React.FC<ShipProps> = ({ length, isVertical = false }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: "SHIP",
    item: { length, isVertical },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const shipClasses = `
    relative cursor-move transition-all duration-300
    ${isVertical ? "flex-col" : "flex-row"}
    ${isDragging ? "opacity-50" : "opacity-100"}
  `;

  return (
    <motion.div
      ref={drag}
      className={`flex ${shipClasses}`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      {Array(length)
        .fill(null)
        .map((_, i) => (
          <div
            key={i}
            className="w-16 h-16 bg-accent/80 rounded-lg border border-white/20 shadow-lg"
          />
        ))}
    </motion.div>
  );
};

export default Ship;
