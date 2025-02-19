
import React, { useState } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import { useIsMobile } from "@/hooks/use-mobile";

interface Cell {
  x: number;
  y: number;
  hasShip: boolean;
  isHit: boolean;
  isMiss: boolean;
}

const GameBoard = () => {
  const isMobile = useIsMobile();
  const [board, setBoard] = useState<Cell[][]>(
    Array(5)
      .fill(null)
      .map((_, y) =>
        Array(5)
          .fill(null)
          .map((_, x) => ({ x, y, hasShip: false, isHit: false, isMiss: false }))
      )
  );

  const renderCell = (cell: Cell) => {
    const baseClasses =
      "w-16 h-16 border border-opacity-20 border-white rounded-lg transition-all duration-300 backdrop-blur-sm";
    const stateClasses = cell.isHit
      ? "bg-accent/80"
      : cell.isMiss
      ? "bg-muted/20"
      : "bg-secondary/10 hover:bg-secondary/20";

    return (
      <div
        key={`${cell.x}-${cell.y}`}
        className={`${baseClasses} ${stateClasses} animate-fade-in`}
        style={{ animationDelay: `${cell.x * 50 + cell.y * 50}ms` }}
      />
    );
  };

  return (
    <DndProvider backend={isMobile ? TouchBackend : HTML5Backend}>
      <div className="p-4">
        <div className="grid grid-cols-5 gap-2 bg-primary/5 p-6 rounded-xl backdrop-blur-md shadow-lg">
          {board.map((row) => row.map((cell) => renderCell(cell)))}
        </div>
      </div>
    </DndProvider>
  );
};

export default GameBoard;
