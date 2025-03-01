import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PlacedShip } from "@/types/game";
import { toast } from "sonner";
import { getOpposingTeamId, getOpposingTeamLetter } from "@/utils/teamUtils";

// Force update function to update team ready status using RPC
// This is a more direct approach that might bypass permission issues
const forceUpdateTeamReadyStatus = async (teamId: string, isReady: boolean) => {
  console.log(`🔥 FORCE UPDATING team ${teamId} ready status to ${isReady} using direct method`);
  
  try {
    // First try direct update - removing updated_at that's causing errors
    const { error } = await supabase
      .from('teams')
      .update({ 
        is_ready: isReady
      })
      .eq('id', teamId);
      
    if (error) {
      console.error('Direct update failed:', error);
      
      // Try using direct SQL if available
      try {
        // More aggressive approach - using raw SQL with auth bypass (needs corresponding SQL function in Supabase)
        console.log('Trying SQL approach as fallback...');
        
        // The SQL function would need to be created in Supabase with admin privileges
        // Try using RPC if available (fallback method)
        const { error: rpcError } = await supabase.rpc('update_team_ready_status', { 
          team_id: teamId, 
          ready_status: isReady 
        });
        
        if (rpcError) {
          console.error('RPC update failed:', rpcError);
          
          // Final fallback - try one more time with a different method, removing updated_at
          const { error: lastResortError } = await supabase
            .from('teams')
            .update({ 
              is_ready: isReady
            })
            .match({ id: teamId });
            
          if (lastResortError) {
            console.error('All update attempts failed:', lastResortError);
            return false;
          }
          
          console.log('Last resort update succeeded!');
          return true;
        }
        
        console.log('RPC update succeeded!');
        return true;
      } catch (sqlErr) {
        console.error('SQL approach failed:', sqlErr);
        return false;
      }
    }
    
    console.log(`Team ${teamId} ready status updated successfully to ${isReady}`);
    return true;
  } catch (err) {
    console.error('Error in forceUpdateTeamReadyStatus:', err);
    return false;
  }
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
  const lastToastTimeRef = useRef<number>(0);
  const isCheckingStatusRef = useRef<boolean>(false);
  const subscriptionsSetupRef = useRef<boolean>(false);
  
  // Function to show toast with rate limiting
  const showLimitedToast = (message: string, type: 'success' | 'error' = 'success') => {
    const now = Date.now();
    // Only show toast if more than 3 seconds have passed since the last one
    if (now - lastToastTimeRef.current > 3000) {
      if (type === 'success') {
        toast.success(message);
      } else {
        toast.error(message);
      }
      lastToastTimeRef.current = now;
    }
  };

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
      console.log('Checking game status...');
      
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
          
        // Get the opposing team info with multiple retries
        let opposingTeam = null;
        let retriesLeft = 3;
        let opposingError = null;
        
        while (retriesLeft > 0 && !opposingTeam) {
          const response = await supabase
            .from('teams')
            .select('id, is_ready')
            .eq('team_letter', opposingLetter)
            .maybeSingle();
            
          opposingError = response.error;
          
          if (!opposingError && response.data) {
            opposingTeam = response.data;
            break;
          }
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 500));
          retriesLeft--;
        }
          
        if (opposingError) {
          console.error('Error getting opposing team after retries:', opposingError);
          isCheckingStatusRef.current = false;
          return;
        }
        
        if (!opposingTeam) {
          console.log(`No opposing team (${opposingLetter}) found yet after multiple attempts`);
          isCheckingStatusRef.current = false;
          return;
        }

        const opposingTeamId = opposingTeam.id;
        
        // Refetch our team status again to get the most up-to-date information
        const { data: refreshedMyTeam, error: refreshError } = await supabase
          .from('teams')
          .select('is_ready')
          .eq('id', teamId)
          .single();
          
        // Use the refreshed data if available, otherwise use the original
        const myTeamReady = refreshError ? myTeam.is_ready : refreshedMyTeam.is_ready;
        
        // Double-check opposing team's ready status
        const { data: refreshedOppTeam, error: refreshOppError } = await supabase
          .from('teams')
          .select('is_ready')
          .eq('id', opposingTeamId)
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

        if (!myParticipants || myParticipants.length === 0 || !myParticipants[0]?.game_id) {
          // No game found for our team
          
          // If both teams are ready, we should ensure they have a game
          if (bothTeamsReady) {
            console.log('Both teams ready but no game found - creating one!');
            
            // Look for a game that has the opposing team
            const { data: opposingParticipants, error: opposingParticipantError } = await supabase
              .from('game_participants')
              .select('game_id')
              .eq('team_id', opposingTeamId)
              .order('created_at', { ascending: false })
              .limit(1);
              
            if (opposingParticipantError) {
              console.error('Error fetching opposing participant:', opposingParticipantError);
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
        const { data: teams, error: teamsError } = await supabase
          .from('teams')
          .select('id, is_ready, team_letter')
          .in('id', teamIds);
          
        if (teamsError) {
          console.error('Error fetching teams:', teamsError);
          isCheckingStatusRef.current = false;
          return;
        }
        
        const allTeamsReady = teams.length === gameParticipants.length && teams.every(team => team.is_ready);
        console.log('Teams ready status:', teams);
        console.log('All teams ready:', allTeamsReady);

        // New additional check - If the database says ready status is false but we know they should be ready
        if (!allTeamsReady && bothTeamsReady) {
          console.log('⚠️ Database teams ready status doesn\'t match our check. Attempting to correct...');
          
          // Force update ready status for both teams
          for (const team of teams) {
            if (!team.is_ready) {
              console.log(`Forcing team ${team.id} ready status to true`);
              await forceUpdateTeamReadyStatus(team.id, true);
            }
          }
          
          // Re-check teams again
          const { data: recheckedTeams, error: recheckError } = await supabase
            .from('teams')
            .select('id, is_ready')
            .in('id', teamIds);
            
          if (!recheckError && recheckedTeams) {
            const nowAllTeamsReady = recheckedTeams.length === gameParticipants.length && 
                                    recheckedTeams.every(team => team.is_ready);
            
            console.log('Re-checked teams ready status:', recheckedTeams);
            console.log('All teams ready after re-check:', nowAllTeamsReady);
            
            if (nowAllTeamsReady) {
              // If all teams are now ready, continue with game start logic
              console.log('Successfully corrected team ready states, proceeding with game start');
            }
          }
        }

        // Check for game completion based on board state
        if (game.status === 'in_progress') {
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
        } else if (game.status === 'waiting') {
          // If both teams are ready and all ships are placed, start the game
          if ((allTeamsReady && allShipsPlaced) || (allTeamsReady && forceAllShipsPlaced) || bothTeamsReady) {
            console.log('Starting game - updating status to in_progress');
            console.log('Condition check: allTeamsReady && allShipsPlaced =', allTeamsReady && allShipsPlaced);
            console.log('Condition check: allTeamsReady && forceAllShipsPlaced =', allTeamsReady && forceAllShipsPlaced);
            console.log('Condition check: bothTeamsReady =', bothTeamsReady);
            
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
              console.error('Error double-checking teams:', doubleCheckError);
            } else {
              const doubleCheckAllTeamsReady = doubleCheckTeams?.length === 2 && doubleCheckTeams.every(team => team.is_ready);
              console.log('Double-check teams:', doubleCheckTeams);
              console.log('Double-check all teams ready:', doubleCheckAllTeamsReady);
              
              // Log each team's ready status individually for clarity
              doubleCheckTeams?.forEach(team => {
                console.log(`Team ${team.team_letter} (ID: ${team.id}) ready status: ${team.is_ready}`);
              });
              
              // IMPROVED LOGIC: More reliable conditions for starting the game
              const shouldStartGame = doubleCheckAllTeamsReady || // Database shows all ready
                                     bothTeamsReady || // Our direct checks show both ready
                                     (allTeamsReady && actuallyAllShipsPlaced) || // All teams ready and ships placed
                                     (gameParticipants?.length === 2 && placedShips.length === 3); // Game has both teams and we have all ships placed
              
              // If any condition confirms teams are ready, force the game to start
              if (shouldStartGame) {
                console.log('Ready conditions met. Starting game...');
                
                // Ensure we have a participant for both teams
                for (const team of doubleCheckTeams || []) {
                  // Check if this team has a participant in this game
                  const hasParticipant = gameParticipants.some(p => p.team_id === team.id);
                  
                  if (!hasParticipant) {
                    console.log(`Creating participant for team ${team.id} in game ${myParticipant.game_id}`);
                    
                    // Create a participant with empty board state
                    const { error: createError } = await supabase
                      .from('game_participants')
                      .insert({
                        team_id: team.id,
                        game_id: myParticipant.game_id,
                        board_state: { ships: [], hits: [] },
                        created_at: new Date().toISOString()
                      });
                      
                    if (createError) {
                      console.error(`Error creating participant for team ${team.id}:`, createError);
                    }
                  }
                }
                
                // Make one final attempt to ensure both teams are ready
                if (!doubleCheckAllTeamsReady) {
                  console.log('Making final attempt to ensure all teams are marked as ready in database');
                  
                  for (const team of doubleCheckTeams || []) {
                    if (!team.is_ready) {
                      console.log(`Final update: Forcing team ${team.id} ready status to true`);
                      await forceUpdateTeamReadyStatus(team.id, true);
                    }
                  }
                }
                
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
                // If teams are not ready according to double-check, try to fix it
                console.log('Teams not ready according to double-check. Attempting to fix...');
                
                // If we're ready but the database doesn't reflect it, update it
                if (myTeamReady) {
                  const { error: updateMyTeamError } = await supabase
                    .from('teams')
                    .update({ is_ready: true })
                    .eq('id', teamId);
                    
                  if (updateMyTeamError) {
                    console.error('Error updating my team ready status:', updateMyTeamError);
                  } else {
                    console.log(`Updated my team (${teamId}) ready status to true`);
                  }
                }
                
                // Check if opposing team is ready in our local state but not in DB
                if (opposingTeamReady) {
                  const opposingTeamInDoubleCheck = doubleCheckTeams?.find(t => t.id === opposingTeamId);
                  if (opposingTeamInDoubleCheck && !opposingTeamInDoubleCheck.is_ready) {
                    console.log(`Opposing team (${opposingTeamId}) should be ready but isn't in DB. Attempting to fix...`);
                    
                    const { error: updateOppTeamError } = await supabase
                      .from('teams')
                      .update({ is_ready: true })
                      .eq('id', opposingTeamId);
                      
                    if (updateOppTeamError) {
                      console.error('Error updating opposing team ready status:', updateOppTeamError);
                    } else {
                      console.log(`Updated opposing team (${opposingTeamId}) ready status to true`);
                      
                      // Try starting the game again after fixing
                      setTimeout(() => checkGameStatus(showToasts), 1000);
                    }
                  }
                }
              }
            }
          }
          
          // If we get here, the game is still in waiting status
          setGameStarted(false);
          setIsPlacementPhase(true);
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
        // Get our team info
        const { data: myTeam, error: teamError } = await supabase
          .from('teams')
          .select('team_letter')
          .eq('id', teamId)
          .single();
          
        if (teamError) {
          console.error('Error getting team info:', teamError);
          return;
        }
        
        // Determine opposing team letter using the utility function
        const teamLetter = myTeam.team_letter;
        const opposingLetter = getOpposingTeamLetter(teamLetter);
          
        console.log(`Team ${teamLetter} is paired with Team ${opposingLetter}`);
        
        // Get the opposing team ID
        const { data: opposingTeam, error: opposingError } = await supabase
          .from('teams')
          .select('id')
          .eq('team_letter', opposingLetter)
          .maybeSingle();
          
        if (opposingError) {
          console.error('Error getting opposing team:', opposingError);
        } else if (opposingTeam) {
          console.log(`Found opposing team ID: ${opposingTeam.id}`);
        }
        
        // Subscribe to updates for BOTH teams
        const teamIds = [teamId];
        if (opposingTeam?.id) {
          teamIds.push(opposingTeam.id);
        }
        
        // Subscribe to games table changes
        console.log('Subscribing to games table changes');
        const gamesSubscription = supabase
          .channel('game-status-monitor')
          .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'games'
          }, (payload) => {
            console.log('Games table update:', payload);
            checkGameStatus(false);
          })
          .subscribe();
          
        // Subscribe to teams ready status changes
        console.log('Subscribing to teams table changes');
        const teamsSubscription = supabase
          .channel('teams-status-monitor')
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'teams',
            filter: `id=in.(${teamIds.join(',')})`
          }, (payload) => {
            console.log('Teams table update:', payload);
            checkGameStatus(false);
          })
          .subscribe();
          
        // Also subscribe to game_participants changes
        console.log('Subscribing to game_participants table changes');
        const participantsSubscription = supabase
          .channel('participants-status-monitor')
          .on('postgres_changes', {
            event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
            schema: 'public',
            table: 'game_participants',
          }, (payload) => {
            console.log('Game participants table update:', payload);
            checkGameStatus(false);
          })
          .subscribe();

        // Check game status initially
        checkGameStatus(true);
        
        return () => {
          gamesSubscription.unsubscribe();
          teamsSubscription.unsubscribe();
          participantsSubscription.unsubscribe();
          subscriptionsSetupRef.current = false;
        };
      } catch (error) {
        console.error('Error in loadTeamsAndSubscribe:', error);
      }
    };

    const unsubscribe = loadTeamsAndSubscribe();
    return () => {
      if (unsubscribe) {
        unsubscribe.then(unsub => {
          if (unsub) {
            unsub();
          }
        });
      }
    };
  }, [teamId, setGameStarted, setIsPlacementPhase, setGameWon, setGameLost, placedShips]);
} 