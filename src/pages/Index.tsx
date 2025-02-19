
import React from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import { useIsMobile } from "@/hooks/use-mobile";
import TeamAuth from "@/components/TeamAuth";
import ShipPlacementPhase from "@/components/ShipPlacementPhase";
import BattlePhase from "@/components/BattlePhase";
import { useGameState } from "@/hooks/useGameState";
import { toast } from "sonner"; // Add toast import

const Index = () => {
  const isMobile = useIsMobile();
  const [teamId, setTeamId] = React.useState<string | null>(null);
  const [teamLetter, setTeamLetter] = React.useState<string | null>(null);
  
  const {
    gameStarted,
    isPlacementPhase,
    isReady,
    ships,
    setShips,
    placedShips,
    setPlacedShips, // Add setPlacedShips to destructured values
    gameState,
    setIsReady,
    checkGameStart,
    handleCellClick,
  } = useGameState(teamId);

  const handleTeamJoin = (id: string, letter: string) => {
    setTeamId(id);
    setTeamLetter(letter);
    localStorage.setItem('teamId', id);
    localStorage.setItem('teamLetter', letter);
  };

  React.useEffect(() => {
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

  const handleReadyClick = async () => {
    if (placedShips.length !== ships.length) {
      toast.error("Place all your ships before declaring ready!");
      return;
    }

    setIsReady(true);
    await checkGameStart();
  };

  const handleResetShips = () => {
    if (isReady) {
      toast.error("Cannot reset ships after declaring ready!");
      return;
    }

    setShips(ships.map(ship => ({ ...ship, isPlaced: false, isVertical: false })));
    setPlacedShips([]);
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
                : gameStarted 
                  ? "Battle Phase - Fire at will!" 
                  : "Waiting for other team..."}
            </p>
          </header>

          <div className="grid md:grid-cols-2 gap-8">
            {isPlacementPhase ? (
              <ShipPlacementPhase
                ships={ships}
                placedShips={placedShips}
                isReady={isReady}
                onRotateShip={handleRotateShip}
                onReadyClick={handleReadyClick}
                onResetShips={handleResetShips}
              />
            ) : (
              <BattlePhase
                myShips={gameState.myShips}
                myHits={gameState.myHits}
                enemyHits={gameState.enemyHits}
                onCellClick={handleCellClick}
              />
            )}
          </div>
        </div>
      </div>
    </DndProvider>
  );
};

export default Index;
