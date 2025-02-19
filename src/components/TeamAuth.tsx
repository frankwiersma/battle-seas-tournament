
import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TeamAuthProps {
  onTeamJoin: (teamId: string, teamLetter: string) => void;
}

const TeamAuth = ({ onTeamJoin }: TeamAuthProps) => {
  const [teamLetter, setTeamLetter] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!teamLetter.match(/^[A-Z]$/)) {
      toast.error("Please enter a single uppercase letter (A-Z)");
      return;
    }

    setLoading(true);
    try {
      // Try to insert the team
      const { data: teamData, error: insertError } = await supabase
        .from("teams")
        .insert([{ team_letter: teamLetter }])
        .select()
        .single();

      if (insertError) {
        if (insertError.code === '23505') { // Unique violation
          // Team already exists, fetch it
          const { data: existingTeam, error: fetchError } = await supabase
            .from("teams")
            .select()
            .eq("team_letter", teamLetter)
            .single();

          if (fetchError) throw fetchError;
          onTeamJoin(existingTeam.id, existingTeam.team_letter);
          toast.success(`Joined as Team ${existingTeam.team_letter}`);
        } else {
          throw insertError;
        }
      } else if (teamData) {
        onTeamJoin(teamData.id, teamData.team_letter);
        toast.success(`Joined as Team ${teamData.team_letter}`);
      }
    } catch (error) {
      console.error("Error joining team:", error);
      toast.error("Failed to join team. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 w-full max-w-md mx-auto">
      <h2 className="text-2xl font-bold text-white mb-6 text-center">Join Battle</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Input
            type="text"
            value={teamLetter}
            onChange={(e) => setTeamLetter(e.target.value.toUpperCase())}
            placeholder="Enter team letter (A-Z)"
            className="bg-white/20 text-white placeholder:text-white/50"
            maxLength={1}
            disabled={loading}
          />
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={loading}
        >
          {loading ? "Joining..." : "Join Team"}
        </Button>
      </form>
    </div>
  );
};

export default TeamAuth;
