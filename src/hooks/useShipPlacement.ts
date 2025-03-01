import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { PlacedShip, BoardState } from "@/types/game";

export function useShipPlacement(teamId: string | null) {
  const initialShips = [
    { id: "ship1", length: 2, isVertical: false, isPlaced: false },
    { id: "ship2", length: 2, isVertical: false, isPlaced: false },
    { id: "ship3", length: 3, isVertical: false, isPlaced: false },
  ];
  
  const [ships, setShips] = useState(initialShips);
  const [placedShips, setPlacedShips] = useState<PlacedShip[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isLoadingShips, setIsLoadingShips] = useState(false);

  // Load existing ships whenever teamId changes (including on initial load and after refreshes)
  useEffect(() => {
    if (teamId) {
      console.log('TeamId changed or initialized, loading ships for team:', teamId);
      loadExistingShips();
    }
  }, [teamId]);

  // NEW EFFECT: Subscribe to game status changes to detect game resets
  useEffect(() => {
    if (!teamId) return;
    
    // Find current game to monitor
    const findCurrentGame = async () => {
      try {
        const { data: participants } = await supabase
          .from('game_participants')
          .select('game_id')
          .eq('team_id', teamId)
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (participants && participants.length > 0) {
          const gameId = participants[0].game_id;
          
          // Subscribe to game status changes
          const gameStatusSubscription = supabase
            .channel(`game-status-${gameId}`)
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'games',
                filter: `id=eq.${gameId}`
              },
              async (payload) => {
                const newStatus = (payload.new as any).status;
                console.log(`Game ${gameId} status changed to: ${newStatus}`);
                
                // If game status changed to 'waiting' (reset), clear ships immediately
                if (newStatus === 'waiting') {
                  console.log('Game reset detected, clearing ships immediately');
                  setShips(initialShips.map(ship => ({ ...ship })));
                  setPlacedShips([]);
                  setIsReady(false);
                }
              }
            )
            .subscribe();
            
          // Return unsubscribe function
          return () => {
            gameStatusSubscription.unsubscribe();
          };
        }
      } catch (error) {
        console.error('Error setting up game status subscription:', error);
      }
    };
    
    // Set up subscription and store cleanup function
    const cleanupPromise = findCurrentGame();
    
    // Return cleanup function
    return () => {
      cleanupPromise.then(cleanup => {
        if (cleanup) cleanup();
      });
    };
  }, [teamId]);

  // Sync with database only when placedShips changes and it's not during initial loading
  useEffect(() => {
    if (!teamId || isInitialLoad || isLoadingShips || placedShips.length === 0) return;

    const syncBoardState = async () => {
      try {
        console.log('Syncing board state to database for team:', teamId);
        
        const boardState = {
          ships: placedShips.map(ship => ({
            id: ship.id,
            positions: ship.positions
          })),
          hits: []
        };

        // Check if record exists first
        const { data: existingRecord } = await supabase
          .from('game_participants')
          .select('id')
          .eq('team_id', teamId)
          .single();

        if (existingRecord) {
          // Update existing record
          const { error: updateError } = await supabase
            .from('game_participants')
            .update({ board_state: boardState })
            .eq('team_id', teamId);

          if (updateError) throw updateError;
          console.log('Updated existing board state for team:', teamId);
        } else {
          // Insert new record
          const { error: insertError } = await supabase
            .from('game_participants')
            .insert({
              team_id: teamId,
              board_state: boardState
            });

          if (insertError) throw insertError;
          console.log('Created new board state for team:', teamId);
        }
      } catch (error: any) {
        console.error('Error syncing board state:', error);
        toast.error("Failed to save ship placement");
      }
    };

    syncBoardState();
  }, [teamId, placedShips, isInitialLoad, isLoadingShips]);

  const loadExistingShips = async () => {
    if (!teamId) return;

    try {
      setIsLoadingShips(true);
      console.log('Loading existing ships for team ID:', teamId);
      
      // First check if the team is ready
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('is_ready')
        .eq('id', teamId)
        .single();
        
      if (teamError) {
        console.error('Error checking team ready status:', teamError);
        toast.error("Failed to check team status");
        return;
      }
      
      // Get the most recent game participant for this team
      const { data: participants, error: participantError } = await supabase
        .from('game_participants')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (participantError && participantError.code !== 'PGRST116') { // No results error
        console.error('Error loading existing ships:', participantError);
        toast.error("Failed to load existing ships");
        return;
      }

      if (participants && participants.length > 0) {
        console.log('Found board state for team:', teamId, participants[0].board_state);
        const boardState = participants[0].board_state as BoardState;
        if (boardState.ships && boardState.ships.length > 0) {
          console.log('Setting placed ships from database:', boardState.ships);
          setPlacedShips(boardState.ships);
          setShips(prevShips => 
            prevShips.map(ship => ({
              ...ship,
              isPlaced: boardState.ships.some(s => s.id === ship.id)
            }))
          );
          
          // Set ready status based on team data
          setIsReady(teamData.is_ready);
          console.log('Team ready status set to:', teamData.is_ready);
        } else {
          // Reset ships if there are no ships in the database
          console.log('No ships found in board state, resetting');
          setPlacedShips([]);
          setShips(initialShips);
          setIsReady(false);
        }
      } else {
        // Reset ships if there is no board state
        console.log('No board state found, resetting ships');
        setPlacedShips([]);
        setShips(initialShips);
        setIsReady(false);
      }
    } catch (error) {
      console.error('Error in loadExistingShips:', error);
      toast.error("Failed to load ship placements");
    } finally {
      setIsInitialLoad(false);
      setIsLoadingShips(false);
    }
  };

  const resetShips = async () => {
    setShips(initialShips.map(ship => ({ ...ship })));
    setPlacedShips([]);
    
    // Update the database to reflect the emptied ship placement
    if (teamId) {
      try {
        console.log('Saving empty ship state to database for team:', teamId);
        
        // Get the current participants for this team
        const { data: participants, error: participantsError } = await supabase
          .from('game_participants')
          .select('id, game_id')
          .eq('team_id', teamId)
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (participantsError) {
          console.error('Error fetching participants in resetShips:', participantsError);
          return;
        }
        
        if (participants && participants.length > 0) {
          // Update the board state to have empty ships array
          const emptyBoardState = { ships: [], hits: [] };
          const { error: updateError } = await supabase
            .from('game_participants')
            .update({ board_state: emptyBoardState })
            .eq('id', participants[0].id);
            
          if (updateError) {
            console.error('Error updating board state in resetShips:', updateError);
            return;
          }
          
          console.log('Board state reset successfully in database');
        }
      } catch (error) {
        console.error('Error in resetShips database update:', error);
      }
    }
    
    console.log('Ships reset!');
  };

  const handleShipPlaced = (shipId: string, positions: { x: number; y: number }[]) => {
    // Remove any existing placement for this ship
    const existingShips = placedShips.filter(ship => ship.id !== shipId);
    
    // Add the new ship placement
    const newPlacedShips = [...existingShips, { id: shipId, positions }];
    setPlacedShips(newPlacedShips);
    
    // Update ships array to mark this ship as placed
    setShips(prevShips => 
      prevShips.map(ship =>
        ship.id === shipId 
          ? { ...ship, isPlaced: true }
          : ship
      )
    );
  };

  return {
    ships,
    setShips,
    placedShips,
    setPlacedShips,
    isReady,
    setIsReady,
    loadExistingShips,
    resetShips,
    handleShipPlaced,
  };
}
