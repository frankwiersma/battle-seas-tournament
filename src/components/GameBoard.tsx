import React, { useState, forwardRef, useImperativeHandle, useEffect } from "react";
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
  hits?: { x: number; y: number; isHit: boolean }[];
  showShips?: boolean;
}

const GameBoard = forwardRef<{ resetBoard: () => void }, GameBoardProps>(({ 
  isCurrentPlayer = true, 
  onShipPlaced, 
  onCellClick, 
  placementPhase = true,
  placedShips = [],
  hits = [],
  showShips = true
}, ref) => {
  const isMobile = useIsMobile();
  const [board, setBoard] = useState<Cell[][]>(createEmptyBoard());

  function createEmptyBoard() {
    return Array(5).fill(null).map((_, y) =>
      Array(5).fill(null).map((_, x) => ({
        x,
        y,
        hasShip: false,
        isHit: false,
        isMiss: false
      }))
    );
  }

  useEffect(() => {
    const newBoard = createEmptyBoard();
    // Apply placed ships
    placedShips?.forEach(ship => {
      ship.positions.forEach(pos => {
        if (newBoard[pos.y] && newBoard[pos.y][pos.x]) {
          newBoard[pos.y][pos.x].hasShip = true;
          newBoard[pos.y][pos.x].shipId = ship.id;
        }
      });
    });
    // Apply hits
    hits?.forEach(hit => {
      if (newBoard[hit.y] && newBoard[hit.y][hit.x]) {
        newBoard[hit.y][hit.x].isHit = hit.isHit;
        newBoard[hit.y][hit.x].isMiss = !hit.isHit;
      }
    });
    setBoard(newBoard);
  }, [placedShips, hits]);

  useImperativeHandle(ref, () => ({
    resetBoard: () => {
      setBoard(createEmptyBoard());
    }
  }));

  const canPlaceShip = (x: number, y: number, length: number, isVertical: boolean): boolean => {
    if (isVertical) {
      if (y + length > 5) return false;
    } else {
      if (x + length > 5) return false;
    }

    // Check if any cell in ship's path or adjacent cells is occupied
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

    const newBoard = [...board.map(row => [...row])];
    const positions: { x: number; y: number }[] = [];

    const placeCell = (cellX: number, cellY: number) => {
      newBoard[cellY][cellX].hasShip = true;
      newBoard[cellY][cellX].shipId = ship.id;
      positions.push({ x: cellX, y: cellY });
    };

    if (ship.isVertical) {
      for (let i = 0; i < ship.length; i++) {
        placeCell(x, y + i);
      }
    } else {
      for (let i = 0; i < ship.length; i++) {
        placeCell(x + i, y);
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
    let cellClasses = [
      "w-16 h-16 border border-opacity-20 border-white rounded-lg transition-all duration-300 backdrop-blur-sm",
      "relative"
    ];

    // Base state classes
    if (cell.isHit) {
      cellClasses.push("bg-red-500/80");
    } else if (cell.isMiss) {
      cellClasses.push("bg-blue-500/50");
    } else if (cell.hasShip && showShips) {
      cellClasses.push("bg-green-500/80");
    } else {
      cellClasses.push("bg-white/10 hover:bg-white/20");
    }

    // Drag state classes
    if (isOver && canDrop) {
      cellClasses.push("bg-green-500/50");
    } else if (isOver && !canDrop) {
      cellClasses.push("bg-red-500/50");
    }

    return (
      <div
        key={`${cell.x}-${cell.y}`}
        data-coords={`${cell.x},${cell.y}`}
        className={cellClasses.join(" ")}
        style={{ animationDelay: `${cell.x * 50 + cell.y * 50}ms` }}
        onClick={() => handleCellClick(cell.x, cell.y)}
      >
        {cell.hasShip && showShips && (
          <div className="absolute inset-1 rounded bg-green-300/20 border-2 border-green-300/50" />
        )}
        {cell.isHit && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
          </div>
        )}
        {cell.isMiss && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-blue-500 rounded-full" />
          </div>
        )}
      </div>
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
