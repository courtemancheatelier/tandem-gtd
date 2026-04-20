"use client";

import { useCallback } from "react";

export interface ToolbarAction {
  id: string;
  label: string;
  icon: string; // lucide icon name — mapped in MarkdownToolbar
  shortcut?: string; // e.g. "Cmd+B"
  group: "inline" | "heading" | "block" | "insert";
  execute: (textarea: HTMLTextAreaElement) => string;
}

/**
 * Wrap the selected text with prefix/suffix. If nothing is selected,
 * inserts prefix + placeholder + suffix and selects the placeholder.
 */
function wrapSelection(
  textarea: HTMLTextAreaElement,
  prefix: string,
  suffix: string,
  placeholder = "text"
): string {
  const { selectionStart, selectionEnd, value } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);
  const inner = selected || placeholder;
  const newValue =
    value.slice(0, selectionStart) + prefix + inner + suffix + value.slice(selectionEnd);

  requestAnimationFrame(() => {
    textarea.focus();
    if (selected) {
      textarea.setSelectionRange(
        selectionStart + prefix.length,
        selectionStart + prefix.length + inner.length
      );
    } else {
      textarea.setSelectionRange(
        selectionStart + prefix.length,
        selectionStart + prefix.length + placeholder.length
      );
    }
  });

  return newValue;
}

/**
 * Prefix the current line with a string. If already prefixed, removes it (toggle).
 */
function prefixLine(
  textarea: HTMLTextAreaElement,
  prefix: string
): string {
  const { selectionStart, value } = textarea;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEnd = value.indexOf("\n", selectionStart);
  const end = lineEnd === -1 ? value.length : lineEnd;
  const line = value.slice(lineStart, end);

  let newValue: string;
  let newCursor: number;

  if (line.startsWith(prefix)) {
    // Toggle off
    newValue = value.slice(0, lineStart) + line.slice(prefix.length) + value.slice(end);
    newCursor = Math.max(lineStart, selectionStart - prefix.length);
  } else {
    // Strip any existing heading prefixes when adding a heading
    const stripped = line.replace(/^#{1,6}\s/, "");
    newValue = value.slice(0, lineStart) + prefix + stripped + value.slice(end);
    newCursor = lineStart + prefix.length + (selectionStart - lineStart);
    // Adjust if we stripped an existing prefix
    if (stripped.length !== line.length) {
      newCursor = lineStart + prefix.length;
    }
  }

  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(newCursor, newCursor);
  });

  return newValue;
}

/**
 * Insert text at the cursor position.
 */
function insertAtCursor(
  textarea: HTMLTextAreaElement,
  text: string,
  cursorOffset?: number
): string {
  const { selectionStart, selectionEnd, value } = textarea;
  const newValue =
    value.slice(0, selectionStart) + text + value.slice(selectionEnd);

  const pos = cursorOffset !== undefined
    ? selectionStart + cursorOffset
    : selectionStart + text.length;

  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
  });

  return newValue;
}

export const toolbarActions: ToolbarAction[] = [
  // Inline group
  {
    id: "bold",
    label: "Bold",
    icon: "Bold",
    shortcut: "Cmd+B",
    group: "inline",
    execute: (ta) => wrapSelection(ta, "**", "**", "bold text"),
  },
  {
    id: "italic",
    label: "Italic",
    icon: "Italic",
    shortcut: "Cmd+I",
    group: "inline",
    execute: (ta) => wrapSelection(ta, "_", "_", "italic text"),
  },
  {
    id: "code",
    label: "Inline Code",
    icon: "Code",
    shortcut: "Cmd+E",
    group: "inline",
    execute: (ta) => wrapSelection(ta, "`", "`", "code"),
  },
  // Heading group
  {
    id: "h1",
    label: "Heading 1",
    icon: "Heading1",
    group: "heading",
    execute: (ta) => prefixLine(ta, "# "),
  },
  {
    id: "h2",
    label: "Heading 2",
    icon: "Heading2",
    group: "heading",
    execute: (ta) => prefixLine(ta, "## "),
  },
  {
    id: "h3",
    label: "Heading 3",
    icon: "Heading3",
    group: "heading",
    execute: (ta) => prefixLine(ta, "### "),
  },
  // Block group
  {
    id: "quote",
    label: "Blockquote",
    icon: "Quote",
    group: "block",
    execute: (ta) => prefixLine(ta, "> "),
  },
  {
    id: "ul",
    label: "Bullet List",
    icon: "List",
    group: "block",
    execute: (ta) => prefixLine(ta, "- "),
  },
  {
    id: "ol",
    label: "Numbered List",
    icon: "ListOrdered",
    group: "block",
    execute: (ta) => prefixLine(ta, "1. "),
  },
  {
    id: "task",
    label: "Task List",
    icon: "ListChecks",
    group: "block",
    execute: (ta) => prefixLine(ta, "- [ ] "),
  },
  {
    id: "codeblock",
    label: "Code Block",
    icon: "FileCode",
    shortcut: "Cmd+Shift+E",
    group: "block",
    execute: (ta) => wrapSelection(ta, "```\n", "\n```", "code"),
  },
  // Insert group
  {
    id: "link",
    label: "Link",
    icon: "Link",
    shortcut: "Cmd+K",
    group: "insert",
    execute: (ta) => {
      const { selectionStart, selectionEnd, value } = ta;
      const selected = value.slice(selectionStart, selectionEnd);
      if (selected) {
        const newValue = value.slice(0, selectionStart) + `[${selected}](url)` + value.slice(selectionEnd);
        const urlStart = selectionStart + selected.length + 3;
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(urlStart, urlStart + 3);
        });
        return newValue;
      }
      return wrapSelection(ta, "[", "](url)", "link text");
    },
  },
  {
    id: "image",
    label: "Image",
    icon: "Image",
    group: "insert",
    execute: (ta) => insertAtCursor(ta, "![alt](https://)", 15),
  },
  {
    id: "table",
    label: "Table",
    icon: "Table",
    group: "insert",
    execute: (ta) =>
      insertAtCursor(
        ta,
        "\n| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n",
        3
      ),
  },
  {
    id: "wikilink",
    label: "Wiki Link",
    icon: "BookOpen",
    group: "insert",
    execute: (ta) => insertAtCursor(ta, "[[", 2),
  },
];

const shortcutMap: Record<string, string> = {};
for (const action of toolbarActions) {
  if (action.shortcut) {
    shortcutMap[action.shortcut] = action.id;
  }
}

export function useMarkdownToolbar(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  onChange: (value: string) => void
) {
  const executeAction = useCallback(
    (actionId: string) => {
      const ta = textareaRef.current;
      if (!ta) return;

      const action = toolbarActions.find((a) => a.id === actionId);
      if (!action) return;

      const newValue = action.execute(ta);
      // Trigger React's onChange by using native setter
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      if (nativeSetter) {
        nativeSetter.call(ta, newValue);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      }
      onChange(newValue);
    },
    [textareaRef, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return false;

      let key = "";
      if (meta) key += "Cmd+";
      if (e.shiftKey) key += "Shift+";
      key += e.key.toUpperCase();

      const actionId = shortcutMap[key];
      if (actionId) {
        e.preventDefault();
        executeAction(actionId);
        return true;
      }
      return false;
    },
    [executeAction]
  );

  return { executeAction, handleKeyDown };
}
