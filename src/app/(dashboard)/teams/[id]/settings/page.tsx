"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, ArrowLeft, Trash2 } from "lucide-react";
import { TeamForm } from "@/components/teams/TeamForm";
import { TeamIcon } from "@/components/teams/team-icons";
import { TeamMemberList, type TeamMemberData } from "@/components/teams/TeamMemberList";
import { AddMemberDialog } from "@/components/teams/AddMemberDialog";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface TeamSettings {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  members: TeamMemberData[];
}

export default function TeamSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;
  const { data: session } = useSession();
  const currentUserId = session?.user?.id || "";

  const [team, setTeam] = useState<TeamSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const { toast } = useToast();

  const fetchTeam = useCallback(async () => {
    const res = await fetch(`/api/teams/${teamId}`);
    if (res.ok) {
      setTeam(await res.json());
    } else {
      router.push("/teams");
    }
    setLoading(false);
  }, [teamId, router]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const isAdmin = team?.members.some(
    (m) => m.user.id === currentUserId && m.role === "ADMIN"
  );

  // Redirect non-admins
  useEffect(() => {
    if (!loading && team && !isAdmin) {
      router.push(`/teams/${teamId}`);
    }
  }, [loading, team, isAdmin, router, teamId]);

  async function updateTeamInfo(data: { name: string; description?: string; icon?: string }) {
    setSaving(true);
    const res = await fetch(`/api/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      toast({ title: "Team updated", description: "Settings have been saved." });
      fetchTeam();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to update", variant: "destructive" });
    }
    setSaving(false);
  }

  async function addMember(data: { email: string; role: string; label?: string }) {
    setAddingMember(true);
    const res = await fetch(`/api/teams/${teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setAddMemberOpen(false);
      toast({ title: "Member added" });
      fetchTeam();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to add member", variant: "destructive" });
    }
    setAddingMember(false);
  }

  async function handleRoleChange(userId: string, role: string) {
    const res = await fetch(`/api/teams/${teamId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      fetchTeam();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to update role", variant: "destructive" });
    }
  }

  async function handleRemoveMember(userId: string) {
    const member = team?.members.find((m) => m.user.id === userId);
    if (!confirm(`Remove ${member?.user.name} from the team?`)) return;

    const res = await fetch(`/api/teams/${teamId}/members/${userId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast({ title: "Member removed" });
      fetchTeam();
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to remove member", variant: "destructive" });
    }
  }

  async function deleteTeam() {
    if (!confirm("Are you sure you want to delete this team? Projects will become personal.")) return;

    const res = await fetch(`/api/teams/${teamId}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Team deleted" });
      router.push("/teams");
    } else {
      const err = await res.json();
      toast({ title: "Error", description: err.error || "Failed to delete team", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!team || !isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/teams/${teamId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">
          <span className="inline-flex items-center gap-2"><TeamIcon icon={team.icon} className="h-5 w-5" />{team.name} — Settings</span>
        </h1>
      </div>

      <Separator />

      {/* Team Info */}
      <Card>
        <CardHeader>
          <CardTitle>Team Information</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamForm
            initialName={team.name}
            initialDescription={team.description || ""}
            initialIcon={team.icon || ""}
            onSubmit={updateTeamInfo}
            onCancel={() => router.push(`/teams/${teamId}`)}
            submitLabel="Save Changes"
            loading={saving}
          />
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Members ({team.members.length})</CardTitle>
            <AddMemberDialog
              open={addMemberOpen}
              onOpenChange={setAddMemberOpen}
              onSubmit={addMember}
              loading={addingMember}
            />
          </div>
        </CardHeader>
        <CardContent>
          <TeamMemberList
            members={team.members}
            isAdmin={true}
            currentUserId={currentUserId}
            onRoleChange={handleRoleChange}
            onRemove={handleRemoveMember}
          />
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Deleting this team will unlink all projects (they become personal).
            This cannot be undone.
          </p>
          <Button variant="destructive" onClick={deleteTeam}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Team
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
