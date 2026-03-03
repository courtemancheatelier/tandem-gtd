"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, SlidersHorizontal } from "lucide-react";
import { TeamIcon } from "@/components/teams/team-icons";

interface Context {
  id: string;
  name: string;
  color: string | null;
}

interface Team {
  id: string;
  name: string;
  icon?: string | null;
}

interface FilterBarProps {
  contexts: Context[];
  selectedContextIds: string[];
  selectedEnergy: string | null;
  selectedMaxMins: number | null;
  selectedDue: string | null;
  selectedStatus?: string | null;
  selectedProjectFilter?: string | null;
  selectedSource?: string | null;
  teams?: Team[];
  selectedScope?: string | null;
  onContextChange: (ids: string[]) => void;
  onEnergyChange: (level: string | null) => void;
  onMaxMinsChange: (mins: number | null) => void;
  onDueChange: (due: string | null) => void;
  onStatusChange?: (status: string | null) => void;
  onProjectFilterChange?: (filter: string | null) => void;
  onSourceChange?: (source: string | null) => void;
  onScopeChange?: (scope: string | null) => void;
  onClearAll: () => void;
}

const timeOptions = [
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2+ hours", value: 120 },
];

export function FilterBar({
  contexts,
  selectedContextIds,
  selectedEnergy,
  selectedMaxMins,
  selectedDue,
  selectedStatus,
  selectedProjectFilter,
  selectedSource,
  teams,
  selectedScope,
  onContextChange,
  onEnergyChange,
  onMaxMinsChange,
  onDueChange,
  onStatusChange,
  onProjectFilterChange,
  onSourceChange,
  onScopeChange,
  onClearAll,
}: FilterBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Optimistic local state — updates immediately on selection, syncs from props
  const [localEnergy, setLocalEnergy] = useState(selectedEnergy);
  const [localMaxMins, setLocalMaxMins] = useState(selectedMaxMins);
  const [localDue, setLocalDue] = useState(selectedDue);
  const [localStatus, setLocalStatus] = useState(selectedStatus ?? null);
  const [localScope, setLocalScope] = useState(selectedScope ?? null);
  const [localProjectFilter, setLocalProjectFilter] = useState(selectedProjectFilter ?? null);
  const [localSource, setLocalSource] = useState(selectedSource ?? null);

  // Sync local state from props when they catch up
  useEffect(() => { setLocalEnergy(selectedEnergy); }, [selectedEnergy]);
  useEffect(() => { setLocalMaxMins(selectedMaxMins); }, [selectedMaxMins]);
  useEffect(() => { setLocalDue(selectedDue); }, [selectedDue]);
  useEffect(() => { setLocalStatus(selectedStatus ?? null); }, [selectedStatus]);
  useEffect(() => { setLocalScope(selectedScope ?? null); }, [selectedScope]);
  useEffect(() => { setLocalProjectFilter(selectedProjectFilter ?? null); }, [selectedProjectFilter]);
  useEffect(() => { setLocalSource(selectedSource ?? null); }, [selectedSource]);

  const hasFilters = selectedContextIds.length > 0 || localEnergy || localMaxMins || localDue || localStatus || localProjectFilter || localSource || (localScope && localScope !== "all");

  // Count active select-based filters (not context pills)
  const activeFilterCount = [localEnergy, localMaxMins, localDue, localStatus, localProjectFilter, localSource, (localScope && localScope !== "all") ? localScope : null].filter(Boolean).length;

  // Helper: update local state optimistically, fire callback, close panel
  function handleSelect(setter: (v: string | null) => void, callback: (v: string | null) => void, rawValue: string) {
    const value = rawValue === "all" ? null : rawValue;
    setter(value);
    callback(value);
    setFiltersOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Context pills — always visible */}
      <div className="flex flex-wrap gap-1">
        {contexts.map((ctx) => (
          <Badge
            key={ctx.id}
            variant={selectedContextIds.includes(ctx.id) ? "default" : "outline"}
            className="cursor-pointer text-xs"
            style={
              !selectedContextIds.includes(ctx.id) && ctx.color
                ? { borderColor: ctx.color, color: ctx.color }
                : undefined
            }
            onClick={() =>
              onContextChange(
                selectedContextIds.includes(ctx.id)
                  ? selectedContextIds.filter((id) => id !== ctx.id)
                  : [...selectedContextIds, ctx.id]
              )
            }
          >
            {ctx.name}
          </Badge>
        ))}
      </div>

      {/* Mobile: toggle button + clear button side by side */}
      <div className="flex gap-2 md:hidden">
        <Button
          variant={activeFilterCount > 0 ? "secondary" : "outline"}
          size="sm"
          className="h-9 text-xs"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </Button>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              setLocalEnergy(null);
              setLocalMaxMins(null);
              setLocalDue(null);
              setLocalStatus(null);
              setLocalScope(null);
              setLocalProjectFilter(null);
              setLocalSource(null);
              setFiltersOpen(false);
              onClearAll();
            }}
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Select filters: hidden on mobile unless expanded, always visible on desktop */}
      <div className={`${filtersOpen ? "flex" : "hidden"} md:flex flex-col md:flex-row w-full md:w-auto gap-2 md:flex-wrap md:items-center`}>
        {/* Scope filter */}
        {teams && teams.length > 0 && onScopeChange && (
          <Select
            value={localScope || "all"}
            onValueChange={(v) => handleSelect(setLocalScope, (val) => onScopeChange!(val), v)}
          >
            <SelectTrigger className="w-full md:w-[140px] h-9 md:h-7 text-xs">
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="personal">Personal</SelectItem>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  <span className="inline-flex items-center gap-1.5"><TeamIcon icon={team.icon} className="h-3.5 w-3.5" />{team.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Energy filter */}
        <Select
          value={localEnergy || "all"}
          onValueChange={(v) => handleSelect(setLocalEnergy, onEnergyChange, v)}
        >
          <SelectTrigger className="w-full md:w-[120px] h-9 md:h-7 text-xs">
            <SelectValue placeholder="Energy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any energy</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
          </SelectContent>
        </Select>

        {/* Time filter */}
        <Select
          value={localMaxMins?.toString() || "all"}
          onValueChange={(v) => {
            const mins = v === "all" ? null : parseInt(v);
            setLocalMaxMins(mins);
            onMaxMinsChange(mins);
            setFiltersOpen(false);
          }}
        >
          <SelectTrigger className="w-full md:w-[120px] h-9 md:h-7 text-xs">
            <SelectValue placeholder="Time" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any time</SelectItem>
            {timeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value.toString()}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Due filter */}
        <Select
          value={localDue || "all"}
          onValueChange={(v) => handleSelect(setLocalDue, onDueChange, v)}
        >
          <SelectTrigger className="w-full md:w-[130px] h-9 md:h-7 text-xs">
            <SelectValue placeholder="Due" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any due date</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="today">Due today</SelectItem>
            <SelectItem value="week">Due this week</SelectItem>
            <SelectItem value="month">Due this month</SelectItem>
          </SelectContent>
        </Select>

        {/* Status filter */}
        {onStatusChange && (
          <Select
            value={localStatus || "all"}
            onValueChange={(v) => handleSelect(setLocalStatus, onStatusChange!, v)}
          >
            <SelectTrigger className="w-full md:w-[130px] h-9 md:h-7 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="NOT_STARTED">Not started</SelectItem>
              <SelectItem value="IN_PROGRESS">In progress</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Project filter */}
        {onProjectFilterChange && (
          <Select
            value={localProjectFilter || "all"}
            onValueChange={(v) => handleSelect(setLocalProjectFilter, onProjectFilterChange!, v)}
          >
            <SelectTrigger className="w-full md:w-[140px] h-9 md:h-7 text-xs">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any project</SelectItem>
              <SelectItem value="none">Loose tasks</SelectItem>
              <SelectItem value="in_project">In a project</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Source filter (Card File / regular) */}
        {onSourceChange && (
          <Select
            value={localSource || "all"}
            onValueChange={(v) => handleSelect(setLocalSource, onSourceChange!, v)}
          >
            <SelectTrigger className="w-full md:w-[140px] h-9 md:h-7 text-xs">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tasks</SelectItem>
              <SelectItem value="card-file">Card File</SelectItem>
              <SelectItem value="regular">Regular tasks</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Clear filters — desktop only (mobile has its own next to the toggle) */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="hidden md:inline-flex h-7 text-xs"
          onClick={onClearAll}
        >
          <X className="h-3 w-3 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
