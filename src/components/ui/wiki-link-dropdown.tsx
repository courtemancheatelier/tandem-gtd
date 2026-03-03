"use client";

import * as React from "react";
import type { WikiSuggestion } from "@/lib/hooks/use-wiki-autocomplete";

interface WikiLinkDropdownProps {
  suggestions: WikiSuggestion[];
  activeIndex: number;
  position: { top: number; left: number };
  onSelect: (suggestion: WikiSuggestion) => void;
}

export function WikiLinkDropdown({
  suggestions,
  activeIndex,
  position,
  onSelect,
}: WikiLinkDropdownProps) {
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (dropdownRef.current) {
      const activeEl = dropdownRef.current.children[activeIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [activeIndex]);

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 w-64 bg-popover border border-border rounded-md shadow-md max-h-[200px] overflow-y-auto"
      style={{ top: position.top, left: Math.max(0, position.left) }}
    >
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion.id}
          type="button"
          className={`w-full text-left px-3 py-2 text-sm truncate hover:bg-accent ${
            index === activeIndex ? "bg-accent" : ""
          }`}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent textarea blur
            onSelect(suggestion);
          }}
        >
          {suggestion.title}
        </button>
      ))}
    </div>
  );
}
