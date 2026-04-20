"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { UsersRound, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { TeamCard, type TeamData } from "@/components/teams/TeamCard";
import { CreateTeamDialog } from "@/components/teams/CreateTeamDialog";

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [teamsEnabled, setTeamsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  const fetchTeams = useCallback(async () => {
    const res = await fetch("/api/teams");
    if (res.ok) {
      const data = await res.json();
      setTeamsEnabled(data.teamsEnabled ?? true);
      setTeams(data.teams ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  // Teams where user is ADMIN and that are not child teams (can be parents)
  const parentTeamOptions = teams
    .filter((t) => t.role === "ADMIN" && !t.parentTeamId)
    .map((t) => ({ id: t.id, name: t.name, icon: t.icon }));

  async function createTeam(data: { name: string; description?: string; icon?: string; parentTeamId?: string }) {
    setCreating(true);
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setCreateDialogOpen(false);
      toast({ title: "Team created", description: `"${data.name}" has been created.` });
      fetchTeams();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to create team", variant: "destructive" });
    }
    setCreating(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!teamsEnabled) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersRound className="h-6 w-6" />
            Teams
          </h1>
        </div>
        <Separator />
        <Card>
          <CardContent className="py-10 text-center">
            <UsersRound className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              Teams are currently disabled by the server administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersRound className="h-6 w-6" />
            Teams
          </h1>
          <p className="text-muted-foreground mt-1">
            {teams.length} team{teams.length !== 1 ? "s" : ""}
          </p>
        </div>

        <CreateTeamDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSubmit={createTeam}
          loading={creating}
          parentTeamOptions={parentTeamOptions}
        />
      </div>

      <Separator />

      {teams.length > 0 ? (
        <div className="grid gap-3">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <UsersRound className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              No teams yet. Create one to start collaborating with others!
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
