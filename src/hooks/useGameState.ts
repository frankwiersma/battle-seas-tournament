
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import type { GameState, PlacedShip, BoardState } from "@/types/game";

export function useGameState(teamId: string | null) {
  const [gameStarted, setGameStarted] = useState(false);
  const [isPlacementPhase, setIsPlacementPhase] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [ships, setShips] = useState([
    { id: "ship1", length: 2, isVertical: false, isPlaced: false },
    { id: "ship2", length: 2, isVertical: false, isPlaced: false },
    { id: "ship3", length: 3, isVertical: false, isPlaced: false },
  ]);
  const [placedShips, setPlacedShips] = useState<PlacedShip[]>([]);
  const [gameState, setGameState] = useState<GameState>({
    myShips: [],
    myHits: [],
    enemyHits: [],
  });

  useEffect(() => {
    if (!teamId || !gameStarted) return;

    const channel = supabase.channel('game_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_participants',
          filter: `team_id=neq.${teamId}`,
        },
        (payload) => {
          const boardState = payload.new.board_state as unknown as BoardState;
          if (boardState && boardState.hits) {
            setGameState(prev => ({
              ...prev,
              enemyHits: boardState.hits
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, gameStarted]);

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
        const initialBoardState = {
          ships: placedShips.map(ship => ({
            id: ship.id,
            positions: ship.positions.map(pos => ({ x: pos.x, y: pos.y }))
          })),
          hits: []
        } as Json;

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

      const opponentState = participants[0].board_state as unknown as BoardState;
      const isHit = opponentState.ships.some(ship =>
        ship.positions.some(pos => pos.x === x && pos.y === y)
      );

      const newHits = [...gameState.myHits, { x, y, isHit }];
      setGameState(prev => ({
        ...prev,
        myHits: newHits,
      }));

      const updatedBoardState = {
        ships: gameState.myShips.map(ship => ({
          id: ship.id,
          positions: ship.positions.map(pos => ({ x: pos.x, y: pos.y }))
        })),
        hits: newHits
      } as Json;

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

  return {
    gameStarted,
    isPlacementPhase,
    isReady,
    ships,
    setShips,
    placedShips,
    setPlacedShips,
    gameState,
    setIsReady,
    checkGameStart,
    handleCellClick,
  };
}
