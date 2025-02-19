
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
      const boardState = {
        ships: placedShips.map(ship => ({
          id: ship.id,
          positions: ship.positions
        })),
        hits: [] as Array<{ x: number; y: number; isHit: boolean }>
      } as unknown as Json;

      const { error } = await supabase
        .from('game_participants')
        .upsert({
          team_id: teamId,
          board_state: boardState
        });

      if (error) {
        console.error('Error syncing board state:', error);
        toast.error("Failed to save ship placement");
      }
    };

    syncBoardState();
  }, [placedShips, teamId, isInitialLoad]);

  const loadExistingShips = async () => {
    if (!teamId) return;

    try {
      const { data, error } = await supabase
        .from('game_participants')
        .select('board_state')
        .eq('team_id', teamId)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') { // No results error
          console.error('Error loading existing ships:', error);
          toast.error("Failed to load existing ships");
        }
        return;
      }

      if (data?.board_state) {
        const boardState = data.board_state as unknown as BoardState;
        if (boardState.ships && boardState.ships.length > 0) {
          // Update placed ships
          setPlacedShips(boardState.ships);
          
          // Update ships state to reflect placed status
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
      } as unknown as Json;

      const { error } = await supabase
        .from('game_participants')
        .upsert({
          team_id: teamId,
          board_state: boardState
        });

      if (error) {
        console.error('Error resetting ships:', error);
        toast.error("Failed to reset ships");
      }
    } catch (error) {
      console.error('Error in resetShips:', error);
      toast.error("Failed to reset ships");
    }
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
  };
}
