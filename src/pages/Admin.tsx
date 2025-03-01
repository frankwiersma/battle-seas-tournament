import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Team = {
  id: string;
  team_letter: string;
  is_ready: boolean;
  created_at: string;
};

type Game = {
  id: string;
  status: "waiting" | "in_progress" | "completed";
  current_team_id: string | null;
  winner_team_id: string | null;
  created_at: string;
  game_participants?: GameParticipant[];
};

type Ship = {
  positions: Array<{x: number, y: number}>;
  [key: string]: any;
};

type BoardState = {
  ships: Ship[];
  hits: Array<{x: number, y: number}>;
  hits_landed?: Array<{x: number, y: number}>;
  [key: string]: any;
};

type GameParticipant = {
  id: string;
  game_id: string;
  team_id: string;
  board_state: BoardState;
  created_at: string;
  team?: Team;
};

const Admin = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<'unknown' | 'connected' | 'error'>('unknown');
  const [adminPassword, setAdminPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const refreshIntervalRef = useRef<number | null>(null);
  const lastRefreshTimeRef = useRef<Date>(new Date());
  const fetchAttemptsRef = useRef(0);
  
  // Check if Supabase is working
  const checkSupabaseConnection = async () => {
    try {
      // Simple ping to check connection
      const { data, error } = await supabase.from('teams').select('id').limit(1);
      
      if (error) {
        console.error('Supabase connection error:', error);
        setSupabaseStatus('error');
        return false;
      }
      
      console.log('Supabase connection successful');
      setSupabaseStatus('connected');
      return true;
    } catch (error) {
      console.error('Supabase connection exception:', error);
      setSupabaseStatus('error');
      return false;
    }
  };
  
  // Execute connection check on mount
  useEffect(() => {
    checkSupabaseConnection();
  }, []);
  
  // Complete reset of app state and forced reload
  const resetAppState = () => {
    // Clear all state
    setTeams([]);
    setGames([]);
    setLoading(false);
    setLoadingError(null);
    setSupabaseStatus('unknown');
    
    // Clear interval if any
    if (refreshIntervalRef.current) {
      window.clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
    
    // Reset counters
    fetchAttemptsRef.current = 0;
    lastRefreshTimeRef.current = new Date();
    
    // Reload page after small delay
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };
  
  // Simple admin authentication
  const handleAdminLogin = () => {
    // This is a simple approach. In a real app, you'd want a proper auth system.
    if (adminPasswordInput === "admin123") { // In production, use a proper auth system
      setIsAuthenticated(true);
      setAdminPassword(adminPasswordInput);
      localStorage.setItem("battleSeasAdminAuth", "true");
      toast.success("Admin access granted");
      
      // Force check connection after login
      checkSupabaseConnection().then(isConnected => {
        if (isConnected) {
          fetchData();
        }
      });
    } else {
      toast.error("Invalid admin password");
    }
  };
  
  useEffect(() => {
    // Check if admin is already authenticated
    if (localStorage.getItem("battleSeasAdminAuth") === "true") {
      setIsAuthenticated(true);
    }
  }, []);
  
  // Simplified fetch data function based on the previous working version
  const fetchData = async () => {
    if (!isAuthenticated) return;
    
    setLoading(true);
    try {
      console.log("Fetching data...");
      
      // Fetch teams
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('*')
        .order('team_letter', { ascending: true });
        
      if (teamsError) {
        throw teamsError;
      }
      
      // Fetch games with participants and related teams
      const { data: gamesData, error: gamesError } = await supabase
        .from('games')
        .select(`
          *,
          game_participants (
            *,
            team:teams (*)
          )
        `)
        .order('created_at', { ascending: false });
        
      if (gamesError) {
        throw gamesError;
      }
      
      setTeams(teamsData || []);
      setGames(gamesData || []);
      setLoadingError(null);
      fetchAttemptsRef.current = 0;
      
      console.log("Data fetched successfully:", teamsData?.length, "teams and", gamesData?.length, "games");
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoadingError(error instanceof Error ? error.message : "Unknown error fetching data");
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
      lastRefreshTimeRef.current = new Date();
    }
  };
  
  // Set up auto-refresh with safety checks
  useEffect(() => {
    if (!isAuthenticated) return;
    
    // Initial data fetch
    fetchData();
    
    if (autoRefreshEnabled) {
      // Setup interval for auto-refresh
      refreshIntervalRef.current = window.setInterval(() => {
        fetchData();
      }, 3000); // Every 3 seconds instead of 1 second
    }
    
    // Clean up interval when component unmounts or dependencies change
    return () => {
      if (refreshIntervalRef.current !== null) {
        window.clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [isAuthenticated, autoRefreshEnabled]);
  
  // Set up realtime subscriptions
  useEffect(() => {
    if (!isAuthenticated) return;
    
    try {
      const teamsSubscription = supabase
        .channel('admin-teams-changes')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'teams' 
        }, () => {
          fetchData();
        })
        .subscribe();
        
      const gamesSubscription = supabase
        .channel('admin-games-changes')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'games' 
        }, () => {
          fetchData();
        })
        .subscribe();
        
      const participantsSubscription = supabase
        .channel('admin-participants-changes')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'game_participants' 
        }, () => {
          fetchData();
        })
        .subscribe();
      
      return () => {
        try {
          teamsSubscription.unsubscribe();
          gamesSubscription.unsubscribe();
          participantsSubscription.unsubscribe();
        } catch (error) {
          console.error("Error unsubscribing from channels:", error);
        }
      };
    } catch (error) {
      console.error("Error setting up realtime subscriptions:", error);
      toast.error("Error setting up realtime updates");
    }
  }, [isAuthenticated]);
  
  // Admin functions
  const startGame = async (gameId: string) => {
    try {
      // Update game status to in_progress
      const { error } = await supabase
        .from('games')
        .update({ status: 'in_progress' })
        .eq('id', gameId);
        
      if (error) throw error;
      
      toast.success("Game started successfully");
    } catch (error) {
      console.error('Error starting game:', error);
      toast.error("Failed to start game");
    }
  };
  
  const resetGame = async (gameId: string) => {
    try {
      // Reset game status to waiting
      const { error: gameError } = await supabase
        .from('games')
        .update({ 
          status: 'waiting',
          winner_team_id: null,
          current_team_id: null
        })
        .eq('id', gameId);
        
      if (gameError) throw gameError;
      
      // Find participants in this game
      const { data: participants, error: participantsError } = await supabase
        .from('game_participants')
        .select('team_id')
        .eq('game_id', gameId);
        
      if (participantsError) throw participantsError;
      
      // Reset team ready status
      for (const participant of participants || []) {
        const { error: teamError } = await supabase
          .from('teams')
          .update({ is_ready: false })
          .eq('id', participant.team_id);
          
        if (teamError) {
          console.error(`Error resetting team ${participant.team_id}:`, teamError);
        }
        
        // Reset board state
        const { error: boardError } = await supabase
          .from('game_participants')
          .update({ board_state: { ships: [], hits: [] } })
          .eq('game_id', gameId)
          .eq('team_id', participant.team_id);
          
        if (boardError) {
          console.error(`Error resetting board for team ${participant.team_id}:`, boardError);
        }
      }
      
      toast.success("Game reset successfully");
    } catch (error) {
      console.error('Error resetting game:', error);
      toast.error("Failed to reset game");
    }
  };
  
  const createNewGame = async () => {
    try {
      // Create a new game
      const { data: newGame, error: createError } = await supabase
        .from('games')
        .insert({
          status: 'waiting',
          created_at: new Date().toISOString()
        })
        .select()
        .single();
        
      if (createError) throw createError;
      
      toast.success(`New game created with ID: ${newGame.id}`);
    } catch (error) {
      console.error('Error creating game:', error);
      toast.error("Failed to create new game");
    }
  };
  
  const markTeamReady = async (teamId: string, isReady: boolean) => {
    try {
      console.log(`Admin attempting to mark team ${teamId} ${isReady ? 'ready' : 'not ready'}`);
      
      // First attempt - basic update
      const { error } = await supabase
        .from('teams')
        .update({ is_ready: isReady })
        .eq('id', teamId);
        
      if (error) {
        console.error('First attempt error:', error);
        toast.error(`First attempt failed: ${error.message}`);
        
        // Second attempt - different approach
        const { error: secondError } = await supabase
          .from('teams')
          .update({ is_ready: isReady })
          .match({ id: teamId });
          
        if (secondError) {
          console.error('Second attempt error:', secondError);
          toast.error(`Second attempt failed: ${secondError.message}`);
          
          // Third attempt - RPC if available
          try {
            const { error: rpcError } = await supabase.rpc('update_team_ready_status', { 
              team_id: teamId, 
              ready_status: isReady 
            });
            
            if (rpcError) {
              console.error('RPC attempt error:', rpcError);
              toast.error(`All attempts failed, please try again`);
              return;
            }
          } catch (rpcException) {
            console.error('RPC exception:', rpcException);
            toast.error(`All attempts failed, please try again`);
            return;
          }
        }
      }
      
      // Verify the update was successful
      const { data: verifyData, error: verifyError } = await supabase
        .from('teams')
        .select('is_ready')
        .eq('id', teamId)
        .single();
      
      if (verifyError) {
        console.error('Verification error:', verifyError);
      } else if (verifyData && verifyData.is_ready !== isReady) {
        console.error(`Verification failed: expected ${isReady}, got ${verifyData.is_ready}`);
        toast.error("Status change failed verification, please check database");
        return;
      }
      
      toast.success(`Team ${isReady ? 'marked ready' : 'marked not ready'}`);
    } catch (error) {
      console.error('Error updating team ready status:', error);
      toast.error("Failed to update team ready status");
    }
  };
  
  const deleteGame = async (gameId: string) => {
    if (!confirm("Are you sure you want to delete this game? This cannot be undone.")) {
      return;
    }
    
    try {
      // First delete participants
      const { error: participantsError } = await supabase
        .from('game_participants')
        .delete()
        .eq('game_id', gameId);
        
      if (participantsError) {
        console.error('Error deleting participants:', participantsError);
      }
      
      // Then delete the game
      const { error: gameError } = await supabase
        .from('games')
        .delete()
        .eq('id', gameId);
        
      if (gameError) throw gameError;
      
      toast.success("Game deleted successfully");
    } catch (error) {
      console.error('Error deleting game:', error);
      toast.error("Failed to delete game");
    }
  };
  
  // Handle team assignment to a game
  const assignTeamToGame = async (gameId: string, teamId: string) => {
    // Check if team is already in a game
    const { data: existingParticipant, error: checkError } = await supabase
      .from('game_participants')
      .select('*')
      .eq('game_id', gameId)
      .eq('team_id', teamId)
      .maybeSingle();
      
    if (checkError) {
      console.error('Error checking existing participant:', checkError);
      toast.error("Failed to check team assignment");
      return;
    }
    
    if (existingParticipant) {
      toast.info("Team is already assigned to this game");
      return;
    }
    
    try {
      // Create participant
      const { error } = await supabase
        .from('game_participants')
        .insert({
          game_id: gameId,
          team_id: teamId,
          board_state: { ships: [], hits: [] },
          created_at: new Date().toISOString()
        });
        
      if (error) throw error;
      
      toast.success("Team assigned to game successfully");
    } catch (error) {
      console.error('Error assigning team to game:', error);
      toast.error("Failed to assign team to game");
    }
  };
  
  const forceStartGame = async (gameId: string) => {
    try {
      // Get participants for this game
      const { data: participants, error: participantsError } = await supabase
        .from('game_participants')
        .select('team_id')
        .eq('game_id', gameId);
        
      if (participantsError) {
        console.error('Error getting participants:', participantsError);
        toast.error("Error getting game participants");
        return;
      }
      
      // Force set all participants' teams to ready
      const teamUpdatePromises = participants.map(async (participant) => {
        try {
          // First attempt
          const { error } = await supabase
            .from('teams')
            .update({ is_ready: true })
            .eq('id', participant.team_id);
            
          if (error) {
            console.error(`Error marking team ${participant.team_id} ready:`, error);
            
            // Second attempt with different approach
            const { error: secondError } = await supabase
              .from('teams')
              .update({ is_ready: true })
              .match({ id: participant.team_id });
              
            if (secondError) {
              console.error(`Second attempt error for team ${participant.team_id}:`, secondError);
              return false;
            }
          }
          
          return true;
        } catch (e) {
          console.error(`Exception marking team ${participant.team_id} ready:`, e);
          return false;
        }
      });
      
      await Promise.all(teamUpdatePromises);
      
      // Force update game status to in_progress
      const { error: gameError } = await supabase
        .from('games')
        .update({ status: 'in_progress' })
        .eq('id', gameId);
        
      if (gameError) {
        console.error('Error updating game status:', gameError);
        toast.error("Error updating game status, but teams may be marked as ready");
        return;
      }
      
      toast.success("Game force started! All teams marked ready and game status updated.");
    } catch (error) {
      console.error('Error in force start:', error);
      toast.error("Failed to force start game");
    }
  };
  
  // Debug panel to show in case of issues
  const renderDebugPanel = () => {
    return (
      <div className="bg-white/10 backdrop-blur-md p-6 rounded-lg shadow-lg mt-4">
        <h2 className="text-2xl font-bold text-white mb-4">Debug Information</h2>
        
        <div className="space-y-2 text-white">
          <p>Supabase Status: <span className={
            supabaseStatus === 'connected' ? 'text-green-400' :
            supabaseStatus === 'error' ? 'text-red-400' : 'text-yellow-400'
          }>{supabaseStatus}</span></p>
          
          <p>Auto-refresh: {autoRefreshEnabled ? 'Enabled' : 'Disabled'}</p>
          <p>Last Refresh: {lastRefreshTimeRef.current.toLocaleTimeString()}</p>
          <p>Loading State: {loading ? 'Loading' : 'Not Loading'}</p>
          {loadingError && <p className="text-red-400">Error: {loadingError}</p>}
          
          <div className="mt-4">
            <button
              onClick={() => checkSupabaseConnection()}
              className="px-3 py-1 bg-blue-600 text-white rounded mr-2"
            >
              Test Connection
            </button>
            <button
              onClick={() => fetchData()}
              className="px-3 py-1 bg-green-600 text-white rounded mr-2"
            >
              Force Fetch
            </button>
            <button
              onClick={resetAppState}
              className="px-3 py-1 bg-red-600 text-white rounded"
            >
              Reset Everything
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary to-secondary p-4 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-md p-8 rounded-lg shadow-lg w-full max-w-md">
          <h1 className="text-3xl font-bold text-white mb-6 text-center">Admin Login</h1>
          <div className="space-y-4">
            <div>
              <label className="block text-white mb-2">Admin Password</label>
              <input
                type="password"
                value={adminPasswordInput}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                className="w-full p-2 rounded border bg-white/5 text-white border-white/20"
                placeholder="Enter admin password"
              />
            </div>
            <button
              onClick={handleAdminLogin}
              className="w-full p-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary to-secondary p-4">
      <div className="max-w-[1800px] mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Battle Seas Admin Panel</h1>
          <p className="text-white/80">
            Manage games and teams
            <span className="ml-2 text-xs bg-blue-500/30 px-2 py-1 rounded">
              {autoRefreshEnabled ? 'Auto-refresh: ON' : 'Auto-refresh: OFF'}
            </span>
            <span className="ml-2 text-xs bg-blue-500/30 px-2 py-1 rounded">
              Last updated: {lastRefreshTimeRef.current.toLocaleTimeString()}
            </span>
            <span className="ml-2 text-xs bg-blue-500/30 px-2 py-1 rounded">
              Status: {supabaseStatus}
            </span>
          </p>
          <div className="flex justify-center gap-2 mt-2">
            <button
              onClick={() => {
                localStorage.removeItem("battleSeasAdminAuth");
                setIsAuthenticated(false);
                toast.success("Logged out successfully");
              }}
              className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              Logout
            </button>
            <button
              onClick={() => {
                setAutoRefreshEnabled(!autoRefreshEnabled);
                
                if (!autoRefreshEnabled) {
                  // Restart refresh interval
                  refreshIntervalRef.current = window.setInterval(() => {
                    fetchData();
                  }, 3000);
                  toast.success("Auto-refresh enabled");
                } else {
                  // Clear interval
                  if (refreshIntervalRef.current !== null) {
                    window.clearInterval(refreshIntervalRef.current);
                    refreshIntervalRef.current = null;
                  }
                  toast.success("Auto-refresh disabled");
                }
              }}
              className={`px-3 py-1 text-white rounded transition-colors ${
                autoRefreshEnabled ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-500 hover:bg-green-600'
              }`}
            >
              {autoRefreshEnabled ? 'Disable Auto-refresh' : 'Enable Auto-refresh'}
            </button>
            {!autoRefreshEnabled && (
              <button
                onClick={() => {
                  fetchData();
                }}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Refresh Now
              </button>
            )}
            <button
              onClick={resetAppState}
              className="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
            >
              Reset App
            </button>
          </div>
        </header>
        
        {/* Show debug panel if there are errors */}
        {(loadingError || supabaseStatus === 'error') && renderDebugPanel()}
        
        {loading ? (
          <div className="text-center text-white text-2xl p-8">Loading data...</div>
        ) : loadingError ? (
          <div className="text-center p-8">
            <p className="text-red-400 text-xl mb-4">Error loading data: {loadingError}</p>
            <button
              onClick={() => fetchData()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : teams.length === 0 && games.length === 0 ? (
          <div className="text-center text-white p-8">
            <p className="mb-4 text-xl">No data available. Either there are no teams or games yet, or there was an error retrieving them.</p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => fetchData()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Reload Data
              </button>
              <button
                onClick={createNewGame}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                Create First Game
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white/10 backdrop-blur-md p-6 rounded-lg shadow-lg">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">Teams</h2>
                <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs">
                  {teams.length} Teams
                </span>
              </div>
              
              <div className="space-y-4 max-h-[500px] overflow-y-auto p-2">
                {teams.map(team => (
                  <div key={team.id} className="bg-white/5 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-xl font-semibold text-white">Team {team.team_letter}</h3>
                        <p className="text-white/70 text-sm">ID: {team.id}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span 
                          className={`px-2 py-1 rounded-full text-xs ${
                            team.is_ready ? 'bg-green-500 text-white' : 'bg-yellow-500 text-white'
                          }`}
                        >
                          {team.is_ready ? 'Ready' : 'Not Ready'}
                        </span>
                        <button
                          onClick={() => markTeamReady(team.id, !team.is_ready)}
                          className={`px-3 py-1 rounded text-white text-xs ${
                            team.is_ready ? 'bg-yellow-600' : 'bg-green-600'
                          }`}
                        >
                          {team.is_ready ? 'Mark Not Ready' : 'Mark Ready'}
                        </button>
                      </div>
                    </div>
                    
                    {selectedGame && (
                      <button
                        onClick={() => assignTeamToGame(selectedGame.id, team.id)}
                        className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                      >
                        Assign to Selected Game
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Games section remains the same */}
            <div className="bg-white/10 backdrop-blur-md p-6 rounded-lg shadow-lg">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">Games</h2>
                <button
                  onClick={createNewGame}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                >
                  Create New Game
                </button>
              </div>
              
              <div className="space-y-6 max-h-[500px] overflow-y-auto p-2">
                {games.map(game => (
                  <div 
                    key={game.id} 
                    className={`bg-white/5 p-4 rounded-lg ${
                      selectedGame?.id === game.id ? 'border-2 border-blue-500' : ''
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div>
                        <h3 className="text-xl font-semibold text-white">
                          Game {game.id.substring(0, 8)}...
                        </h3>
                        <p className="text-white/70 text-sm">
                          Created: {new Date(game.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span 
                          className={`px-2 py-1 rounded-full text-xs ${
                            game.status === 'waiting' ? 'bg-yellow-500 text-white' :
                            game.status === 'in_progress' ? 'bg-blue-500 text-white' :
                            'bg-green-500 text-white'
                          }`}
                        >
                          {game.status === 'waiting' ? 'Waiting' :
                           game.status === 'in_progress' ? 'In Progress' :
                           'Completed'}
                        </span>
                        <button
                          onClick={() => setSelectedGame(selectedGame?.id === game.id ? null : game)}
                          className={`px-3 py-1 rounded text-white text-xs ${
                            selectedGame?.id === game.id ? 'bg-gray-600' : 'bg-blue-600'
                          }`}
                        >
                          {selectedGame?.id === game.id ? 'Deselect' : 'Select'}
                        </button>
                      </div>
                    </div>
                    
                    {/* Game Summary - Battle Stats */}
                    {game.status === 'in_progress' && game.game_participants && game.game_participants.length >= 2 && (
                      <div className="mb-3 p-2 bg-white/5 rounded-lg">
                        <h4 className="text-white text-sm font-semibold mb-1">Battle Summary</h4>
                        <div className="grid grid-cols-2 gap-x-4 text-xs">
                          {game.game_participants.map(participant => {
                            // Calculate scores
                            const ownShips = participant.board_state?.ships || [];
                            const hitsTaken = participant.board_state?.hits || [];
                            const hitsLanded = participant.board_state?.hits_landed || [];
                            
                            // Find opponent
                            const opponent = game.game_participants?.find(p => p.team_id !== participant.team_id);
                            const opponentShips = opponent?.board_state?.ships || [];
                            
                            // Calculate ships sunk
                            let shipsLost = 0;
                            ownShips.forEach(ship => {
                              const shipPositions = ship.positions || [];
                              const allPositionsHit = shipPositions.length > 0 && shipPositions.every(pos => 
                                hitsTaken.some(hit => hit.x === pos.x && hit.y === pos.y)
                              );
                              if (allPositionsHit) shipsLost++;
                            });
                            
                            // Calculate ships sunk by this team
                            let shipsSunk = 0;
                            opponentShips.forEach(ship => {
                              const shipPositions = ship.positions || [];
                              const allPositionsHit = shipPositions.length > 0 && shipPositions.every(pos => 
                                hitsLanded.some(hit => hit.x === pos.x && hit.y === pos.y)
                              );
                              if (allPositionsHit) shipsSunk++;
                            });
                            
                            const hitAccuracy = hitsLanded.length > 0 
                              ? Math.round((hitsLanded.length / (hitsLanded.length + (opponent?.board_state?.ships.flat().length || 0) - shipsSunk)) * 100) 
                              : 0;
                              
                            return (
                              <div key={participant.id} className="flex flex-col">
                                <span className="font-medium text-white">Team {participant.team?.team_letter}</span>
                                <div className="flex justify-between text-white/70">
                                  <span>Hit Accuracy:</span>
                                  <span className={hitAccuracy > 50 ? "text-green-400" : "text-yellow-400"}>
                                    {hitAccuracy}%
                                  </span>
                                </div>
                                <div className="flex justify-between text-white/70">
                                  <span>Battle Score:</span>
                                  <span className="text-blue-400">{shipsSunk * 100 + hitsLanded.length * 10}</span>
                                </div>
                                <div className="mt-1 w-full bg-gray-700 rounded-full h-1">
                                  <div 
                                    className={`h-1 rounded-full ${shipsLost > shipsSunk ? "bg-red-500" : "bg-green-500"}`}
                                    style={{ width: `${Math.min(100, (shipsSunk / (opponentShips.length || 1)) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-2 space-y-2">
                      <h4 className="text-white font-medium">Participants:</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {game.game_participants && game.game_participants.length > 0 ? (
                          game.game_participants.map(participant => (
                            <div key={participant.id} className="bg-white/5 p-2 rounded">
                              <p className="text-white">
                                Team {participant.team?.team_letter || '?'}
                              </p>
                              <p className="text-white/70 text-xs">
                                Ships: {participant.board_state?.ships?.length || 0}
                                {participant.team?.is_ready && (
                                  <span className="ml-2 px-1 py-0.5 bg-green-500 text-white rounded-full text-xs">
                                    Ready
                                  </span>
                                )}
                              </p>
                              
                              {/* Team Score Information */}
                              <div className="mt-1 pt-1 border-t border-white/10">
                                <p className="text-white/70 text-xs flex justify-between">
                                  <span>Hits landed: <span className="text-green-400">{participant.board_state?.hits_landed?.length || 0}</span></span>
                                  <span>Hits taken: <span className="text-red-400">{participant.board_state?.hits?.length || 0}</span></span>
                                </p>
                                <p className="text-white/70 text-xs flex justify-between">
                                  <span>Ships sunk: <span className="text-green-400">
                                    {(() => {
                                      // Calculate ships sunk by this team
                                      const opponentShips = game.game_participants?.find(p => 
                                        p.team_id !== participant.team_id
                                      )?.board_state?.ships || [];
                                      
                                      const hitsLanded = participant.board_state?.hits_landed || [];
                                      
                                      // Count ships that have all positions hit
                                      let sunkCount = 0;
                                      opponentShips.forEach(ship => {
                                        const shipPositions = ship.positions || [];
                                        const allPositionsHit = shipPositions.every(pos => 
                                          hitsLanded.some(hit => 
                                            hit.x === pos.x && hit.y === pos.y
                                          )
                                        );
                                        if (allPositionsHit && shipPositions.length > 0) {
                                          sunkCount++;
                                        }
                                      });
                                      
                                      return sunkCount;
                                    })()}
                                  </span></span>
                                  <span>Ships lost: <span className="text-red-400">
                                    {(() => {
                                      // Calculate ships lost by this team
                                      const ownShips = participant.board_state?.ships || [];
                                      const hitsTaken = participant.board_state?.hits || [];
                                      
                                      // Count ships that have all positions hit
                                      let lostCount = 0;
                                      ownShips.forEach(ship => {
                                        const shipPositions = ship.positions || [];
                                        const allPositionsHit = shipPositions.every(pos => 
                                          hitsTaken.some(hit => 
                                            hit.x === pos.x && hit.y === pos.y
                                          )
                                        );
                                        if (allPositionsHit && shipPositions.length > 0) {
                                          lostCount++;
                                        }
                                      });
                                      
                                      return lostCount;
                                    })()}
                                  </span></span>
                                </p>
                                {game.status === 'in_progress' && (
                                  <div className="mt-1 w-full bg-gray-700 rounded-full h-1.5">
                                    <div 
                                      className="bg-blue-500 h-1.5 rounded-full" 
                                      style={{ 
                                        width: `${((participant.board_state?.hits_landed?.length || 0) / 
                                                  ((participant.board_state?.hits_landed?.length || 0) + 
                                                  (participant.board_state?.hits?.length || 0) + 1)) * 100}%` 
                                      }}
                                    ></div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-white/70 col-span-2">No participants yet</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-4 flex space-x-2">
                      {game.status === 'waiting' && (
                        <>
                          <button
                            onClick={() => startGame(game.id)}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                            disabled={
                              !game.game_participants || 
                              game.game_participants.length < 2 ||
                              !game.game_participants.every(p => p.team?.is_ready)
                            }
                          >
                            Start Game
                          </button>
                          
                          <button
                            onClick={() => forceStartGame(game.id)}
                            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                            disabled={
                              !game.game_participants || 
                              game.game_participants.length < 2
                            }
                          >
                            Force Start Game
                          </button>
                        </>
                      )}
                      
                      <button
                        onClick={() => resetGame(game.id)}
                        className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
                      >
                        Reset Game
                      </button>
                      
                      <button
                        onClick={() => deleteGame(game.id)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                      >
                        Delete Game
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin; 