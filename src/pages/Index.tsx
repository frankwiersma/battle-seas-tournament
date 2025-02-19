
import React, { useState, useEffect, useRef } from "react";
import GameBoard from "@/components/GameBoard";
import Ship from "@/components/Ship";
import TeamAuth from "@/components/TeamAuth";
import { toast } from "sonner";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface PlacedShip {
  id: string;
  positions: { x: number; y: number }[];
}

interface TeamPresence {
  team_id: string;
  ready: boolean;
}

const Index = () => {
  const isMobile = useIsMobile();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamLetter, setTeamLetter] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [ships, setShips] = useState([
    { id: "ship1", length: 2, isVertical: false, isPlaced: false },
    { id: "ship2", length: 2, isVertical: false, isPlaced: false },
    { id: "ship3", length: 3, isVertical: false, isPlaced: false },
  ]);
  
  const [placedShips, setPlacedShips] = useState<PlacedShip[]>([]);
  const [isPlacementPhase, setIsPlacementPhase] = useState(true);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const gameBoardRef = useRef<{ resetBoard: () => void } | null>(null);

  useEffect(() => {
    if (!teamId) return;

    const channel = supabase.channel('team_status');
    
    channel
      .on('presence', { event: 'sync' }, () => {
        checkGameStart();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [teamId]);

  const checkGameStart = async () => {
    try {
      const { data: teams, error } = await supabase
        .from('teams')
        .select('*')
        .eq('is_ready', true);

      if (error) {
        console.error('Error checking team status:', error);
        return;
      }

      if (teams && teams.length >= 2) {
        setGameStarted(true);
        setIsPlacementPhase(false);
        toast.success("Both teams are ready! The battle begins!");
      }
    } catch (error) {
      console.error('Error checking game start:', error);
    }
  };

  const handleReadyClick = async () => {
    if (placedShips.length !== ships.length) {
      toast.error("Place all your ships before declaring ready!");
      return;
    }

    try {
      if (!teamId) throw new Error("No team ID found");

      // First subscribe to the channel
      const channel = supabase.channel('team_status');
      await channel.subscribe();

      // Then update the team status
      const { error: updateError } = await supabase
        .from('teams')
        .update({ is_ready: true })
        .eq('id', teamId);

      if (updateError) throw updateError;

      setIsReady(true);
      toast.success("You're ready for battle! Waiting for other team...");

      // Finally track the presence
      const presence: TeamPresence = { team_id: teamId, ready: true };
      await channel.track(presence);
    } catch (error: any) {
      console.error('Error updating team status:', error);
      toast.error(error.message || "Failed to update ready status. Please try again.");
    }
  };

  const handleResetShips = () => {
    if (isReady) {
      toast.error("Cannot reset ships after declaring ready!");
      return;
    }

    // Reset ships state
    setShips(ships.map(ship => ({ ...ship, isPlaced: false, isVertical: false })));
    setPlacedShips([]);
    
    // Reset the game board
    if (gameBoardRef.current) {
      gameBoardRef.current.resetBoard();
    }
    
    toast.info("Ships reset! Place them again.");
  };

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
    if (isReady) return;
    setShips(ships.map(ship => 
      ship.id === shipId 
        ? { ...ship, isVertical: !ship.isVertical }
        : ship
    ));
  };

  const handleShipPlaced = (shipId: string, positions: { x: number; y: number }[]) => {
    if (isReady) return;

    // Find the ship that was placed
    const placedShip = ships.find(ship => ship.id === shipId);
    if (!placedShip) return;

    // Update ships state
    setShips(prevShips => 
      prevShips.map(ship => 
        ship.id === shipId 
          ? { ...ship, isPlaced: true }
          : ship
      )
    );

    // Update placed ships
    setPlacedShips(prev => {
      // Remove any existing placement for this ship
      const filtered = prev.filter(ship => ship.id !== shipId);
      return [...filtered, { id: shipId, positions }];
    });

    const updatedPlacedCount = placedShips.length + 1;
    if (updatedPlacedCount === ships.length) {
      toast.success("All ships placed! Click 'Ready for Battle' when you're ready!");
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
                <div className="flex gap-4">
                  <Button 
                    onClick={handleReadyClick}
                    disabled={placedShips.length !== ships.length || isReady}
                    className="w-full"
                  >
                    {isReady ? "Waiting for other team..." : "Ready for Battle"}
                  </Button>
                  <Button 
                    onClick={handleResetShips}
                    variant="outline"
                    disabled={isReady}
                    className="w-full"
                  >
                    Reset Ships
                  </Button>
                </div>
              </div>
            )}

            <div className="animate-fade-in" style={{ animationDelay: "200ms" }}>
              <h2 className="text-2xl font-semibold text-white mb-4">
                {isPlacementPhase ? "Battle Grid" : "Enemy Waters"}
              </h2>
              <GameBoard
                ref={gameBoardRef}
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
