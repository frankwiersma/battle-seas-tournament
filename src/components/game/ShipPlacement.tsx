import React from "react";
import { useDrop } from "react-dnd";
import type { ShipDragItem } from "./types";

interface ShipPlacementProps {
  onPlaceShip: (x: number, y: number, ship: ShipDragItem) => void;
  canPlaceShip: (x: number, y: number, length: number, isVertical: boolean) => boolean;
  children: React.ReactElement;
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
      
      console.log("Dropping ship:", item.id, "with orientation:", item.isVertical ? "vertical" : "horizontal");
      
      // Pass the exact same item from the drag source to preserve orientation
      onPlaceShip(cellCoords[0], cellCoords[1], item);
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  }));

  // Clone the child element and pass the drag-and-drop props
  const childWithProps = React.cloneElement(children, {
    ref: drop,
    className: `${children.props.className || ''} ${isOver ? 'drop-target' : ''}`,
    'data-is-over': isOver,
    'data-can-drop': canDrop,
  });

  return childWithProps;
};
