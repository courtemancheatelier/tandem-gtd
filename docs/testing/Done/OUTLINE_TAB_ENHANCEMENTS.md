# Outline Tab Enhancements — Test Plan

## Prerequisites
- A project with sub-projects (at least 2 levels deep)
- Tasks in various states: NOT_STARTED, IN_PROGRESS, COMPLETED
- At least one context defined (e.g., @Computer, @Home)
- An empty sub-project (0 tasks, 0 children) for promote/demote testing

---

## Phase 1: Row Context Menu

### Task Context Menu (hover row)
- [ ] Hover over a task row → three-dot (⋯) button appears on right
- [ ] Click ⋯ → dropdown menu opens with all expected items
- [ ] "Mark in progress" shown for NOT_STARTED tasks → changes status
- [ ] "Mark complete" shown for NOT_STARTED and IN_PROGRESS tasks → completes task
- [ ] "Reopen" shown for COMPLETED tasks → changes back to NOT_STARTED
- [ ] Menu does not appear when not hovering (opacity-0 by default)

### Set Context (sub-menu)
- [ ] "Set context" sub-menu lists all user contexts
- [ ] "None" option clears the context
- [ ] Selecting a context → toast "Context updated" → badge appears on row
- [ ] Context persists after page refresh

### Set Due Date (sub-menu)
- [ ] "Set due date" sub-menu shows a date input
- [ ] Enter date and click "Set" → toast "Due date set" → date shows on row
- [ ] Click "Clear" → removes due date
- [ ] Overdue dates show in red

### Move To (sub-menu)
- [ ] "Move to..." sub-menu lists parent project and all sibling sub-projects
- [ ] Selecting a project moves the task → toast "Task moved" → tree updates
- [ ] Task disappears from original location and appears in target project
- [ ] Move targets list scrolls when many sub-projects exist (max-h-64)

### Delete Task
- [ ] First click shows "Delete" → item stays open
- [ ] Second click shows "Confirm delete" in red → deletes task
- [ ] Toast "Task deleted" appears
- [ ] Task removed from tree

### Convert to Sub-Project
- [ ] "Convert to sub-project" item visible on task rows
- [ ] Disabled (grayed out) when task is at depth >= 2
- [ ] Clicking creates a new sub-project with the task title
- [ ] Original task is deleted
- [ ] Toast "Converted to sub-project" appears
- [ ] Tree refreshes to show new sub-project

### Project Context Menu
- [ ] Hover over a project header → ⋯ button appears
- [ ] "Open project" links to `/projects/{id}`
- [ ] "Edit name" triggers inline edit (if handler provided)
- [ ] "Add task" focuses the add task input for that project
- [ ] "Add sub-project" sub-menu with title input → creates child project
- [ ] "Add sub-project" disabled at depth >= 2
- [ ] "Convert to task" shown only for sub-projects (not root project)
- [ ] "Convert to task" disabled if project has tasks or children
- [ ] "Delete" follows same two-click confirm pattern as tasks

---

## Phase 2: Type Badge Toggle

### Badge Display
- [ ] Sequential projects show slate badge with arrow icon
- [ ] Parallel projects show blue badge with branch icon
- [ ] SINGLE_ACTIONS type badge is NOT clickable (no toggle)

### Toggle Behavior
- [ ] Click Sequential badge → changes to Parallel immediately (optimistic)
- [ ] Click Parallel badge → changes to Sequential immediately
- [ ] Badge style updates instantly (color, icon, label)
- [ ] Server PATCH succeeds → no revert
- [ ] Server PATCH fails → toast error → reverts to original type
- [ ] Version conflict (409) handled gracefully

### Scope
- [ ] Toggle works on root project type badge
- [ ] Toggle works on sub-project type badges
- [ ] Global outline page (`/projects/outline`) does NOT have clickable badges (no handler passed)

---

## Phase 3: Promote / Demote

### Demote Task → Sub-Project (⌘])
- [ ] Focus a task row → press ⌘] → task converts to empty sub-project
- [ ] Also available via context menu "Convert to sub-project"
- [ ] New sub-project has same title as original task
- [ ] Original task is deleted
- [ ] Tree refreshes to show new sub-project node
- [ ] Disabled at depth >= 2 (no keyboard action, menu item grayed out)
- [ ] Toast "Converted to sub-project" appears

