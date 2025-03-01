import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GameState, BoardState, GameScores, PlacedShip } from "@/types/game";
import { calculateSunkShips } from "@/utils/gameCalculations";

// Add a debounce utility
const debounce = (func: Function, wait: number) => {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: any[]) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Hook for synchronizing game state with the database
 */
export function useGameStateSynchronizer(
  teamId: string | null,
  currentGameId: string | null,
  setCurrentGameId: (id: string | null) => void,
  setGameState: (state: GameState) => void,
  setScores: (scores: GameScores) => void,
  setGameWon: (value: boolean) => void,
  setGameLost: (value: boolean) => void,
  setGameStarted: (value: boolean) => void,
  setIsPlacementPhase: (value: boolean) => void,
  placedShips: PlacedShip[]
) {
  // Track last processed state to avoid redundant updates
  const lastProcessedStateRef = useRef<string>("");
  // Track if we're currently loading game state
  const isLoadingGameState = useRef(false);

  // Helper function to check if game can start and start it if possible
  const checkIfGameCanStart = async (participants: any[], gameId: string) => {
    // Check if all ships are placed
    const allShipsPlaced = participants.every((p: { board_state: any; team_id: string }) => {
      const boardState = p.board_state as unknown as BoardState;
      const hasAllShips = boardState?.ships?.length === 3;
      if (process.env.NODE_ENV !== 'production') {
        console.log(`Team ${p.team_id} has ${boardState?.ships?.length || 0} ships placed.`);
      }
      return hasAllShips;
    });
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('All ships placed:', allShipsPlaced);
    }
    
    if (!allShipsPlaced) {
      console.log('Not all ships are placed. Game cannot start yet.');
      return;
    }
    
    // Get teams ready status
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('is_ready, id')
      .in('id', participants.map((p: { team_id: string }) => p.team_id));

    if (teamsError) {
      console.error('Error checking team status:', teamsError);
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('Teams ready status:', teams);
    }

    // Both teams have joined and placed all ships, check if both are ready
    const allTeamsReady = teams?.length === 2 && teams.every(t => t.is_ready);
    console.log('All teams ready:', allTeamsReady);
    
    if (!allTeamsReady) {
      return;
    }
    
    // Update game status to in progress
    console.log('All conditions met. Starting game...');
    
    const { error: updateError } = await supabase
      .from('games')
      .update({ status: 'in_progress' })
      .eq('id', gameId);
      
    if (updateError) {
      console.error('Error updating game status:', updateError);
    } else {
      console.log('Game started!');
    }
  };

  // Subscribe to game state updates
  useEffect(() => {
    if (!teamId) return;

    let gameId: string | null = null;

    // Helper function to process game data
    const processGameData = (game: any) => {
      // Skip processing if this is the same data we already processed
      const gameStateHash = JSON.stringify({
        status: game.status,
        winner_team_id: game.winner_team_id,
        participants: game.game_participants.map((p: any) => ({
          team_id: p.team_id,
          board_state: p.board_state
        }))
      });
      
      if (gameStateHash === lastProcessedStateRef.current) {
        console.log('State unchanged, skipping redundant update');
        return;
      }
      
      // Update last processed state
      lastProcessedStateRef.current = gameStateHash;

      // Check game status and winner
      if (game.status === 'completed' && game.winner_team_id) {
        if (game.winner_team_id === teamId) {
          setGameWon(true);
        } else {
          setGameLost(true);
        }
        
        // Reset team ready status when game is completed
        if (teamId) {
          console.log('Game completed, resetting this team\'s ready status');
          supabase
            .from('teams')
            .update({ is_ready: false })
            .eq('id', teamId)
            .then(({ error }) => {
              if (error) {
                console.error('Error resetting team ready status:', error);
              } else {
                console.log('Team ready status reset to false');
              }
            });
        }
      } else if (game.status === 'in_progress') {
        setGameStarted(true);
        setIsPlacementPhase(false);
        
        // NEW CODE: Check if teams are ready when game is in progress
        const gameParticipants = game.game_participants;
        if (gameParticipants && gameParticipants.length === 2) {
          // Check if all ships are placed
          const allShipsPlaced = gameParticipants.every((p: { board_state: any; team_id: string }) => {
            const bs = p.board_state as any;
            return bs && bs.ships && Array.isArray(bs.ships) && bs.ships.length === 3;
          });
          
          if (allShipsPlaced) {
            // Get teams ready status
            supabase
              .from('teams')
              .select('is_ready, id')
              .in('id', gameParticipants.map((p: { team_id: string }) => p.team_id))
              .then(({ data: teams, error: teamsError }) => {
                if (!teamsError && teams) {
                  const allTeamsReady = teams.length === 2 && teams.every(t => t.is_ready);
                  
                  // If game is in progress but teams are not ready, fix it
                  if (!allTeamsReady) {
                    console.log('Game is in progress but teams are not ready. Fixing team ready status...');
                    
                    // Update all teams to ready
                    for (const team of teams) {
                      if (!team.is_ready) {
                        console.log(`Setting team ${team.id} ready status to true`);
                        supabase
                          .from('teams')
                          .update({ is_ready: true })
                          .eq('id', team.id)
                          .then(({ error }) => {
                            if (error) {
                              console.error(`Error updating team ${team.id} ready status:`, error);
                            } else {
                              console.log(`Successfully updated team ${team.id} ready status to true`);
                            }
                          });
                      }
                    }
                  }
                }
              });
          }
        }
      } else if (game.status === 'waiting') {
        // Clear any game won/lost state when a game transitions to waiting
        setGameWon(false);
        setGameLost(false);
        
        // Check if the game should be started
        const gameParticipants = game.game_participants;
        const allShipsPlaced = gameParticipants.length === 2 && 
          gameParticipants.every((p: { board_state: any; team_id: string }) => {
            const bs = p.board_state as any;
            return bs && bs.ships && Array.isArray(bs.ships) && bs.ships.length === 3;
          });
        
        if (allShipsPlaced) {
          // Get teams ready status
          supabase
            .from('teams')
            .select('is_ready, id')
            .in('id', gameParticipants.map((p: { team_id: string }) => p.team_id))
            .then(({ data: teams, error: teamsError }) => {
              if (!teamsError && teams && teams.length === 2 && teams.every(t => t.is_ready)) {
                console.log('Both teams ready and all ships placed. Starting game...');
                
                // Update game status
                supabase
                  .from('games')
                  .update({ 
                    status: 'in_progress'
                  })
                  .eq('id', game.id)
                  .then(({ error: updateError }) => {
                    if (!updateError) {
                      setGameStarted(true);
                      setIsPlacementPhase(false);
                      console.log('Game started from loadGameState!');
                    }
                  });
              } else {
                setGameStarted(false);
                setIsPlacementPhase(true);
              }
            });
        } else {
          setGameStarted(false);
          setIsPlacementPhase(true);
        }
      }

      const gameParticipants = game.game_participants;
      const myParticipant = gameParticipants.find((p: { team_id: string }) => p.team_id === teamId);
      const enemyParticipant = gameParticipants.find((p: { team_id: string }) => p.team_id !== teamId);

      if (myParticipant && enemyParticipant) {
        const myBoardState = myParticipant.board_state as unknown as BoardState;
        const enemyBoardState = enemyParticipant.board_state as unknown as BoardState;

        if (process.env.NODE_ENV !== 'production') {
          console.log('Board states:', {
            myBoardState,
            enemyBoardState
          });
        }

        // Set game state with correct ship placements
        setGameState({
          myShips: myBoardState.ships || [], // Use my ships from my board state
          myHits: enemyBoardState.hits || [], // My hits on enemy board
          enemyHits: myBoardState.hits || [] // Enemy hits on my board
        });

        // Calculate and set scores
        const myHits = enemyBoardState.hits || [];
        const enemyHits = myBoardState.hits || [];
        
        // Fix for type mismatch in calculateSunkShips
        // Convert hits to match the expected format of the ship positions
        // We're using the parameters in reversed order from what the error shows
        const mySunkShips = calculateSunkShips(
          enemyBoardState.ships || [], // ships parameter
          myHits // hits parameter
        );
        const enemySunkShips = calculateSunkShips(
          myBoardState.ships || [], // ships parameter
          enemyHits // hits parameter
        );

        setScores({
          myScore: myHits.filter(h => h.isHit).length,
          enemyScore: enemyHits.filter(h => h.isHit).length,
          myGuesses: myHits.length,
          enemyGuesses: enemyHits.length,
          myShipsSunk: mySunkShips,
          enemyShipsSunk: enemySunkShips
        });

        // Check if game should be completed
        if (game.status === 'in_progress') {
          if (mySunkShips === 3 && !game.winner_team_id) {
            console.log('You won! Updating game status...');
            supabase
              .from('games')
              .update({ 
                status: 'completed',
                winner_team_id: teamId 
              })
              .eq('id', game.id);
          } else if (enemySunkShips === 3 && !game.winner_team_id) {
            console.log('Enemy won. Updating game status...');
            supabase
              .from('games')
              .update({ 
                status: 'completed',
                winner_team_id: enemyParticipant.team_id 
              })
              .eq('id', game.id);
          }
        }
      }
    };

    // Initialize loadGameState with debouncing to prevent rapid repeated calls
    const loadGameState = async () => {
      // If already loading, skip this call
      if (isLoadingGameState.current) {
        return;
      }

      isLoadingGameState.current = true;
      
      try {
        if (process.env.NODE_ENV !== 'production') {
          console.log('Loading game state...');
        }
        
        // If we have a currentGameId, use it directly
        if (currentGameId) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('Using current game ID:', currentGameId);
          }
          gameId = currentGameId;
          
          // Get the game with all participants
          const { data: game, error: gameError } = await supabase
            .from('games')
            .select(`
              id,
              status,
              current_team_id,
              winner_team_id,
              game_participants (
                id,
                team_id,
                board_state
              )
            `)
            .eq('id', gameId)
            .single();

          if (gameError) {
            console.error('Error fetching game with ID:', gameId, gameError);
            isLoadingGameState.current = false;
            return;
          }
          
          if (process.env.NODE_ENV !== 'production') {
            console.log('Game data from currentGameId:', game);
          }
          
          // Check if we have a participant in this game
          const myParticipant = game.game_participants.find(p => p.team_id === teamId);
          if (!myParticipant) {
            console.log('No participant found for our team in this game. Creating one...');
            
            // Create a participant for this team
            const initialBoardState = {
              ships: placedShips.map(ship => ({
                id: ship.id,
                positions: ship.positions.map(pos => ({ x: pos.x, y: pos.y }))
              })),
              hits: []
            };
            
            const { error: insertError } = await supabase
              .from('game_participants')
              .insert({
                game_id: gameId,
                team_id: teamId,
                board_state: initialBoardState,
                created_at: new Date().toISOString()
              });
              
            if (insertError) {
              console.error('Error creating participant for existing game:', insertError);
              isLoadingGameState.current = false;
              return;
            }
            
            console.log('Created participant for existing game');
            
            // Reload the game data
            isLoadingGameState.current = false;
            return loadGameState();
          }
          
          // Process the game data
          processGameData(game);
          isLoadingGameState.current = false;
          return;
        }
        
        // First get the current game participant
        const { data: myParticipants, error: participantError } = await supabase
          .from('game_participants')
          .select('game_id, id')
          .eq('team_id', teamId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (participantError) {
          console.error('Error fetching participant:', participantError);
          isLoadingGameState.current = false;
          return;
        }

        if (!myParticipants || myParticipants.length === 0) {
          console.log('No active game found');
          setGameState({
            myShips: [],
            myHits: [],
            enemyHits: [],
          });
          isLoadingGameState.current = false;
          return;
        }

        const currentParticipant = myParticipants[0];
        if (process.env.NODE_ENV !== 'production') {
          console.log('Current participant:', currentParticipant);
        }

        if (!currentParticipant?.game_id) {
          console.log('No active game found');
          setGameState({
            myShips: [],
            myHits: [],
            enemyHits: [],
          });
          isLoadingGameState.current = false;
          return;
        }
        
        // Store game ID for subscription and state
        gameId = currentParticipant.game_id;
        setCurrentGameId(gameId);

        // Then get the game with all participants
        const { data: game, error: gameError } = await supabase
          .from('games')
          .select(`
            id,
            status,
            current_team_id,
            winner_team_id,
            game_participants (
              id,
              team_id,
              board_state
            )
          `)
          .eq('id', gameId)
          .single();

        if (gameError) {
          console.error('Error fetching game:', gameError);
          isLoadingGameState.current = false;
          return;
        }

        if (process.env.NODE_ENV !== 'production') {
          console.log('Game data:', game);
        }

        if (!game?.game_participants) {
          console.log('No game participants found');
          isLoadingGameState.current = false;
          return;
        }

        // Process the game data
        processGameData(game);
      } catch (error) {
        console.error('Error loading game state:', error);
      } finally {
        isLoadingGameState.current = false;
      }
    };

    // Debounced version of loadGameState
    const debouncedLoadGameState = debounce(loadGameState, 300);

    // Initial load to get game ID and state
    loadGameState();

    // Subscribe to game_participants changes
    const updateSubscription = supabase
      .channel('game-participant-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_participants',
        },
        async () => {
          await debouncedLoadGameState();
        }
      )
      .subscribe();
      
    // Subscribe to game_participants creation events
    const insertSubscription = supabase
      .channel('game-participant-inserts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_participants',
        },
        async (payload) => {
          if (process.env.NODE_ENV !== 'production') {
            console.log('New participant created:', payload);
          }
          
          // If we have a game ID, check if this new participant is for our game
          if (currentGameId && payload.new && (payload.new as any).game_id === currentGameId) {
            console.log('New participant joined our game. Checking game status...');
            await debouncedLoadGameState();
            
            // Get all participants for this game
            const { data: participants } = await supabase
              .from('game_participants')
              .select('team_id, board_state, id')
              .eq('game_id', currentGameId);
              
            if (participants && participants.length === 2) {
              console.log('Both participants now in game. Checking if game can start...');
              await checkIfGameCanStart(participants, currentGameId);
            }
          } else if (!currentGameId && payload.new && (payload.new as any).team_id === teamId) {
            // If we don't have a game ID yet, but this is our participant, update our game ID
            console.log('Our participant was created. Setting game ID.');
            setCurrentGameId((payload.new as any).game_id);
            await debouncedLoadGameState();
          }
        }
      )
      .subscribe();

    return () => {
      updateSubscription.unsubscribe();
      insertSubscription.unsubscribe();
    };
  }, [teamId, currentGameId, placedShips, setGameState, setScores, setGameWon, setGameLost, setCurrentGameId, setGameStarted, setIsPlacementPhase]);

  // Return the checkIfGameCanStart function for use outside the hook
  return { checkIfGameCanStart };
} 