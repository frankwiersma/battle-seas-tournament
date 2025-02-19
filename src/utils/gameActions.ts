
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
    setGameState({
      ...gameState,
      myHits: newHits,
    });

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
}