### Promote Sub-Project → Task (⌘[)
- [ ] Focus an empty sub-project header → press ⌘[ → converts to task
- [ ] Also available via context menu "Convert to task"
- [ ] New task has same title as original sub-project
- [ ] Sub-project is deleted
- [ ] Tree refreshes to show new task under parent project
- [ ] Blocked if sub-project has any tasks or children → toast "Cannot convert"
- [ ] Toast "Converted to task" appears

### Round-Trip
- [ ] Demote a task → ⌘] → then promote back → ⌘[ → original task title preserved
- [ ] Task appears in correct position after round-trip

---

## Phase 4: Multi-Select & Bulk Actions

### Selection Entry
- [ ] ⌘-click (Ctrl-click) on a task row → selects it, checkbox appears
- [ ] Selected row gets highlighted background (bg-primary/5)
- [ ] Checkbox visible on hover even before selection mode starts
- [ ] Once in selection mode, all task rows show checkboxes

### Selection Management
- [ ] Click checkbox to toggle individual task selection
- [ ] ⌘-click additional rows to add to selection
- [ ] Selection count shown in BulkActionBar
- [ ] "Deselect all" (X) clears selection and exits selection mode

### BulkActionBar
- [ ] Floating bar appears at bottom when in selection mode
- [ ] Shows correct count: "N selected"
- [ ] Context button → lists all contexts → bulk update works
- [ ] Energy button → LOW/MEDIUM/HIGH/None → bulk update works
- [ ] Time button → 5m/15m/30m/1h/2h → bulk update works
- [ ] Status button → NOT_STARTED/IN_PROGRESS → bulk update works
- [ ] Due date button → date picker → bulk update works
- [ ] Delete button → confirms → deletes all selected tasks
- [ ] Move to sub-project → lists existing sub-projects → moves tasks
- [ ] Create & move → prompts for new sub-project title → creates + moves
- [ ] After bulk action: selection clears, tree refreshes, toast confirms

### Cross-Section Selection
- [ ] Can select tasks from different sub-projects simultaneously
- [ ] Bulk actions affect all selected tasks regardless of which sub-project they're in

---

## Phase 5: Compact / Comfortable Mode

### Toggle Button
- [ ] Compact/Comfortable toggle button in toolbar next to Expand/Collapse
- [ ] Shows "Compact" label when in comfortable mode (click to switch)
- [ ] Shows "Comfortable" label when in compact mode (click to switch)

### Visual Differences — Compact
- [ ] Task rows use `py-1` (tighter vertical padding)
- [ ] Project headers use `py-1` (tighter)
- [ ] Text size smaller (`text-xs` for titles in compact)
- [ ] Context badges, energy dots, and time badges hidden on task rows
- [ ] Progress bar hidden on project headers
- [ ] Add task input height reduced
- [ ] Due dates still visible (important info)
- [ ] Star (next action) still visible

### Visual Differences — Comfortable
- [ ] Default layout: `py-1.5`, `text-sm`, all badges visible
- [ ] Progress bars visible on project headers

### Persistence
- [ ] Toggle compact → refresh page → still compact
- [ ] Per-project: Project A compact, Project B comfortable
- [ ] localStorage key: `outline-view-mode-${projectId}`

---

## Phase 6: Empty States

### Project with No Content
- [ ] Project with 0 tasks and 0 sub-projects shows centered empty state
- [ ] Shows ListChecks icon + "This project has no tasks yet." text
- [ ] "Add task" button prompts for title → creates task → refreshes to outline
- [ ] "Add sub-project" button prompts for title → creates sub-project → refreshes

### Empty Sub-Project (within tree)
- [ ] Expanded sub-project with 0 tasks shows "No tasks yet." muted text
- [ ] AddTaskInput still appears below the empty message
- [ ] Adding a task replaces the empty message with the task row

---

## Phase 7: Extended Keyboard Shortcuts

### Task Row Shortcuts
- [ ] `N` — focuses the AddTaskInput for the current section
- [ ] `E` — enters inline edit mode for the task title (same as Enter)
- [ ] `Enter` — enters inline edit mode for the task title
- [ ] `⌘+Enter` — marks task complete (calls onCompleteTask)
- [ ] `⌘+]` — demotes task to sub-project (Phase 3)
- [ ] `Space` — toggles status (NOT_STARTED → IN_PROGRESS → COMPLETED)
- [ ] Arrow Up/Down — navigates between rows

### Project Header Shortcuts
- [ ] `N` — expands project (if collapsed) and focuses AddTaskInput
- [ ] `⌘+[` — promotes empty sub-project to task (Phase 3)
- [ ] Arrow Left/Right — collapse/expand sub-project
- [ ] Arrow Up/Down — navigates between rows

### Shortcut Guards
- [ ] Shortcuts do NOT fire when editing a task title (editingTitle guard)
- [ ] ⌘] does nothing at depth >= 2
- [ ] ⌘[ does nothing when project has children

---

## Global Outline Page Regression

- [ ] `/projects/outline` still renders correctly (no new props passed)
- [ ] No context menus on the global page
- [ ] No type badge toggle on the global page
- [ ] No selection checkboxes on the global page
- [ ] No compact toggle on the global page
- [ ] Expand/collapse, keyboard nav, and existing features unchanged

---

## Edge Cases

- [ ] Very deep nesting (depth = 2): convert to sub-project disabled correctly
- [ ] Task with version conflict during context/due date/move update shows error toast and refreshes
- [ ] Rapid ⌘-click selection on multiple rows doesn't miss any
- [ ] Opening context menu doesn't steal keyboard focus from tree navigation
- [ ] BulkActionBar doesn't overlap with page content
- [ ] Empty project → add first task → outline view renders correctly (transition from empty state)
- [ ] Demote last task in a project → project becomes empty → empty state shows
