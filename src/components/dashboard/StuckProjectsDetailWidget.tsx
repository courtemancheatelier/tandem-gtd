"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Loader2 } from "lucide-react";

interface StuckProject {
  id: string;
  title: string;
  totalTasks: number;
}

export function StuckProjectsDetailWidget({
  data,
}: {
  data: StuckProject[];
}) {
  const [projects, setProjects] = useState(data);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAddTask(projectId: string) {
    if (!inputValue.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: inputValue.trim(), projectId }),
      });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        setExpandedId(null);
        setInputValue("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (projects.length === 0) {
    return (
      <Card id="stuck-detail">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Stuck Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            All projects have next actions. Nice work!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="stuck-detail">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Stuck Projects
          <Badge variant="secondary" className="ml-2 text-xs">
            {projects.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[240px] px-6 pb-6">
          <div className="space-y-2">
            {projects.map((project) => (
              <div key={project.id} className="space-y-2">
                <div className="flex items-center gap-3 rounded-md p-2 -mx-2">
                  <Link
                    href={`/projects/${project.id}`}
                    className="text-sm font-medium truncate flex-1 hover:underline"
                  >
                    {project.title}
                  </Link>
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {project.totalTasks} task
                    {project.totalTasks !== 1 ? "s" : ""}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs shrink-0"
                    onClick={() => {
                      setExpandedId(
                        expandedId === project.id ? null : project.id
                      );
                      setInputValue("");
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add next action
                  </Button>
                </div>

                {expandedId === project.id && (
                  <div className="flex items-center gap-2 pl-2">
                    <Input
                      placeholder="Next action title..."
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddTask(project.id);
                        if (e.key === "Escape") {
                          setExpandedId(null);
                          setInputValue("");
                        }
                      }}
                      className="h-8 text-sm"
                      autoFocus
                      disabled={submitting}
                    />
                    <Button
                      size="sm"
                      className="h-8 shrink-0"
                      onClick={() => handleAddTask(project.id)}
                      disabled={!inputValue.trim() || submitting}
                    >
                      {submitting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Add"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
