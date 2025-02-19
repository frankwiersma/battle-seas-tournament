
import React, { useState, forwardRef, useImperativeHandle } from "react";
import { useDrop } from "react-dnd";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

interface Cell {
  x: number;
  y: number;
  hasShip: boolean;
  isHit: boolean;
  isMiss: boolean;
  shipId?: string;
}

interface ShipDragItem {
  id: string;
  length: number;
  isVertical: boolean;
}

interface GameBoardProps {
  isCurrentPlayer?: boolean;
  onShipPlaced?: (shipId: string, positions: { x: number; y: number }[]) => void;
  onCellClick?: (x: number, y: number) => void;
  placementPhase?: boolean;
  placedShips?: { id: string; positions: { x: number; y: number }[] }[];
}

const GameBoard = forwardRef<{ resetBoard: () => void }, GameBoardProps>(({ 
  isCurrentPlayer = true, 
  onShipPlaced, 
  onCellClick, 
  placementPhase = true,
  placedShips = []
}, ref) => {
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

  useImperativeHandle(ref, () => ({
    resetBoard: () => {
      const newBoard = Array(5)
        .fill(null)
        .map((_, y) =>
          Array(5)
            .fill(null)
            .map((_, x) => ({ x, y, hasShip: false, isHit: false, isMiss: false, shipId: undefined }))
        );
      setBoard(newBoard);
    }
  }));

  const canPlaceShip = (x: number, y: number, length: number, isVertical: boolean): boolean => {
    // Check if ship is within board boundaries
    if (isVertical) {
      if (y + length > 5) return false;
    } else {
      if (x + length > 5) return false;
    }

    // Check if any cell is already occupied or adjacent to another ship
    for (let i = -1; i <= length; i++) {
      for (let j = -1; j <= 1; j++) {
        const checkX = isVertical ? x + j : x + i;
        const checkY = isVertical ? y + i : y + j;

        if (
          checkX >= 0 && checkX < 5 &&
          checkY >= 0 && checkY < 5 &&
          board[checkY][checkX].hasShip
        ) {
          return false;
        }
      }
    }

    return true;
  };

  const placeShip = (x: number, y: number, ship: ShipDragItem) => {
    if (!canPlaceShip(x, y, ship.length, ship.isVertical)) {
      toast.error("Cannot place ship here!");
      return;
    }

    const newBoard = [...board];
    const positions: { x: number; y: number }[] = [];

    if (ship.isVertical) {
      for (let i = 0; i < ship.length; i++) {
        newBoard[y + i][x].hasShip = true;
        newBoard[y + i][x].shipId = ship.id;
        positions.push({ x, y: y + i });
      }
    } else {
      for (let i = 0; i < ship.length; i++) {
        newBoard[y][x + i].hasShip = true;
        newBoard[y][x + i].shipId = ship.id;
        positions.push({ x: x + i, y });
      }
    }

    setBoard(newBoard);
    onShipPlaced?.(ship.id, positions);
  };

  const handleCellClick = (x: number, y: number) => {
    if (!isCurrentPlayer || placementPhase) return;
    
    const cell = board[y][x];
    if (cell.isHit || cell.isMiss) {
      toast.error("You've already fired at this position!");
      return;
    }

    onCellClick?.(x, y);
    const newBoard = [...board];
    if (cell.hasShip) {
      newBoard[y][x].isHit = true;
      toast.success("Direct hit!");
    } else {
      newBoard[y][x].isMiss = true;
      toast.info("Miss!");
    }
    setBoard(newBoard);
  };

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
      placeShip(cellCoords[0], cellCoords[1], item);
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  }));

  const renderCell = (cell: Cell) => {
    const baseClasses = "w-16 h-16 border border-opacity-20 border-white rounded-lg transition-all duration-300 backdrop-blur-sm";
    let stateClasses = cell.isHit
      ? "bg-accent/80"
      : cell.isMiss
      ? "bg-muted/20"
      : cell.hasShip && placementPhase
      ? "bg-accent/50"
      : "bg-secondary/10 hover:bg-secondary/20";

    if (isOver && canDrop) {
      stateClasses += " bg-green-500/50";
    } else if (isOver && !canDrop) {
      stateClasses += " bg-red-500/50";
    }

    return (
      <div
        key={`${cell.x}-${cell.y}`}
        data-coords={`${cell.x},${cell.y}`}
        className={`${baseClasses} ${stateClasses} animate-fade-in`}
        style={{ animationDelay: `${cell.x * 50 + cell.y * 50}ms` }}
        onClick={() => handleCellClick(cell.x, cell.y)}
      />
    );
  };

  return (
    <div className="p-4" ref={drop}>
      <div className="grid grid-cols-5 gap-2 bg-primary/5 p-6 rounded-xl backdrop-blur-md shadow-lg">
        {board.map((row) => row.map((cell) => renderCell(cell)))}
      </div>
    </div>
  );
});

GameBoard.displayName = "GameBoard";

export default GameBoard;
