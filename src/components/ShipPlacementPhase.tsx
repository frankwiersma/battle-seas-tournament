
import React, { useRef } from "react";
import Ship from "@/components/Ship";
import GameBoard from "@/components/GameBoard";
import { Button } from "@/components/ui/button";
import type { PlacedShip } from "@/types/game";

interface ShipPlacementPhaseProps {
  ships: Array<{ id: string; length: number; isVertical: boolean; isPlaced: boolean }>;
  placedShips: PlacedShip[];
  isReady: boolean;
  onRotateShip: (shipId: string) => void;
  onReadyClick: () => void;
  onResetShips: () => void;
}

const ShipPlacementPhase: React.FC<ShipPlacementPhaseProps> = ({
  ships,
  placedShips,
  isReady,
  onRotateShip,
  onReadyClick,
  onResetShips,
}) => {
  const gameBoardRef = useRef<{ resetBoard: () => void }>(null);

  const handleShipPlaced = (shipId: string, positions: { x: number; y: number }[]) => {
    const updatedShips = ships.map(ship =>
      ship.id === shipId ? { ...ship, isPlaced: true } : ship
    );
    setShips(updatedShips);
    setPlacedShips([...placedShips, { id: shipId, positions }]);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-2xl font-semibold text-white mb-4">Your Fleet</h2>
      <div className="flex flex-wrap gap-4 p-4 bg-white/10 rounded-xl backdrop-blur-sm">
        {ships.map((ship) => (
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
        <Button 
          onClick={onReadyClick}
          disabled={placedShips.length !== ships.length || isReady}
          className="w-full"
        >
          {isReady ? "Waiting for other team..." : "Ready for Battle"}
        </Button>
        <Button 
          onClick={() => {
            onResetShips();
            gameBoardRef.current?.resetBoard();
          }}
          variant="outline"
          disabled={isReady}
          className="w-full"
        >
          Reset Ships
        </Button>
      </div>
    </div>
  );
};

export default ShipPlacementPhase;
