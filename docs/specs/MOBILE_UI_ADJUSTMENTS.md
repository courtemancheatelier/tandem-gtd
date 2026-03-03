# Mobile UI Adjustments — Filter Repositioning & Bottom Nav

**Status:** Draft  
**Priority:** High (UX polish)  
**Scope:** Mobile portrait mode across Outline, Do Now, and Projects views

---

## Problem

On mobile in portrait mode, filter controls (project/area/team selectors, context buttons) occupy prime vertical real estate at the top of several views. This pushes the actual content — tasks and projects — down the screen. Additionally, these controls are in the top zone where thumbs don't naturally reach, making one-handed use harder.

---

## Changes

### 1. Outline View — Collapse or Relocate Filters

**Current behavior:** Project, area, and team filter controls are always visible at the top, consuming significant vertical space.

**Option A — Collapsible filter bar:**
- Replace the expanded filters with a single "Filter" button/pill at the top
- Tapping it expands a collapsible panel showing the project/area/team selectors
- Collapsed by default; remembers state per session
- Show a badge/indicator when filters are active so the user knows they're filtering

**Option B — Bottom filter tray (preferred):**
- Move filter controls to a tray just above the bottom navigation bar
- Same collapsible behavior — tap "Filter" to expand upward
- Keeps thumbs close to the controls

**Result:** Full screen height available for the project/task outline.

### 2. Do Now View — Move Filters & Context to Bottom

**Current behavior:** Filter and context buttons sit at the top of the Do Now list.

**Target behavior:**
- Move the filter controls and context selector buttons to a bottom tray, positioned just above the bottom navigation bar
- Tapping a context button still filters the Do Now list as it does today
- The top of the view becomes the task list immediately, with only a minimal header (page title)

### 3. Projects View — Move Filters & New Project to Bottom

**Current behavior:** Filter controls and "New Project" button are at the top.

**Target behavior:**
- Move project status filters to the bottom tray (same pattern as Do Now and Outline)
- Move the "New Project" button to the bottom, either:
  - As part of the filter tray area, or
  - As a floating action button (FAB) above the bottom nav
- Top of view goes straight to the project list

### 4. Bug Fix — Dashboard Bottom Nav Button

**Current behavior:** The "Dashboard" button in the bottom navigation bar does NOT navigate to the dashboard. The user must tap "More" → use the sidebar → tap "Dashboard" to reach it.

**Expected behavior:** The Dashboard button in the bottom nav should navigate to the Dashboard view.

**Investigation needed:** Determine if this is a routing issue, a naming issue (the button may be intentionally pointing to Do Now but mislabeled), or a broken link.

### 5. Bottom Nav Label — Rename "Dashboard" to "Do Now"

**Context:** If the bottom nav button is *intentionally* routing to the Do Now view (not the Dashboard), then the label should say "Do Now" to match. If the bug in item 4 is fixed and the button correctly routes to Dashboard, then we may want *both* a Dashboard and a Do Now button — see item 6.

**Decision needed:** Is the bottom nav button supposed to go to Dashboard or Do Now? Label accordingly. If Do Now, update the icon and label. If Dashboard, fix the route (item 4) and consider adding a separate Do Now entry.

### 6. Feature — Customizable Bottom Toolbar

**Description:** Let users choose which icons/views appear in the bottom navigation bar.

**Design considerations:**
- Bottom nav typically holds 3–5 items; more than 5 gets crowded on mobile
- Provide a default set (e.g., Do Now, Inbox, Projects, More)
- Let users swap items in/out from a settings screen (e.g., Settings → Bottom Toolbar)
- Available items could include: Do Now, Dashboard, Inbox, Projects, Outline, Wiki, Review, More
- "More" should always be present as an anchor so users can reach everything else
- Persist selection per user (store in user preferences / local storage)

**Implementation approach:**
- Store the toolbar configuration in user settings (database-backed so it syncs across devices)
- Render the bottom nav dynamically based on the user's selected items
- Provide a drag-to-reorder UI in settings for arranging the toolbar items
- Fall back to the default set if no customization exists

---

## Design Pattern — Bottom Filter Tray

Since items 1–3 all introduce the same "bottom filter tray" concept, define it once:

- **Position:** Fixed, just above the bottom navigation bar
- **Default state:** Collapsed — shows a small "Filter" pill/button, possibly with an active-filter indicator (dot or count badge)
- **Expanded state:** Slides up to reveal the filter controls relevant to the current view
- **Dismiss:** Tap the "Filter" pill again, or tap outside the tray
- **Animation:** Smooth slide-up/slide-down transition
- **Z-index:** Above page content, below any modals or toasts
- **Interaction area:** Ensure the tray doesn't accidentally intercept taps on the last visible task/project in the list — add enough padding or a visual separator

---

## Implementation Notes

- These changes apply to **mobile portrait mode only** — desktop and tablet layouts remain unchanged
- Use the existing responsive breakpoints to conditionally render top vs. bottom filter placement
- Consider whether landscape mode on phones should follow the mobile or tablet pattern
- Test with bottom nav + filter tray + keyboard open scenarios to ensure nothing overlaps
- The FAB for "New Project" (item 3) could be reused as a pattern for "New Task" quick-capture on other views if it works well
