import React, { useState, forwardRef, useImperativeHandle, useRef, useEffect, useCallback, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { Cell as CellComponent } from "./game/Cell";
import { ShipPlacement } from "./game/ShipPlacement";
import type { Cell, ShipDragItem } from "./game/types";
import type { BoardState, PlacedShip, Position } from "@/types/game";

// Create a logger that only logs in dev environments
const isDev = process.env.NODE_ENV !== 'production';
const logger = {
  log: (...args: any[]) => {
    if (isDev) {
      console.log(...args);
    }
  },
  error: (...args: any[]) => {
    // Always log errors, even in production
    console.error(...args);
  }
};

interface GameBoardProps {
  isCurrentPlayer?: boolean;
  onShipPlaced?: (shipId: string, positions: { x: number; y: number }[]) => void;
  onCellClick?: (x: number, y: number) => void;
  placementPhase?: boolean;
  placedShips?: { id: string; positions: { x: number; y: number }[] }[];
  hits?: { x: number; y: number; isHit: boolean }[];
  showShips?: boolean;
  receivedHits?: Array<{ position: Position; isHit: boolean }>;
  onPlaceShip?: (ship: PlacedShip) => void;
  readonly?: boolean;
  currentShipId?: string;
  currentShipSize?: number;
  isOpponentBoard?: boolean;
  gameStarted?: boolean;
}

const GameBoard = forwardRef<{ resetBoard: () => void }, GameBoardProps>(({ 
  isCurrentPlayer = true, 
  onShipPlaced, 
  onCellClick, 
  placementPhase = true,
  placedShips = [],
  hits = [],
  showShips = true,
  receivedHits = [],
  onPlaceShip,
  readonly = false,
  currentShipId = "",
  currentShipSize = 0,
  isOpponentBoard = false,
  gameStarted = false
}, ref) => {
  const isMobile = useIsMobile();
  
  useEffect(() => {
    logger.log("Received hits:", receivedHits);
    logger.log("Placed ships:", placedShips);
  }, [receivedHits, placedShips]);
  
  const board = useMemo(() => {
    const newBoard = Array(5).fill(null).map((_, y) =>
      Array(5).fill(null).map((_, x) => ({
        hasShip: false,
        isHit: false,
        isMiss: false,
        x: x,
        y: y
      }))
    );

    // Place ships first
    logger.log('Placing ships:', placedShips);
    placedShips.forEach(ship => {
      ship.positions.forEach(pos => {
        if (newBoard[pos.y] && newBoard[pos.y][pos.x]) {
          newBoard[pos.y][pos.x].hasShip = true;
          newBoard[pos.y][pos.x].x = pos.x;
          newBoard[pos.y][pos.x].y = pos.y;
        }
      });
    });

    // Then mark hits and misses
    logger.log('Processing hits:', hits);
    hits.forEach(hit => {
      if (newBoard[hit.y] && newBoard[hit.y][hit.x]) {
        const cell = newBoard[hit.y][hit.x];
        cell.isHit = hit.isHit;
        cell.isMiss = !hit.isHit;
        logger.log(`Setting cell at ${hit.x},${hit.y}:`, cell);
      }
    });

    logger.log('Final board state:', newBoard);
    return newBoard;
  }, [placedShips, hits]);

  // Keep track of the current board state without causing re-renders
  const boardRef = useRef<Cell[][]>(board);

  // Update boardRef when board changes
  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useImperativeHandle(ref, () => ({
    resetBoard: () => {
      const newBoard = Array(5).fill(null).map((_, y) =>
        Array(5).fill(null).map((_, x) => ({
          hasShip: false,
          isHit: false,
          isMiss: false,
          x: x,
          y: y
        }))
      );
      boardRef.current = newBoard;
      logger.log('Board reset called, new board state:', newBoard);
    }
  }));

  const canPlaceShip = useCallback((x: number, y: number, length: number, isVertical: boolean): boolean => {
    console.log("Checking if can place ship at:", x, y, "length:", length, "orientation:", isVertical ? "vertical" : "horizontal");
    
    // Check board boundaries
    if (isVertical && y + length > 5) {
      console.log("Cannot place: vertical ship would exceed bottom boundary");
      return false;
    }
    if (!isVertical && x + length > 5) {
      console.log("Cannot place: horizontal ship would exceed right boundary");
      return false;
    }

    // Get all positions for the new ship
    const newPositions = [];
    for (let i = 0; i < length; i++) {
      newPositions.push({
        x: isVertical ? x : x + i,
        y: isVertical ? y + i : y
      });
    }

    console.log("Checking positions:", newPositions);

    // Check if any of these positions are occupied
    for (const pos of newPositions) {
      // Check if this position is occupied
      if (boardRef.current[pos.y][pos.x].hasShip) {
        console.log("Cannot place: position", pos.x, pos.y, "is already occupied");
        return false;
      }
    }

    console.log("Ship can be placed");
    return true;
  }, []);
  const placeShip = (x: number, y: number, ship: ShipDragItem) => {
    console.log("Placing ship:", ship.id, "at", x, y, "orientation:", ship.isVertical ? "vertical" : "horizontal");
    
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

    console.log("Ship positions:", positions);

    // Notify parent component of the placement
    onShipPlaced?.(ship.id, positions);
  };

  const handleCellClick = (x: number, y: number) => {
    if (!isCurrentPlayer || placementPhase) return;
    
    const cell = boardRef.current[y][x];
    if (cell.isHit || cell.isMiss) {
      toast.error("You've already fired at this position!");
      return;
    }

    onCellClick?.(x, y);
  };

  const letters = ['A', 'B', 'C', 'D', 'E'];
  
  // Calculate cell size based on screen size
  const cellSizeClass = isMobile 
    ? "w-[calc(18vw-4px)] h-[calc(18vw-4px)] max-w-16 max-h-16" 
    : "w-16 h-16";
    
  // Calculate letter spacing to match cell size
  const letterSizeClass = isMobile
    ? "w-[calc(18vw-2px)] h-8 max-w-16"
    : "w-16 h-8";

  return (
    <div className="p-1 sm:p-2 w-full max-w-full overflow-hidden">
      {placementPhase ? (
        <ShipPlacement onPlaceShip={placeShip} canPlaceShip={canPlaceShip}>
          <div className="relative disable-text-selection w-full">
            <div className="flex justify-center items-center mb-1 pl-3">
              <div className="w-3"></div>
              {letters.map((letter) => (
                <div key={letter} className={`${letterSizeClass} flex items-center justify-center font-bold text-sm sm:text-base text-white tracking-widest`}>{letter}</div>
              ))}
            </div>
            <div className="flex">
              <div className="flex flex-col justify-around mr-0">
                {[1, 2, 3, 4, 5].map((num) => (
                  <div key={num} className="w-3 h-[calc(18vw-4px)] max-h-16 flex items-center justify-start font-bold text-sm sm:text-base text-white">{num}</div>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-0.5 bg-primary/5 p-1 sm:p-2 rounded-xl backdrop-blur-md shadow-lg mobile-touch-fix w-[calc(90vw-20px)] max-w-[400px]">
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
            </div>
          </div>
        </ShipPlacement>
      ) : (
        <div className="relative disable-text-selection w-full">
          <div className="flex justify-center items-center mb-1 pl-3">
            <div className="w-3"></div>
            {letters.map((letter) => (
              <div key={letter} className={`${letterSizeClass} flex items-center justify-center font-bold text-sm sm:text-base text-white tracking-widest`}>{letter}</div>
            ))}
          </div>
          <div className="flex">
            <div className="flex flex-col justify-around mr-0">
              {[1, 2, 3, 4, 5].map((num) => (
                <div key={num} className="w-3 h-[calc(18vw-4px)] max-h-16 flex items-center justify-start font-bold text-sm sm:text-base text-white">{num}</div>
              ))}
            </div>
            <div className={`grid grid-cols-5 gap-0.5 bg-primary/5 p-1 sm:p-2 rounded-xl backdrop-blur-md shadow-lg relative mobile-touch-fix w-[calc(90vw-20px)] max-w-[400px]`}>
              {isOpponentBoard && (
                <div className="absolute inset-0 rounded-xl overflow-hidden z-0">
                  <img 
                    src="/Bucharest_low_res_map (1).png" 
                    alt="Bucharest Map" 
                    className="w-full h-full object-cover opacity-40"
                  />
                </div>
              )}
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
          </div>
        </div>
      )}
    </div>
  );
});

GameBoard.displayName = "GameBoard";

export default GameBoard;
