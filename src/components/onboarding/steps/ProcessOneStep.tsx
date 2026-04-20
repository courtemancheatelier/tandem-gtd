"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle, ArrowRight } from "lucide-react";

interface ProcessOneStepProps {
  brainDumpItems: string[];
  onNext: () => void;
  onSkip: () => void;
}

interface InboxItem {
  id: string;
  content: string;
  status: string;
}

interface ContextData {
  id: string;
  name: string;
  color: string | null;
}

type SubStep = "review" | "define" | "success";

export function ProcessOneStep({
  onNext,
}: ProcessOneStepProps) {
  const [subStep, setSubStep] = useState<SubStep>("review");
  const [inboxItem, setInboxItem] = useState<InboxItem | null>(null);
  const [contexts, setContexts] = useState<ContextData[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Task form fields
  const [taskTitle, setTaskTitle] = useState("");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [contextId, setContextId] = useState("");
  const [energyLevel, setEnergyLevel] = useState("");
  const [estimatedMins, setEstimatedMins] = useState("");

  // Success state
  const [createdTask, setCreatedTask] = useState<{
    title: string;
    project?: string;
    context?: string;
  } | null>(null);
  const [remainingCount, setRemainingCount] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [inboxRes, ctxRes] = await Promise.all([
        fetch("/api/inbox"),
        fetch("/api/contexts"),
      ]);

      if (inboxRes.ok) {
        const items: InboxItem[] = await inboxRes.json();
        // Pick the first unprocessed item
        const first = items.find((i) => i.status === "UNPROCESSED");
        if (first) {
          setInboxItem(first);
          setTaskTitle(first.content);
          setRemainingCount(
            items.filter((i) => i.status === "UNPROCESSED").length - 1
          );
        }
      }
      if (ctxRes.ok) setContexts(await ctxRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleActionable() {
    setSubStep("define");
  }

  async function handleNotActionable(disposition: "trash" | "someday") {
    if (!inboxItem) return;
    setSubmitting(true);
    try {
      await fetch(`/api/inbox/${inboxItem.id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "not_actionable",
          disposition,
          ...(disposition === "someday"
            ? { somedayTitle: inboxItem.content }
            : {}),
        }),
      });
      setCreatedTask(null);
      setSubStep("success");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateTask() {
    if (!inboxItem || !taskTitle.trim()) return;
    setSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        decision: "actionable",
        taskTitle: taskTitle.trim(),
      };
      if (newProjectTitle.trim()) payload.newProjectTitle = newProjectTitle.trim();
      if (contextId) payload.contextId = contextId;
      if (energyLevel) payload.energyLevel = energyLevel;
      if (estimatedMins) payload.estimatedMins = parseInt(estimatedMins, 10);

      const res = await fetch(`/api/inbox/${inboxItem.id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setCreatedTask({
          title: taskTitle.trim(),
          project: newProjectTitle.trim() || undefined,
          context: contexts.find((c) => c.id === contextId)?.name,
        });
        setSubStep("success");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // No inbox items to process — skip this step
  if (!inboxItem) {
    return (
      <Card>
        <CardContent className="py-8 md:py-12 px-6 md:px-10 text-center">
          <p className="text-muted-foreground mb-6">
            No inbox items to process. You can process items later from the
            Inbox page.
          </p>
          <Button onClick={onNext} size="lg">
            Continue
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (subStep === "review") {
    return (
      <Card>
        <CardContent className="py-8 md:py-12 px-6 md:px-10">
          <h2 className="text-2xl font-bold mb-2">
            Let&apos;s process your first item
          </h2>
          <p className="text-muted-foreground mb-6">
            Is this something you can take action on?
          </p>

          <div className="bg-muted rounded-lg p-4 mb-6">
            <p className="font-medium text-lg">
              &ldquo;{inboxItem.content}&rdquo;
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleActionable} disabled={submitting}>
              Yes, it&apos;s actionable
            </Button>
            <Button
              variant="outline"
              onClick={() => handleNotActionable("trash")}
              disabled={submitting}
            >
              No — delete it
            </Button>
            <Button
              variant="outline"
              onClick={() => handleNotActionable("someday")}
              disabled={submitting}
            >
              No — save for someday
            </Button>
          </div>
          {submitting && (
            <Loader2 className="h-4 w-4 animate-spin mt-4 text-muted-foreground" />
          )}
        </CardContent>
      </Card>
    );
  }

  if (subStep === "define") {
    return (
      <Card>
        <CardContent className="py-8 md:py-12 px-6 md:px-10">
          <h2 className="text-2xl font-bold mb-2">Define the next action</h2>
          <p className="text-muted-foreground mb-6">
            What&apos;s the very next physical action? Not &ldquo;plan
            party&rdquo; but &ldquo;Text Sarah about venue options.&rdquo;
          </p>

          <div className="space-y-4">
            <div>
              <Label htmlFor="taskTitle">Next action</Label>
              <Input
                id="taskTitle"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="e.g., Text Sarah about venue options"
                autoFocus
              />
            </div>

            <div>
              <Label htmlFor="newProject">
                Project{" "}
                <span className="text-muted-foreground font-normal">
                  (optional, creates new)
                </span>
              </Label>
              <Input
                id="newProject"
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                placeholder="e.g., Mom's Birthday Party"
              />
            </div>

            <div>
              <Label>Context</Label>
              <Select value={contextId} onValueChange={setContextId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select context" />
                </SelectTrigger>
                <SelectContent>
                  {contexts.map((ctx) => (
                    <SelectItem key={ctx.id} value={ctx.id}>
                      {ctx.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Energy</Label>
                <Select value={energyLevel} onValueChange={setEnergyLevel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Energy level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Time estimate</Label>
                <Select value={estimatedMins} onValueChange={setEstimatedMins}>
                  <SelectTrigger>
                    <SelectValue placeholder="Time needed" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 min</SelectItem>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="120">2 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-8">
            <Button
              onClick={handleCreateTask}
              disabled={!taskTitle.trim() || submitting}
              size="lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Task"
              )}
            </Button>
            <Button variant="ghost" onClick={() => setSubStep("review")}>
              Back
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Success sub-step
  return (
    <Card>
      <CardContent className="py-8 md:py-12 px-6 md:px-10">
        {createdTask ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <h2 className="text-xl font-bold">Task created!</h2>
            </div>
            <div className="bg-muted rounded-lg p-4 mb-2 space-y-1">
              <p className="font-medium">{createdTask.title}</p>
              {createdTask.project && (
                <p className="text-sm text-muted-foreground">
                  Project: {createdTask.project}
                </p>
              )}
              {createdTask.context && (
                <p className="text-sm text-muted-foreground">
                  Context: {createdTask.context}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <h2 className="text-xl font-bold">Item processed!</h2>
          </div>
        )}

        {remainingCount > 0 && (
          <p className="text-muted-foreground mt-4 mb-6">
            You have {remainingCount} more item{remainingCount !== 1 ? "s" : ""}{" "}
            in your inbox. You can process them after onboarding — or any time
            from the Inbox page.
          </p>
        )}

        <Button onClick={onNext} size="lg" className="mt-4">
          Continue
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}
