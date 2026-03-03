"use client";

import { useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectTaskItem, type ProjectTask, type TeamMember } from "./ProjectTaskItem";
import { InlineTaskAdd } from "./InlineTaskAdd";
import { ListChecks, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectTaskListProps {
  tasks: ProjectTask[];
  projectType: string;
  projectStatus: string;
  onComplete: (taskId: string) => void;
  onStatusChange?: (taskId: string, status: string) => void;
  onAddTask: (title: string) => Promise<void>;
  onAddMultipleTasks?: (titles: string[]) => Promise<void>;
  onUpdateTask: (taskId: string, data: Record<string, unknown>) => void;
  onDeleteTask?: (taskId: string) => void;
  onDetachTask?: (taskId: string) => void;
  onPromoteToSubProject?: (taskId: string, taskTitle: string) => void;
  onUncompleteTask?: (taskId: string) => void;
  onReorderTasks?: (orderedTaskIds: string[]) => void;
  reorderMode?: boolean;
  contexts?: { id: string; name: string; color: string | null }[];
  teamMembers?: TeamMember[];
  teamId?: string | null;
  isSelected?: (id: string) => boolean;
  onToggleSelect?: (id: string) => void;
  conflictTaskId?: string | null;
  conflictFields?: string[];
}

export function ProjectTaskList({
  tasks,
  projectType,
  projectStatus,
  onComplete,
  onStatusChange,
  onAddTask,
  onAddMultipleTasks,
  onUpdateTask,
  onDeleteTask,
  onDetachTask,
  onPromoteToSubProject,
  onUncompleteTask,
  onReorderTasks,
  reorderMode,
  contexts,
  teamMembers,
  teamId,
  isSelected,
  onToggleSelect,
  conflictTaskId,
  conflictFields,
}: ProjectTaskListProps) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragCounter = useRef(0);
  const isSequential = projectType === "SEQUENTIAL";
  const isProjectActive = projectStatus === "ACTIVE" || projectStatus === "ON_HOLD";

  const activeTasks = tasks.filter(
    (t) => t.status !== "COMPLETED" && t.status !== "DROPPED"
  );
  const completedTasks = tasks.filter(
    (t) => t.status === "COMPLETED" || t.status === "DROPPED"
  );

  const showDragHandles = !!onReorderTasks && !!reorderMode && activeTasks.length > 1;

  const handleDragStart = useCallback((idx: number) => {
    setDragIndex(idx);
    dragCounter.current = 0;
  }, []);

  const handleDragEnter = useCallback((idx: number) => {
    dragCounter.current++;
    setDragOverIndex(idx);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setDragOverIndex(null);
      dragCounter.current = 0;
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (dropIdx: number) => {
      if (dragIndex === null || dragIndex === dropIdx || !onReorderTasks) {
        setDragIndex(null);
        setDragOverIndex(null);
        return;
      }
      const newOrder = [...activeTasks];
      const [moved] = newOrder.splice(dragIndex, 1);
      newOrder.splice(dropIdx, 0, moved);
      onReorderTasks(newOrder.map((t) => t.id));
      setDragIndex(null);
      setDragOverIndex(null);
    },
    [dragIndex, activeTasks, onReorderTasks]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
    dragCounter.current = 0;
  }, []);

  return (
    <div className="space-y-1">
      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <ListChecks className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No tasks yet. Add your first task to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Active tasks */}
          {activeTasks.map((task, idx) => (
            <ProjectTaskItem
              key={task.id}
              task={task}
              index={idx}
              isSequential={isSequential}
              onComplete={onComplete}
              onStatusChange={onStatusChange}
              onUpdateTask={onUpdateTask}
              onDeleteTask={onDeleteTask}
              onDetachTask={onDetachTask}
              onPromoteToSubProject={onPromoteToSubProject}
              contexts={contexts}
              teamMembers={teamMembers}
              teamId={teamId}
              isSelected={isSelected?.(task.id)}
              onToggleSelect={onToggleSelect ? () => onToggleSelect(task.id) : undefined}
              conflictHighlight={conflictTaskId === task.id}
              conflictFields={conflictTaskId === task.id ? conflictFields : undefined}
              // Reorder props — only active in reorder mode
              draggable={showDragHandles}
              onDragStart={showDragHandles ? () => handleDragStart(idx) : undefined}
              onDragEnter={showDragHandles ? () => handleDragEnter(idx) : undefined}
              onDragLeave={showDragHandles ? handleDragLeave : undefined}
              onDragOver={showDragHandles ? handleDragOver : undefined}
              onDrop={showDragHandles ? () => handleDrop(idx) : undefined}
              onDragEnd={showDragHandles ? handleDragEnd : undefined}
              isDragging={dragIndex === idx}
              isDragOver={dragOverIndex === idx && dragIndex !== idx}
            />
          ))}
        </>
      )}

      {/* Inline task add — always in same tree position to preserve state across re-renders */}
      {isProjectActive && (
        <div className="mt-2">
          <InlineTaskAdd onAdd={onAddTask} onAddMultiple={onAddMultipleTasks} />
        </div>
      )}

      {/* Completed tasks */}
      {completedTasks.length > 0 && (
        <div className="pt-4 mt-4 space-y-2">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", showCompleted && "rotate-90")} />
            Completed ({completedTasks.length})
          </button>
          {showCompleted && completedTasks.map((task, idx) => (
            <ProjectTaskItem
              key={task.id}
              task={task}
              index={activeTasks.length + idx}
              isSequential={false}
              onComplete={onComplete}
              onStatusChange={onStatusChange}
              onUpdateTask={onUpdateTask}
              onUncompleteTask={onUncompleteTask}
              teamId={teamId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
