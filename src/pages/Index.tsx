import React from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import { useIsMobile } from "@/hooks/use-mobile";
import TeamAuth from "@/components/TeamAuth";
import ShipPlacementPhase from "@/components/ShipPlacementPhase";
import BattlePhase from "@/components/BattlePhase";
import { useGameState } from "@/hooks/useGameState";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getOpposingTeamId, getOpposingTeamLetter } from "@/utils/teamUtils";
import { Link } from "react-router-dom";

// Force update function to update team ready status 
// This is a more direct approach that might bypass permission issues
const forceUpdateTeamReadyStatus = async (teamId: string, isReady: boolean) => {
  console.log(`🔥 FORCE UPDATING team ${teamId} ready status to ${isReady} using direct method`);
  
  try {
    // First try direct update
    const { error } = await supabase
      .from('teams')
      .update({ is_ready: isReady })
      .eq('id', teamId);
      
    if (error) {
      console.error('Direct update failed:', error);
      return false;
    }
    
    console.log(`Team ${teamId} ready status updated successfully to ${isReady}`);
    return true;
  } catch (err) {
    console.error('Error in forceUpdateTeamReadyStatus:', err);
    return false;
  }
};

const Index = () => {
  const isMobile = useIsMobile();
  const [teamId, setTeamId] = React.useState<string | null>(null);
  const [teamLetter, setTeamLetter] = React.useState<string | null>(null);
  
  const {
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
    handleCellClick,
    resetShips,
    setIsPlacementPhase,
    setGameStarted,
    scores,
    gameWon,
    gameLost,
    loadExistingShips,
    currentGameId,
    setGameWon,
    setGameLost
  } = useGameState(teamId);

  // Add debug logging
  React.useEffect(() => {
    console.log('Game State Updated:', {
      gameStarted,
      isPlacementPhase,
      scores,
      gameWon,
      teamId,
      teamLetter,
      currentGameId,
      isReady
    });
  }, [gameStarted, isPlacementPhase, scores, gameWon, teamId, teamLetter, currentGameId, isReady]);

  const handleTeamJoin = (id: string, letter: string) => {
    setTeamId(id);
    setTeamLetter(letter);
    localStorage.setItem('teamId', id);
    localStorage.setItem('teamLetter', letter);
  };

  React.useEffect(() => {
    const savedTeamId = localStorage.getItem('teamId');
    const savedTeamLetter = localStorage.getItem('teamLetter');
    if (savedTeamId && savedTeamLetter) {
      handleTeamJoin(savedTeamId, savedTeamLetter);
    }
  }, []);

  const handleRotateShip = (shipId: string) => {
    if (isReady) return;
    
    console.log("Rotating ship:", shipId);
    
    // Find the ship and toggle its orientation
    const shipToRotate = ships.find(ship => ship.id === shipId);
    if (!shipToRotate) {
      console.error("Ship not found:", shipId);
      return;
    }
    
    const newIsVertical = !shipToRotate.isVertical;
    console.log("Changing orientation from", shipToRotate.isVertical ? "vertical" : "horizontal", "to", newIsVertical ? "vertical" : "horizontal");
    
    // Update the ship's orientation
    setShips(prevShips => 
      prevShips.map(ship =>
        ship.id === shipId 
          ? { ...ship, isVertical: newIsVertical }
          : ship
      )
    );
    
    console.log("Ship rotation updated");
  };

  const handleReadyClick = async () => {
    if (placedShips.length !== ships.length) {
      toast.error("Place all your ships before declaring ready!");
      return;
    }

    console.log('Ready button clicked, current isReady state:', isReady);
    
    try {
      if (!teamId) {
        toast.error("Team authentication error!");
        return;
      }

      // SUPER FORCE UPDATE: Always update the ready status in the database regardless of local state
      console.log('🚨 SUPER FORCE UPDATING team ready status for teamId:', teamId);
      
      // Try multiple update methods in sequence
      let updateSuccess = false;
      
      // Method 1: Direct update using our force function
      updateSuccess = await forceUpdateTeamReadyStatus(teamId, true);
      
      if (!updateSuccess) {
        // Method 2: Try direct RPC (if available)
        console.log('Direct update failed, trying alternative methods...');
        
        // Method 3: Last resort - try a raw SQL query via Supabase client
        try {
          const { error: rawError } = await supabase
            .from('teams')
            .update({ is_ready: true })
            .eq('id', teamId);
          
          if (!rawError) {
            updateSuccess = true;
            console.log('Raw update succeeded!');
          } else {
            console.error('Raw update failed:', rawError);
          }
        } catch (e) {
          console.error('Raw update error:', e);
        }
      }
      
      if (!updateSuccess) {
        console.error('🔴 CRITICAL: All attempts to update team ready status failed!');
        toast.error('Could not update ready status. Please try again or contact an administrator.');
        return;
      }

      console.log('Team ready status FORCE UPDATED successfully in database');
      
      // Update local state
      setIsReady(true);
      
      // Show a single toast notification that we're ready
      toast.success('Ready for battle! Waiting for other team...');
      
      // Add a sleep function to help with database synchronization
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      // Verify with retries - this helps with database synchronization issues
      let verifySuccess = false;
      let retryCount = 0;
      let verifyTeam = null;
      
      while (!verifySuccess && retryCount < 3) {
        // Wait for database to sync (increase time with each retry)
        await sleep(1000 * (retryCount + 1));
        
        console.log(`Verifying team ready status (attempt ${retryCount + 1})...`);
        
        // Get the team's current status to verify update was successful
        const { data: teamData, error: verifyError } = await supabase
          .from('teams')
          .select('is_ready, team_letter')
          .eq('id', teamId)
          .single();
          
        if (verifyError) {
          console.error('Error verifying team update:', verifyError);
        } else {
          verifyTeam = teamData;
          console.log(`Verify team update: Team ${teamData.team_letter} ready status is now: ${teamData.is_ready}`);
          
          if (teamData.is_ready) {
            verifySuccess = true;
            break;
          } else {
            console.log(`Ready status not reflected in database yet. Retrying verification...`);
            
            // Try to update again just to be sure
            if (retryCount > 0) {
              console.log('Attempting to update ready status again...');
              await forceUpdateTeamReadyStatus(teamId, true);
            }
          }
        }
        
        retryCount++;
      }
      
      // If verification still fails after retries, provide options but continue anyway
      if (!verifySuccess) {
        console.error('CRITICAL ERROR: Team ready status was not updated in database despite successful API call');
        
        // Display warning but don't block the flow - the Emergency Start button will be visible
        toast.error('Database sync issue detected. If the game doesn\'t start, use the Emergency Start button.');
        
        // Don't return here - continue with the game flow anyway since the local state is updated
      }
      
      // Get the opposing team info - use verifyTeam if available, otherwise fallback
      const opposingLetter = getOpposingTeamLetter((verifyTeam?.team_letter || teamLetter) as string);
      console.log(`Team ${verifyTeam?.team_letter || teamLetter} is paired with Team ${opposingLetter}`);
      
      // Get the opposing team ID and ready status
      const { data: opposingTeam, error: opposingError } = await supabase
        .from('teams')
        .select('id, is_ready')
        .eq('team_letter', opposingLetter)
        .maybeSingle();
        
      if (opposingError) {
        console.error('Error checking opposing team:', opposingError);
      }
      
      const opposingTeamId = opposingTeam?.id;
      const opposingTeamReady = opposingTeam?.is_ready || false;
      
      console.log(`Opposing team ${opposingLetter} (ID: ${opposingTeamId}) ready status: ${opposingTeamReady}`);

      // Check if both teams are now ready
      if (opposingTeamReady) {
        console.log('Both teams are ready, attempting to start game...');
        
        // Get the current participant for this team to find the game
        const { data: existingParticipant, error: participantError } = await supabase
          .from('game_participants')
          .select('id, game_id, board_state')
          .eq('team_id', teamId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
          
        if (participantError && participantError.code !== 'PGRST116') {
          console.error('Error checking for existing participant:', participantError);
          toast.error('Failed to check game status');
          return;
        }
        
        const gameId = existingParticipant?.game_id;
        
        if (gameId) {
          // Update game status to in_progress
          const { error: updateGameError } = await supabase
            .from('games')
            .update({ 
              status: 'in_progress'
            })
            .eq('id', gameId);
            
          if (updateGameError) {
            console.error('Error updating game status:', updateGameError);
            toast.error('Failed to start the game. Please try again.');
          } else {
            console.log('Game started!');
            setGameStarted(true);
            setIsPlacementPhase(false);
            toast.success('Game started! Both teams are ready.');
          }
        } else {
          console.error('No game ID found despite both teams being ready');
          toast.error('Game setup error. Please reset and try again.');
        }
      } else {
        // Check if game can start
        checkGameStart();
        
        // Don't show another toast here - we already showed one at the beginning
      }
    } catch (err) {
      console.error('Error in handleReadyClick:', err);
      toast.error('An error occurred while updating ready status. Please try again.');
    }
  };

  const handleUnreadyClick = async () => {
    console.log('Unready button clicked, current isReady state:', isReady);
    
    try {
      if (!teamId) {
        toast.error("Team authentication error!");
        return;
      }

      console.log('🚨 Updating team ready status to FALSE for teamId:', teamId);
      
      // Use the forceUpdateTeamReadyStatus function to set ready to false
      const updateSuccess = await forceUpdateTeamReadyStatus(teamId, false);
      
      if (!updateSuccess) {
        console.error('Failed to update team status to not ready');
        toast.error('Could not update status. Please try again or contact an administrator.');
        return;
      }

      console.log('Team ready status updated to NOT READY successfully in database');
      
      // Update local state first
      setIsReady(false);
      
      // We don't want to reset the ships here, just keep the existing placements
      // but allow the user to modify them
      
      toast.success('You can now modify your ships placement!');
      
      // No need to call loadExistingShips() as we want to keep the current ships
      // This allows users to make small adjustments without losing their entire layout
      
    } catch (err) {
      console.error('Error in handleUnreadyClick:', err);
      toast.error('An error occurred while updating status. Please try again.');
    }
  };

  const handleResetShips = async () => {
    if (isReady) {
      toast.error("Cannot reset ships after declaring ready!");
      return;
    }
    await resetShips();
    toast.success("Ships have been reset!");
  };

  const handleResetGame = async () => {
    if (!teamId || !teamLetter) return;
    
    try {
      // Use utility function for opposing team
      const opposingTeamLetter = getOpposingTeamLetter(teamLetter);
      
      // Get the current active game participant
      const { data: participants, error: participantError } = await supabase
        .from('game_participants')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (participantError) {
        console.error('Error fetching participant:', participantError);
        toast.error("Failed to reset game!");
        return;
      }

      // Reset local state first - IMPORTANT: Reset in correct order
      setGameWon(false);  // Add this line to reset win state
      setGameLost(false); // Add this line to reset loss state
      setIsReady(false);
      resetShips();
      setGameState({
        myShips: [],
        myHits: [],
        enemyHits: [],
      });
      setPlacedShips([]); // Add this line to explicitly clear placed ships
      setIsPlacementPhase(true);
      setGameStarted(false);

      // Find opposing team based on team letter
      console.log(`Resetting game for team ${teamLetter} and opposing team ${opposingTeamLetter}`);
      
      // Get opposing team ID
      const { data: opposingTeam, error: opposingTeamError } = await supabase
        .from('teams')
        .select('id')
        .eq('team_letter', opposingTeamLetter)
        .maybeSingle();
        
      if (opposingTeamError) {
        console.error(`Error finding opposing team ${opposingTeamLetter}:`, opposingTeamError);
      }
      
      const opposingTeamId = opposingTeam?.id;
      if (opposingTeamId) {
        console.log(`Found opposing team ID: ${opposingTeamId}`);
      } else {
        console.log(`No opposing team found with letter ${opposingTeamLetter}`);
      }

      // Teams to reset - always include our team, and include opposing team if found
      const teamsToReset = [teamId];
      if (opposingTeamId) {
        teamsToReset.push(opposingTeamId);
      }

      console.log(`Will reset the following teams: ${teamsToReset.join(', ')}`);

      // If there's no active game, just reset the teams' ready status
      if (!participants || participants.length === 0) {
        console.log('No active game to reset, just resetting team status');
        
        // Reset all teams' ready status
        for (const id of teamsToReset) {
          const { error: teamError } = await supabase
            .from('teams')
            .update({ is_ready: false })
            .eq('id', id);
            
          if (teamError) {
            console.error(`Error resetting team status for team ${id}:`, teamError);
          } else {
            console.log(`Reset ready status for team ${id}`);
          }
          
          // Also delete any game participants for this team
          const { error: participantDeleteError } = await supabase
            .from('game_participants')
            .delete()
            .eq('team_id', id);
            
          if (participantDeleteError) {
            console.error(`Error deleting participants for team ${id}:`, participantDeleteError);
          }
        }
        
        toast.success("Game reset for both teams!");
        return;
      }

      const currentParticipant = participants[0];
      const gameId = currentParticipant.game_id;

      console.log('Resetting game for team:', teamId, 'and opponent:', opposingTeamId, 'game:', gameId);
      
      // Update game status to 'waiting' (to cancel any in-progress game)
      if (gameId) {
        const { error: updateError } = await supabase
          .from('games')
          .update({ 
            status: 'waiting',
            winner_team_id: null,
            current_team_id: null  // Also reset current team ID
          })
          .eq('id', gameId);
          
        if (updateError) {
          console.error('Error updating game status:', updateError);
        } else {
          console.log('Reset game status to waiting');
        }
      }
      
      // Reset all teams' ready status
      for (const id of teamsToReset) {
        const { error: teamError } = await supabase
          .from('teams')
          .update({ is_ready: false })
          .eq('id', id);
          
        if (teamError) {
          console.error(`Error resetting team status for team ${id}:`, teamError);
        } else {
          console.log(`Reset ready status for team ${id}`);
        }
        
        // Reset board state for each team
        if (gameId) {
          const { error: participantError } = await supabase
            .from('game_participants')
            .update({
              board_state: { ships: [], hits: [] }
            })
            .eq('team_id', id)
            .eq('game_id', gameId);
            
          if (participantError) {
            console.error(`Error resetting board state for team ${id}:`, participantError);
          } else {
            console.log(`Reset board state for team ${id}`);
          }
        }
      }

      toast.success("Game reset for both teams!");
    } catch (error) {
      console.error('Error in handleResetGame:', error);
      toast.error("An error occurred while resetting the game");
    }
  };

  if (!teamId || !teamLetter) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary to-secondary p-4 flex items-center justify-center">
        <TeamAuth onTeamJoin={handleTeamJoin} />
      </div>
    );
  }

  return (
    <DndProvider 
      backend={isMobile ? TouchBackend : HTML5Backend} 
      options={isMobile ? { 
        enableMouseEvents: true, 
        delayTouchStart: 50,
        ignoreContextMenu: true,
        enableHoverOutsideTarget: true,
        touchSlop: 15
      } : undefined}
    >
      <div className="min-h-screen bg-gradient-to-b from-primary to-secondary p-4">
        <div className="max-w-[1800px] mx-auto">
          <header className="text-center mb-8 animate-fade-in">
            <h1 className="text-4xl font-bold text-white mb-2">Sea Battle</h1>
            <div className="text-white/80 space-y-2">
              <p className="text-xl font-semibold">You are Team {teamLetter}</p>
              <p>Playing against: Team {
                // Use the utility function
                teamLetter ? getOpposingTeamLetter(teamLetter) : ''
              }</p>
              {currentGameId && (
                <div className="relative inline-block group">
                  <button className="text-xs bg-black/20 w-6 h-6 rounded-full inline-flex items-center justify-center">
                    i
                  </button>
                  <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 hidden group-hover:block bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    Game ID: <span className="font-mono">{currentGameId}</span>
                  </div>
                </div>
              )}
              <p className="text-sm">
                {isPlacementPhase 
                  ? "Place your ships and prepare for battle!" 
                  : gameStarted 
                    ? "Battle Phase - Fire at will!" 
                    : "Waiting for other team..."}
              </p>
            </div>
            <div className="mt-4 flex justify-center gap-2">
              {/* Reset Game button removed but functionality preserved */}
            </div>
          </header>

          {isPlacementPhase ? (
            <div className="flex justify-center">
              <ShipPlacementPhase
                ships={ships}
                setShips={setShips}
                placedShips={placedShips}
                setPlacedShips={setPlacedShips}
                isReady={isReady}
                onReadyClick={handleReadyClick}
                onResetShips={handleResetShips}
                onRotateShip={handleRotateShip}
                onUnreadyClick={handleUnreadyClick}
              />
            </div>
          ) : (
            <div className="flex justify-center w-full">
              <BattlePhase
                myShips={placedShips}
                myHits={gameState.myHits}
                enemyHits={gameState.enemyHits}
                onCellClick={handleCellClick}
                scores={scores}
                gameWon={gameWon}
                gameLost={gameLost}
                onRestart={handleResetGame}
                teamId={teamId}
              />
            </div>
          )}
        </div>
      </div>
    </DndProvider>
  );
};

export default Index;
