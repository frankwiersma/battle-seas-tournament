import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import type { GameState, PlacedShip, BoardState } from "@/types/game";

export function useGamePhase(teamId: string | null, placedShips: PlacedShip[]) {
  const [gameStarted, setGameStarted] = useState(false);
  const [isPlacementPhase, setIsPlacementPhase] = useState(true);
  const [gameState, setGameState] = useState<GameState>({
    myShips: [],
    myHits: [],
    enemyHits: [],
  });

  useEffect(() => {
    if (!teamId) return;

    // Subscribe to team ready status changes
    const teamChannel = supabase.channel('team_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'teams',
        },
        async () => {
          // Check if both teams are ready
          const { data: teams } = await supabase
            .from('teams')
            .select('*')
            .eq('is_ready', true);

          if (teams && teams.length >= 2) {
            // Find matching team (A vs B, C vs D, etc.)
            const currentTeam = teams.find(t => t.id === teamId);
            const opponentTeam = teams.find(t => {
              const currentLetter = currentTeam?.team_letter.toUpperCase();
              const opponentLetter = t.team_letter.toUpperCase();
              return (currentLetter === 'A' && opponentLetter === 'B') ||
                     (currentLetter === 'B' && opponentLetter === 'A') ||
                     (currentLetter === 'C' && opponentLetter === 'D') ||
                     (currentLetter === 'D' && opponentLetter === 'C');
            });

            if (currentTeam && opponentTeam) {
              // Look for any existing game between these teams
              const { data: existingGame } = await supabase
                .from('games')
                .select('*')
                .or(`current_team_id.eq.${currentTeam.id},current_team_id.eq.${opponentTeam.id}`)
                .eq('status', 'in_progress')
                .single();

              let gameId = existingGame?.id;

              if (!existingGame) {
                // Create new game if none exists
                const { data: newGame, error: gameError } = await supabase
                  .from('games')
                  .insert({
                    status: 'in_progress',
                    current_team_id: currentTeam.id,
                    winner_team_id: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  })
                  .select()
                  .single();

                if (gameError) {
                  console.error('Error creating game:', gameError);
                  return;
                }

                gameId = newGame.id;
              }

              // Update both participants with game_id
              const { error: participantError } = await supabase
                .from('game_participants')
                .upsert([
                  {
                    team_id: currentTeam.id,
                    game_id: gameId,
                    board_state: currentTeam.id === teamId ? 
                      { ships: placedShips, hits: [] } : 
                      { ships: [], hits: [] }
                  },
                  {
                    team_id: opponentTeam.id,
                    game_id: gameId,
                    board_state: opponentTeam.id === teamId ? 
                      { ships: placedShips, hits: [] } : 
                      { ships: [], hits: [] }
                  }
                ]);

              if (participantError) {
                console.error('Error updating game participants:', participantError);
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
          }
        }
      )
      .subscribe();

    // Subscribe to opponent's moves and game status
    const gameChannel = supabase.channel('game_updates')
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
      supabase.removeChannel(teamChannel);
      supabase.removeChannel(gameChannel);
    };
  }, [teamId, placedShips]);

  const checkGameStart = async () => {
    try {
      // Update team ready status
      const { error: updateError } = await supabase
        .from('teams')
        .update({ is_ready: true })
        .eq('id', teamId);

      if (updateError) {
        console.error('Error updating team ready status:', updateError);
        return;
      }

      // Save initial board state
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
    setIsPlacementPhase,
    setGameStarted,
  };
}
