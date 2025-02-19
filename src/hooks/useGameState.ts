import { useEffect } from "react";
import { useShipPlacement } from "./useShipPlacement";
import { useGamePhase } from "./useGamePhase";
import { handleCellClick } from "@/utils/gameActions";

export function useGameState(teamId: string | null) {
  const {
    ships,
    setShips,
    placedShips,
    setPlacedShips,
    isReady,
    setIsReady,
    loadExistingShips,
    resetShips,
  } = useShipPlacement(teamId);

  const {
    gameStarted,
    isPlacementPhase,
    gameState,
    setGameState,
    checkGameStart,
    setIsPlacementPhase,
    setGameStarted,
  } = useGamePhase(teamId, placedShips);

  useEffect(() => {
    loadExistingShips();
  }, [teamId]);

  const handleGameCellClick = async (x: number, y: number) => {
    if (isPlacementPhase || !teamId) return;
    await handleCellClick(x, y, teamId, gameState, setGameState);
  };

  return {
    gameStarted,
    isPlacementPhase,
    isReady,
    ships,
    setShips,
    placedShips,
    setPlacedShips,
    gameState,
    setGameState,
    setIsReady,
    checkGameStart,
    handleCellClick: handleGameCellClick,
    resetShips,
    setIsPlacementPhase,
    setGameStarted,
  };
}
