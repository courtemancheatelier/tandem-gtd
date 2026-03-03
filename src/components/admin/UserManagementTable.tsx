"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Users, Crown, Pencil, Check, X, Plus, Ban, ChevronDown, Clock } from "lucide-react";
import { UserEditDialog, type AdminUser } from "./UserEditDialog";

const tierColors: Record<string, string> = {
  ALPHA: "border-purple-400 text-purple-600 bg-purple-50",
  BETA: "border-blue-400 text-blue-600 bg-blue-50",
  GENERAL: "border-gray-400 text-gray-600 bg-gray-50",
  WAITLIST: "border-yellow-400 text-yellow-600 bg-yellow-50",
};

function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return <span className="text-muted-foreground">-</span>;
  return (
    <Badge variant="outline" className={`text-xs ${tierColors[tier] ?? ""}`}>
      {tier}
    </Badge>
  );
}

function formatRelativeDate(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function getLoginStatus(user: AdminUser) {
  if (!user.lastLoginAt) {
    return {
      label: "Never logged in",
      variant: "destructive" as const,
      tooltip: "User was invited but has not signed in yet",
    };
  }

  const lastLogin = new Date(user.lastLoginAt);
  const daysSince = Math.floor(
    (Date.now() - lastLogin.getTime()) / 86_400_000
  );

  if (daysSince > 30) {
    return {
      label: `Inactive (${formatRelativeDate(lastLogin)})`,
      variant: "warning" as const,
      tooltip: `Last login: ${lastLogin.toLocaleDateString()} (${user.loginCount} logins total)`,
    };
  }

  return {
    label: formatRelativeDate(lastLogin),
    variant: "secondary" as const,
    tooltip: `Last login: ${lastLogin.toLocaleDateString()} (${user.loginCount} logins total)`,
  };
}

interface UserManagementTableProps {
  currentUserId: string;
  defaultDailyLimit: number;
  authMode?: "OAUTH_ONLY" | "OAUTH_AND_CREDENTIALS";
}

export function UserManagementTable({
  currentUserId,
  defaultDailyLimit,
  authMode,
}: UserManagementTableProps) {
  const { toast } = useToast();
  const [usersOpen, setUsersOpen] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    isAdmin: false,
  });

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsers(data);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  function handleEdit(user: AdminUser) {
    setEditingUser(user);
    setDialogOpen(true);
  }

  function handleUserUpdated(updatedUser: AdminUser) {
    setUsers((prev) =>
      prev.map((u) => (u.id === updatedUser.id ? updatedUser : u))
    );
  }

  function handleUserDeleted(userId: string) {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
  }

  async function createUser() {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      if (res.ok) {
        const created = await res.json();
        setUsers((prev) => [...prev, created]);
        setCreateOpen(false);
        setNewUser({ name: "", email: "", password: "", isAdmin: false });
        toast({ title: "User created", description: `${created.email} can now sign in.` });
      } else {
        const err = await res.json();
        toast({ title: "Error", description: err.error || "Failed to create user", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to create user", variant: "destructive" });
    }
    setCreating(false);
  }

  return (
    <>
      <Collapsible open={usersOpen} onOpenChange={setUsersOpen}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CollapsibleTrigger className="flex-1 text-left">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5" />
                  User Management
                  <ChevronDown className={`h-4 w-4 ml-auto text-muted-foreground transition-transform ${usersOpen ? "rotate-0" : "-rotate-90"}`} />
                </CardTitle>
                <CardDescription>
                  Manage user accounts, permissions, and AI access
                </CardDescription>
              </CollapsibleTrigger>
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="ml-4 shrink-0">
                    <Plus className="h-4 w-4 mr-1" />
                    Create User
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create User Account</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Name</Label>
                      <Input
                        value={newUser.name}
                        onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                        placeholder="Jane Doe"
                      />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        placeholder="jane@example.com"
                      />
                    </div>
                    {authMode !== "OAUTH_ONLY" && (
                      <div>
                        <Label>Password</Label>
                        <Input
                          type="password"
                          value={newUser.password}
                          onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                          placeholder="Min 6 characters"
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={newUser.isAdmin}
                        onCheckedChange={(checked) => setNewUser({ ...newUser, isAdmin: checked })}
                      />
                      <Label>Admin privileges</Label>
                    </div>
                    <Button
                      onClick={createUser}
                      disabled={!newUser.name || !newUser.email || (authMode !== "OAUTH_ONLY" && (!newUser.password || newUser.password.length < 6)) || creating}
                      className="w-full"
                    >
                      {creating ? "Creating..." : "Create User"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading users...</p>
              ) : users.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 font-medium text-muted-foreground">
                          Name
                        </th>
                        <th className="text-left py-3 px-2 font-medium text-muted-foreground">
                          Email
                        </th>
                        <th className="text-center py-3 px-2 font-medium text-muted-foreground">
                          Tier
                        </th>
                        <th className="text-left py-3 px-2 font-medium text-muted-foreground">
                          Invited By
                        </th>
                        <th className="text-center py-3 px-2 font-medium text-muted-foreground hidden md:table-cell">
                          Last Login
                        </th>
                        <th className="text-center py-3 px-2 font-medium text-muted-foreground">
                          Admin
                        </th>
                        <th className="text-center py-3 px-2 font-medium text-muted-foreground">
                          AI
                        </th>
                        <th className="text-center py-3 px-2 font-medium text-muted-foreground">
                          Usage
                        </th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => {
                        const limit = user.aiDailyLimit ?? defaultDailyLimit;
                        return (
                          <tr
                            key={user.id}
                            className="border-b last:border-0 hover:bg-muted/50"
                          >
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-2">
                                {user.name}
                                {user.id === currentUserId && (
                                  <Badge variant="outline" className="text-xs">
                                    You
                                  </Badge>
                                )}
                                {user.isDisabled && (
                                  <Badge variant="destructive" className="text-xs gap-1">
                                    <Ban className="h-3 w-3" />
                                    Disabled
                                  </Badge>
                                )}
                                {authMode === "OAUTH_ONLY" && !user.hasOAuthAccounts && (
                                  <Badge variant="destructive" className="text-xs">
                                    No OAuth
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-2 text-muted-foreground">
                              {user.email}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <TierBadge tier={user.tier} />
                            </td>
                            <td className="py-3 px-2 text-muted-foreground text-sm">
                              {user.invitedByName || "-"}
                            </td>
                            <td className="py-3 px-2 text-center hidden md:table-cell">
                              {(() => {
                                const status = getLoginStatus(user);
                                return (
                                  <Badge
                                    variant={status.variant === "warning" ? "outline" : status.variant}
                                    className={`text-xs ${
                                      status.variant === "warning"
                                        ? "border-amber-400 text-amber-600 bg-amber-50"
                                        : ""
                                    }`}
                                    title={status.tooltip}
                                  >
                                    {status.variant === "destructive" && (
                                      <Clock className="h-3 w-3 mr-1" />
                                    )}
                                    {status.label}
                                  </Badge>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-2 text-center">
                              {user.isAdmin ? (
                                <Crown className="h-4 w-4 text-amber-500 inline-block" />
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-center">
                              {user.aiEnabled ? (
                                <Badge
                                  variant="default"
                                  className="text-xs gap-1"
                                >
                                  <Check className="h-3 w-3" />
                                  Enabled
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="text-xs gap-1"
                                >
                                  <X className="h-3 w-3" />
                                  Disabled
                                </Badge>
                              )}
                            </td>
                            <td className="py-3 px-2 text-center font-mono text-xs">
                              {user.aiMessagesUsedToday}/{limit}
                            </td>
                            <td className="py-3 px-2 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(user)}
                                className="h-8 gap-1"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <UserEditDialog
        user={editingUser}
        currentUserId={currentUserId}
        authMode={authMode}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onUserUpdated={handleUserUpdated}
        onUserDeleted={handleUserDeleted}
      />
    </>
  );
}
