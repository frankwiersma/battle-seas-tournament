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

  // Load existing ships on initial mount
  useEffect(() => {
    if (teamId && isInitialLoad) {
      loadExistingShips();
      setIsInitialLoad(false);
    }
  }, [teamId, isInitialLoad]);

  // Sync with database only when placedShips changes and it's not the initial load
  useEffect(() => {
    if (!teamId || isInitialLoad) return;

    const syncBoardState = async () => {
      try {
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
        } else {
          // Insert new record
          const { error: insertError } = await supabase
            .from('game_participants')
            .insert({
              team_id: teamId,
              board_state: boardState
            });

          if (insertError) throw insertError;
        }
      } catch (error: any) {
        console.error('Error syncing board state:', error);
        toast.error("Failed to save ship placement");
      }
    };

    syncBoardState();
  }, [teamId, placedShips, isInitialLoad]);

  const loadExistingShips = async () => {
    if (!teamId) return;

    try {
      const { data, error } = await supabase
        .from('game_participants')
        .select('board_state')
        .eq('team_id', teamId)
        .maybeSingle();  // Use maybeSingle instead of single

      if (error && error.code !== 'PGRST116') { // No results error
        console.error('Error loading existing ships:', error);
        toast.error("Failed to load existing ships");
        return;
      }

      if (data?.board_state) {
        const boardState = data.board_state as BoardState;
        if (boardState.ships && boardState.ships.length > 0) {
          setPlacedShips(boardState.ships);
          setShips(prevShips => 
            prevShips.map(ship => ({
              ...ship,
              isPlaced: boardState.ships.some(s => s.id === ship.id)
            }))
          );
          
          if (boardState.ships.length === initialShips.length) {
            setIsReady(true);
          }
        }
      }
    } catch (error) {
      console.error('Error in loadExistingShips:', error);
      toast.error("Failed to load ship placements");
    }
  };

  const resetShips = async () => {
    if (!teamId) return;

    try {
      // Reset local state
      setShips(initialShips);
      setPlacedShips([]);
      setIsReady(false);

      // Reset database state
      const boardState = {
        ships: [],
        hits: []
      };

      const { error } = await supabase
        .from('game_participants')
        .update({
          board_state: boardState,
          updated_at: new Date().toISOString()
        })
        .eq('team_id', teamId);

      if (error) throw error;
    } catch (error: any) {
      console.error('Error resetting ships:', error);
      toast.error("Failed to reset ships");
    }
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
