"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import {
  Inbox,
  Mail,
  StickyNote,
  Smartphone,
  Brain,
  FolderOpen,
  FileText,
  ExternalLink,
  CheckCircle2,
  Loader2,
  Plus,
} from "lucide-react";
import Link from "next/link";

interface GetClearStepProps {
  notes: string;
  onNotesChange: (notes: string) => void;
  onMarkComplete: () => void;
  saving: boolean;
}

const collectionPoints = [
  { id: "physical_inbox", label: "Physical inbox / desk / papers", icon: FolderOpen },
  { id: "email", label: "Email inboxes (personal + work)", icon: Mail },
  { id: "notes", label: "Loose notes, post-its, napkins", icon: StickyNote },
  { id: "phone", label: "Phone — voicemail, texts, photos of notes", icon: Smartphone },
  { id: "head", label: "Head — things on your mind not yet captured", icon: Brain },
  { id: "downloads", label: "Downloads folder, desktop files", icon: FileText },
];

export function GetClearStep({
  notes,
  onNotesChange,
  onMarkComplete,
  saving,
}: GetClearStepProps) {
  const [inboxCount, setInboxCount] = useState<number | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [captureText, setCaptureText] = useState("");
  const [capturing, setCapturing] = useState(false);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchInboxCount() {
      try {
        const res = await fetch("/api/inbox");
        if (res.ok) {
          const items = await res.json();
          setInboxCount(Array.isArray(items) ? items.length : 0);
        }
      } catch {
        // Silently fail — not critical
      }
      setLoadingInbox(false);
    }
    fetchInboxCount();
  }, []);

  function toggleItem(id: string) {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleCapture() {
    if (!captureText.trim() || capturing) return;
    setCapturing(true);
    try {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: captureText.trim() }),
      });
      if (res.ok) {
        toast({ title: "Captured", description: captureText.trim().slice(0, 60) });
        setCaptureText("");
        setInboxCount((prev) => (prev !== null ? prev + 1 : 1));
        setTimeout(() => captureInputRef.current?.focus(), 50);
      }
    } finally {
      setCapturing(false);
    }
  }

  const allChecked = collectionPoints.every((cp) => checkedItems[cp.id]);

  return (
    <div className="space-y-4">
      {/* Inbox status */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Inbox className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Tandem Inbox</p>
                <p className="text-sm text-muted-foreground">
                  {loadingInbox ? (
                    "Loading..."
                  ) : inboxCount === 0 ? (
                    <span className="text-green-600 dark:text-green-400">
                      Inbox is clear
                    </span>
                  ) : (
                    <>
                      {inboxCount} unprocessed item{inboxCount !== 1 ? "s" : ""}
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!loadingInbox && inboxCount !== null && inboxCount > 0 && (
                <Badge variant="destructive">{inboxCount}</Badge>
              )}
              {!loadingInbox && inboxCount === 0 && (
                <Badge
                  variant="outline"
                  className="border-green-300 text-green-700 dark:border-green-700 dark:text-green-400"
                >
                  Clear
                </Badge>
              )}
              <Link href="/inbox/process">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Process Inbox
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Collection points checklist */}
      <Card>
        <CardContent className="py-4">
          <h4 className="font-medium mb-3">Collection Points Checklist</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Have you checked all these places for loose items that need capturing?
          </p>
          <div className="space-y-3">
            {collectionPoints.map((cp) => {
              const Icon = cp.icon;
              return (
                <div key={cp.id}>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <Checkbox
                      checked={!!checkedItems[cp.id]}
                      onCheckedChange={() => toggleItem(cp.id)}
                    />
                    <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    <span
                      className={`text-sm ${
                        checkedItems[cp.id]
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      }`}
                    >
                      {cp.label}
                    </span>
                  </label>
                  {cp.id === "head" && (
                    <div className="ml-7 mt-2 flex items-center gap-2">
                      <Input
                        ref={captureInputRef}
                        value={captureText}
                        onChange={(e) => setCaptureText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleCapture();
                          }
                        }}
                        placeholder="Quick capture to inbox..."
                        maxLength={500}
                        disabled={capturing}
                        className="h-8 text-sm"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleCapture}
                        disabled={!captureText.trim() || capturing}
                        className="h-8 shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Capture
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {allChecked && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              All collection points checked
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardContent className="py-4">
          <h4 className="font-medium mb-2">Notes</h4>
          <p className="text-sm text-muted-foreground mb-3">
            Anything to note from this step? Capture any thoughts here.
          </p>
          <Textarea
            placeholder="Optional notes for this step..."
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={3}
          />
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end">
        <Button onClick={onMarkComplete} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark Complete & Continue
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
