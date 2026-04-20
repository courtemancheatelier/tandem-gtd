"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Mountain,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  Pencil,
} from "lucide-react";

interface StepProps {
  mode: "setup" | "review";
  notes: string;
  onNotesChange: (val: string) => void;
  onMarkComplete: () => void;
  onBack?: () => void;
  saving: boolean;
}

interface HorizonNoteData {
  id: string;
  level: string;
  title: string;
  content: string;
  updatedAt: string;
}

export function VisionStep({
  mode,
  notes,
  onNotesChange,
  onMarkComplete,
  onBack,
  saving,
}: StepProps) {
  const [existingNote, setExistingNote] = useState<HorizonNoteData | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNote() {
      try {
        const res = await fetch("/api/horizon-notes");
        if (res.ok) {
          const allNotes: HorizonNoteData[] = await res.json();
          const visionNote = allNotes.find((n) => n.level === "HORIZON_4");
          if (visionNote) {
            setExistingNote(visionNote);
            setNoteContent(visionNote.content);
          }
        }
      } catch {
        // Silently fail
      }
      setLoading(false);
    }
    fetchNote();
  }, []);

  async function saveNote() {
    if (!noteContent.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch("/api/horizon-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: "HORIZON_4",
          title: "",
          content: noteContent.trim(),
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setExistingNote(saved);
        setEditing(false);
      }
    } catch {
      // Silently fail
    }
    setSavingNote(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasNote = !!existingNote?.content;
  const showEditor = mode === "setup" ? !hasNote || editing : editing;

  return (
    <div className="space-y-4">
      {/* Intro */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Mountain className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <h4 className="font-medium">
                40,000ft — Vision
              </h4>
              {mode === "setup" ? (
                <div className="text-sm text-muted-foreground mt-2 space-y-2">
                  <p>
                    Your vision is what life looks like in 3-5 years if things go well.
                    Be specific enough to feel it, loose enough to stay open.
                  </p>
                  <p className="font-medium text-foreground">Prompts to consider:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Where are you living? Who&apos;s around you?</li>
                    <li>What does a typical Tuesday look like?</li>
                    <li>What are you known for professionally?</li>
                    <li>What does your relationship with health, money, creativity, and people look like?</li>
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  Does your 3-5 year vision still feel right? What&apos;s changed since you last looked at this?
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Existing note in review mode */}
      {mode === "review" && hasNote && !editing && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  You wrote this{" "}
                  {existingNote.updatedAt
                    ? new Date(existingNote.updatedAt).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "previously"}
                  :
                </p>
                <blockquote className="border-l-2 border-muted-foreground/30 pl-3 text-sm italic whitespace-pre-wrap">
                  {existingNote.content}
                </blockquote>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Editor */}
      {showEditor && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <h4 className="text-sm font-medium">
              {hasNote ? "Edit your vision" : "Your vision"}
            </h4>
            <Textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Describe your ideal life in 3-5 years..."
              rows={5}
              maxLength={10000}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              {editing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNoteContent(existingNote?.content || "");
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                onClick={saveNote}
                disabled={!noteContent.trim() || savingNote}
              >
                {savingNote ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Setup mode: show saved note */}
      {mode === "setup" && hasNote && !editing && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Your vision:</p>
                <blockquote className="border-l-2 border-muted-foreground/30 pl-3 text-sm italic whitespace-pre-wrap">
                  {existingNote.content}
                </blockquote>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reflection notes (review mode) */}
      {mode === "review" && (
        <Card>
          <CardContent className="py-4 space-y-2">
            <h4 className="text-sm font-medium">Reflection notes</h4>
            <Textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="What's changed since you last looked at this? What still resonates?"
              rows={3}
            />
          </CardContent>
        </Card>
      )}

      <Separator />

      <div className="flex justify-between">
        {onBack ? (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        ) : (
          <div />
        )}
        <Button
          onClick={onMarkComplete}
          disabled={saving || (mode === "setup" && !hasNote)}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Continue
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
