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
      // First get the current game participant to find the game_id
      const { data: myParticipant } = await supabase
        .from('game_participants')
        .select('game_id, board_state')
        .eq('team_id', teamId)
        .single();

      if (!myParticipant?.game_id) return;

      // Get both participants for this specific game
      const { data: participants } = await supabase
        .from('game_participants')
        .select('board_state, team_id')
        .eq('game_id', myParticipant.game_id);
      
      // Check if both teams exist and have placed all their ships
      const allShipsPlaced = participants?.length === 2 && participants.every(participant => {
        const boardState = participant.board_state as unknown as BoardState;
        return boardState?.ships?.length === 3;
      });

      // Get teams ready status for the participants in this game
      const { data: teams } = await supabase
        .from('teams')
        .select('is_ready, id')
        .in('id', participants?.map(p => p.team_id) || []);

      // Get game status
      const { data: game } = await supabase
        .from('games')
        .select('status')
        .eq('id', myParticipant.game_id)
        .single();
      
      console.log('Current game status:', {
        teams,
        allShipsPlaced,
        gameStatus: game?.status
      });

      if (game?.status === 'in_progress' || 
          (teams?.length === 2 && teams.every(team => team.is_ready) && allShipsPlaced)) {
        console.log('Game is in progress or ready to start!');
        setGameStarted(true);
        setIsPlacementPhase(false);
      }
    };

    // Check initial state
    checkGameStatus();

    return () => {
      supabase.removeChannel(teamsChannel);
      supabase.removeChannel(gamesChannel);
    };
  }, [teamId]);

  // Subscribe to game updates
  useEffect(() => {
    if (!teamId) return;

    // Subscribe to game_participants changes
    const subscription = supabase
      .channel('game-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_participants',
        },
        (payload) => {
          console.log('Game update received:', payload);
          loadInitialState();  // This is causing the repeated requests
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [teamId]);

  // Add initial state loading to useGamePhase
  useEffect(() => {
    if (!teamId) return;

    const loadInitialState = async () => {
      try {
        // First get the current game participant
        const { data: participant } = await supabase
          .from('game_participants')
          .select('game_id')
          .eq('team_id', teamId)
          .single();

        if (!participant?.game_id) return;

        // Then get the game with all participants
        const { data: game } = await supabase
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
          .eq('id', participant.game_id)
          .single();

        if (!game?.game_participants) return;

        const participants = game.game_participants;
        const myParticipant = participants.find(p => p.team_id === teamId);
        const enemyParticipant = participants.find(p => p.team_id !== teamId);

        if (myParticipant && enemyParticipant) {
          const myBoardState = myParticipant.board_state as unknown as BoardState;
          const enemyBoardState = enemyParticipant.board_state as unknown as BoardState;

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

          // Check if game is in progress
          if (myHits.length > 0 || enemyHits.length > 0) {
            setGameStarted(true);
            setIsPlacementPhase(false);
          }

          // Check if game is won
          if (mySunkShips === 3) {
            setGameWon(true);
          }
        }
      } catch (error) {
        console.error('Error loading initial game state:', error);
      }
    };

    loadInitialState();
  }, [teamId]);

  const checkGameStart = async () => {
    try {
      console.log('Starting checkGameStart...');
      
      // Check if all ships are placed first
      const { data: participant } = await supabase
        .from('game_participants')
        .select('board_state')
        .eq('team_id', teamId)
        .single();
      
      const boardState = participant?.board_state as unknown as BoardState;
      if (!boardState?.ships || boardState.ships.length !== 3) {
        toast.error("Please place all ships before declaring ready!");
        return;
      }
      
      // Update team ready status
      await supabase
        .from('teams')
        .update({ is_ready: true })
        .eq('id', teamId);
      
      console.log('Team ready status updated');

      // First check for any existing game that's waiting for players
      const { data: existingGames, error: fetchError } = await supabase
        .from('games')
        .select(`
          id,
          status,
          game_participants (
            team_id
          )
        `)
        .eq('status', 'waiting')
        .order('created_at', { ascending: false });

      console.log('Existing games check:', { existingGames, fetchError });

      let gameId;

      if (existingGames && existingGames.length > 0) {
        // Find a game that doesn't already have this team and has only one participant
        const availableGame = existingGames.find(game => 
          game.game_participants.length === 1 && 
          !game.game_participants.some(p => p.team_id === teamId)
        );

        if (availableGame) {
          // Join existing game
          gameId = availableGame.id;
          console.log('Joining existing game:', gameId);
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
          throw createError;
        }

        if (!newGame) {
          throw new Error('Failed to create new game');
        }

        gameId = newGame.id;
        console.log('Created new game:', gameId);
      }

      // Save initial board state and link to game
      const initialBoardState = {
        ships: placedShips.map(ship => ({
          id: ship.id,
          positions: ship.positions.map(pos => ({ x: pos.x, y: pos.y }))
        })),
        hits: []
      };

      // First, check if we're already a participant in this game
      const { data: existingParticipant } = await supabase
        .from('game_participants')
        .select('*')
        .eq('team_id', teamId)
        .maybeSingle();

      if (existingParticipant) {
        // Update existing participant
        console.log('Updating existing participant');
        await supabase
          .from('game_participants')
          .update({
            game_id: gameId,
            board_state: initialBoardState,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingParticipant.id);
      } else {
        // Create new participant
        console.log('Creating new participant');
        await supabase
          .from('game_participants')
          .insert({
            team_id: teamId,
            game_id: gameId,
            board_state: initialBoardState,
            created_at: new Date().toISOString()
          });
      }

      // Check if both teams are ready
      const { data: participants } = await supabase
        .from('game_participants')
        .select('team_id, board_state')
        .eq('game_id', gameId);

      if (participants && participants.length === 2 && 
          participants.every(p => p.board_state?.ships?.length === 3)) {
        // Both teams have joined and placed all ships, update game status to in_progress
        await supabase
          .from('games')
          .update({ 
            status: 'in_progress',
            updated_at: new Date().toISOString()
          })
          .eq('id', gameId);

        setGameStarted(true);
        setIsPlacementPhase(false);
        console.log('Game started:', gameId);
      }
    } catch (error) {
      console.error('Error in checkGameStart:', error);
      throw error;
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
    gameWon
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
