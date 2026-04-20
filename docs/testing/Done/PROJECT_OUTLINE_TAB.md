# Project Outline Tab — Test Plan

## Prerequisites
- A project with sub-projects (at least 2 levels deep)
- A project without sub-projects
- Tasks in various states: NOT_STARTED, IN_PROGRESS, COMPLETED
- A sequential project with multiple tasks (to test cascade promotion)
- A team project with threads enabled (for Threads tab)

## Tab System

### Tab Bar Rendering
- [ ] Project with sub-projects shows 4 tabs: Overview / Outline / Gantt / Threads
- [ ] Project without sub-projects shows tabs (Overview still default)
- [ ] Non-team project hides Threads tab
- [ ] Team project without threadsEnabled hides Threads tab
- [ ] Team project with threadsEnabled shows Threads tab
- [ ] Active tab is visually highlighted
- [ ] Tab content switches without full page reload

### Tab Persistence (localStorage)
- [ ] Switching to Outline tab → refresh page → Outline tab is still selected
- [ ] Switch to Overview → refresh → Overview is selected
- [ ] Different projects remember their own tab selection independently
- [ ] Key format: `project-tab-${projectId}` in localStorage

### Default Tab Logic
- [ ] Fresh visit to project with sub-projects + outlineReady=false → defaults to Overview
- [ ] Fresh visit to project with sub-projects + outlineReady=true → defaults to Outline
- [ ] Fresh visit to project without sub-projects → defaults to Overview
- [ ] localStorage override takes priority over outlineReady default

## Overview Tab

### Content Parity
- [ ] Burn-down/burn-up chart renders same as before
- [ ] Sub-projects section with expand/collapse works
- [ ] Add sub-project flow works (click +, enter title, submit)
- [ ] Task list with sorting (manual, status, due date, energy) works
- [ ] Project activity section renders at bottom
- [ ] Reorder mode for tasks works

### Bulk Operations
- [ ] Select multiple tasks with checkboxes
- [ ] Floating action bar appears with bulk options
- [ ] Bulk status change works
- [ ] Bulk delete works
- [ ] Move to sub-project works
- [ ] Create new sub-project and move works
- [ ] Select all / deselect all works
- [ ] Selection clears when switching away from Overview tab

### Task Operations
- [ ] Click task title to expand/edit
- [ ] Complete task via status circle click
- [ ] Change task status via dropdown
- [ ] Add new task at bottom of list
- [ ] Drag reorder in manual sort mode

## Outline Tab

### Tree Rendering
- [ ] Root project shows as top-level node
- [ ] Sub-projects render nested with indentation
- [ ] Tasks appear under their respective project
- [ ] 3 levels of nesting display correctly (project → sub-project → sub-sub-project)
- [ ] Each project node shows: chevron + title + status + progress fraction (e.g., 3/8)
- [ ] Tasks show status circle, title, context badge, energy dot, time badge

### Data Loading
- [ ] Outline tab fetches from `/api/projects/[id]/outline` on mount
- [ ] Loading state shows while fetching
- [ ] Error state shows if fetch fails
- [ ] Refetch on tab re-entry after mutations in Overview tab

### Expand / Collapse
- [ ] Click chevron to expand/collapse a sub-project section
- [ ] Expand/collapse all button works
- [ ] Expand state persists across tab switches
- [ ] Expand state persists across page refreshes (localStorage)

### Show/Hide Completed Tasks
- [ ] Completed tasks hidden by default
- [ ] "Show completed (N)" toggle reveals completed tasks
- [ ] Completed tasks render muted with strikethrough
- [ ] Toggle state is per-section (each sub-project independent)

### Task Status Transitions
- [ ] Click NOT_STARTED status circle → changes to IN_PROGRESS
- [ ] Click IN_PROGRESS status circle → completes task (POST /api/tasks/{id}/complete)
- [ ] Completing a task shows undo toast
- [ ] Undo restores the task to previous state
- [ ] Status change uses optimistic update (UI updates before server response)

### Cascade Behavior
- [ ] Complete last active task in sequential project → next task promotes to next action
- [ ] Tree refreshes after completion to reflect promoted tasks
- [ ] Completing all tasks in a sub-project updates its progress display

### Inline Add Task
- [ ] Add task input appears at bottom of each project section
- [ ] Enter title and press Enter → task created in correct sub-project
- [ ] New task appears in the tree immediately
- [ ] Input clears after successful creation

### Task Rename
- [ ] Click/double-click task title to enter edit mode
- [ ] Edit title and press Enter → saves via PATCH
- [ ] Press Escape → cancels edit

### Keyboard Navigation
- [ ] Arrow keys navigate between tasks
- [ ] Space/Enter toggles task status or enters edit mode
- [ ] Navigation works across sub-project boundaries

## Cross-Tab Refresh
- [ ] Complete a task in Outline tab → switch to Overview → task counts updated
- [ ] Add a task in Outline tab → switch to Overview → new task appears
- [ ] Complete a task in Overview tab → switch to Outline → tree reflects change

## Gantt Tab (Placeholder)
- [ ] Shows "Gantt view coming soon" message
- [ ] No errors or blank screen

## Threads Tab
- [ ] Shows thread list for team projects
- [ ] Can create new thread from the tab
- [ ] Thread replies work within the tab

## ProjectHeader — Outline Default Toggle
- [ ] Three-dot menu on project with sub-projects shows "Use outline as default"
- [ ] Clicking it sets outlineReady=true on the project
- [ ] After enabling, menu item changes to "Disable outline as default"
- [ ] Clicking disable sets outlineReady=false
- [ ] Projects without sub-projects do NOT show the toggle
- [ ] After enabling, fresh visit (clear localStorage for that project) defaults to Outline tab

## API Endpoint

### GET /api/projects/[id]/outline
- [ ] Returns project tree with all tasks (including completed)
- [ ] Response includes `taskCounts: { total, active, completed }`
- [ ] Sub-projects are recursive up to 3 levels
- [ ] Tasks include: id, title, status, isNextAction, sortOrder, estimatedMins, energyLevel, dueDate, version, context
- [ ] `rollupProgress` calculated correctly across nested sub-projects
- [ ] Returns 404 for non-existent project
- [ ] Returns 403 for project not owned by user

## Mobile Responsiveness
- [ ] Tab bar scrolls horizontally on narrow screens (if needed)
- [ ] Outline tree is usable on mobile with proper indentation
- [ ] Touch targets for status circles are large enough on mobile
- [ ] Add task input works on mobile keyboard

## Edge Cases
- [ ] Project with no tasks shows empty state in Outline tab
- [ ] Project with only completed tasks shows "Show completed (N)" with no active tasks
- [ ] Very deep nesting (3 levels) doesn't break layout
- [ ] Large project (50+ tasks across sub-projects) loads and renders efficiently
- [ ] Concurrent edits: version conflict on status change shows appropriate error
