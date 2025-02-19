import React, { useState, forwardRef, useImperativeHandle, useRef, useEffect, useCallback } from "react";
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
  
  // Create board state
  const [board, setBoard] = useState<Cell[][]>(createEmptyBoard());
  
  // Keep track of the current board state without causing re-renders
  const boardRef = useRef<Cell[][]>(board);

  // Update board when placedShips or hits change
  useEffect(() => {
    const newBoard = createEmptyBoard();
    
    // Apply all placed ships to the board
    placedShips.forEach(ship => {
      ship.positions.forEach(pos => {
        if (newBoard[pos.y]?.[pos.x]) {
          newBoard[pos.y][pos.x] = {
            ...newBoard[pos.y][pos.x],
            hasShip: true,
            shipId: ship.id
          };
        }
      });
    });

    // Apply hits
    hits.forEach(hit => {
      if (newBoard[hit.y]?.[hit.x]) {
        newBoard[hit.y][hit.x] = {
          ...newBoard[hit.y][hit.x],
          isHit: hit.isHit,
          isMiss: !hit.isHit
        };
      }
    });

    // Only update if the board has actually changed
    if (JSON.stringify(boardRef.current) !== JSON.stringify(newBoard)) {
      boardRef.current = newBoard;
      setBoard(newBoard);
    }
  }, [placedShips, hits]);

  useImperativeHandle(ref, () => ({
    resetBoard: () => {
      const newBoard = createEmptyBoard();
      boardRef.current = newBoard;
      setBoard(newBoard);
    }
  }));

  const canPlaceShip = useCallback((x: number, y: number, length: number, isVertical: boolean): boolean => {
    // Check board boundaries
    if (isVertical && y + length > 5) return false;
    if (!isVertical && x + length > 5) return false;

    // Get all positions for the new ship
    const newPositions = [];
    for (let i = 0; i < length; i++) {
      newPositions.push({
        x: isVertical ? x : x + i,
        y: isVertical ? y + i : y
      });
    }

    // Check if any of these positions or their adjacent cells are occupied
    for (const pos of newPositions) {
      // Check if this position is occupied
      if (boardRef.current[pos.y][pos.x].hasShip) return false;

      // Check adjacent cells
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const checkX = pos.x + i;
          const checkY = pos.y + j;

          // Skip if outside board
          if (checkX < 0 || checkX >= 5 || checkY < 0 || checkY >= 5) continue;

          // Check if adjacent position is occupied
          if (boardRef.current[checkY][checkX].hasShip) return false;
        }
      }
    }

    return true;
  }, []);

  const placeShip = (x: number, y: number, ship: ShipDragItem) => {
    if (!canPlaceShip(x, y, ship.length, ship.isVertical)) {
      toast.error("Cannot place ship here!");
      return;
    }

    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < ship.length; i++) {
      positions.push({
        x: ship.isVertical ? x : x + i,
        y: ship.isVertical ? y + i : y
      });
    }

    // Notify parent component of the placement
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
          <div className="grid grid-cols-5 gap-2 bg-primary/5 p-6 rounded-xl backdrop-blur-md shadow-lg">
            {board.map((row, y) => 
              row.map((cell, x) => (
                <CellComponent
                  key={`${x}-${y}`}
                  {...cell}
                  showShips={showShips}
                  onClick={() => handleCellClick(x, y)}
                />
              ))
            )}
          </div>
        </ShipPlacement>
      ) : (
        <div className="grid grid-cols-5 gap-2 bg-primary/5 p-6 rounded-xl backdrop-blur-md shadow-lg">
          {board.map((row, y) => 
            row.map((cell, x) => (
              <CellComponent
                key={`${x}-${y}`}
                {...cell}
                showShips={showShips}
                onClick={() => handleCellClick(x, y)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
});

GameBoard.displayName = "GameBoard";

export default GameBoard;
