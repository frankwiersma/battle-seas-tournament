
import React from "react";
import { useDrop } from "react-dnd";
import type { ShipDragItem } from "./types";

interface ShipPlacementProps {
  onPlaceShip: (x: number, y: number, ship: ShipDragItem) => void;
  canPlaceShip: (x: number, y: number, length: number, isVertical: boolean) => boolean;
  children: React.ReactNode;
}

export const ShipPlacement: React.FC<ShipPlacementProps> = ({ onPlaceShip, canPlaceShip, children }) => {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: "SHIP",
    canDrop: (item: ShipDragItem, monitor) => {
      const { x, y } = monitor.getClientOffset() || { x: 0, y: 0 };
      const element = document.elementFromPoint(x, y);
      const cellCoords = element?.getAttribute("data-coords")?.split(",").map(Number);
      if (!cellCoords) return false;
      return canPlaceShip(cellCoords[0], cellCoords[1], item.length, item.isVertical);
    },
    drop: (item: ShipDragItem, monitor) => {
      const { x, y } = monitor.getClientOffset() || { x: 0, y: 0 };
      const element = document.elementFromPoint(x, y);
      const cellCoords = element?.getAttribute("data-coords")?.split(",").map(Number);
      if (!cellCoords) return;
      onPlaceShip(cellCoords[0], cellCoords[1], item);
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  }));

  return (
    <div ref={drop}>
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { isOver, canDrop });
        }
        return child;
      })}
    </div>
  );
};
