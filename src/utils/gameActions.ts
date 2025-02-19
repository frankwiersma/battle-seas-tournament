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

    // Update local state
    const newHits = [...gameState.myHits, { x, y, isHit }];
    setGameState({
      ...gameState,
      myHits: newHits,
    });

    // Update database
    const { error: updateError } = await supabase
      .from('game_participants')
      .update({
        board_state: {
          ...opponentState,
          hits: newHits
        }
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
}
