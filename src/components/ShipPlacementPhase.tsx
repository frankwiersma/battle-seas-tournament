import React, { useRef, Dispatch, SetStateAction, useEffect } from "react";
import Ship from "@/components/Ship";
import GameBoard from "@/components/GameBoard";
import { Button } from "@/components/ui/button";
import type { PlacedShip } from "@/types/game";

// Define ship type to fix TypeScript errors
type ShipType = {
  id: string;
  length: number;
  isVertical: boolean;
  isPlaced: boolean;
};

interface ShipPlacementPhaseProps {
  ships: ShipType[];
  setShips: React.Dispatch<React.SetStateAction<ShipType[]>>;
  placedShips: PlacedShip[];
  setPlacedShips: React.Dispatch<React.SetStateAction<PlacedShip[]>>;
  isReady: boolean;
  onReadyClick: () => Promise<void>;
  onResetShips: () => void;
  onRotateShip: (shipId: string) => void;
  onUnreadyClick?: () => Promise<void>;
}

const ShipPlacementPhase: React.FC<ShipPlacementPhaseProps> = ({
  ships,
  placedShips,
  isReady,
  setShips,
  setPlacedShips,
  onRotateShip,
  onReadyClick,
  onResetShips,
  onUnreadyClick,
}) => {
  const gameBoardRef = useRef<{ resetBoard: () => void }>(null);

  const handleShipPlaced = (shipId: string, positions: { x: number; y: number }[]) => {
    // Update placedShips - keep all other ships and add/update this one
    setPlacedShips(prevPlacedShips => {
      const otherShips = prevPlacedShips.filter(ship => ship.id !== shipId);
      return [...otherShips, { id: shipId, positions }];
    });
    
    // Update ships array to mark this ship as placed
    setShips(prevShips => 
      prevShips.map(ship =>
        ship.id === shipId 
          ? { ...ship, isPlaced: true }
          : ship
      )
    );
  };

  // Add this to debug state
  useEffect(() => {
    console.log('Ships:', ships);
    console.log('Placed Ships:', placedShips);
  }, [ships, placedShips]);

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-2xl font-semibold text-white mb-4">Your Fleet</h2>
      <div className="flex flex-wrap gap-4 p-4 bg-white/10 rounded-xl backdrop-blur-sm">
        {ships.filter(ship => !ship.isPlaced).map((ship) => (
          <Ship
            key={ship.id}
            id={ship.id}
            length={ship.length}
            isVertical={ship.isVertical}
            isPlaced={ship.isPlaced}
            onRotate={() => onRotateShip(ship.id)}
          />
        ))}
      </div>
      <GameBoard
        ref={gameBoardRef}
        placementPhase={true}
        onShipPlaced={handleShipPlaced}
        placedShips={placedShips}
        showShips={true}
      />
      <div className="flex gap-4">
        {isReady ? (
          <>
            <Button 
              disabled={true}
              className="w-full opacity-50"
            >
              Waiting for other team...
            </Button>
            {onUnreadyClick && (
              <Button 
                onClick={onUnreadyClick}
                variant="destructive"
                className="w-full"
              >
                Retract Ready Status
              </Button>
            )}
          </>
        ) : (
          <>
            <Button 
              onClick={onReadyClick}
              disabled={placedShips.length !== ships.length}
              className="w-full"
            >
              Ready for Battle
            </Button>
            <Button 
              onClick={() => {
                onResetShips();
                gameBoardRef.current?.resetBoard();
              }}
              variant="outline"
              className="w-full"
            >
              Reset Ships
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default ShipPlacementPhase;
