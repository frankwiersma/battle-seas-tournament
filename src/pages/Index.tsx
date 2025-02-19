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

interface Position {
  x: number;
  y: number;
}

interface PlacedShip {
  id: string;
  positions: Position[];
}

interface TeamPresence {
  team_id: string;
  ready: boolean;
}

interface BoardState {
  ships: Array<{
    id: string;
    positions: Array<{ x: number; y: number }>;
  }>;
  hits: Array<{ x: number; y: number; isHit: boolean }>;
}

interface GameState {
  myShips: PlacedShip[];
  myHits: { x: number; y: number; isHit: boolean }[];
  enemyHits: { x: number; y: number; isHit: boolean }[];
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

  const [gameState, setGameState] = useState<GameState>({
    myShips: [],
    myHits: [],
    enemyHits: [],
  });

  useEffect(() => {
    if (!teamId) return;

    const channel = supabase.channel('game_updates');
    
    channel
      .on('presence', { event: 'sync' }, () => {
        checkGameStart();
      })
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_participants',
        },
        (payload: any) => {
          if (payload.new.team_id !== teamId) {
            const boardState = payload.new.board_state;
            if (boardState && boardState.hits) {
              setGameState(prev => ({
                ...prev,
                enemyHits: boardState.hits,
              }));
            }
          }
        }
      )
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
        const initialBoardState: BoardState = {
          ships: placedShips.map(ship => ({
            id: ship.id,
            positions: ship.positions.map(pos => ({ x: pos.x, y: pos.y }))
          })),
          hits: []
        };

        const { error: participantError } = await supabase
          .from('game_participants')
          .insert({
            team_id: teamId,
            board_state: initialBoardState
          });

        if (participantError) {
          console.error('Error saving board state:', participantError);
          return;
        }

        setGameStarted(true);
        setIsPlacementPhase(false);
        setGameState(prev => ({
          ...prev,
          myShips: placedShips,
        }));
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

      const channel = supabase.channel('team_status');
      await channel.subscribe();

      const { error: updateError } = await supabase
        .from('teams')
        .update({ is_ready: true })
        .eq('id', teamId);

      if (updateError) throw updateError;

      setIsReady(true);
      toast.success("You're ready for battle! Waiting for other team...");

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

    setShips(ships.map(ship => ({ ...ship, isPlaced: false, isVertical: false })));
    setPlacedShips([]);
    
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

    const placedShip = ships.find(ship => ship.id === shipId);
    if (!placedShip) return;

    setShips(prevShips => 
      prevShips.map(ship => 
        ship.id === shipId 
          ? { ...ship, isPlaced: true }
          : ship
      )
    );

    setPlacedShips(prev => {
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

  const handleCellClick = async (x: number, y: number) => {
    if (isPlacementPhase) return;
    
    try {
      const { data: participants, error: fetchError } = await supabase
        .from('game_participants')
        .select('*')
        .neq('team_id', teamId);

      if (fetchError || !participants || participants.length === 0) {
        toast.error("Couldn't find opponent's board!");
        return;
      }

      const opponentState = participants[0].board_state as BoardState;
      const isHit = opponentState.ships.some(ship =>
        ship.positions.some(pos => pos.x === x && pos.y === y)
      );

      const newHits = [...gameState.myHits, { x, y, isHit }];
      setGameState(prev => ({
        ...prev,
        myHits: newHits,
      }));

      const updatedBoardState: BoardState = {
        ships: gameState.myShips.map(ship => ({
          id: ship.id,
          positions: ship.positions.map(pos => ({ x: pos.x, y: pos.y }))
        })),
        hits: newHits
      };

      const { error: updateError } = await supabase
        .from('game_participants')
        .update({
          board_state: updatedBoardState
        })
        .eq('team_id', teamId);

      if (updateError) {
        toast.error("Failed to update game state!");
        return;
      }

      toast.success(isHit ? "Direct hit!" : "Miss!");
    } catch (error) {
      console.error('Error updating game state:', error);
      toast.error("Failed to process move!");
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
        <div className="max-w-4xl mx-auto">
          <header className="text-center mb-8 animate-fade-in">
            <h1 className="text-4xl font-bold text-white mb-2">Sea Battle Tournament</h1>
            <p className="text-white/80">Team {teamLetter}</p>
            <p className="text-white/80">
              {isPlacementPhase 
                ? "Place your ships and prepare for battle!" 
                : "Battle Phase - Fire at will!"}
            </p>
          </header>

          <div className="grid md:grid-cols-2 gap-8">
            {isPlacementPhase ? (
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
            ) : (
              <>
                <div className="space-y-4 animate-fade-in">
                  <h2 className="text-2xl font-semibold text-white mb-4">Your Fleet</h2>
                  <GameBoard
                    isCurrentPlayer={false}
                    placementPhase={false}
                    placedShips={gameState.myShips}
                    hits={gameState.enemyHits}
                    showShips={true}
                  />
                </div>
                <div className="space-y-4 animate-fade-in">
                  <h2 className="text-2xl font-semibold text-white mb-4">Enemy Waters</h2>
                  <GameBoard
                    isCurrentPlayer={true}
                    placementPhase={false}
                    hits={gameState.myHits}
                    onCellClick={handleCellClick}
                    showShips={false}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </DndProvider>
  );
};

export default Index;
