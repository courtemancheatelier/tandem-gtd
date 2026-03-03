"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
} from "react";
import type { SlashCommandItem } from "./SlashCommandExtension";
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Table,
  Code,
  Quote,
  Minus,
  Image,
  Link,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  list: List,
  listOrdered: ListOrdered,
  listChecks: ListChecks,
  table: Table,
  code: Code,
  quote: Quote,
  minus: Minus,
  image: Image,
  link: Link,
};

export interface SlashCommandMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export const SlashCommandMenu = forwardRef<
  SlashCommandMenuRef,
  SlashCommandMenuProps
>(function SlashCommandMenu({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // Scroll selected item into view
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
      if (event.key === "Enter") {
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
      className="z-50 rounded-lg border border-border bg-popover p-1 shadow-md max-h-[300px] overflow-y-auto w-[220px]"
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((item, index) => {
        const Icon = iconMap[item.icon];
        return (
          <button
            key={item.title}
            type="button"
            className={`flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm text-left transition-colors ${
              index === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50"
            }`}
            onClick={() => selectItem(index)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            {Icon && <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
            <div className="min-w-0">
              <div className="font-medium truncate">{item.title}</div>
              <div className="text-xs text-muted-foreground truncate">
                {item.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
});
