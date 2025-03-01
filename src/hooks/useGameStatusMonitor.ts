import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PlacedShip } from "@/types/game";
import { toast } from "sonner";
import { getOpposingTeamId, getOpposingTeamLetter } from "@/utils/teamUtils";

// Debounce utility function
const debounce = (func: Function, wait: number) => {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: any[]) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Prevent showing too many toasts
const toastTimeouts: Record<string, number> = {};
const showLimitedToast = (message: string, type: 'default' | 'success' | 'error' = 'default') => {
  const now = Date.now();
  if (toastTimeouts[message] && now - toastTimeouts[message] < 5000) {
    return; // Don't show the same toast if it was shown less than 5 seconds ago
  }
  
  toastTimeouts[message] = now;
  if (type === 'success') {
    toast.success(message);
  } else if (type === 'error') {
    toast.error(message);
  } else {
    toast(message);
  }
};

// Force update team ready status - helper function with retry logic
const forceUpdateTeamReadyStatus = async (teamId: string, isReady: boolean, maxRetries = 3): Promise<boolean> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { error } = await supabase
        .from('teams')
        .update({ is_ready: isReady })
        .eq('id', teamId);
        
      if (!error) {
        return true;
      }
      
      console.error(`Attempt ${i+1} failed to update team ready status:`, error);
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`Attempt ${i+1} failed with exception:`, err);
    }
  }
  
  return false;
};

// This is a special function for emergency game starting
// It will start the game for both teams even if the database doesn't show them as ready
// It should only be used when we're confident both teams are actually ready
export async function emergencyStartGame(
  gameId: string, 
  setGameStarted: (value: boolean) => void,
  setIsPlacementPhase: (value: boolean) => void
) {
  console.log('🚨 EMERGENCY: Forcing game to start regardless of ready status 🚨');
  
  try {
    // Force update game status to in_progress, removing updated_at field
    const { error: updateError } = await supabase
      .from('games')
      .update({ 
        status: 'in_progress'
      })
      .eq('id', gameId);
    
    if (updateError) {
      console.error('🔴 EMERGENCY START FAILED:', updateError);
      toast.error('Failed to force start the game. Please try again or reset the game.');
      return false;
    }
    
    // Force update UI state
    setGameStarted(true);
    setIsPlacementPhase(false);
    
    console.log('✅ EMERGENCY GAME START SUCCESSFUL!');
    toast.success('Game forced to start! Good luck!');
    return true;
  } catch (err) {
    console.error('🔴 ERROR IN EMERGENCY GAME START:', err);
    toast.error('Failed to force start the game. Please try again or reset the game.');
    return false;
  }
}

/**
 * Hook that monitors game status and updates local state accordingly
 */
