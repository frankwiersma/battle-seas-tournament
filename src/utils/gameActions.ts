import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import type { GameState, BoardState } from "@/types/game";

export async function handleCellClick(
  x: number,
  y: number,
  teamId: string,
  gameState: GameState,
  setGameState: (state: GameState) => void
) {
  try {
    // Check if this cell was already hit
    if (gameState.myHits.some(hit => hit.x === x && hit.y === y)) {
      toast.error("You've already fired at this position!");
      return;
    }

    // Get opponent's board
    const { data: participants, error: fetchError } = await supabase
      .from('game_participants')
      .select('*')
      .neq('team_id', teamId)
      .single();

    if (fetchError || !participants) {
      toast.error("Couldn't find opponent's board!");
      return;
    }

    const opponentState = participants.board_state as unknown as BoardState;
    
    // Check if hit
    const isHit = opponentState.ships.some(ship =>
      ship.positions.some(pos => pos.x === x && pos.y === y)
    );

    // Create new hits array with the new hit
    const newHits = [...gameState.myHits, { x, y, isHit }];

    // Calculate sunk ships after the new hit
    const sunkShips = opponentState.ships.filter(ship => 
      ship.positions.every(pos => 
        newHits.some(hit => hit.x === pos.x && hit.y === pos.y && hit.isHit)
      )
    ).length;

    // Update local game state with new hit
    setGameState({
      ...gameState,
      myHits: newHits,
    });

    // Update opponent's board state in database with our hits
    const { error: updateError } = await supabase
      .from('game_participants')
      .update({
        board_state: {
          ...opponentState,
          hits: newHits  // Store our hits on their board
        }
      })
      .eq('team_id', participants.team_id);  // Update opponent's board

    if (updateError) {
      toast.error("Failed to update game state!");
      return;
    }

    // Show appropriate toast message
    if (isHit) {
      toast.success("Direct hit!");
    } else {
      toast.error("Miss!");
    }

    // If all ships are sunk (3 ships in total), update game status
    if (sunkShips === 3) {
      await supabase
        .from('games')
        .update({ 
          status: 'completed',
          winner_team_id: teamId 
        })
        .eq('id', participants.game_id);
    }
  } catch (error) {
    console.error('Error updating game state:', error);
    toast.error("Failed to process move!");
  }
}
