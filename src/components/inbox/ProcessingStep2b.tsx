"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Zap,
  Clock,
  User,
  FolderOpen,
  Tag,
  Plus,
} from "lucide-react";

interface Project {
  id: string;
  title: string;
}

interface Context {
  id: string;
  name: string;
  color: string | null;
}

export interface ActionableData {
  taskTitle: string;
  twoMinuteTask: boolean;
  projectId?: string;
  newProjectTitle?: string;
  contextId?: string;
  energyLevel?: "LOW" | "MEDIUM" | "HIGH";
  estimatedMins?: number;
  scheduledDate?: string;
  dueDate?: string;
  delegateTo?: string;
}

interface ProcessingStep2bProps {
  inboxContent: string;
  onBack: () => void;
  onConfirm: (data: ActionableData) => void;
}

export function ProcessingStep2b({
  inboxContent,
  onBack,
  onConfirm,
}: ProcessingStep2bProps) {
  const [taskTitle, setTaskTitle] = useState(inboxContent);
  const [twoMinuteTask, setTwoMinuteTask] = useState(false);
  const [projectSelection, setProjectSelection] = useState("none");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [contextId, setContextId] = useState("none");
  const [energyLevel, setEnergyLevel] = useState("none");
  const [estimatedMins, setEstimatedMins] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isDelegated, setIsDelegated] = useState(false);
  const [delegateTo, setDelegateTo] = useState("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [contexts, setContexts] = useState<Context[]>([]);

  const fetchData = useCallback(async () => {
    const [projectsRes, contextsRes] = await Promise.all([
      fetch("/api/projects?someday=false"),
      fetch("/api/contexts"),
    ]);
    if (projectsRes.ok) setProjects(await projectsRes.json());
    if (contextsRes.ok) setContexts(await contextsRes.json());
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleConfirm() {
    if (!taskTitle.trim()) return;
    const data: ActionableData = {
      taskTitle: taskTitle.trim(),
      twoMinuteTask,
    };
    if (projectSelection === "__new__" && newProjectTitle.trim()) {
      data.newProjectTitle = newProjectTitle.trim();
    } else if (projectSelection !== "none") {
      data.projectId = projectSelection;
    }
    if (contextId !== "none") {
      data.contextId = contextId;
    }
    if (energyLevel !== "none") {
      data.energyLevel = energyLevel as "LOW" | "MEDIUM" | "HIGH";
    }
    if (estimatedMins && parseInt(estimatedMins) > 0) {
      data.estimatedMins = parseInt(estimatedMins);
    }
    if (scheduledDate) {
      data.scheduledDate = new Date(scheduledDate).toISOString();
    }
    if (dueDate) {
      data.dueDate = new Date(dueDate).toISOString();
    }
    if (isDelegated && delegateTo.trim()) {
      data.delegateTo = delegateTo.trim();
    }
    onConfirm(data);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h2 className="text-lg font-semibold">Define the Action</h2>
      </div>

      {/* Task Title */}
      <div className="space-y-2">
        <Label htmlFor="task-title">What&apos;s the next action?</Label>
        <Input
          id="task-title"
          value={taskTitle}
          onChange={(e) => setTaskTitle(e.target.value)}
          placeholder="Next action..."
        />
      </div>

      {/* Two-Minute Rule */}
      <Card
        className="cursor-pointer"
        onClick={() => setTwoMinuteTask((v) => !v)}
      >
        <CardContent className="py-2.5 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-sm font-medium">
                  Is this a 2-minute task?
                </p>
                <p className="text-xs text-muted-foreground">
                  If it takes less than 2 minutes, do it now
                </p>
              </div>
            </div>
            <Switch
              checked={twoMinuteTask}
              onCheckedChange={setTwoMinuteTask}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </CardContent>
      </Card>

      {twoMinuteTask ? (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="py-6 text-center">
            <Zap className="h-10 w-10 text-yellow-500 mx-auto mb-2" />
            <p className="font-semibold text-lg">Do it now!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Complete the action, then click below to mark it done.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Project */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              Project
            </Label>
            <Select
              value={projectSelection}
              onValueChange={setProjectSelection}
            >
              <SelectTrigger>
                <SelectValue placeholder="No project (standalone task)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project (standalone task)</SelectItem>
                <SelectItem value="__new__">
                  <span className="flex items-center gap-1">
                    <Plus className="h-3 w-3" />
                    New Project
                  </span>
                </SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projectSelection === "__new__" && (
              <Input
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                placeholder="New project title..."
              />
            )}
          </div>

          {/* Context */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              Context
            </Label>
            <Select value={contextId} onValueChange={setContextId}>
              <SelectTrigger>
                <SelectValue placeholder="No context" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No context</SelectItem>
                {contexts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Energy + Time Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                Energy Level
              </Label>
              <Select value={energyLevel} onValueChange={setEnergyLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Time Estimate
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  value={estimatedMins}
                  onChange={(e) => setEstimatedMins(e.target.value)}
                  placeholder="Minutes"
                />
                <span className="text-sm text-muted-foreground shrink-0">
                  min
                </span>
              </div>
            </div>
          </div>

          {/* Date Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Schedule (defer until)</Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Delegate */}
          <Card
            className="cursor-pointer"
            onClick={() => setIsDelegated((v) => !v)}
          >
            <CardContent className="py-2.5 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Delegate this?</p>
                    <p className="text-xs text-muted-foreground">
                      Create a waiting-for record
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isDelegated}
                  onCheckedChange={setIsDelegated}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              {isDelegated && (
                <div className="mt-3">
                  <Input
                    value={delegateTo}
                    onChange={(e) => setDelegateTo(e.target.value)}
                    placeholder="Who are you delegating to?"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleConfirm}
          disabled={!taskTitle.trim()}
        >
          {twoMinuteTask ? "Mark Done & Continue" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
