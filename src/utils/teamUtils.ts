import { supabase } from "@/integrations/supabase/client";

/**
 * Utility functions for working with teams
 */

/**
 * Get the team letter from the team ID
 * @param teamId The ID of the team
 * @returns Promise that resolves with the team letter, or null if not found
 */
export const getTeamLetterFromId = async (teamId: string): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('team_letter')
      .eq('id', teamId)
      .single();
      
    if (error || !data) {
      console.error('Error getting team letter:', error);
      return null;
    }
    
    return data.team_letter;
  } catch (error) {
    console.error('Exception getting team letter:', error);
    return null;
  }
};

/**
 * Get the opposing team letter based on a team's letter
 * Teams are paired as A-B, C-D, E-F, etc.
 * @param letter The team letter
 * @returns The opposing team letter
 */
export const getOpposingTeamLetter = (letter: string): string => {
  // Handle pairs: A-B, C-D, E-F, G-H, I-J, K-L, M-N, O-P, etc.
  const letterCode = letter.charCodeAt(0);
  if (letterCode % 2 === 1) { // A, C, E, G, I, etc. (odd ASCII values)
    return String.fromCharCode(letterCode + 1); // Return B, D, F, H, J, etc.
  } else { // B, D, F, H, J, etc. (even ASCII values)
    return String.fromCharCode(letterCode - 1); // Return A, C, E, G, I, etc.
  }
};

/**
 * Get the opposing team ID based on a team's ID
 * @param teamId The team ID
 * @returns Promise that resolves with the opposing team ID, or null if not found
 */
export const getOpposingTeamId = async (teamId: string): Promise<string | null> => {
  try {
    // First get the team letter
    const teamLetter = await getTeamLetterFromId(teamId);
    if (!teamLetter) return null;
    
    // Get the opposing team letter
    const opposingLetter = getOpposingTeamLetter(teamLetter);
    
    // Get the opposing team ID
    const { data, error } = await supabase
      .from('teams')
      .select('id')
      .eq('team_letter', opposingLetter)
      .maybeSingle();
      
    if (error || !data) {
      console.error('Error getting opposing team ID:', error);
      return null;
    }
    
    return data.id;
  } catch (error) {
    console.error('Exception getting opposing team ID:', error);
    return null;
  }
}; 