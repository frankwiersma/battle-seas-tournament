import { PlacedShip } from "@/types/game";
import { useGameStateManager } from "./useGameStateManager";
import { useGameInitialization } from "./useGameInitialization";
import { useGameStatusMonitor } from "./useGameStatusMonitor";
import { useGameStateSynchronizer } from "./useGameStateSynchronizer";
import { useGameActions } from "./useGameActions";

/**
 * Main hook for managing the game phase and state
 * This hook combines multiple smaller hooks to provide a complete game management solution
 */
export function useGamePhase(teamId: string | null, placedShips: PlacedShip[]) {
  // Initialize game state
  const {
    gameStarted,
    isPlacementPhase,
    gameState,
    scores,
    gameWon,
    gameLost,
    currentGameId,
    setGameStarted,
    setIsPlacementPhase,
    setGameState,
    setScores,
    setGameWon,
    setGameLost,
    setCurrentGameId
  } = useGameStateManager();

  // Initialize game when ships are placed
  useGameInitialization(
    teamId,
    placedShips,
    currentGameId,
    setCurrentGameId
  );

  // Monitor game status changes
  useGameStatusMonitor(
    teamId,
    placedShips,
    setGameStarted,
    setIsPlacementPhase,
    setGameWon,
    setGameLost
  );

  // Synchronize game state with the database
  const { checkIfGameCanStart } = useGameStateSynchronizer(
    teamId,
    currentGameId,
    setCurrentGameId,
    setGameState,
    setScores,
    setGameWon,
    setGameLost,
    setGameStarted,
    setIsPlacementPhase,
    placedShips
  );

  // Game actions
  const { checkGameStart } = useGameActions(
    teamId,
    placedShips,
    currentGameId,
    setCurrentGameId
  );

  return {
    gameStarted,
    isPlacementPhase,
    gameState,
    setGameState,
    checkGameStart,
    setIsPlacementPhase,
    setGameStarted,
    scores,
    gameWon,
    gameLost,
    currentGameId,
    setGameWon,
    setGameLost,
  };
} 