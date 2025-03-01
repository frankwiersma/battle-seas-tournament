import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import type { GameState, PlacedShip, BoardState } from "@/types/game";
import { debounce } from 'lodash';

// Add this interface at the top of the file, after the imports
interface GameScores {
  myScore: number;
  enemyScore: number;
  myGuesses: number;
  enemyGuesses: number;
  myShipsSunk: number;
  enemyShipsSunk: number;
}

export function useGamePhase(teamId: string | null, placedShips: PlacedShip[]) {
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

  // Subscribe to game updates
  useEffect(() => {
    if (!teamId) return;

    const channel = supabase
      .channel('game-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
        },
        async (payload) => {
          const game = payload.new as any;
          if (game.status === 'completed' && game.winner_team_id) {
            if (game.winner_team_id === teamId) {
              setGameWon(true);
            } else {
              setGameLost(true);
            }
          } else if (game.status === 'waiting') {
            // Reset game state when game is reset
            setGameWon(false);
            setGameLost(false);
            setGameStarted(false);
            setIsPlacementPhase(true);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [teamId]);

  // We need to subscribe to both teams' ready status
  useEffect(() => {
    if (!teamId) return;

    const teamsChannel = supabase
      .channel('teams-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'teams',
        },
        async (payload) => {
          console.log('Team status changed:', payload);
          await checkGameStatus();
        }
      )
      .subscribe();

    const gamesChannel = supabase
      .channel('games-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
        },
        async (payload) => {
          console.log('Game status changed:', payload);
          await checkGameStatus();
        }
      )
      .subscribe();

    // Helper function to check game status
    const checkGameStatus = async () => {
      console.log('Checking game status...');
      
      // First get the current game participant to find the game_id
      const { data: myParticipants, error: participantError } = await supabase
        .from('game_participants')
        .select('game_id, board_state')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (participantError) {
        console.error('Error fetching participant:', participantError);
        return;
      }

      console.log('My participant:', myParticipants);

      if (!myParticipants || myParticipants.length === 0 || !myParticipants[0]?.game_id) {
        setGameStarted(false);
        setIsPlacementPhase(true);
        return;
      }

      const myParticipant = myParticipants[0];

      // Get both participants for this specific game
      const { data: gameParticipants, error: participantsError } = await supabase
        .from('game_participants')
        .select('board_state, team_id')
        .eq('game_id', myParticipant.game_id);
      
      if (participantsError) {
        console.error('Error fetching game participants:', participantsError);
        return;
      }

      console.log('All participants:', gameParticipants);

      // Check if both teams exist and have placed all their ships
      const allShipsPlaced = gameParticipants?.length === 2 && gameParticipants.every(participant => {
        try {
          const boardState = participant.board_state as unknown as BoardState;
          // Check if ships array exists and has the right length
          const hasAllShips = boardState?.ships?.length === 3;
          console.log(`Team ${participant.team_id} has ${boardState?.ships?.length || 0} ships placed. Raw board state:`, JSON.stringify(boardState));
          
          // If ships aren't placed correctly, try to fix the board state
          if (!hasAllShips && participant.team_id === teamId && placedShips.length === 3) {
            console.log('Attempting to fix board state for team', teamId);
            
            // Create a fixed board state
            const fixedBoardState = {
              ships: placedShips.map(ship => ({
                id: ship.id,
                positions: ship.positions.map(pos => ({ x: pos.x, y: pos.y }))
              })),
              hits: boardState?.hits || []
            };
            
            // Update the participant with the fixed board state
            supabase
              .from('game_participants')
              .update({
                board_state: fixedBoardState,
                updated_at: new Date().toISOString()
              })
              .eq('team_id', participant.team_id)
              .eq('game_id', myParticipant.game_id)
              .then(({ error }) => {
                if (error) {
                  console.error('Error fixing board state:', error);
                } else {
                  console.log('Fixed board state for team', teamId);
                }
              });
          }
          
          return hasAllShips;
        } catch (e) {
          console.error('Error checking ships for team', participant.team_id, e);
          return false;
        }
      });

      // Force parse the board state to ensure it's correct
      const forceParsedShips = gameParticipants?.map(participant => {
        try {
          const boardState = participant.board_state as any;
          if (typeof boardState === 'string') {
            // Try to parse if it's a string
            const parsed = JSON.parse(boardState);
            return {
              team_id: participant.team_id,
              ships: parsed.ships || []
            };
          } else {
            // Otherwise use as is
            return {
              team_id: participant.team_id,
              ships: boardState?.ships || []
            };
          }
        } catch (e) {
          console.error('Error parsing board state:', e);
          return {
            team_id: participant.team_id,
            ships: []
          };
        }
      });

      console.log('Force parsed ships:', forceParsedShips);
      const forceAllShipsPlaced = forceParsedShips?.length === 2 && 
        forceParsedShips.every(p => p.ships.length === 3);
      
      console.log('Force all ships placed:', forceAllShipsPlaced);

      // Get teams ready status for the participants in this game
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('is_ready, id')
        .in('id', gameParticipants?.map(p => p.team_id) || []);

      if (teamsError) {
        console.error('Error fetching teams:', teamsError);
        return;
      }

      const allTeamsReady = teams?.length === 2 && teams.every(team => team.is_ready);
      console.log('Teams:', teams);
      console.log('All teams ready:', allTeamsReady);
      teams?.forEach(team => {
        console.log(`Team ${team.id} ready status: ${team.is_ready}`);
      });

      // Get game status
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('status')
        .eq('id', myParticipant.game_id)
        .single();
      
      if (gameError) {
        console.error('Error fetching game:', gameError);
        return;
      }

      console.log('Current game status:', {
        teams,
        allShipsPlaced,
        allTeamsReady,
        gameStatus: game?.status
      });

      if (game?.status === 'waiting') {
        // If both teams are ready and all ships are placed, start the game
        if ((allTeamsReady && allShipsPlaced) || (allTeamsReady && forceAllShipsPlaced)) {
          console.log('Starting game - updating status to in_progress');
          
          // Force check if both teams have actually placed all ships
          const actuallyAllShipsPlaced = gameParticipants?.length === 2 && 
            gameParticipants.every(p => {
              const bs = p.board_state as any;
              return bs && bs.ships && Array.isArray(bs.ships) && bs.ships.length === 3;
            });
          
          console.log('Double-checking all ships placed:', actuallyAllShipsPlaced);
          
          if (actuallyAllShipsPlaced || forceAllShipsPlaced) {
            console.log('Updating game status to in_progress for game:', myParticipant.game_id);
            
            const { error: updateError } = await supabase
              .from('games')
              .update({ 
                status: 'in_progress',
                updated_at: new Date().toISOString()
              })
              .eq('id', myParticipant.game_id);
            
            if (updateError) {
              console.error('Error updating game status:', updateError);
              return;
            }
            
            // Force update local state
            setGameStarted(true);
            setIsPlacementPhase(false);
            
            console.log('Game started successfully!');
          } else {
            console.error('Ships not actually placed correctly. Game not starting.');
            
            // If we're ready but ships aren't placed correctly, try to fix it
            if (allTeamsReady && placedShips.length === 3) {
              console.log('Attempting to fix our ships placement...');
              
              // Create a fixed board state
              const fixedBoardState = {
                ships: placedShips.map(ship => ({
                  id: ship.id,
                  positions: ship.positions.map(pos => ({ x: pos.x, y: pos.y }))
                })),
                hits: []
              };
              
              // Update our participant with the fixed board state
              const { error: fixError } = await supabase
                .from('game_participants')
                .update({
                  board_state: fixedBoardState,
                  updated_at: new Date().toISOString()
                })
                .eq('team_id', teamId)
                .eq('game_id', myParticipant.game_id);
              
              if (fixError) {
                console.error('Error fixing our board state:', fixError);
              } else {
                console.log('Fixed our board state, rechecking game status...');
                // Recheck game status after fixing
                setTimeout(() => checkGameStatus(), 1000);
              }
            }
          }
        } else {
          setGameStarted(false);
          setIsPlacementPhase(true);
        }
      } else if (game?.status === 'in_progress') {
        console.log('Game is in progress - updating local state');
        setGameStarted(true);
        setIsPlacementPhase(false);
      }
    };

    // Check initial state
    checkGameStatus();

    return () => {
      teamsChannel.unsubscribe();
      gamesChannel.unsubscribe();
    };
  }, [teamId]);

  // Subscribe to game state updates
  useEffect(() => {
    if (!teamId) return;

    let gameId: string | null = null;

    // Helper function to process game data
    const processGameData = (game: any) => {
      // Check game status and winner
      if (game.status === 'completed' && game.winner_team_id) {
        if (game.winner_team_id === teamId) {
          setGameWon(true);
        } else {
          setGameLost(true);
        }
      } else if (game.status === 'in_progress') {
        setGameStarted(true);
        setIsPlacementPhase(false);
      } else if (game.status === 'waiting') {
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
                    status: 'in_progress',
                    updated_at: new Date().toISOString()
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

        console.log('Board states:', {
          myBoardState,
          enemyBoardState
        });

        // Set game state with correct ship placements
        setGameState({
          myShips: myBoardState.ships || [], // Use my ships from my board state
          myHits: enemyBoardState.hits || [], // My hits on enemy board
          enemyHits: myBoardState.hits || [] // Enemy hits on my board
        });

        // Calculate and set scores
        const myHits = enemyBoardState.hits || [];
        const enemyHits = myBoardState.hits || [];
        
        const mySunkShips = calculateSunkShips(myHits, enemyBoardState.ships || []);
        const enemySunkShips = calculateSunkShips(enemyHits, myBoardState.ships || []);

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

    const loadGameState = async () => {
      try {
        console.log('Loading game state...');
        
        // If we have a currentGameId, use it directly
        if (currentGameId) {
          console.log('Using current game ID:', currentGameId);
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
            return;
          }
          
          console.log('Game data from currentGameId:', game);
          
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
            
            const { error: createError } = await supabase
              .from('game_participants')
              .insert({
                team_id: teamId,
                game_id: gameId,
                board_state: initialBoardState,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
              
            if (createError) {
              console.error('Error creating participant for existing game:', createError);
              return;
            }
            
            console.log('Created participant for existing game');
            
            // Reload the game data
            return loadGameState();
          }
          
          // Process the game data
          processGameData(game);
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
          return;
        }

        if (!myParticipants || myParticipants.length === 0) {
          console.log('No active game found');
          setGameState({
            myShips: [],
            myHits: [],
            enemyHits: [],
          });
          return;
        }

        const currentParticipant = myParticipants[0];
        console.log('Current participant:', currentParticipant);

        if (!currentParticipant?.game_id) {
          console.log('No active game found');
          setGameState({
            myShips: [],
            myHits: [],
            enemyHits: [],
          });
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
          return;
        }

        console.log('Game data:', game);

        if (!game?.game_participants) {
          console.log('No game participants found');
          return;
        }

        // Process the game data
        processGameData(game);
      } catch (error) {
        console.error('Error loading game state:', error);
      }
    };

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
          await loadGameState();
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
          console.log('New participant created:', payload);
          
          // If we have a game ID, check if this new participant is for our game
          if (currentGameId && payload.new && (payload.new as any).game_id === currentGameId) {
            console.log('New participant joined our game. Checking game status...');
            await loadGameState();
            
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
            await loadGameState();
          }
        }
      )
      .subscribe();

    return () => {
      updateSubscription.unsubscribe();
      insertSubscription.unsubscribe();
    };
  }, [teamId, currentGameId, placedShips]);

  // Watch for ship placements and create/join a game when all ships are placed
  useEffect(() => {
    if (!teamId || placedShips.length !== 3) return;
    
    // All ships are placed, ensure we have a game
    const ensureGameExists = async () => {
      console.log('All ships placed, ensuring game exists...');
      
      // Check if we already have a game participant
      const { data: existingParticipant, error: participantError } = await supabase
        .from('game_participants')
        .select('game_id')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (participantError) {
        console.error('Error checking for existing participant:', participantError);
        return;
      }
      
      if (existingParticipant && existingParticipant.length > 0 && existingParticipant[0].game_id) {
        console.log('Already have a game:', existingParticipant[0].game_id);
        setCurrentGameId(existingParticipant[0].game_id);
        return;
      }
      
      // Find or create a game
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
      
      let gameId;
      
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
      
      if (!gameId) {
        // Create a new game
        console.log('Auto-creating new game...');
        const { data: newGame, error: createError } = await supabase
          .from('games')
          .insert({
            status: 'waiting',
            current_team_id: teamId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();
          
        if (createError) {
          console.error('Error creating new game:', createError);
          return;
        }
        
        gameId = newGame.id;
        console.log('Auto-created new game:', gameId);
      }
      
      // Create a participant for this team
      const initialBoardState = {
        ships: placedShips.map(ship => ({
          id: ship.id,
          positions: ship.positions.map(pos => ({ x: pos.x, y: pos.y }))
        })),
        hits: []
      };
      
      // Clean up any existing participants for this team
      const { error: cleanupError } = await supabase
        .from('game_participants')
        .delete()
        .eq('team_id', teamId);
        
      if (cleanupError) {
        console.error('Error cleaning up existing participants:', cleanupError);
      }
      
      // Create new participant
      const { data: newParticipant, error: createError } = await supabase
        .from('game_participants')
        .insert({
          team_id: teamId,
          game_id: gameId,
          board_state: initialBoardState,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
        
      if (createError) {
        console.error('Error creating game participant:', createError);
        return;
      }
      
      console.log('Auto-created game participant:', newParticipant);
      setCurrentGameId(gameId);
    };
    
    ensureGameExists();
  }, [teamId, placedShips]);

  const checkGameStart = async () => {
    try {
      console.log('Starting checkGameStart...');
      
      // Check if all ships are placed first
      if (placedShips.length !== 3) {
        toast.error("Please place all ships before declaring ready!");
        return;
      }
      
      // Update team ready status
      const { error: teamError } = await supabase
        .from('teams')
        .update({ is_ready: true })
        .eq('id', teamId);
      
      if (teamError) {
        console.error('Error updating team ready status:', teamError);
        toast.error("Failed to update team status!");
        return;
      }
      
      console.log('Team ready status updated');
      
      // Verify the ready status was actually updated
      const { data: teamData, error: verifyError } = await supabase
        .from('teams')
        .select('is_ready')
        .eq('id', teamId)
        .single();
        
      if (verifyError) {
        console.error('Error verifying team ready status:', verifyError);
      } else {
        console.log('Verified team ready status:', teamData?.is_ready);
        
        // If the ready status wasn't updated, try again
        if (!teamData?.is_ready) {
          console.log('Team ready status not updated correctly. Trying again...');
          
          const { error: retryError } = await supabase
            .from('teams')
            .update({ 
              is_ready: true,
              updated_at: new Date().toISOString() 
            })
            .eq('id', teamId);
            
          if (retryError) {
            console.error('Error in retry update of team ready status:', retryError);
          } else {
            console.log('Retry update of team ready status successful');
          }
        }
      }

      // If we already have a game ID, use that instead of creating a new one
      if (currentGameId) {
        console.log('Using existing game ID:', currentGameId);
        
        // Check if we have a participant in this game
        const { data: existingParticipant, error: participantError } = await supabase
          .from('game_participants')
          .select('id, board_state')
          .eq('team_id', teamId)
          .eq('game_id', currentGameId)
          .single();
          
        if (participantError) {
          console.error('Error checking for existing participant:', participantError);
        } else if (existingParticipant) {
          console.log('Found existing participant:', existingParticipant);
          
          // Verify the board state is correct
          const boardState = existingParticipant.board_state as any;
          if (!boardState?.ships || !Array.isArray(boardState.ships) || boardState.ships.length !== placedShips.length) {
            console.log('Board state is incorrect. Updating...');
            
            // Update the board state
            const initialBoardState = {
              ships: placedShips.map(ship => ({
                id: ship.id,
                positions: ship.positions.map(pos => ({ x: pos.x, y: pos.y }))
              })),
              hits: boardState?.hits || []
            };
            
            const { error: updateError } = await supabase
              .from('game_participants')
              .update({
                board_state: initialBoardState,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingParticipant.id);
              
            if (updateError) {
              console.error('Error updating board state:', updateError);
            } else {
              console.log('Board state updated successfully');
            }
          }
          
          // Check if both teams are ready
          const { data: participants } = await supabase
            .from('game_participants')
            .select('team_id, board_state, id')
            .eq('game_id', currentGameId);
            
          if (participants && participants.length === 2) {
            console.log('Both participants found. Checking if game can start...');
            await checkIfGameCanStart(participants, currentGameId);
          }
          
          return;
        }
      }

      // First check for any existing game that's waiting for players
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

      console.log('Existing games check:', { existingGames, fetchError });

      let gameId;

      if (existingGames && existingGames.length > 0) {
        // First, check if we already have a participant in any of these games
        const gameWithMyTeam = existingGames.find(game => 
          game.game_participants.some(p => p.team_id === teamId)
        );
        
        if (gameWithMyTeam) {
          // We're already in a game, use that one
          gameId = gameWithMyTeam.id;
          console.log('Already in game:', gameId);
        } else {
          // Find a game that has exactly one participant and doesn't have this team
          const availableGame = existingGames.find(game => 
            game.game_participants.length === 1 && 
            !game.game_participants.some(p => p.team_id === teamId)
          );

          if (availableGame) {
            // Join existing game
            gameId = availableGame.id;
            console.log('Joining existing game with one participant:', gameId);
          } else {
            // If no suitable game was found, check if there's a game with no participants
            // This can happen if a game was created but the participant creation failed
            const emptyGame = existingGames.find(game => game.game_participants.length === 0);
            if (emptyGame) {
              gameId = emptyGame.id;
              console.log('Joining empty game:', gameId);
            }
          }
        }
      }

      if (!gameId) {
        // Create a new game if no suitable game was found
        console.log('Creating new game...');
        const { data: newGame, error: createError } = await supabase
          .from('games')
          .insert({
            status: 'waiting',
            current_team_id: teamId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating game:', createError);
          toast.error("Failed to create game!");
          return;
        }

        if (!newGame) {
          toast.error("Failed to create new game");
          return;
        }

        gameId = newGame.id;
        console.log('Created new game:', gameId);
      }
      
      // Store the game ID
      setCurrentGameId(gameId);

      // First, clean up any existing participants for this team
      console.log('Cleaning up existing participants for team', teamId);
      const { error: cleanupError } = await supabase
        .from('game_participants')
        .delete()
        .eq('team_id', teamId);
      
      if (cleanupError) {
        console.error('Error cleaning up participants:', cleanupError);
        // Continue anyway, as this is just cleanup
      }

      // Save initial board state and link to game
      const initialBoardState = {
        ships: placedShips.map(ship => ({
          id: ship.id,
          positions: ship.positions.map(pos => ({ x: pos.x, y: pos.y }))
        })),
        hits: []
      };

      console.log('Initial board state for team', teamId, ':', JSON.stringify(initialBoardState));
      console.log('Placed ships count:', placedShips.length);

      // Create new participant
      console.log('Creating new participant for team', teamId, 'in game', gameId);
      const { data: newParticipant, error: createError } = await supabase
        .from('game_participants')
        .insert({
          team_id: teamId,
          game_id: gameId,
          board_state: initialBoardState,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating participant:', createError);
        toast.error("Failed to create game participant!");
        return;
      }

      console.log('New participant created:', newParticipant);
      console.log('Verifying board_state was saved correctly:', 
        typeof newParticipant.board_state === 'object' ? 
          JSON.stringify(newParticipant.board_state) : 
          'Not an object: ' + typeof newParticipant.board_state);

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
          toast.error("Failed to save ship placements!");
          return;
        }
        
        console.log('Fixed board state for participant:', newParticipant.id);
      }

      // Check if both teams are ready
      const { data: participants, error: participantsError } = await supabase
        .from('game_participants')
        .select('team_id, board_state, id')
        .eq('game_id', gameId);

      if (participantsError) {
        console.error('Error checking participants:', participantsError);
        return;
      }

      console.log('Game participants:', participants);

      // Force check if we have exactly 2 participants
      if (participants && participants.length !== 2) {
        console.log(`Found ${participants.length} participants instead of 2. Waiting for opponent...`);
        
        // Set up a polling mechanism to check for the second participant
        let attempts = 0;
        const maxAttempts = 5;
        const pollInterval = 2000; // 2 seconds
        
        const pollForOpponent = async () => {
          if (attempts >= maxAttempts) {
            console.log('Max polling attempts reached. Giving up waiting for opponent.');
            return;
          }
          
          attempts++;
          console.log(`Polling for opponent (attempt ${attempts}/${maxAttempts})...`);
          
          const { data: updatedParticipants } = await supabase
            .from('game_participants')
            .select('team_id, board_state, id')
            .eq('game_id', gameId);
            
          if (updatedParticipants && updatedParticipants.length === 2) {
            console.log('Found opponent! Checking if game can start...');
            await checkIfGameCanStart(updatedParticipants, gameId);
          } else {
            setTimeout(pollForOpponent, pollInterval);
          }
        };
        
        // Start polling
        setTimeout(pollForOpponent, pollInterval);
        return;
      }

      // Check if all ships are placed and both teams are ready
      await checkIfGameCanStart(participants, gameId);
    } catch (error) {
      console.error('Error in checkGameStart:', error);
      toast.error("An error occurred while starting the game");
    }
  };

  // Helper function to check if game can start and start it if possible
  const checkIfGameCanStart = async (participants: any[], gameId: string) => {
    // Check if all ships are placed
    const allShipsPlaced = participants.every((p: { board_state: any; team_id: string }) => {
      const boardState = p.board_state as unknown as BoardState;
      const hasAllShips = boardState?.ships?.length === 3;
      console.log(`Team ${p.team_id} has ${boardState?.ships?.length || 0} ships placed.`);
      return hasAllShips;
    });
    
    console.log('All ships placed:', allShipsPlaced);
    
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

    console.log('Teams ready status:', teams);

    // Both teams have joined and placed all ships, check if both are ready
    const allTeamsReady = teams?.length === 2 && teams.every(t => t.is_ready);
    console.log('All teams ready:', allTeamsReady);
    
    if (allTeamsReady) {
      console.log('Both teams ready, updating game status to in_progress');
      
      const { error: gameUpdateError } = await supabase
        .from('games')
        .update({ 
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', gameId);

      if (gameUpdateError) {
        console.error('Error updating game status:', gameUpdateError);
        return;
      }

      // Force update local state
      setGameStarted(true);
      setIsPlacementPhase(false);
      console.log('Game started:', gameId);
    } else {
      console.log('Not all teams are ready. Checking if we need to fix team ready status...');
      
      // If we have two participants with ships placed, but teams aren't ready,
      // there might be an issue with the ready status not being properly updated
      if (participants.length === 2 && allShipsPlaced) {
        console.log('Both teams have placed ships but not all are marked ready. Attempting to fix...');
        
        // Log the current ready status of each team
        teams?.forEach(team => {
          console.log(`Team ${team.id} ready status: ${team.is_ready}`);
        });
        
        // Check if our team is ready in the database
        const ourTeam = teams?.find(t => t.id === teamId);
        if (ourTeam && !ourTeam.is_ready) {
          console.log('Our team is not marked as ready in the database. Fixing...');
          
          // Update our team's ready status
          const { error: updateError } = await supabase
            .from('teams')
            .update({ is_ready: true })
            .eq('id', teamId);
            
          if (updateError) {
            console.error('Error updating our team ready status:', updateError);
          } else {
            console.log('Fixed our team ready status');
          }
        }
        
        // If both teams have placed ships, force the game to start after a short delay
        // This is a fallback mechanism in case the ready status isn't properly updated
        if (allShipsPlaced && participants.length === 2) {
          console.log('Both teams have placed ships. Attempting to force start the game...');
          
          // Force update all teams to ready
          for (const participant of participants) {
            const { error: forceReadyError } = await supabase
              .from('teams')
              .update({ is_ready: true })
              .eq('id', participant.team_id);
              
            if (forceReadyError) {
              console.error(`Error forcing team ${participant.team_id} ready:`, forceReadyError);
            } else {
              console.log(`Forced team ${participant.team_id} ready status to true`);
            }
          }
          
          // Force start the game
          setTimeout(async () => {
            console.log('Force starting game...');
            const { error: forceStartError } = await supabase
              .from('games')
              .update({ 
                status: 'in_progress',
                updated_at: new Date().toISOString()
              })
              .eq('id', gameId);
              
            if (forceStartError) {
              console.error('Error force starting game:', forceStartError);
            } else {
              console.log('Game force started successfully!');
              // Force update local state
              setGameStarted(true);
              setIsPlacementPhase(false);
            }
          }, 2000);
        }
      }
    }
  };

  const debouncedSetGameStarted = debounce((value: boolean) => {
    setGameStarted(value);
    setIsPlacementPhase(!value);
  }, 500);

  return {
    gameStarted,
    isPlacementPhase,
    gameState,
    setGameState,
    checkGameStart,
    setIsPlacementPhase,
    setGameStarted: debouncedSetGameStarted,
    scores,
    gameWon,
    gameLost,
  };
}

const calculateSunkShips = (hits: Array<{ x: number; y: number; isHit: boolean }>, ships: Array<{ positions: Array<{ x: number; y: number }> }>) => {
  return ships.filter(ship => {
    // A ship is sunk if all its positions have been hit
    return ship.positions.every(pos =>
      hits.some(hit => hit.x === pos.x && hit.y === pos.y && hit.isHit)
    );
  }).length;
};
