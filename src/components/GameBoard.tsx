
import React, { useState, forwardRef, useImperativeHandle } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { Cell as CellComponent } from "./game/Cell";
import { ShipPlacement } from "./game/ShipPlacement";
import type { Cell, ShipDragItem } from "./game/types";

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

  function createEmptyBoard(): Cell[][] {
    return Array(5).fill(null).map((_, y) =>
      Array(5).fill(null).map((_, x) => ({
        x,
        y,
        hasShip: false,
        isHit: false,
        isMiss: false,
        shipId: undefined
      }))
    );
  }

  // Update board when placedShips or hits change
  React.useEffect(() => {
    const newBoard = createEmptyBoard();
    
    // Apply placed ships
    placedShips.forEach(ship => {
      ship.positions.forEach(pos => {
        if (newBoard[pos.y] && newBoard[pos.y][pos.x]) {
          newBoard[pos.y][pos.x].hasShip = true;
          newBoard[pos.y][pos.x].shipId = ship.id;
        }
      });
    });

    // Apply hits
    hits.forEach(hit => {
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
    // Check board boundaries
    if (isVertical) {
      if (y + length > 5) return false;
    } else {
      if (x + length > 5) return false;
    }

    // Check for overlapping ships and adjacent ships
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

    const positions: { x: number; y: number }[] = [];
    
    if (ship.isVertical) {
      for (let i = 0; i < ship.length; i++) {
        positions.push({ x, y: y + i });
      }
    } else {
      for (let i = 0; i < ship.length; i++) {
        positions.push({ x: x + i, y });
      }
    }

    // Notify parent component
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

  return (
    <div className="p-4">
      {placementPhase ? (
        <ShipPlacement onPlaceShip={placeShip} canPlaceShip={canPlaceShip}>
          {renderBoard()}
        </ShipPlacement>
      ) : (
        renderBoard()
      )}
    </div>
  );

  function renderBoard(isOver?: boolean, canDrop?: boolean) {
    return (
      <div className="grid grid-cols-5 gap-2 bg-primary/5 p-6 rounded-xl backdrop-blur-md shadow-lg">
        {board.map((row) => 
          row.map((cell) => (
            <CellComponent
              key={`${cell.x}-${cell.y}`}
              {...cell}
              showShips={showShips}
              onClick={() => handleCellClick(cell.x, cell.y)}
              isOver={isOver}
              canDrop={canDrop}
            />
          ))
        )}
      </div>
    );
  }
});

GameBoard.displayName = "GameBoard";

export default GameBoard;
