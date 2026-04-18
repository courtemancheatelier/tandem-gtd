# Keyboard Shortcuts — Power User Navigation

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement

### The Need

Tandem is a daily-use productivity tool. Power users interact with it dozens of times per day. Every action that requires moving the mouse — clicking a task to expand it, navigating to the inbox, completing a task — adds friction. Keyboard shortcuts are the difference between "I tolerate this tool" and "this tool is an extension of my brain."

### What Exists

Tandem already has a solid keyboard shortcut foundation:

1. **`useKeyboardShortcuts` hook** (`src/lib/hooks/use-keyboard-shortcuts.ts`) — handles keydown events, input element detection, modifier key matching
2. **`KeyboardShortcutsProvider`** (`src/components/shared/KeyboardShortcutsProvider.tsx`) — React context that provides global and page-level shortcuts, plus a leader key system (`G then X` pattern) for navigation
3. **`ShortcutOverlay`** (`src/components/shared/ShortcutOverlay.tsx`) — modal triggered by `?` showing all shortcuts grouped by category
4. **Existing shortcuts:**
   - `Cmd+I` — Capture to Inbox (handled by `InboxCaptureModal`)
   - `Cmd+K` — Open Global Search
   - `?` — Show shortcut help overlay
   - `Esc` — Close modal
   - `G then I` — Go to Inbox
   - `G then D` — Go to Do Now
   - `G then P` — Go to Projects
   - `G then W` — Go to Waiting For
   - `G then S` — Go to Someday/Maybe
   - `G then A` — Go to Areas
   - `G then R` — Go to Weekly Review

### The Gap

The existing shortcuts cover **navigation** and **capture** but not **interaction**. There is no way to:

1. Navigate through a list of tasks with `j`/`k` (vim-style)
2. Complete a task without clicking the checkbox
3. Expand, edit, or delete a focused task from the keyboard
4. Move a task to a different project
5. Navigate to wiki or help via leader keys

The infrastructure is in place — we need to extend it with list-level focus management and task action shortcuts.

---

## 2. Shortcut Inventory

### 2.1 Global Shortcuts (Any Page)

These work from any page and are already implemented unless marked "NEW":

| Shortcut | Action | Status |
|----------|--------|--------|
| `Cmd+I` | Capture to Inbox | Exists |
| `Cmd+K` | Open Global Search | Exists |
| `?` | Show shortcut help overlay | Exists |
| `Esc` | Close modal / deselect | Exists |
| `n` | New task (opens quick-add modal) | **NEW** |
| `G then I` | Go to Inbox | Exists |
| `G then D` | Go to Do Now | Exists |
| `G then P` | Go to Projects | Exists |
| `G then W` | Go to Waiting For | Exists |
| `G then S` | Go to Someday/Maybe | Exists |
| `G then A` | Go to Areas | Exists |
| `G then R` | Go to Weekly Review | Exists |
| `G then K` | Go to Wiki | **NEW** |
| `G then H` | Go to Help | **NEW** |
| `G then C` | Go to Contexts | **NEW** |
| `G then G` | Go to Goals (Horizons) | **NEW** |

### 2.2 List Navigation Shortcuts (Do Now, Inbox, Project Tasks)

Active on pages that show a list of items:

| Shortcut | Action |
|----------|--------|
| `j` | Move focus to next item |
| `k` | Move focus to previous item |
| `Enter` | Expand / open focused item |
| `x` or `Space` | Complete focused task (Do Now) / process focused item (Inbox) |
| `e` | Edit focused item (enter inline edit mode) |
| `Backspace` or `Delete` | Delete focused item (with confirmation) |
| `m` | Move focused task to different project (opens project picker) |
| `Esc` | Deselect / collapse expanded item |

### 2.3 Quick-Add Shortcuts (Inside Quick-Add Modal)

| Shortcut | Action |
|----------|--------|
| `Cmd+Enter` | Save and close |
| `Esc` | Cancel and close |

---

## 3. Focus Management System

### 3.1 Architecture

The focus system uses a `data-shortcut-index` attribute on list items and a `focusedIndex` state in a React context. This avoids managing actual DOM focus (which conflicts with screen readers and existing tab order) in favor of a visual highlight + action dispatch pattern.

```typescript
// src/lib/hooks/use-list-focus.ts

interface UseListFocusOptions {
  itemCount: number;
  enabled?: boolean;
  onSelect?: (index: number) => void;
  onActivate?: (index: number) => void;
}

interface UseListFocusReturn {
  focusedIndex: number | null;
  setFocusedIndex: (index: number | null) => void;
  getFocusProps: (index: number) => {
    "data-shortcut-index": number;
    "data-shortcut-focused": boolean;
    ref: (el: HTMLElement | null) => void;
  };
}

export function useListFocus({
  itemCount,
  enabled = true,
  onSelect,
  onActivate,
}: UseListFocusOptions): UseListFocusReturn {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map());

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex === null) return;
    const el = itemRefs.current.get(focusedIndex);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedIndex]);

  // The hook returns props to spread on each list item.
  // Actual keyboard handling is in the page component via registerPageShortcuts.
  return {
    focusedIndex,
    setFocusedIndex,
    getFocusProps: (index: number) => ({
      "data-shortcut-index": index,
      "data-shortcut-focused": focusedIndex === index,
      ref: (el: HTMLElement | null) => {
        if (el) itemRefs.current.set(index, el);
        else itemRefs.current.delete(index);
      },
    }),
  };
}
```

