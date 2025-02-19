
import React, { useState } from "react";
import GameBoard from "@/components/GameBoard";
import Ship from "@/components/Ship";
import { toast } from "sonner";

interface PlacedShip {
  id: string;
  positions: { x: number; y: number }[];
}

const Index = () => {
  const [ships, setShips] = useState([
    { id: "ship1", length: 3, isVertical: false, isPlaced: false },
    { id: "ship2", length: 2, isVertical: false, isPlaced: false },
    { id: "ship3", length: 2, isVertical: false, isPlaced: false },
    { id: "ship4", length: 1, isVertical: false, isPlaced: false },
  ]);
  
  const [placedShips, setPlacedShips] = useState<PlacedShip[]>([]);
  const [isPlacementPhase, setIsPlacementPhase] = useState(true);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);

  const handleRotateShip = (shipId: string) => {
    setShips(ships.map(ship => 
      ship.id === shipId 
        ? { ...ship, isVertical: !ship.isVertical }
        : ship
    ));
  };

  const handleShipPlaced = (shipId: string, positions: { x: number; y: number }[]) => {
    setShips(ships.map(ship => 
      ship.id === shipId 
        ? { ...ship, isPlaced: true }
        : ship
    ));
    setPlacedShips([...placedShips, { id: shipId, positions }]);

    if (placedShips.length + 1 === ships.length) {
      toast.success("All ships placed! Ready for battle!");
      setIsPlacementPhase(false);
    }
  };

  const handleCellClick = (x: number, y: number) => {
    if (!isPlayerTurn || isPlacementPhase) return;
    
    setIsPlayerTurn(false);
    // Simulate opponent's turn
    setTimeout(() => {
      setIsPlayerTurn(true);
      toast.info("Your turn!");
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary to-secondary p-4">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8 animate-fade-in">
          <h1 className="text-4xl font-bold text-white mb-2">Sea Battle Tournament</h1>
          <p className="text-white/80">
            {isPlacementPhase 
              ? "Place your ships and prepare for battle!" 
              : isPlayerTurn 
                ? "Your turn - Choose a target!" 
                : "Opponent's turn - Stand by..."}
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          {isPlacementPhase && (
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
                    onRotate={() => handleRotateShip(ship.id)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="animate-fade-in" style={{ animationDelay: "200ms" }}>
            <h2 className="text-2xl font-semibold text-white mb-4">
              {isPlacementPhase ? "Battle Grid" : "Enemy Waters"}
            </h2>
            <GameBoard
              isCurrentPlayer={isPlayerTurn}
              onShipPlaced={handleShipPlaced}
              onCellClick={handleCellClick}
              placementPhase={isPlacementPhase}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
