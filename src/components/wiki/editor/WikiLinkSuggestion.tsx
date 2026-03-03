/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { WikiSuggestion } from "@/lib/hooks/use-wiki-autocomplete";

export interface WikiLinkSuggestionRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface WikiLinkSuggestionProps {
  items: WikiSuggestion[];
  command: (item: WikiSuggestion) => void;
}

export const WikiLinkSuggestionMenu = forwardRef<
  WikiLinkSuggestionRef,
  WikiLinkSuggestionProps
>(function WikiLinkSuggestionMenu({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const selected = container.children[selectedIndex] as HTMLElement;
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    },
    [items, command]
  );

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) =>
          prev <= 0 ? items.length - 1 : prev - 1
        );
        return true;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) =>
          prev >= items.length - 1 ? 0 : prev + 1
        );
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="z-50 rounded-lg border border-border bg-popover p-1 shadow-md max-h-[200px] overflow-y-auto w-[264px]"
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className={`flex items-center w-full rounded-md px-2 py-1.5 text-sm text-left transition-colors ${
            index === selectedIndex
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50"
          }`}
          onClick={() => selectItem(index)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span className="truncate">{item.title}</span>
        </button>
      ))}
    </div>
  );
});

/**
 * Creates the Tiptap suggestion configuration for wiki link autocomplete.
 */
export function createWikiLinkSuggestion(teamId?: string | null) {
  let abortController: AbortController | null = null;

  return {
    items: async ({ query }: { query: string }): Promise<WikiSuggestion[]> => {
      if (abortController) {
        abortController.abort();
      }
      abortController = new AbortController();

      try {
        const params = new URLSearchParams();
        if (query) params.set("search", query);
        if (teamId) {
          params.set("teamId", teamId);
          params.set("includePersonal", "true");
        } else {
          params.set("scope", "all");
        }
        const res = await fetch(`/api/wiki?${params}`, {
          signal: abortController.signal,
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.slice(0, 8).map(
          (a: WikiSuggestion & { teamId?: string | null }) => ({
            id: a.id,
            slug: a.slug,
            title: a.title,
            teamId: a.teamId || null,
          })
        );
      } catch {
        return [];
      }
    },
    command: ({
      editor,
      range,
      props,
    }: {
      editor: any;
      range: { from: number; to: number };
      props: WikiSuggestion;
    }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "wikiLink",
          attrs: { title: props.title },
        })
        .run();
    },
  };
}
