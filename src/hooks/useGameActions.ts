import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PlacedShip } from "@/types/game";
import { getOpposingTeamId, getOpposingTeamLetter } from "@/utils/teamUtils";

/**
 * Hook for game actions like starting a game, marking ready, etc.
 */
export function useGameActions(
  teamId: string | null,
  placedShips: PlacedShip[],
  currentGameId: string | null,
  setCurrentGameId: (id: string | null) => void
) {
  /**
   * Check if the game can start and mark the team as ready
   */
  const checkGameStart = async () => {
    try {
      console.log('Starting checkGameStart...');
      
      // Check if all ships are placed first
      if (placedShips.length !== 3) {
        toast.error("Please place all ships before declaring ready!");
        return;
      }
      
      if (!teamId) {
        console.error('No team ID provided');
        toast.error("Team authentication error!");
        return;
      }
      
      // First get this team's information to determine the opposing team
      const { data: myTeam, error: teamError } = await supabase
        .from('teams')
        .select('team_letter, is_ready')
        .eq('id', teamId)
        .single();
        
      if (teamError) {
        console.error('Error getting team information:', teamError);
        toast.error("Failed to get team information!");
        return;
      }
      
      // Use utility function to get opposing team letter
      const teamLetter = myTeam.team_letter;
      const opposingLetter = getOpposingTeamLetter(teamLetter);
        
      console.log(`Team ${teamLetter} is paired with Team ${opposingLetter}`);
      
      // Get the opposing team ID
      const { data: opposingTeam, error: opposingError } = await supabase
        .from('teams')
        .select('id, is_ready')
        .eq('team_letter', opposingLetter)
        .maybeSingle();
        
      if (opposingError) {
        console.error('Error getting opposing team information:', opposingError);
      }
      
      const opposingTeamId = opposingTeam?.id;
      const opposingTeamReady = opposingTeam?.is_ready || false;
      console.log('Opposing team ID:', opposingTeamId, 'is ready:', opposingTeamReady);
      
      // If team is already ready, no need to update
      if (myTeam.is_ready) {
        console.log('Team is already marked as ready');
      } else {
        // Update this team's ready status
        const { error: updateError } = await supabase
          .from('teams')
          .update({ is_ready: true })
          .eq('id', teamId);
        
        if (updateError) {
          console.error('Error updating team ready status:', updateError);
          toast.error("Failed to update team status!");
          return;
        }
        
        console.log('Team ready status updated for team ID:', teamId);
      }
      
      // Find or create a game for these two teams
      let gameId = currentGameId;
      
      // If we don't have a current game ID, check if there's already a game
      if (!gameId) {
        // Find existing game involving either team
        let existingGame;
        
        if (opposingTeamId) {
          // First check for games with existing participants from both teams
          const { data: games, error: gamesError } = await supabase
            .from('games')
            .select('id, status')
            .order('created_at', { ascending: false });
            
          if (gamesError) {
            console.error('Error finding existing games:', gamesError);
          } else if (games && games.length > 0) {
            console.log('Found potential games:', games);
            
            // For each game, check if it has participants from either team
            for (const game of games) {
              const { data: participants, error: participantsError } = await supabase
                .from('game_participants')
                .select('team_id')
                .eq('game_id', game.id);
                
              if (participantsError) {
                console.error(`Error getting participants for game ${game.id}:`, participantsError);
                continue;
              }
              
              const teamIds = participants?.map(p => p.team_id) || [];
              const hasMyTeam = teamIds.includes(teamId);
              const hasOpposingTeam = opposingTeamId ? teamIds.includes(opposingTeamId) : false;
              
              if (hasMyTeam || hasOpposingTeam) {
                existingGame = game;
                console.log(`Found existing game ${game.id} with one of our teams`);
                break;
              }
            }
          }
        }
        
        if (existingGame) {
          gameId = existingGame.id;
          console.log(`Using existing game: ${gameId}`);
        } else {
          // Create a new game
          console.log('Creating new game...');
          const { data: newGame, error: createError } = await supabase
            .from('games')
            .insert({
              status: 'waiting',
              current_team_id: teamId,
              created_at: new Date().toISOString()
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
      }
      
      // Prepare the board state
      const initialBoardState = {
        ships: placedShips.map(ship => ({
          id: ship.id,
          positions: ship.positions.map(pos => ({ x: pos.x, y: pos.y }))
        })),
        hits: []
      };
      
      // Check if we already have a participant for this team in this game
      const { data: existingParticipant, error: participantError } = await supabase
        .from('game_participants')
        .select('id, board_state')
        .eq('team_id', teamId)
        .eq('game_id', gameId)
        .maybeSingle();
        
      if (participantError && participantError.code !== 'PGRST116') {
        console.error('Error checking for existing participant:', participantError);
      }
      
      if (existingParticipant) {
        // Update existing participant
        console.log(`Updating existing participant ${existingParticipant.id}`);
        
        // Preserve existing hits if any
        const updatedBoardState = {
          ships: initialBoardState.ships,
          hits: existingParticipant.board_state?.hits || []
        };
        
        const { error: updateError } = await supabase
          .from('game_participants')
          .update({
            board_state: updatedBoardState,
          })
          .eq('game_id', gameId)
          .eq('team_id', teamId);
          
        if (updateError) {
          console.error('Error updating participant:', updateError);
        }
      } else {
        // Create new participant
        console.log(`Creating new participant for team ${teamId} in game ${gameId}`);
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
          toast.error("Failed to join game!");
          return;
        }
      }
      
      // Check if we should add the opposing team as a participant too
      if (opposingTeamId) {
        const { data: opposingParticipant, error: oppParticipantError } = await supabase
          .from('game_participants')
          .select('id')
          .eq('team_id', opposingTeamId)
          .eq('game_id', gameId)
          .maybeSingle();
          
        if (oppParticipantError && oppParticipantError.code !== 'PGRST116') {
          console.error('Error checking for opposing participant:', oppParticipantError);
        }
        
        if (!opposingParticipant) {
          // Add opposing team as a participant with empty board state
          console.log(`Adding opposing team ${opposingTeamId} to game ${gameId}`);
          const { error: createOppError } = await supabase
            .from('game_participants')
            .insert({
              team_id: opposingTeamId,
              game_id: gameId,
              board_state: { ships: [], hits: [] },
              created_at: new Date().toISOString()
            });
            
          if (createOppError) {
            console.error('Error creating opposing participant:', createOppError);
          } else {
            console.log(`Successfully added opposing team to game ${gameId}`);
          }
        }
      }
      
      // Check if both teams are ready to start the game
      console.log('Checking if both teams are ready...');
      
      // Re-check both teams' ready status
      const { data: updatedMyTeam, error: myUpdateError } = await supabase
        .from('teams')
        .select('is_ready')
        .eq('id', teamId)
        .single();
        
      if (myUpdateError) {
        console.error('Error getting updated team status:', myUpdateError);
      }
      
      const { data: updatedOpposingTeam, error: oppUpdateError } = opposingTeamId ? 
        await supabase
          .from('teams')
          .select('is_ready')
          .eq('id', opposingTeamId)
          .single() : 
        { data: null, error: null };
        
      if (oppUpdateError) {
        console.error('Error getting updated opposing team status:', oppUpdateError);
      }
      
      const myTeamReady = updatedMyTeam?.is_ready || false;
      const oppTeamReady = updatedOpposingTeam?.is_ready || false;
      
      console.log(`Updated status - My team ready: ${myTeamReady}, Opposing team ready: ${oppTeamReady}`);
      
      if (myTeamReady && oppTeamReady) {
        console.log('Both teams are ready, updating game status to in_progress');
        
        // Make sure both teams are participants in the game
        const { data: allParticipants, error: allParticipantsError } = await supabase
          .from('game_participants')
          .select('team_id')
          .eq('game_id', gameId);
          
        if (allParticipantsError) {
          console.error('Error checking all participants:', allParticipantsError);
        } else {
          const participantTeamIds = allParticipants?.map(p => p.team_id) || [];
          console.log('Current participants team IDs:', participantTeamIds);
          
          const hasMyTeam = participantTeamIds.includes(teamId);
          const hasOpposingTeam = opposingTeamId ? participantTeamIds.includes(opposingTeamId) : false;
          
          // Add any missing participants
          if (!hasMyTeam) {
            console.log(`Adding my team ${teamId} to game ${gameId}`);
            const { error: addMyTeamError } = await supabase
              .from('game_participants')
              .insert({
                team_id: teamId,
                game_id: gameId,
                board_state: initialBoardState,
                created_at: new Date().toISOString()
              });
              
            if (addMyTeamError) {
              console.error('Error adding my team as participant:', addMyTeamError);
            }
          }
          
          if (opposingTeamId && !hasOpposingTeam) {
            console.log(`Adding opposing team ${opposingTeamId} to game ${gameId}`);
            const { error: addOppTeamError } = await supabase
              .from('game_participants')
              .insert({
                team_id: opposingTeamId,
                game_id: gameId,
                board_state: { ships: [], hits: [] },
                created_at: new Date().toISOString()
              });
              
            if (addOppTeamError) {
              console.error('Error adding opposing team as participant:', addOppTeamError);
            }
          }
        }
        
        // Update the game status
        const { error: updateError } = await supabase
          .from('games')
          .update({
            status: 'in_progress',
            current_team_id: teamId
          })
          .eq('id', gameId);
          
        if (updateError) {
          console.error('Error updating game status:', updateError);
          return;
        }
        
        console.log('Game status updated to in_progress');
        toast.success("Game started! Both teams are ready.");
      } else {
        console.log('Not all teams are ready yet');
        toast.success("Ready for battle! Waiting for opponent...");
      }
    } catch (error) {
      console.error('Error in checkGameStart:', error);
      toast.error("An error occurred while starting the game");
    }
  };

  return {
    checkGameStart
  };
} 