"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isDisabled: boolean;
  tier?: string;
  invitedByName?: string;
  inviteCodesCount?: number;
  aiEnabled: boolean;
  aiDailyLimit: number | null;
  aiMessagesUsedToday: number;
  createdAt: string;
  lastLoginAt: string | null;
  loginCount: number;
  hasPassword: boolean;
  hasOAuthAccounts: boolean;
  oauthProviders?: string[];
}

interface UserEditDialogProps {
  user: AdminUser | null;
  currentUserId: string;
  authMode?: "OAUTH_ONLY" | "OAUTH_AND_CREDENTIALS";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserUpdated: (user: AdminUser) => void;
  onUserDeleted?: (userId: string) => void;
}

export function UserEditDialog({
  user,
  currentUserId,
  authMode,
  open,
  onOpenChange,
  onUserUpdated,
  onUserDeleted,
}: UserEditDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const [tier, setTier] = useState("GENERAL");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [dailyLimit, setDailyLimit] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);
  const [removingPassword, setRemovingPassword] = useState(false);
  const [initialized, setInitialized] = useState<string | null>(null);

  // Re-initialize form when user changes
  if (user && initialized !== user.id) {
    setIsAdmin(user.isAdmin);
    setIsDisabled(user.isDisabled);
    setTier(user.tier ?? "GENERAL");
    setAiEnabled(user.aiEnabled);
    setDailyLimit(user.aiDailyLimit != null ? String(user.aiDailyLimit) : "");
    setNewPassword("");
    setInitialized(user.id);
  }

  if (!user) return null;

  const isSelf = user.id === currentUserId;

  async function handleDelete() {
    if (!user || !onUserDeleted) return;
    if (!window.confirm(`Are you sure you want to delete ${user.name}? This will permanently remove all their data.`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to delete user" }));
        throw new Error(err.error || "Failed to delete user");
      }
      onUserDeleted(user.id);
      onOpenChange(false);
      toast({ title: "User deleted", description: `${user.name} has been removed` });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to delete user",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  async function handleSetPassword() {
    if (!user || newPassword.length < 6) return;
    setSettingPassword(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to set password");
      }
      const updatedUser = await res.json();
      onUserUpdated(updatedUser);
      setNewPassword("");
      toast({ title: "Password updated", description: `Password has been set for ${user.name}` });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to set password",
        variant: "destructive",
      });
    } finally {
      setSettingPassword(false);
    }
  }

  async function handleRemovePassword() {
    if (!user) return;
    if (!window.confirm(`Remove password for ${user.name}? They will only be able to sign in via OAuth.`)) return;
    setRemovingPassword(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removePassword: true }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to remove password");
      }
      const updatedUser = await res.json();
      onUserUpdated(updatedUser);
      toast({ title: "Password removed", description: `${user.name} can now only sign in via OAuth` });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to remove password",
        variant: "destructive",
      });
    } finally {
      setRemovingPassword(false);
    }
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);

    const updates: Record<string, unknown> = {};

    if (!isSelf && isAdmin !== user.isAdmin) {
      updates.isAdmin = isAdmin;
    }
    if (!isSelf && isDisabled !== user.isDisabled) {
      updates.isDisabled = isDisabled;
    }
    if (tier !== (user.tier ?? "GENERAL")) {
      updates.tier = tier;
    }
    if (aiEnabled !== user.aiEnabled) {
      updates.aiEnabled = aiEnabled;
    }

    const limitValue = dailyLimit.trim();
    const currentLimit = user.aiDailyLimit != null ? String(user.aiDailyLimit) : "";
    if (limitValue !== currentLimit) {
      if (limitValue === "") {
        updates.aiDailyLimit = null;
      } else {
        const num = Number(limitValue);
        if (isNaN(num) || num <= 0) {
          toast({
            title: "Invalid limit",
            description: "Daily limit must be a positive number or empty for default",
            variant: "destructive",
          });
          setSaving(false);
          return;
        }
        updates.aiDailyLimit = num;
      }
    }

    if (Object.keys(updates).length === 0) {
      onOpenChange(false);
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update user");
      }

      const updatedUser = await res.json();
      onUserUpdated(updatedUser);
      onOpenChange(false);
      toast({ title: "User updated", description: `${user.name} has been updated` });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to update user",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User: {user.name}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Admin toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="edit-is-admin">Admin</Label>
              <p className="text-sm text-muted-foreground">
                {isSelf
                  ? "You cannot modify your own admin status"
                  : "Grant admin privileges to this user"}
              </p>
            </div>
            <Switch
              id="edit-is-admin"
              checked={isAdmin}
              disabled={saving || isSelf}
              onCheckedChange={setIsAdmin}
            />
          </div>

          {/* Tier selector */}
          <div className="space-y-2">
            <Label>User Tier</Label>
            <Select value={tier} onValueChange={setTier} disabled={saving}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALPHA">Alpha</SelectItem>
                <SelectItem value="BETA">Beta</SelectItem>
                <SelectItem value="GENERAL">General</SelectItem>
                <SelectItem value="WAITLIST">Waitlist</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Disable account toggle — hidden for self */}
          {!isSelf && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="edit-is-disabled">Account Disabled</Label>
                <p className="text-sm text-muted-foreground">
                  Prevent this user from signing in
                </p>
              </div>
              <Switch
                id="edit-is-disabled"
                checked={isDisabled}
                disabled={saving}
                onCheckedChange={setIsDisabled}
              />
            </div>
          )}

          {/* AI enabled toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="edit-ai-enabled">AI Enabled</Label>
              <p className="text-sm text-muted-foreground">
                Allow this user to use AI features
              </p>
            </div>
            <Switch
              id="edit-ai-enabled"
              checked={aiEnabled}
              disabled={saving}
              onCheckedChange={setAiEnabled}
            />
          </div>

          {/* Daily limit */}
          <div className="space-y-2">
            <Label htmlFor="edit-daily-limit">
              Daily AI Message Limit
            </Label>
            <Input
              id="edit-daily-limit"
              type="number"
              min="1"
              placeholder="Use server default"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              disabled={saving}
              className="w-48"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use the server default
            </p>
          </div>

          {/* Password management — hidden for self and in OAUTH_ONLY mode */}
          {!isSelf && authMode === "OAUTH_ONLY" && (
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-1">
                <Label>Linked OAuth Providers</Label>
                {user.oauthProviders && user.oauthProviders.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {user.oauthProviders.map((provider) => (
                      <Badge key={provider} variant="secondary" className="text-xs capitalize">
                        {provider === "azure-ad" ? "Microsoft" : provider}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-destructive">
                    No OAuth providers linked — this user cannot sign in.
                  </p>
                )}
              </div>
            </div>
          )}
          {!isSelf && authMode !== "OAUTH_ONLY" && (
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-1">
                <Label>Password</Label>
                <p className="text-sm text-muted-foreground">
                  {user.hasPassword ? "Has password" : "No password — OAuth only"}
                </p>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    type="password"
                    placeholder="New password (min 6 chars)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={saving || settingPassword}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleSetPassword}
                  disabled={saving || settingPassword || newPassword.length < 6}
                >
                  {settingPassword ? "Setting..." : "Set Password"}
                </Button>
              </div>
              {user.hasPassword && user.hasOAuthAccounts && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRemovePassword}
                  disabled={saving || removingPassword}
                >
                  {removingPassword ? "Removing..." : "Remove Password"}
                </Button>
              )}
            </div>
          )}
        </div>

        {!isSelf && onUserDeleted && (
          <div className="border-t pt-4">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving || deleting}
              className="w-full"
            >
              {deleting ? "Deleting..." : "Delete User"}
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving || deleting}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || deleting}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
