"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface WikiSuggestion {
  id: string;
  slug: string;
  title: string;
  teamId?: string | null;
}

interface DropdownPosition {
  top: number;
  left: number;
}

export function useWikiAutocomplete(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  teamId?: string | null
) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<WikiSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition>({
    top: 0,
    left: 0,
  });

  const bracketStartRef = useRef(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController>();

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const fetchSuggestions = useCallback((query: string) => {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const params = new URLSearchParams();
        if (query) params.set("search", query);
        if (teamId) {
          params.set("teamId", teamId);
          params.set("includePersonal", "true");
        } else {
          // No specific scope — search across personal + all teams
          params.set("scope", "all");
        }
        const url = `/api/wiki?${params}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        const articles = Array.isArray(data) ? data : data.articles ?? [];
        if (!controller.signal.aborted) {
          setSuggestions(
            articles.slice(0, 8).map((a: WikiSuggestion & { teamId?: string | null }) => ({
              id: a.id,
              slug: a.slug,
              title: a.title,
              teamId: a.teamId || null,
            }))
          );
          setActiveIndex(0);
        }
      } catch {
        // Silently fail (abort or network error)
      }
    }, 200);
  }, [teamId]);

  const updateDropdownPosition = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || bracketStartRef.current === -1) return;

    const pos = getCaretCoordinates(textarea, bracketStartRef.current);
    setDropdownPosition({
      top: pos.top + pos.height + 4,
      left: Math.min(pos.left, textarea.clientWidth - 260),
    });
  }, [textareaRef]);

  const handleChange = useCallback(
    (value: string, cursorPos: number) => {
      const before = value.slice(0, cursorPos);
      const openBracket = before.lastIndexOf("[[");

      if (openBracket === -1) {
        setIsOpen(false);
        return;
      }

      const afterBracket = before.slice(openBracket + 2);

      // Close if there's already a ]] or newline between [[ and cursor
      if (afterBracket.includes("]]") || afterBracket.includes("\n")) {
        setIsOpen(false);
        return;
      }

      bracketStartRef.current = openBracket;
      setIsOpen(true);
      fetchSuggestions(afterBracket);
      updateDropdownPosition();
    },
    [fetchSuggestions, updateDropdownPosition]
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(0);
    bracketStartRef.current = -1;
    clearTimeout(debounceRef.current);
  }, []);

  const handleSelect = useCallback(
    (suggestion: WikiSuggestion) => {
      const textarea = textareaRef.current;
      if (!textarea || bracketStartRef.current === -1) return;

      const start = bracketStartRef.current;
      const cursorPos = textarea.selectionStart;
      const value = textarea.value;

      const prefix = value.slice(0, start);
      const suffix = value.slice(cursorPos);
      const insertion = `[[${suggestion.title}]]`;
      const newValue = prefix + insertion + suffix;
      const newCursorPos = prefix.length + insertion.length;

      // Set value using native setter to trigger React onChange
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(textarea, newValue);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }

      close();

      requestAnimationFrame(() => {
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
      });
    },
    [textareaRef, close]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!isOpen || suggestions.length === 0) return false;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0
          );
          return true;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1
          );
          return true;
        case "Enter":
        case "Tab":
          e.preventDefault();
          handleSelect(suggestions[activeIndex]);
          return true;
        case "Escape":
          e.preventDefault();
          close();
          return true;
      }
      return false;
    },
    [isOpen, suggestions, activeIndex, handleSelect, close]
  );

  return {
    isOpen,
    suggestions,
    activeIndex,
    dropdownPosition,
    handleChange,
    handleKeyDown,
    handleSelect,
    close,
  };
}

/**
 * Get caret pixel coordinates in a textarea using a mirror element.
 * Returns position relative to the textarea's border box.
 */
function getCaretCoordinates(
  element: HTMLTextAreaElement,
  position: number
): { top: number; left: number; height: number } {
  const mirror = document.createElement("div");
  const computed = window.getComputedStyle(element);

  mirror.style.position = "absolute";
  mirror.style.top = "0";
  mirror.style.left = "0";
  mirror.style.visibility = "hidden";
  mirror.style.overflow = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";

  const stylesToCopy = [
    "width",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "letterSpacing",
    "textTransform",
    "wordSpacing",
    "textIndent",
    "lineHeight",
    "tabSize",
    "boxSizing",
  ];

  for (const prop of stylesToCopy) {
    mirror.style.setProperty(
      prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
      computed.getPropertyValue(prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`))
    );
  }

  document.body.appendChild(mirror);

  mirror.textContent = element.value.substring(0, position);

  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.appendChild(marker);

  const lineHeight =
    marker.offsetHeight ||
    parseInt(computed.lineHeight) ||
    parseInt(computed.fontSize) * 1.2;

  const result = {
    top: marker.offsetTop - element.scrollTop,
    left: marker.offsetLeft - element.scrollLeft,
    height: lineHeight,
  };

  document.body.removeChild(mirror);
  return result;
}
