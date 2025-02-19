
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import type { GameState, PlacedShip } from "@/types/game";

export function useGamePhase(teamId: string | null, placedShips: PlacedShip[]) {
  const [gameStarted, setGameStarted] = useState(false);
  const [isPlacementPhase, setIsPlacementPhase] = useState(true);
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
          .upsert({
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

  return {
    gameStarted,
    isPlacementPhase,
    gameState,
    setGameState,
    checkGameStart,
  };
}
