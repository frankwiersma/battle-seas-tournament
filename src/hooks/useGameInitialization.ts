import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PlacedShip, BoardState } from "@/types/game";

/**
 * Hook for handling game initialization and ship placement
 */
export function useGameInitialization(
  teamId: string | null, 
  placedShips: PlacedShip[],
  currentGameId: string | null,
  setCurrentGameId: (id: string | null) => void
) {
  // Watch for ship placements and create/join a game when all ships are placed
  useEffect(() => {
    if (!teamId || placedShips.length !== 3) return;
    
    // All ships are placed, ensure we have a game
    const ensureGameExists = async () => {
      console.log('All ships placed, ensuring game exists...');
      
      // Check if we already have a game participant
      const { data: existingParticipant, error: participantError } = await supabase
        .from('game_participants')
        .select('game_id, board_state, id')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (participantError) {
        console.error('Error checking for existing participant:', participantError);
        return;
      }
      
      // Create the board state with current ship placements
      const initialBoardState = {
        ships: placedShips.map(ship => ({
          id: ship.id,
          positions: ship.positions.map(pos => ({ x: pos.x, y: pos.y }))
        })),
        hits: existingParticipant && existingParticipant.length > 0 && existingParticipant[0].board_state?.hits 
          ? existingParticipant[0].board_state.hits 
          : []
      };
      
      // If we already have a game participant, update it and return
      if (existingParticipant && existingParticipant.length > 0 && existingParticipant[0].game_id) {
        console.log('Already have a game:', existingParticipant[0].game_id);
        
        // Update the existing participant with the latest ship placements
        const { error: updateError } = await supabase
          .from('game_participants')
          .update({
            board_state: initialBoardState
          })
          .eq('id', existingParticipant[0].id);
          
        if (updateError) {
          console.error('Error updating existing participant:', updateError);
        } else {
          console.log('Updated existing participant with latest ship placements');
        }
        
        setCurrentGameId(existingParticipant[0].game_id);
        return;
      }
      
      // Find or create a game
      let gameId: string | null = null;
      
      // Look for existing games
      const { data: existingGames, error: fetchError } = await supabase
        .from('games')
        .select(`
          id,
          status,
          created_at,
          game_participants (
            team_id
          )
        `)
        .eq('status', 'waiting')
        .order('created_at', { ascending: false });
        
      if (fetchError) {
        console.error('Error fetching existing games:', fetchError);
        return;
      }
      
      if (existingGames && existingGames.length > 0) {
        // Find a game with exactly one participant that isn't this team
        const availableGame = existingGames.find(game => 
          game.game_participants.length === 1 && 
          !game.game_participants.some(p => p.team_id === teamId)
        );
        
        if (availableGame) {
          gameId = availableGame.id;
          console.log('Auto-joining existing game:', gameId);
        } else {
          // Check for empty games
          const emptyGame = existingGames.find(game => game.game_participants.length === 0);
          if (emptyGame) {
            gameId = emptyGame.id;
            console.log('Auto-joining empty game:', gameId);
          }
        }
      }
      
      // If no existing game found, create a new one
      if (!gameId) {
        console.log('Auto-creating new game...');
        const { data: game, error: gameError } = await supabase
          .from('games')
          .insert({
            status: 'waiting',
            created_at: new Date().toISOString()
          })
          .select()
          .single();
          
        if (gameError) {
          console.error('Error creating new game:', gameError);
          return;
        }
        
        gameId = game.id;
        console.log('Auto-created new game:', gameId);
      }
      
      // Create a new participant for this team
      console.log('Creating new game participant with board state:', initialBoardState);
      const { data: newParticipant, error: createError } = await supabase
        .from('game_participants')
        .insert({
          team_id: teamId,
          game_id: gameId,
          board_state: initialBoardState,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
        
      if (createError) {
        console.error('Error creating game participant:', createError);
        return;
      }
      
      console.log('Auto-created game participant:', newParticipant);
      
      // Verify the board state was saved correctly
      if (!newParticipant.board_state || 
          typeof newParticipant.board_state !== 'object' || 
          !Array.isArray((newParticipant.board_state as any).ships) || 
          (newParticipant.board_state as any).ships.length !== placedShips.length) {
        
        console.error('Board state was not saved correctly. Attempting to fix...');
        
        // Try to update the participant with the correct board state
        const { error: updateError } = await supabase
          .from('game_participants')
          .update({
            board_state: initialBoardState
          })
          .eq('id', newParticipant.id);
        
        if (updateError) {
          console.error('Error updating participant board state:', updateError);
        } else {
          console.log('Fixed board state for participant:', newParticipant.id);
        }
      }
      
      setCurrentGameId(gameId);
    };
    
    ensureGameExists();
  }, [teamId, placedShips, setCurrentGameId]);

  return {
    // This hook primarily handles side effects, so it doesn't return any values
  };
} 