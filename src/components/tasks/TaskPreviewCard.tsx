"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  MapPin,
  Clock,
  Zap,
  FolderKanban,
  Check,
  X,
  Battery,
  BatteryMedium,
  BatteryFull,
} from "lucide-react";
import type { ParsedTask } from "@/lib/parsers/natural-language-task";

interface TaskPreviewCardProps {
  parsed: ParsedTask;
  contexts: Array<{ id: string; name: string; color: string | null }>;
  projects: Array<{ id: string; title: string }>;
  onConfirm: (data: {
    title: string;
    dueDate?: string;
    scheduledDate?: string;
    contextId?: string;
    estimatedMins?: number;
    energyLevel?: "LOW" | "MEDIUM" | "HIGH";
    projectId?: string;
  }) => void;
  onCancel: () => void;
}

const energyIcons = {
  LOW: <Battery className="h-3 w-3 text-green-500" />,
  MEDIUM: <BatteryMedium className="h-3 w-3 text-yellow-500" />,
  HIGH: <BatteryFull className="h-3 w-3 text-red-500" />,
};

export function TaskPreviewCard({ parsed, contexts, projects, onConfirm, onCancel }: TaskPreviewCardProps) {
  const [title, setTitle] = useState(parsed.title);
  const [dueDate, setDueDate] = useState(parsed.dueDate || "");
  const [contextId, setContextId] = useState(parsed.contextId || "none");
  const [estimatedMins, setEstimatedMins] = useState(parsed.estimatedMins?.toString() || "none");
  const [energyLevel, setEnergyLevel] = useState(parsed.energyLevel || "none");
  const [projectId, setProjectId] = useState(parsed.projectId || "none");

  function handleConfirm() {
    onConfirm({
      title,
      ...(dueDate ? { dueDate } : {}),
      ...(parsed.scheduledDate ? { scheduledDate: parsed.scheduledDate } : {}),
      ...(contextId !== "none" ? { contextId } : {}),
      ...(estimatedMins !== "none" ? { estimatedMins: parseInt(estimatedMins, 10) } : {}),
      ...(energyLevel !== "none" ? { energyLevel: energyLevel as "LOW" | "MEDIUM" | "HIGH" } : {}),
      ...(projectId !== "none" ? { projectId } : {}),
    });
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-muted/30 p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Check className="h-3.5 w-3.5 text-primary" />
        Parsed task — review and create
      </div>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="font-medium text-sm"
        placeholder="Task title"
        onKeyDown={(e) => {
          if (e.key === "Enter") handleConfirm();
          if (e.key === "Escape") onCancel();
        }}
        autoFocus
      />

      {/* Extracted fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* Due date */}
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            type="date"
            value={dueDate ? dueDate.slice(0, 10) : ""}
            onChange={(e) => setDueDate(e.target.value || "")}
            className="h-8 text-xs"
            placeholder="Due date"
          />
        </div>

        {/* Context */}
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Select value={contextId} onValueChange={setContextId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Context" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No context</SelectItem>
              {contexts.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Time estimate */}
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Select value={estimatedMins} onValueChange={setEstimatedMins}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No estimate</SelectItem>
              <SelectItem value="5">5 min</SelectItem>
              <SelectItem value="15">15 min</SelectItem>
              <SelectItem value="30">30 min</SelectItem>
              <SelectItem value="60">1 hour</SelectItem>
              <SelectItem value="120">2 hours</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Energy */}
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Select value={energyLevel} onValueChange={(v) => setEnergyLevel(v as "LOW" | "MEDIUM" | "HIGH" | "none")}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Energy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No energy level</SelectItem>
              <SelectItem value="LOW">
                <span className="flex items-center gap-1.5">{energyIcons.LOW} Low</span>
              </SelectItem>
              <SelectItem value="MEDIUM">
                <span className="flex items-center gap-1.5">{energyIcons.MEDIUM} Medium</span>
              </SelectItem>
              <SelectItem value="HIGH">
                <span className="flex items-center gap-1.5">{energyIcons.HIGH} High</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Project */}
        {projects.length > 0 && (
          <div className="flex items-center gap-2 md:col-span-2">
            <FolderKanban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Unmatched context/project hints */}
      {parsed.contextName && !parsed.contextId && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Context &quot;{parsed.contextName}&quot; not found — select one above or create it later
        </p>
      )}
      {parsed.projectName && !parsed.projectId && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Project &quot;{parsed.projectName}&quot; not found — select one above or create it later
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCancel}>
          <X className="h-3.5 w-3.5 mr-1" />
          Back
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={handleConfirm} disabled={!title.trim()}>
          <Check className="h-3.5 w-3.5 mr-1" />
          Create Task
        </Button>
      </div>
    </div>
  );
}
