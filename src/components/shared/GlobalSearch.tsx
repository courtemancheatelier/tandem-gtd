"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Search,
  CheckCircle2,
  Circle,
  FolderKanban,
  Inbox,
  Clock,
  ArrowRight,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskResult {
  id: string;
  title: string;
  status: string;
  isNextAction: boolean;
  projectId: string | null;
  projectTitle: string | null;
  contextName: string | null;
}

interface ProjectResult {
  id: string;
  title: string;
  status: string;
  taskCount: number;
}

interface InboxResult {
  id: string;
  content: string;
  status: string;
  createdAt: string;
}

interface WaitingForResult {
  id: string;
  description: string;
  person: string;
  isResolved: boolean;
}

interface SearchResults {
  tasks: TaskResult[];
  projects: ProjectResult[];
  inbox: InboxResult[];
  waitingFor: WaitingForResult[];
  totalCount: number;
}

type FlatItem =
  | { type: "task"; data: TaskResult }
  | { type: "project"; data: ProjectResult }
  | { type: "inbox"; data: InboxResult }
  | { type: "waitingFor"; data: WaitingForResult };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenResults(results: SearchResults): FlatItem[] {
  const items: FlatItem[] = [];
  for (const t of results.tasks) items.push({ type: "task", data: t });
  for (const p of results.projects) items.push({ type: "project", data: p });
  for (const i of results.inbox) items.push({ type: "inbox", data: i });
  for (const w of results.waitingFor) items.push({ type: "waitingFor", data: w });
  return items;
}

function getItemUrl(item: FlatItem): string {
  switch (item.type) {
    case "task":
      return item.data.projectId
        ? `/projects/${item.data.projectId}`
        : "/do-now";
    case "project":
      return `/projects/${item.data.id}`;
    case "inbox":
      return "/inbox";
    case "waitingFor":
      return "/waiting-for";
  }
}

function statusBadgeVariant(
  status: string
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "COMPLETED":
    case "ACHIEVED":
    case "PROCESSED":
      return "secondary";
    case "DROPPED":
    case "DELETED":
      return "destructive";
    default:
      return "outline";
  }
}

function formatStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Result item renderers
// ---------------------------------------------------------------------------

function TaskItem({ data }: { data: TaskResult }) {
  const isComplete = data.status === "COMPLETED";
  return (
    <div className="flex items-center gap-3 min-w-0">
      {isComplete ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <div className="flex-1 min-w-0">
        <span className={cn("truncate block", isComplete && "line-through text-muted-foreground")}>
          {data.title}
        </span>
      </div>
      {data.contextName && (
        <span className="text-xs text-muted-foreground shrink-0">
          {data.contextName}
        </span>
      )}
      {data.projectTitle && (
        <span className="text-xs text-muted-foreground truncate max-w-[120px] shrink-0">
          {data.projectTitle}
        </span>
      )}
      {data.isNextAction && (
        <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
          Next
        </Badge>
      )}
    </div>
  );
}

function ProjectItem({ data }: { data: ProjectResult }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <span className="truncate block">{data.title}</span>
      </div>
      <span className="text-xs text-muted-foreground shrink-0">
        {data.taskCount} task{data.taskCount !== 1 ? "s" : ""}
      </span>
      <Badge variant={statusBadgeVariant(data.status)} className="shrink-0 text-[10px] px-1.5 py-0">
        {formatStatus(data.status)}
      </Badge>
    </div>
  );
}

function InboxItem({ data }: { data: InboxResult }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Inbox className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <span className="truncate block">{data.content}</span>
      </div>
      <Badge variant={statusBadgeVariant(data.status)} className="shrink-0 text-[10px] px-1.5 py-0">
        {formatStatus(data.status)}
      </Badge>
    </div>
  );
}

