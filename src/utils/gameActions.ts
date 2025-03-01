import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import type { GameState, BoardState } from "@/types/game";
import { calculateSunkShips } from "./gameCalculations";

// Track pending updates to prevent race conditions
const pendingUpdates: Record<string, boolean> = {};

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
    
    // Check if there's already a pending update for this cell
    const cellKey = `${x}-${y}`;
    if (pendingUpdates[cellKey]) {
      console.log(`Update for cell ${cellKey} already in progress, ignoring duplicate request`);
      return;
    }
    
    // Mark this update as in progress
    pendingUpdates[cellKey] = true;

    // First get our game participant to find the game_id
    const { data: myParticipants, error: myError } = await supabase
      .from('game_participants')
      .select('game_id')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (myError || !myParticipants || myParticipants.length === 0) {
      console.error('Error fetching my participant:', myError);
      toast.error("Couldn't find your game!");
      pendingUpdates[cellKey] = false;
      return;
    }

    const gameId = myParticipants[0].game_id;

    // Get opponent's board
    const { data: opponents, error: fetchError } = await supabase
      .from('game_participants')
      .select('*')
      .eq('game_id', gameId)
      .neq('team_id', teamId);

    if (fetchError || !opponents || opponents.length === 0) {
      console.error('Error fetching opponent:', fetchError);
      toast.error("Couldn't find opponent's board!");
      pendingUpdates[cellKey] = false;
      return;
    }

    const opponent = opponents[0];
    const opponentState = opponent.board_state as unknown as BoardState;
    
    // Check if hit
    const isHit = opponentState.ships.some(ship =>
      ship.positions.some(pos => pos.x === x && pos.y === y)
    );

    // Create new hits array with the new hit
    const newHits = [...gameState.myHits, { x, y, isHit }];

    // Optimistic update - update local state immediately
    setGameState({
      ...gameState,
      myHits: newHits,
    });

    // Show appropriate toast message optimistically
    if (isHit) {
      toast.success("Direct hit!");
    } else {
      toast.info("Miss!");
    }

    // Calculate sunk ships after the new hit
    const sunkShips = calculateSunkShips(opponentState.ships, newHits);

    // Use a transaction to ensure atomicity when updating the database
    try {
      // Update opponent's board state in database with our hits
      const { error: updateError } = await supabase
        .from('game_participants')
        .update({
          board_state: {
            ...opponentState,
            hits: newHits  // Store our hits on their board
          },
          updated_at: new Date().toISOString() // Add timestamp to prevent concurrent updates
        })
        .eq('id', opponent.id)
        .single(); // Ensure only one record is updated

      if (updateError) {
        console.error('Error updating opponent board:', updateError);
        toast.error("Failed to update game state! Please try again.");
        
        // If the update fails, revert the optimistic update
        setGameState({
          ...gameState
        });
        
        pendingUpdates[cellKey] = false;
        return;
      }

      // If all ships are sunk (3 ships in total), update game status
      if (sunkShips === 3) {
        const { error: gameUpdateError } = await supabase
          .from('games')
          .update({ 
            status: 'completed',
            winner_team_id: teamId,
            updated_at: new Date().toISOString()
          })
          .eq('id', gameId);

        if (gameUpdateError) {
          console.error('Error updating game status:', gameUpdateError);
        } else {
          toast.success("You sunk all enemy ships! You win!");
        }
      }
    } catch (error) {
      console.error('Error in transaction:', error);
      toast.error("Failed to process move! Please try again.");
      
      // If there's an error, revert the optimistic update
      setGameState({
        ...gameState
      });
    } finally {
      // Always clear the pending state
      pendingUpdates[cellKey] = false;
    }
  } catch (error) {
    console.error('Error updating game state:', error);
    toast.error("Failed to process move!");
    
    // Ensure we clear any pending updates even if there's an error
    pendingUpdates[`${x}-${y}`] = false;
  }
}
