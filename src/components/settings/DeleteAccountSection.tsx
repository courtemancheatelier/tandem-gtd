"use client";

import * as React from "react";
import { signOut, useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { AlertTriangle, Loader2 } from "lucide-react";

export function DeleteAccountSection() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [confirmEmail, setConfirmEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const userEmail = session?.user?.email ?? "";
  const emailMatches =
    confirmEmail.toLowerCase() === userEmail.toLowerCase() && confirmEmail !== "";

  const handleDelete = async () => {
    if (!emailMatches) return;

    setLoading(true);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete account");
      }

      localStorage.clear();
      signOut({ callbackUrl: "/login?status=deleted" });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete account";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </CardTitle>
        <CardDescription>
          Permanently delete your account and all associated data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setConfirmEmail(""); setLoading(false); } }}>
          <DialogTrigger asChild>
            <Button variant="destructive">Delete My Account</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Delete Account
              </DialogTitle>
              <DialogDescription>
                This action is permanent and cannot be undone. The following data
                will be deleted:
              </DialogDescription>
            </DialogHeader>

            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 my-2">
              <li>All tasks, projects, and inbox items</li>
              <li>Goals, areas, and horizon notes</li>
              <li>Wiki articles and versions</li>
              <li>Contexts, waiting-for items, and reviews</li>
              <li>API tokens and OAuth connections</li>
              <li>Team memberships (teams you created will persist)</li>
            </ul>

            <div className="space-y-2">
              <Label htmlFor="confirm-email">
                Type <span className="font-mono font-semibold">{userEmail}</span> to
                confirm
              </Label>
              <Input
                id="confirm-email"
                type="email"
                placeholder="Enter your email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={!emailMatches || loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? "Deleting..." : "Delete My Account"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