function WaitingForItem({ data }: { data: WaitingForResult }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <span className={cn("truncate block", data.isResolved && "line-through text-muted-foreground")}>
          {data.description}
        </span>
      </div>
      <span className="text-xs text-muted-foreground shrink-0">
        {data.person}
      </span>
      {data.isResolved && (
        <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
          Resolved
        </Badge>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const flatItems = results ? flattenResults(results) : [];

  // -------------------------------------------------------------------------
  // Cmd+K / Ctrl+K global listener
  // -------------------------------------------------------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // -------------------------------------------------------------------------
  // Reset state when modal closes
  // -------------------------------------------------------------------------
  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setQuery("");
      setResults(null);
      setActiveIndex(0);
      setLoading(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    }
  }, []);

  // -------------------------------------------------------------------------
  // Auto-focus input when modal opens
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // -------------------------------------------------------------------------
  // Debounced search
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!query.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query.trim())}&type=all`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const data: SearchResults = await res.json();
          setResults(data);
          setActiveIndex(0);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Ignore aborted requests
          return;
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  // -------------------------------------------------------------------------
  // Navigate to selected item
  // -------------------------------------------------------------------------
  const navigateTo = useCallback(
    (item: FlatItem) => {
      setOpen(false);
      router.push(getItemUrl(item));
    },
    [router]
  );

  // -------------------------------------------------------------------------
  // Scroll active item into view
  // -------------------------------------------------------------------------
  useEffect(() => {
    const el = itemRefs.current.get(activeIndex);
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  // -------------------------------------------------------------------------
  // Keyboard navigation
  // -------------------------------------------------------------------------
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flatItems.length > 0 && flatItems[activeIndex]) {
        navigateTo(flatItems[activeIndex]);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Section rendering
  // -------------------------------------------------------------------------
  function renderResults() {
    if (!results) return null;

    if (results.totalCount === 0) {
      return (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          No results for &ldquo;{query}&rdquo;
        </div>
      );
    }

    let globalIndex = 0;
    const sections: React.ReactNode[] = [];

    function renderSection<T>(
      label: string,
      items: T[],
      renderItem: (item: T, index: number) => React.ReactNode
    ) {
      if (items.length === 0) return;
      const sectionStart = globalIndex;

      sections.push(
        <div key={label}>
          {sectionStart > 0 && <Separator />}
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </div>
          {items.map((item) => {
            const idx = globalIndex;
            globalIndex++;
            return renderItem(item, idx);
          })}
        </div>
      );
    }

    renderSection("Tasks", results.tasks, (task, idx) => (
      <div
        key={task.id}
        ref={(el) => {
          if (el) itemRefs.current.set(idx, el);
          else itemRefs.current.delete(idx);
        }}
        className={cn(
          "px-3 py-2 cursor-pointer flex items-center gap-2 rounded-sm mx-1",
          activeIndex === idx
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent/50"
        )}
        onClick={() => navigateTo({ type: "task", data: task })}
        onMouseEnter={() => setActiveIndex(idx)}
      >
        <div className="flex-1 min-w-0">
          <TaskItem data={task} />
        </div>
        {activeIndex === idx && (
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </div>
    ));

    renderSection("Projects", results.projects, (project, idx) => (
      <div
        key={project.id}
        ref={(el) => {
          if (el) itemRefs.current.set(idx, el);
          else itemRefs.current.delete(idx);
        }}
        className={cn(
          "px-3 py-2 cursor-pointer flex items-center gap-2 rounded-sm mx-1",
          activeIndex === idx
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent/50"
        )}
        onClick={() => navigateTo({ type: "project", data: project })}
        onMouseEnter={() => setActiveIndex(idx)}
      >
        <div className="flex-1 min-w-0">
          <ProjectItem data={project} />
        </div>
        {activeIndex === idx && (
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </div>
    ));

    renderSection("Inbox", results.inbox, (item, idx) => (
      <div
        key={item.id}
        ref={(el) => {
          if (el) itemRefs.current.set(idx, el);
          else itemRefs.current.delete(idx);
        }}
        className={cn(
          "px-3 py-2 cursor-pointer flex items-center gap-2 rounded-sm mx-1",
          activeIndex === idx
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent/50"
        )}
        onClick={() => navigateTo({ type: "inbox", data: item })}
        onMouseEnter={() => setActiveIndex(idx)}
      >
        <div className="flex-1 min-w-0">
          <InboxItem data={item} />
        </div>
        {activeIndex === idx && (
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </div>
    ));

    renderSection("Waiting For", results.waitingFor, (item, idx) => (
      <div
        key={item.id}
        ref={(el) => {
          if (el) itemRefs.current.set(idx, el);
          else itemRefs.current.delete(idx);
        }}
        className={cn(
          "px-3 py-2 cursor-pointer flex items-center gap-2 rounded-sm mx-1",
          activeIndex === idx
            ? "bg-accent text-accent-foreground"
            : "hover:bg-accent/50"
        )}
        onClick={() => navigateTo({ type: "waitingFor", data: item })}
        onMouseEnter={() => setActiveIndex(idx)}
      >
        <div className="flex-1 min-w-0">
          <WaitingForItem data={item} />
        </div>
        {activeIndex === idx && (
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </div>
    ));

    return sections;
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="md:max-w-xl p-0 gap-0 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-lg outline-none placeholder:text-muted-foreground"
            placeholder="Search tasks, projects, inbox..."
            autoComplete="off"
            spellCheck={false}
          />
          {loading && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Results area */}
        <ScrollArea className="max-h-[60vh]">
          {!query.trim() && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Type to search across all your GTD items
            </div>
          )}
          {query.trim() && !loading && results && renderResults()}
          {query.trim() && loading && !results && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
              Searching...
            </div>
          )}
        </ScrollArea>

        {/* Footer hint — hidden on mobile (no keyboard) */}
        {flatItems.length > 0 && (
          <div className="border-t px-4 py-2 hidden md:flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono text-[10px]">&uarr;</kbd>
              <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono text-[10px] ml-0.5">&darr;</kbd>
              <span className="ml-1">Navigate</span>
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono text-[10px]">&crarr;</kbd>
              <span className="ml-1">Open</span>
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono text-[10px]">Esc</kbd>
              <span className="ml-1">Close</span>
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
