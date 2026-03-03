"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface SaveAsTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  project: {
    id: string;
    title: string;
    type: string;
    taskCount: number;
    childProjectCount: number;
  };
}

export function SaveAsTemplateDialog({
  open,
  onClose,
  project,
}: SaveAsTemplateDialogProps) {
  const [title, setTitle] = useState(`${project.title} Template`);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/save-as-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => {
          onClose();
          setSaved(false);
          setTitle(`${project.title} Template`);
          setDescription("");
        }, 1000);
      }
    } catch {
      // silently fail
    }
    setSaving(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setSaved(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Save &ldquo;{project.title}&rdquo; as Template
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Template Name</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Template"
            />
          </div>

          <div>
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this template for?"
              rows={2}
            />
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p>Will capture:</p>
            <ul className="list-disc list-inside text-xs space-y-0.5">
              <li>
                {project.taskCount} task{project.taskCount !== 1 ? "s" : ""}{" "}
                (excluding dropped)
              </li>
              {project.childProjectCount > 0 && (
                <li>
                  {project.childProjectCount} sub-project
                  {project.childProjectCount !== 1 ? "s" : ""}
                </li>
              )}
              <li>
                Project type: {project.type.replace("_", " ").toLowerCase()}
              </li>
              <li>Task titles, estimates, energy levels, and contexts</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || saved || !title.trim()}
          >
            {saved ? (
              "Saved!"
            ) : saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Template"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
