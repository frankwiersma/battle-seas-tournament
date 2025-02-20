import React from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import { useIsMobile } from "@/hooks/use-mobile";
import TeamAuth from "@/components/TeamAuth";
import ShipPlacementPhase from "@/components/ShipPlacementPhase";
import BattlePhase from "@/components/BattlePhase";
import { useGameState } from "@/hooks/useGameState";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
    setPlacedShips,
    gameState,
    setGameState,
    setIsReady,
    checkGameStart,
    handleCellClick,
    resetShips,
    setIsPlacementPhase,
    setGameStarted,
    scores,
    gameWon,
  } = useGameState(teamId);

  // Add debug logging
  React.useEffect(() => {
    console.log('Game State Updated:', {
      gameStarted,
      isPlacementPhase,
      scores,
      gameWon
    });
  }, [gameStarted, isPlacementPhase, scores, gameWon]);

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
    resetShips();
  };

  const handleResetGame = async () => {
    if (!teamId) return;
    
    try {
      // Get the current active game participant
      const { data: participants, error: participantError } = await supabase
        .from('game_participants')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (participantError) {
        console.error('Error fetching participant:', participantError);
        toast.error("Failed to reset game!");
        return;
      }

      // Unsubscribe from game updates temporarily
      await supabase.channel('game-updates').unsubscribe();

      // Reset local state first
      setIsReady(false);
      resetShips();
      setGameState({
        myShips: [],
        myHits: [],
        enemyHits: [],
      });
      setIsPlacementPhase(true);
      setGameStarted(false);

      // If there's no active game, we're done
      if (!participants?.game_id) {
        toast.success("Game state reset!");
        return;
      }

      // Perform database updates in parallel
      const [teamUpdate, participantUpdate, gameUpdate] = await Promise.all([
        // Reset team ready status
        supabase
          .from('teams')
          .update({ is_ready: false })
          .eq('id', teamId),

        // Reset game participant
        supabase
          .from('game_participants')
          .update({ 
            board_state: { ships: [], hits: [] },
            game_id: null  // Also clear the game_id reference
          })
          .eq('team_id', teamId)
          .eq('id', participants.id),

        // Update game status
        supabase
          .from('games')
          .update({ 
            status: 'completed',
            winner_team_id: null,
            current_team_id: null
          })
          .eq('id', participants.game_id)
      ]);

      // Check for any errors in the updates
      if (teamUpdate.error || participantUpdate.error || gameUpdate.error) {
        console.error('Error in updates:', { teamUpdate, participantUpdate, gameUpdate });
        toast.error("Failed to reset some game data!");
        return;
      }

      // Small delay to ensure all updates are processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      toast.success("Game reset successfully!");

      // Resubscribe to game updates
      supabase
        .channel('game-updates')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'game_participants',
          },
          () => loadInitialState()
        )
        .subscribe();

    } catch (error) {
      console.error('Error resetting game:', error);
      toast.error("Failed to reset game!");
    }
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
        <div className="max-w-[1800px] mx-auto">
          <header className="text-center mb-8 animate-fade-in">
            <h1 className="text-4xl font-bold text-white mb-2">Sea Battle Tournament</h1>
            <div className="text-white/80 space-y-2">
              <p className="text-xl font-semibold">You are Team {teamLetter}</p>
              <p>Playing against: Team {
                teamLetter === 'A' ? 'B' : 
                teamLetter === 'B' ? 'A' : 
                teamLetter === 'C' ? 'D' : 'C'
              }</p>
              <p className="text-sm">
                {isPlacementPhase 
                  ? "Place your ships and prepare for battle!" 
                  : gameStarted 
                    ? "Battle Phase - Fire at will!" 
                    : "Waiting for other team..."}
              </p>
            </div>
            <button
              onClick={handleResetGame}
              className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              Reset Game
            </button>
          </header>

          {isPlacementPhase ? (
            <div className="flex justify-center">
              <ShipPlacementPhase
                ships={ships}
                setShips={setShips}
                placedShips={placedShips}
                setPlacedShips={setPlacedShips}
                isReady={isReady}
                onReadyClick={handleReadyClick}
                onResetShips={handleResetShips}
                onRotateShip={handleRotateShip}
              />
            </div>
          ) : (
            <div className="flex justify-center w-full">
              <BattlePhase
                myShips={placedShips}
                myHits={gameState.myHits}
                enemyHits={gameState.enemyHits}
                onCellClick={handleCellClick}
                scores={scores}
                gameWon={gameWon}
              />
            </div>
          )}
        </div>
      </div>
    </DndProvider>
  );
};

export default Index;