### 3.2 Visual Focus Indicator

Focused items receive a visible ring/highlight:

```typescript
// In TaskCard or list item component
<div
  {...getFocusProps(index)}
  className={cn(
    "rounded-lg border transition-all",
    focusedIndex === index && "ring-2 ring-primary ring-offset-2 bg-accent/50"
  )}
>
```

### 3.3 Integration with Page Components

Each page that supports list navigation registers its shortcuts via the existing `registerPageShortcuts` API from `KeyboardShortcutsProvider`:

```typescript
// In DoNowContent (src/app/(dashboard)/do-now/page.tsx)

const { registerPageShortcuts, unregisterPageShortcuts } = useShortcutsContext();
const { focusedIndex, setFocusedIndex, getFocusProps } = useListFocus({
  itemCount: filteredTasks.length,
});

useEffect(() => {
  registerPageShortcuts([
    {
      key: "j",
      handler: () => setFocusedIndex(
        focusedIndex === null ? 0 : Math.min(focusedIndex + 1, filteredTasks.length - 1)
      ),
      description: "Next item",
      category: "List",
    },
    {
      key: "k",
      handler: () => setFocusedIndex(
        focusedIndex === null ? 0 : Math.max(focusedIndex - 1, 0)
      ),
      description: "Previous item",
      category: "List",
    },
    {
      key: "x",
      handler: () => {
        if (focusedIndex !== null && filteredTasks[focusedIndex]) {
          handleComplete(filteredTasks[focusedIndex].id);
        }
      },
      description: "Complete task",
      category: "List",
    },
    {
      key: "Enter",
      handler: () => {
        if (focusedIndex !== null) {
          setExpandedTaskId(filteredTasks[focusedIndex]?.id ?? null);
        }
      },
      description: "Expand item",
      category: "List",
    },
    {
      key: "Escape",
      handler: () => {
        setFocusedIndex(null);
        setExpandedTaskId(null);
      },
      description: "Deselect",
      category: "List",
    },
    // ... more shortcuts
  ]);

  return () => unregisterPageShortcuts();
}, [focusedIndex, filteredTasks.length]); // Re-register when focus or list changes
```

---

## 4. New Global Shortcuts

### 4.1 Quick-Add Task (`n`)

Pressing `n` from any page opens a lightweight task creation modal. Different from `Cmd+I` (inbox capture) — this creates a task directly with project and context selection.

```typescript
// Add to KeyboardShortcutsProvider appShortcuts

{
  key: "n",
  handler: () => {
    // Dispatch a custom event that QuickAddTask listens for
    document.dispatchEvent(new CustomEvent("tandem:quick-add-task"));
  },
  description: "New task",
  category: "Actions",
},
```

Component: `src/components/tasks/QuickAddTask.tsx` — a Dialog with title, project picker, context picker, and save button. Minimal fields, keyboard-friendly (`Cmd+Enter` to save).

### 4.2 New Navigation Targets

Add to the `navigationMap` in `KeyboardShortcutsProvider`:

```typescript
const navigationMap: Record<string, { path: string; label: string }> = {
  // ... existing entries ...
  k: { path: "/wiki", label: "Wiki" },        // NEW
  h: { path: "/help", label: "Help" },         // NEW
  c: { path: "/contexts", label: "Contexts" }, // NEW
  g: { path: "/horizons", label: "Horizons" }, // NEW
};
```

Note: `G then G` for horizons/goals. The leader key system already handles double-key sequences, so `G` followed by `G` works — the first `G` activates leader mode, the second `G` navigates.

---

## 5. Conflict Avoidance

### 5.1 Input Element Detection

The existing `isInputElement()` function in both `use-keyboard-shortcuts.ts` and `KeyboardShortcutsProvider.tsx` already checks for `input`, `textarea`, `select`, and `contentEditable` elements. All shortcuts are suppressed when any of these has focus.

### 5.2 Modal State

When any Dialog/modal is open (Global Search, Inbox Capture, Quick Add Task, ShortcutOverlay), most shortcuts should be suppressed. The existing pattern handles this implicitly: modals trap focus in input elements, which triggers `isInputElement()` suppression.

For modals without input fields (like confirmation dialogs), add an explicit check:

```typescript
// In KeyboardShortcutsProvider
const [modalOpen, setModalOpen] = useState(false);

// Pass setModalOpen to context so modals can signal their state
// Suppress non-global shortcuts when modalOpen is true
```

### 5.3 No Conflicts with Browser Shortcuts

All single-key shortcuts (`j`, `k`, `n`, `x`, `e`, `m`, `?`) only fire when not in an input field. Modifier-key shortcuts use `Cmd` (Mac) / `Ctrl` (Windows), which the existing hook normalizes. No shortcuts conflict with browser defaults:

