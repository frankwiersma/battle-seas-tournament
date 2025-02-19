
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

  // Sync with database whenever placedShips changes
  useEffect(() => {
    if (!teamId || placedShips.length === 0) return;

    const syncBoardState = async () => {
      const boardState = {
        ships: placedShips.map(ship => ({
          id: ship.id,
          positions: ship.positions
        })),
        hits: []
      } as Json;

      const { error } = await supabase
        .from('game_participants')
        .upsert({
          team_id: teamId,
          board_state: boardState
        });

      if (error) {
        console.error('Error syncing board state:', error);
      }
    };

    syncBoardState();
  }, [placedShips, teamId]);

  const loadExistingShips = async () => {
    if (!teamId) return;

    const { data, error } = await supabase
      .from('game_participants')
      .select('board_state')
      .eq('team_id', teamId)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') { // No results error
        console.error('Error loading existing ships:', error);
      }
      return;
    }

    if (data && data.board_state) {
      const boardState = data.board_state as unknown as BoardState;
      if (boardState.ships && boardState.ships.length > 0) {
        setPlacedShips(boardState.ships.map(ship => ({
          id: ship.id,
          positions: ship.positions
        })));
        setShips(ships.map(ship => ({
          ...ship,
          isPlaced: boardState.ships.some(s => s.id === ship.id)
        })));
        setIsReady(true);
      }
    }
  };

  const resetShips = () => {
    setShips(initialShips);
    setPlacedShips([]);
    setIsReady(false);
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
