"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Play, X, Clock, ListChecks, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

function timeAgo(date: string): string {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

interface AreaInfo {
  id: string;
  name: string;
}

interface SomedayProject {
  id: string;
  title: string;
  description?: string | null;
  createdAt: string;
  area?: { id: string; name: string } | null;
  taskCounts: { total: number; completed: number; active: number };
}

interface SomedayProjectCardProps {
  project: SomedayProject;
  areas: AreaInfo[];
  onActivate: (id: string) => void;
  onDrop: (id: string) => void;
  onUpdate: (id: string, data: { title?: string; description?: string; areaId?: string | null }) => void;
  isActivating?: boolean;
  isDropping?: boolean;
}

export function SomedayProjectCard({
  project,
  areas,
  onActivate,
  onDrop,
  onUpdate,
  isActivating,
  isDropping,
}: SomedayProjectCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(project.title);
  const [editDescription, setEditDescription] = useState(project.description || "");
  const [editAreaId, setEditAreaId] = useState(project.area?.id || "");
  const isDisabled = isActivating || isDropping;

  function openEdit() {
    setEditTitle(project.title);
    setEditDescription(project.description || "");
    setEditAreaId(project.area?.id || "");
    setEditOpen(true);
  }

  function handleSave() {
    const data: { title?: string; description?: string; areaId?: string | null } = {};
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) return;

    if (trimmedTitle !== project.title) data.title = trimmedTitle;
    if (editDescription.trim() !== (project.description || "")) data.description = editDescription.trim();

    const newAreaId = editAreaId || null;
    const oldAreaId = project.area?.id || null;
    if (newAreaId !== oldAreaId) data.areaId = newAreaId;

    if (Object.keys(data).length > 0) {
      onUpdate(project.id, data);
    }
    setEditOpen(false);
  }

  return (
    <>
      <Card
        className={cn(
          "border-muted/60 bg-card/80 transition-all hover:border-muted-foreground/30",
          isDisabled && "opacity-50 pointer-events-none"
        )}
      >
        <CardHeader className="py-3 px-4 pb-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm font-medium text-foreground/80">
                {project.title}
              </CardTitle>
              {project.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {project.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={openEdit}
                disabled={isDisabled}
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:text-green-300 dark:hover:bg-green-950"
                onClick={() => onActivate(project.id)}
                disabled={isDisabled}
                title="Activate project"
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDrop(project.id)}
                disabled={isDisabled}
                title="Drop project"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-3 pt-1">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {project.area && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5 font-normal"
              >
                {project.area.name}
              </Badge>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Added {timeAgo(project.createdAt)}
            </span>
            {project.taskCounts.total > 0 && (
              <span className="flex items-center gap-1">
                <ListChecks className="h-3 w-3" />
                {project.taskCounts.total} task
                {project.taskCounts.total !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Someday/Maybe Item</DialogTitle>
            <DialogDescription>
              Update the details for this idea.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Notes, links, context..."
                rows={4}
              />
            </div>
            <div>
              <Label>Area of Responsibility</Label>
              <Select
                value={editAreaId || "none"}
                onValueChange={(v) => setEditAreaId(v === "none" ? "" : v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select area..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No area</SelectItem>
                  {areas.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!editTitle.trim()}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