- `Cmd+K` — conflicts with some browsers' address bar focus, but the existing implementation `preventDefault()`s it
- `?` — requires Shift on US keyboards, which the hook handles correctly
- `/` — NOT used (some apps use it for search) since `Cmd+K` already exists

---

## 6. Implementation Phases

### Phase 1: New Global Navigation + Quick-Add

**Goal:** Complete the global navigation map and add the quick-add task shortcut.

**Code changes:**
- `src/components/shared/KeyboardShortcutsProvider.tsx` — Add wiki, help, contexts, horizons to `navigationMap`. Add `n` shortcut for quick-add.
- `src/components/tasks/QuickAddTask.tsx` — Quick-add task modal (new)
- `src/app/(dashboard)/layout.tsx` — Add `<QuickAddTask />` to layout

**Files touched:** 3 (1 provider update, 1 new component, 1 layout update)

### Phase 2: List Focus — j/k Navigation

**Goal:** Navigate task lists with `j`/`k` keys on Do Now page.

**Code changes:**
- `src/lib/hooks/use-list-focus.ts` — Focus management hook (new)
- `src/app/(dashboard)/do-now/page.tsx` — Integrate `useListFocus`, register `j`/`k` page shortcuts
- `src/components/tasks/TaskCard.tsx` — Accept focus props, render focus ring

**Files touched:** 3 (1 hook, 1 page, 1 component)

### Phase 3: Task Action Shortcuts

**Goal:** Complete, edit, delete, and move tasks from keyboard.

**Code changes:**
- `src/app/(dashboard)/do-now/page.tsx` — Register `x`/`Space`, `e`, `Delete`, `m` shortcuts
- `src/components/tasks/TaskCard.tsx` — Support programmatic expand/edit mode
- `src/components/tasks/ProjectPicker.tsx` — Keyboard-friendly project picker for `m` shortcut (new, or reuse existing if present)
- Delete confirmation dialog — keyboard-accessible

**Files touched:** ~4

### Phase 4: Inbox + Projects List Navigation

**Goal:** Extend j/k and action shortcuts to Inbox and Project task lists.

**Code changes:**
- `src/app/(dashboard)/inbox/page.tsx` — Integrate list focus and page shortcuts
- `src/app/(dashboard)/projects/[id]/page.tsx` — Integrate list focus and page shortcuts

**Files touched:** 2

### Phase 5: Help Overlay Enhancement

**Goal:** Update the shortcut overlay to show all new shortcuts including list-level actions.

**Code changes:**
- `src/components/shared/ShortcutOverlay.tsx` — Add "List" category, update display
- `src/components/shared/KeyboardShortcutsProvider.tsx` — Ensure all display shortcuts are registered

**Files touched:** 2

---

## 7. Edge Cases

- **Empty lists** — `j`/`k` do nothing when the list is empty. `focusedIndex` stays null.
- **Focus after list mutation** — When a task is completed or deleted, adjust `focusedIndex`. If the focused item is removed, move focus to the next item (or previous if it was the last).
- **Focus across filter changes** — When filters are applied and the list changes, reset `focusedIndex` to null.
- **Stale focus refs** — The `itemRefs` Map must be cleaned up when items are removed. The `ref` callback handles this by deleting entries when `el` is null.
- **Mobile** — Keyboard shortcuts are irrelevant on mobile. The `useKeyboardShortcuts` hook already only runs on `keydown` events, which mobile does not generate (except with external keyboards, where shortcuts should work).
- **Multiple lists on one page** — Do Now has both "Next Actions" and "Waiting For" sections. Focus management should apply to the main action list only, not waiting-for items.
- **Screen reader compatibility** — The visual focus ring should be accompanied by `aria-selected="true"` on the focused item. Consider adding `role="listbox"` and `role="option"` attributes for ARIA compliance.

---

## 8. What This Spec Does Not Cover

- **User-customizable key bindings** — All shortcuts are fixed in this spec. Custom bindings (a `KeyboardBinding` model or JSON on User) is a future feature.
- **Vim mode** — Full vim emulation (commands, operators, motions) is out of scope. We borrow `j`/`k` from vim but stop there.
- **Touch gestures** — Swipe-to-complete, swipe-to-delete are covered in `MOBILE_RESPONSIVENESS.md`, not here.
- **Macro recording** — No ability to record and replay shortcut sequences.
- **Shortcut conflicts with browser extensions** — Cannot be controlled from the app side.

---

## 9. Future Considerations

- **Custom key bindings** — Store per-user overrides as `{ shortcutId: string, keys: string[] }` JSON on the User model. Merge with defaults at render time.
- **Shortcut cheat sheet tooltip** — On first use, show a subtle "Press ? for keyboard shortcuts" tooltip in the corner.
- **Context-specific shortcuts** — Different shortcuts depending on which view is active (e.g., wiki-specific shortcuts for markdown editing).
- **Command palette** — Extend `Cmd+K` from search to a full command palette (like VS Code) where users can type actions: "create task", "go to inbox", "complete task: Buy groceries".
```

---
