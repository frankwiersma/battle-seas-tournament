import { useState } from "react";
import { debounce } from 'lodash';
import { GameState, GameScores, PlacedShip } from "@/types/game";

/**
 * Hook for managing the game state and phase
 */
export function useGameStateManager() {
  const [gameStarted, setGameStarted] = useState(false);
  const [isPlacementPhase, setIsPlacementPhase] = useState(true);
  const [gameState, setGameState] = useState<GameState>({
    myShips: [],
    myHits: [],
    enemyHits: [],
  });
  const [scores, setScores] = useState<GameScores>({
    myScore: 0,
    enemyScore: 0,
    myGuesses: 0,
    enemyGuesses: 0,
    myShipsSunk: 0,
    enemyShipsSunk: 0
  });
  const [gameWon, setGameWon] = useState(false);
  const [gameLost, setGameLost] = useState(false);
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);

  // Debounce the setGameStarted function to prevent rapid state changes
  const debouncedSetGameStarted = debounce((value: boolean) => {
    setGameStarted(value);
    setIsPlacementPhase(!value);
  }, 500);

  return {
    // State
    gameStarted,
    isPlacementPhase,
    gameState,
    scores,
    gameWon,
    gameLost,
    currentGameId,
    
    // State setters
    setGameStarted: debouncedSetGameStarted,
    setIsPlacementPhase,
    setGameState,
    setScores,
    setGameWon,
    setGameLost,
    setCurrentGameId,
  };
} 