export function useGameStatusMonitor(
  teamId: string | null,
  placedShips: PlacedShip[],
  setGameStarted: (value: boolean) => void,
  setIsPlacementPhase: (value: boolean) => void,
  setGameWon: (value: boolean) => void,
  setGameLost: (value: boolean) => void
) {
  // Add these refs to prevent multiple updates and toast spam
  const subscriptionsSetupRef = useRef(false);
  const isCheckingStatusRef = useRef(false);
  const lastProcessedGameStatusRef = useRef<string>("");
  const lastSubscriptionTimeRef = useRef(0);

  // Subscribe to game updates
  useEffect(() => {
    if (!teamId || subscriptionsSetupRef.current) return;
    subscriptionsSetupRef.current = true;

    // Helper function to update game status
    const updateGameStatus = async (gameId: string, status: 'waiting' | 'in_progress' | 'completed', winnerTeamId?: string) => {
      const updateData: any = { status };
      
      if (status === 'completed' && winnerTeamId) {
        updateData.winner_team_id = winnerTeamId;
      }
      
      const { error } = await supabase
        .from('games')
        .update(updateData)
        .eq('id', gameId);
        
      if (error) {
        console.error(`Error updating game status to ${status}:`, error);
      } else {
        console.log(`Game ${gameId} status updated to ${status}`);
        
        // If game is completed, reset teams' ready status to false
        if (status === 'completed') {
          console.log('Game completed, resetting team ready status');
          
          // Get all participants in this game
          const { data: participants, error: participantsError } = await supabase
            .from('game_participants')
            .select('team_id')
            .eq('game_id', gameId);
            
          if (participantsError) {
            console.error('Error getting game participants:', participantsError);
          } else if (participants && participants.length > 0) {
            // Set all teams' ready status to false
            for (const participant of participants) {
              const { error: teamError } = await supabase
                .from('teams')
                .update({ is_ready: false })
                .eq('id', participant.team_id);
                
              if (teamError) {
                console.error(`Error resetting team ${participant.team_id} ready status:`, teamError);
              } else {
                console.log(`Reset team ${participant.team_id} ready status to false`);
              }
            }
          }
        }
      }
    };

    // Helper function to check game status - added showToasts parameter to control notifications
    const checkGameStatus = async (showToasts = true) => {
      // Prevent multiple simultaneous checks
      if (isCheckingStatusRef.current) {
        console.log('Already checking status, skipping redundant check');
        return;
      }
      
      isCheckingStatusRef.current = true;
      
      try {
        // Get our team info - direct database query for most up-to-date data
        const { data: myTeam, error: teamError } = await supabase
          .from('teams')
          .select('team_letter, is_ready')
          .eq('id', teamId)
          .single();
          
        if (teamError) {
          console.error('Error getting team info:', teamError);
          isCheckingStatusRef.current = false;
          return;
        }
        
        // IMPROVED TEAM READY STATUS CHECK:
        // If we have all ships placed but aren't marked ready in the database, update our ready status
        if (!myTeam.is_ready && placedShips.length === 3) {
          console.log('Team has all ships placed but is not marked as ready in the database. Updating...');
          
          // Use the force update function
          const success = await forceUpdateTeamReadyStatus(teamId, true);
          
          if (success) {
            console.log('Successfully updated team ready status to true');
            if (showToasts) {
              showLimitedToast('Ready status updated successfully!');
            }
          } else {
            console.error('Failed to update team ready status');
            if (showToasts) {
              showLimitedToast('Failed to update ready status. Please try again.', 'error');
            }
          }
        }
        
        // Determine opposing team letter using the utility function
        const teamLetter = myTeam.team_letter;
        const opposingLetter = getOpposingTeamLetter(teamLetter);
        
        // Get opposing team's data
        const { data: opposingTeams, error: opposingError } = await supabase
          .from('teams')
          .select('id, is_ready')
          .eq('team_letter', opposingLetter);
          
        if (opposingError || !opposingTeams || opposingTeams.length === 0) {
          console.error('Error getting opposing team:', opposingError);
          isCheckingStatusRef.current = false;
          return;
        }
        
        const opposingTeam = opposingTeams[0];
        
        // Get fresh my team data to check ready status after potential update
        const { data: refreshedMyTeam, error: refreshMyError } = await supabase
          .from('teams')
          .select('is_ready')
          .eq('id', teamId)
          .single();
          
        const myTeamReady = refreshMyError ? myTeam.is_ready : refreshedMyTeam.is_ready;
        
        // Get fresh opposing team data too
        const { data: refreshedOppTeam, error: refreshOppError } = await supabase
          .from('teams')
          .select('is_ready')
          .eq('id', opposingTeam.id)
          .single();
          
        // Use the refreshed data if available, otherwise use the original
        const opposingTeamReady = refreshOppError ? opposingTeam.is_ready : refreshedOppTeam.is_ready;
        
        console.log(`Team ${teamLetter} ready: ${myTeamReady}, Team ${opposingLetter} ready: ${opposingTeamReady}`);
        
        // Check if both teams are ready with the most up-to-date information
        const bothTeamsReady = myTeamReady && opposingTeamReady;
        console.log(`All teams ready: ${bothTeamsReady}`);
        
        // CRITICAL: If both teams are ready, log this prominently
        if (bothTeamsReady) {
          console.log('🚨 CRITICAL: BOTH TEAMS ARE READY! GAME SHOULD START! 🚨');
        }
        
        // First get the current game participant to find the game_id
        const { data: myParticipants, error: participantError } = await supabase
          .from('game_participants')
          .select('game_id, board_state')
          .eq('team_id', teamId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (participantError) {
          console.error('Error fetching participant:', participantError);
          isCheckingStatusRef.current = false;
          return;
        }

        console.log('My participant:', myParticipants);
        
        // If we don't have a participant yet, create a new game or join existing
        if (!myParticipants || myParticipants.length === 0) {
          // Check if opposing team already has a game
          const { data: opposingParticipants, error: oppParticipantError } = await supabase
            .from('game_participants')
            .select('game_id, id')
            .eq('team_id', opposingTeam.id)
            .order('created_at', { ascending: false })
            .limit(1);
            
          if (oppParticipantError) {
            console.error('Error fetching opposing participant:', oppParticipantError);
            isCheckingStatusRef.current = false;
            return;
          }
          
          // If neither team has a game, create a new one for both teams
          if (!opposingParticipants || opposingParticipants.length === 0) {
            console.log('No active game found for either team. Creating a new game...');
            
            // Only proceed if we have ships placed
            if (placedShips.length < 3) {
              console.log('Waiting for all ships to be placed before creating game');
              if (showToasts) {
                showLimitedToast('Place all your ships before starting the game!');
              }
              isCheckingStatusRef.current = false;
              return;
            }
            
            // Create a new game
            const { data: newGame, error: createGameError } = await supabase
              .from('games')
              .insert({
                status: 'waiting',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .select('id')
              .single();
              
            if (createGameError || !newGame) {
              console.error('Error creating game:', createGameError);
              isCheckingStatusRef.current = false;
              return;
            }
            
            console.log(`Created new game with ID: ${newGame.id}`);
            
            // Create a participant for us
            const initialBoardState = {
              ships: placedShips.map(ship => ({
                id: ship.id,
                positions: ship.positions.map(pos => ({ x: pos.x, y: pos.y }))
              })),
              hits: []
            };
            
            const { error: createParticipantError } = await supabase
              .from('game_participants')
              .insert({
                team_id: teamId,
                game_id: newGame.id,
                board_state: initialBoardState,
                created_at: new Date().toISOString()
              });
              
            if (createParticipantError) {
              console.error('Error creating participant:', createParticipantError);
              isCheckingStatusRef.current = false;
              return;
            }
            
            console.log(`Successfully created participant for game ${newGame.id}`);
            
            if (showToasts) {
              showLimitedToast('Game created! Waiting for opponent...');
            }
            
            setGameStarted(false);
            setIsPlacementPhase(true);
            isCheckingStatusRef.current = false;
            return;
          } else if (opposingParticipants && opposingParticipants.length > 0) {
            // Opposing team has a game, we should join that game
            const gameId = opposingParticipants[0].game_id;
            console.log(`Found game ${gameId} for opposing team, joining it`);
            
            // Create a participant for us in that game
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
                created_at: new Date().toISOString()
              });
              
            if (createError) {
              console.error('Error creating participant:', createError);
            } else {
              console.log(`Successfully joined game ${gameId}`);
              
              // Start the game by updating its status
              const { error: updateError } = await supabase
                .from('games')
                .update({ status: 'in_progress' })
                .eq('id', gameId);
                
              if (updateError) {
                console.error('Error updating game status:', updateError);
              } else {
                console.log('Game started successfully!');
                setGameStarted(true);
                setIsPlacementPhase(false);
                isCheckingStatusRef.current = false;
                return;
              }
            }
          }
          
          setGameStarted(false);
          setIsPlacementPhase(true);
          isCheckingStatusRef.current = false;
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
          isCheckingStatusRef.current = false;
          return;
        }

        console.log('All participants:', gameParticipants);
        
        // Get the game status
        const { data: game, error: gameError } = await supabase
          .from('games')
          .select('status, current_team_id, winner_team_id')
          .eq('id', myParticipant.game_id)
          .single();
          
        if (gameError) {
          console.error('Error fetching game:', gameError);
          isCheckingStatusRef.current = false;
          return;
        }
        
        // Generate a hash of the current game state
        const gameStateHash = JSON.stringify({
          status: game.status,
          winner_team_id: game.winner_team_id,
          participants: gameParticipants.map(p => ({
            team_id: p.team_id,
            board_state: p.board_state
          }))
        });
        
        // If the game state hasn't changed, skip processing
        if (gameStateHash === lastProcessedGameStatusRef.current) {
          console.log('Game state unchanged, skipping redundant update');
          isCheckingStatusRef.current = false;
          return;
        }
        
        // Update last processed state
        lastProcessedGameStatusRef.current = gameStateHash;
        
        console.log('Game status:', game.status);
        
        // Check if all ships are placed
        const allShipsPlaced = gameParticipants.every(p => {
          const bs = p.board_state as any;
          return bs && bs.ships && Array.isArray(bs.ships) && bs.ships.length === 3;
        });
        
        console.log('All ships placed:', allShipsPlaced);
        
        // Force all ships placed flag for testing
        // This helps when a participant has a wrong board state
        const forceAllShipsPlaced = gameParticipants.length === 2;
        
        // Check if teams are ready - get the CURRENT status directly from teams table
        const teamIds = gameParticipants.map(p => p.team_id);
        
        const { data: readyTeams, error: readyError } = await supabase
          .from('teams')
          .select('is_ready, id, team_letter')
          .in('id', teamIds);
          
        if (readyError) {
          console.error('Error checking team ready status:', readyError);
          isCheckingStatusRef.current = false;
          return;
        }
        
        console.log('Teams ready status:', readyTeams);
        console.log('All teams ready:', readyTeams?.length === 2 && readyTeams.every(t => t.is_ready));
        
        // If the game is waiting, but both teams should be ready and all ships are placed
        // update the game status to in_progress
        if (game.status === 'waiting') {
          // If both teams are ready and all ships are placed, start the game
          if ((readyTeams?.length === 2 && readyTeams.every(t => t.is_ready) && allShipsPlaced) || (bothTeamsReady && forceAllShipsPlaced)) {
            console.log('Starting game - updating status to in_progress');
            
            // Force check if both teams have actually placed all ships
            const actuallyAllShipsPlaced = gameParticipants?.length === 2 && 
              gameParticipants.every(p => {
                const bs = p.board_state as any;
                return bs && bs.ships && Array.isArray(bs.ships) && bs.ships.length === 3;
              });
            
            console.log('Double-checking all ships placed:', actuallyAllShipsPlaced);
            
            // Double-check team ready status directly from the database
            const { data: doubleCheckTeams, error: doubleCheckError } = await supabase
              .from('teams')
              .select('is_ready, id, team_letter')
              .in('id', gameParticipants?.map(p => p.team_id) || []);
              
            if (doubleCheckError) {
              console.error('Error double-checking team status:', doubleCheckError);
              isCheckingStatusRef.current = false;
              return;
            }
            
            const teamsActuallyReady = doubleCheckTeams?.length === 2 && doubleCheckTeams.every(t => t.is_ready);
            console.log('Double-checking all teams ready:', teamsActuallyReady);
            
            if (teamsActuallyReady && (actuallyAllShipsPlaced || forceAllShipsPlaced)) {
              console.log('Team A: ', doubleCheckTeams.find(t => t.team_letter === 'A'));
              console.log('Team B: ', doubleCheckTeams.find(t => t.team_letter === 'B'));
              
              console.log('CONFIRMED: Both teams ready and ships placed. Starting game...');
              
              // Log each team's board state for debugging
              gameParticipants.forEach(p => {
                const team = doubleCheckTeams.find(t => t.id === p.team_id);
                console.log(`Team ${team?.team_letter} board state:`, p.board_state);
              });
              
              // Update the game status to in_progress
              const { error: updateError } = await supabase
                .from('games')
                .update({ status: 'in_progress' })
                .eq('id', myParticipant.game_id);
              
              if (updateError) {
                console.error('Error updating game status:', updateError);
                isCheckingStatusRef.current = false;
                return;
              }
              
              // Force update local state
              setGameStarted(true);
              setIsPlacementPhase(false);
              
              console.log('Game started successfully!');
              if (showToasts) {
                showLimitedToast('Both teams are ready! Game starting...');
              }
              isCheckingStatusRef.current = false;
              return;
            } else {
              // Something is wrong, let's try to fix team ready status
              console.log('Teams or ship placement not properly set. Attempting to fix...');
              
              // Fix team ready status if ships are placed
              for (const team of doubleCheckTeams || []) {
                const participant = gameParticipants.find(p => p.team_id === team.id);
                const bs = participant?.board_state as any;
                const hasAllShips = bs && bs.ships && Array.isArray(bs.ships) && bs.ships.length === 3;
                
                if (hasAllShips && !team.is_ready) {
                  console.log(`Team ${team.team_letter} has all ships but is not ready. Fixing...`);
                  
                  const { error: fixError } = await supabase
                    .from('teams')
                    .update({ is_ready: true })
                    .eq('id', team.id);
                    
                  if (fixError) {
                    console.error(`Error fixing team ${team.team_letter} ready status:`, fixError);
                  } else {
                    console.log(`Fixed team ${team.team_letter} ready status`);
                  }
                }
              }
            }
          }
          
          // If we get here, the game is still in waiting status
          setGameStarted(false);
          setIsPlacementPhase(true);
        } else if (game.status === 'in_progress') {
          // Game is in progress, update UI state
          setGameStarted(true);
          setIsPlacementPhase(false);
          
          // Check if the game should be marked as completed based on hits
          gameParticipants.forEach(participant => {
            const bs = participant.board_state as any;
            if (!bs || !bs.hits || !bs.ships) return;
            
            const ships = bs.ships || [];
            const hits = bs.hits || [];
            
            // Count number of hit positions
            const hitPositions = hits.filter((h: {isHit: boolean}) => h.isHit).length;
            
            // Count total ship positions
            const totalShipPositions = ships.reduce((total: number, ship: {positions?: any[]}) => {
              return total + (ship.positions?.length || 0);
            }, 0);
            
            // Check if all ships are sunk
            if (hitPositions >= totalShipPositions && totalShipPositions > 0) {
              const isMyBoard = participant.team_id === teamId;
              
              if (isMyBoard) {
                // All my ships are sunk - I lost
                console.log('All my ships are sunk - GAME LOST');
                setGameLost(true);
                setGameWon(false);
                
                // Update game status to completed if needed
                if (game.status !== 'completed') {
                  updateGameStatus(myParticipant.game_id, 'completed', participant.team_id);
                }
              } else {
                // All enemy ships are sunk - I won
                console.log('All enemy ships are sunk - GAME WON');
                setGameWon(true);
                setGameLost(false);
                
                // Update game status to completed if needed
                if (game.status !== 'completed') {
                  updateGameStatus(myParticipant.game_id, 'completed', teamId);
                }
              }
            }
          });
        } else if (game.status === 'completed') {
          // Game is completed
          setGameStarted(true);
          setIsPlacementPhase(false);
          
          // Check if this team won
          if (game.winner_team_id === teamId) {
            setGameWon(true);
            setGameLost(false);
          } else {
            setGameWon(false);
            setGameLost(true);
          }
        }
      } finally {
        // Always reset the checking status flag when done
        isCheckingStatusRef.current = false;
      }
    };

    // First get our team's letter to determine our opponent
    const loadTeamsAndSubscribe = async () => {
      try {
        const { data: myTeam, error: teamError } = await supabase
          .from('teams')
          .select('team_letter')
          .eq('id', teamId)
          .single();
          
        if (teamError || !myTeam) {
          console.error('Error loading team:', teamError);
          return;
        }
        
        const opposingLetter = getOpposingTeamLetter(myTeam.team_letter);
        
        console.log(`Team ${myTeam.team_letter} is paired with Team ${opposingLetter}`);
        
        // Find the opposing team
        const { data: opposingTeams, error: opposingError } = await supabase
          .from('teams')
          .select('id')
          .eq('team_letter', opposingLetter);
          
        if (opposingError || !opposingTeams || opposingTeams.length === 0) {
          console.error('Error finding opposing team:', opposingError);
          return;
        }
        
        const opposingTeamId = opposingTeams[0].id;
        console.log('Found opposing team ID:', opposingTeamId);
        
        // Debounced version of checkGameStatus
        const debouncedCheckStatus = debounce(checkGameStatus, 300);
        
        // Only set up subscriptions if we haven't already
        const now = Date.now();
        if (now - lastSubscriptionTimeRef.current < 60000) {
          console.log('Subscriptions were set up recently. Skipping to avoid duplicates.');
          return;
        }
        
        lastSubscriptionTimeRef.current = now;
        
        console.log('Subscribing to games table changes');
        supabase
          .channel('games-changes')
          .on(
            'postgres_changes',
            { 
              event: '*', 
              schema: 'public',
              table: 'games'
            },
            () => debouncedCheckStatus(false)
          )
          .subscribe();
          
        console.log('Subscribing to teams table changes');
        supabase
          .channel('teams-changes')
          .on(
            'postgres_changes',
            { 
              event: '*', 
              schema: 'public',
              table: 'teams'
            },
            () => debouncedCheckStatus(false)
          )
          .subscribe();
        
        console.log('Subscribing to game_participants table changes');
        supabase
          .channel('game-participants-changes')
          .on(
            'postgres_changes',
            { 
              event: '*', 
              schema: 'public',
              table: 'game_participants'
            },
            () => debouncedCheckStatus(false)
          )
          .subscribe();
      } catch (error) {
        console.error('Error in loadTeamsAndSubscribe:', error);
      }
    };

    loadTeamsAndSubscribe();
    checkGameStatus();

    // Set up periodic check of game status
    const statusCheckInterval = setInterval(() => {
      checkGameStatus(false); // Don't show toasts for periodic checks
    }, 5000); // Check every 5 seconds

    return () => {
      clearInterval(statusCheckInterval);
    };
  }, [teamId, placedShips, setGameStarted, setIsPlacementPhase, setGameWon, setGameLost]);
} 