"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { X, SlidersHorizontal, ArrowUpDown } from "lucide-react";
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
  selectedDue: string[];
  selectedStatus?: string | null;
  selectedProjectFilter?: string | null;
  selectedSource?: string | null;
  teams?: Team[];
  selectedScope?: string | null;
  selectedSort?: string | null;
  onContextChange: (ids: string[]) => void;
  onEnergyChange: (level: string | null) => void;
  onMaxMinsChange: (mins: number | null) => void;
  onDueChange: (due: string[]) => void;
  onStatusChange?: (status: string | null) => void;
  onProjectFilterChange?: (filter: string | null) => void;
  onSourceChange?: (source: string | null) => void;
  onScopeChange?: (scope: string | null) => void;
  onSortChange?: (sort: string | null) => void;
  onClearAll: () => void;
}

const dueOptions = [
  { label: "Overdue", value: "overdue" },
  { label: "Due today", value: "today" },
  { label: "Due this week", value: "week" },
  { label: "Due this month", value: "month" },
];

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
  selectedSort,
  onContextChange,
  onEnergyChange,
  onMaxMinsChange,
  onDueChange,
  onStatusChange,
  onProjectFilterChange,
  onSourceChange,
  onScopeChange,
  onSortChange,
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
  const [localSort, setLocalSort] = useState(selectedSort ?? null);

  // Sync local state from props when they catch up
  useEffect(() => { setLocalEnergy(selectedEnergy); }, [selectedEnergy]);
  useEffect(() => { setLocalMaxMins(selectedMaxMins); }, [selectedMaxMins]);
  useEffect(() => { setLocalDue(selectedDue); }, [selectedDue]);
  useEffect(() => { setLocalStatus(selectedStatus ?? null); }, [selectedStatus]);
  useEffect(() => { setLocalScope(selectedScope ?? null); }, [selectedScope]);
  useEffect(() => { setLocalProjectFilter(selectedProjectFilter ?? null); }, [selectedProjectFilter]);
  useEffect(() => { setLocalSource(selectedSource ?? null); }, [selectedSource]);
  useEffect(() => { setLocalSort(selectedSort ?? null); }, [selectedSort]);

  const hasFilters = selectedContextIds.length > 0 || localEnergy || localMaxMins || localDue.length > 0 || localStatus || localProjectFilter || localSource || (localScope && localScope !== "all");

  // Count active select-based filters (not context pills)
  const activeFilterCount = [localEnergy, localMaxMins, localDue.length > 0 ? "due" : null, localStatus, localProjectFilter, localSource, (localScope && localScope !== "all") ? localScope : null].filter(Boolean).length;

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
              setLocalDue([]);
              setLocalStatus(null);
              setLocalScope(null);
              setLocalProjectFilter(null);
              setLocalSource(null);
              setLocalSort(null);
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

        {/* Due filter (multi-select) */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`w-full md:w-[140px] h-9 md:h-7 text-xs justify-between font-normal ${localDue.length > 0 ? "border-primary/50" : ""}`}
            >
              {localDue.length === 0
                ? "Any due date"
                : localDue.length === 1
                  ? dueOptions.find((o) => o.value === localDue[0])?.label ?? localDue[0]
                  : `${localDue.length} due filters`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            {dueOptions.map((opt) => {
              const checked = localDue.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => {
                      const next = checked
                        ? localDue.filter((v) => v !== opt.value)
                        : [...localDue, opt.value];
                      setLocalDue(next);
                      onDueChange(next);
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
            {localDue.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs mt-1"
                onClick={() => { setLocalDue([]); onDueChange([]); }}
              >
                Clear
              </Button>
            )}
          </PopoverContent>
        </Popover>

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
              <SelectItem value="health">Routines</SelectItem>
              <SelectItem value="regular">Regular tasks</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Sort */}
        {onSortChange && (
          <Select
            value={localSort || "default"}
            onValueChange={(v) => {
              const val = v === "default" ? null : v;
              setLocalSort(val);
              onSortChange(val);
              setFiltersOpen(false);
            }}
          >
            <SelectTrigger className="w-full md:w-[140px] h-9 md:h-7 text-xs">
              <ArrowUpDown className="h-3 w-3 mr-1 shrink-0" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default order</SelectItem>
              <SelectItem value="project">By project</SelectItem>
              <SelectItem value="due">By due date</SelectItem>
              <SelectItem value="context">By context</SelectItem>
              <SelectItem value="energy">By energy</SelectItem>
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
