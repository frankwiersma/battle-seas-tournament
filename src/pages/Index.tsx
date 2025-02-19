
import React, { useState, useEffect } from "react";
import GameBoard from "@/components/GameBoard";
import Ship from "@/components/Ship";
import TeamAuth from "@/components/TeamAuth";
import { toast } from "sonner";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";

interface PlacedShip {
  id: string;
  positions: { x: number; y: number }[];
}

const Index = () => {
  const isMobile = useIsMobile();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamLetter, setTeamLetter] = useState<string | null>(null);
  const [ships, setShips] = useState([
    { id: "ship1", length: 3, isVertical: false, isPlaced: false }, // Battleship
    { id: "ship2", length: 3, isVertical: false, isPlaced: false }, // Cruiser
    { id: "ship3", length: 2, isVertical: false, isPlaced: false }, // Destroyer
  ]);
  
  const [placedShips, setPlacedShips] = useState<PlacedShip[]>([]);
  const [isPlacementPhase, setIsPlacementPhase] = useState(true);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);

  const handleTeamJoin = (id: string, letter: string) => {
    setTeamId(id);
    setTeamLetter(letter);
    localStorage.setItem('teamId', id);
    localStorage.setItem('teamLetter', letter);
  };

  useEffect(() => {
    // Check for existing team in localStorage
    const savedTeamId = localStorage.getItem('teamId');
    const savedTeamLetter = localStorage.getItem('teamLetter');
    if (savedTeamId && savedTeamLetter) {
      handleTeamJoin(savedTeamId, savedTeamLetter);
    }
  }, []);

  const handleRotateShip = (shipId: string) => {
    setShips(ships.map(ship => 
      ship.id === shipId 
        ? { ...ship, isVertical: !ship.isVertical }
        : ship
    ));
  };

  const handleShipPlaced = (shipId: string, positions: { x: number; y: number }[]) => {
    // Update the ships state to mark the ship as placed
    setShips(ships.map(ship => 
      ship.id === shipId 
        ? { ...ship, isPlaced: true }
        : ship
    ));

    // Add the placed ship to placedShips array
    setPlacedShips(prev => [...prev, { id: shipId, positions }]);

    // Check if all ships are placed
    const updatedPlacedCount = placedShips.length + 1;
    if (updatedPlacedCount === ships.length) {
      toast.success("All ships placed! Ready for battle!");
      setIsPlacementPhase(false);
    } else {
      toast.success("Ship placed successfully!");
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

  if (!teamId || !teamLetter) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary to-secondary p-4 flex items-center justify-center">
        <TeamAuth onTeamJoin={handleTeamJoin} />
      </div>
    );
  }

  return (
    <DndProvider backend={isMobile ? TouchBackend : HTML5Backend}>
      <div className="min-h-screen bg-gradient-to-b from-primary to-secondary p-4">
        <div className="max-w-4xl mx-auto">
          <header className="text-center mb-8 animate-fade-in">
            <h1 className="text-4xl font-bold text-white mb-2">Sea Battle Tournament</h1>
            <p className="text-white/80">Team {teamLetter}</p>
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
                placedShips={placedShips}
              />
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
};

export default Index;
