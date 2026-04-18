# Mobile Responsiveness — Touch-First PWA Experience

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement

### The Need

Tandem is a PWA with `manifest.json` set to `standalone` display and portrait-primary orientation, yet the UI is desktop-only. The sidebar (`hidden md:block`) disappears below 768px, leaving phone users with no navigation at all. Only ~40 responsive Tailwind classes exist across the entire codebase. Touch targets are undersized (the checkbox used by TaskCard is 16×16px — less than half Apple's 44pt minimum). Dialogs, filter bars, and page layouts assume wide screens.

### What "Done" Looks Like

1. **Full navigation on phones** — every page reachable without a desktop browser.
2. **44px minimum touch targets** on all interactive elements (checkboxes, buttons, nav items, list rows).
3. **Content reflows gracefully** on screens from 320px (iPhone SE) to 428px (iPhone 14 Pro Max).
4. **Thumb-zone optimization** — primary GTD actions (complete task, capture to inbox, navigate) reachable by thumb in one-handed use.
5. **No functionality loss** — every feature on desktop remains accessible on mobile.
6. **Dark mode works** — all mobile additions respect the existing HSL CSS variable theming.
7. **PWA stays functional** — nothing breaks `manifest.json`, service worker, install prompt, or standalone mode.

### Design Constraints

- All responsive styling via Tailwind CSS breakpoints (existing `md:` = 768px)
- Components from shadcn/ui + Radix UI only — Sheet for drawers, Dialog for modals
- `cn()` utility from `src/lib/utils.ts` for class merging
- localStorage for persistence (matches sidebar collapse pattern)
- Next.js App Router patterns
- No custom breakpoints needed — Tailwind defaults are sufficient

---

## 2. Breakpoint Strategy

| Range | Label | Behavior |
|-------|-------|----------|
| < 768px | Mobile | Bottom tab bar, hamburger drawer, stacked layouts |
| ≥ 768px | Desktop | Existing sidebar, current layouts unchanged |

All new classes use the pattern: mobile-first base + `md:` override. Example: `pb-20 md:pb-0` (padding for bottom tab bar on mobile, none on desktop).

---

## 3. Phase 1 — Mobile Navigation

**Goal:** Make every page reachable on phones. This is the critical blocker.

### 3.1 Bottom Tab Bar

A fixed bottom navigation bar visible only below `md` breakpoint. Five tabs:

1. **Do Now** (Zap icon) → `/do-now`
2. **Inbox** (Inbox icon) → `/inbox`
3. **Projects** (FolderKanban icon) → `/projects`
4. **Dashboard** (LayoutDashboard icon) → `/`
5. **More** (Menu icon) → opens nav drawer

**New file:** `src/components/layout/BottomTabBar.tsx`

```tsx
<nav className="fixed bottom-0 inset-x-0 z-40 border-t bg-card md:hidden"
     style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
  <div className="flex items-stretch">
    {tabs.map(tab => (
      <Link key={tab.href} href={tab.href}
        className={cn(
          "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors min-h-[56px]",
          isActive ? "text-primary" : "text-muted-foreground"
        )}>
        <tab.icon className="h-5 w-5" />
        <span>{tab.label}</span>
      </Link>
    ))}
    <button onClick={() => setDrawerOpen(true)}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium text-muted-foreground min-h-[56px]">
      <Menu className="h-5 w-5" />
      <span>More</span>
    </button>
  </div>
</nav>
```

Each tab is `flex-1` of 5 columns (minimum ~64px wide on 320px screens) and `min-h-[56px]` — exceeds 44px minimum in both dimensions.

### 3.2 Mobile Nav Drawer

Full navigation drawer using the existing `Sheet` component, sliding from the left. Opened by the "More" tab or the hamburger in the mobile header. Contains the complete `Nav` component.

**New file:** `src/components/layout/MobileNavDrawer.tsx`

```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent side="left" className="w-[280px] p-0">
    <SheetTitle className="sr-only">Navigation</SheetTitle>
    <Nav collapsed={false} onNavItemClick={() => onOpenChange(false)} />
  </SheetContent>
</Sheet>
```

**Modification to `Nav`:** Add optional `onNavItemClick` callback prop. When provided (mobile context), fires on any link click to close the drawer.

### 3.3 Mobile Header Bar

A thin sticky top header visible only on mobile, providing a hamburger menu (alternative to "More" tab) and a search button (replaces Cmd+K which doesn't exist on phones).

**New file:** `src/components/layout/MobileHeader.tsx`

```tsx
<header className="sticky top-0 z-30 flex items-center justify-between px-4 h-12 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:hidden">
  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={openDrawer}>
    <Menu className="h-5 w-5" />
  </Button>
  <span className="text-sm font-semibold">Tandem</span>
  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={openSearch}>
    <Search className="h-5 w-5" />
  </Button>
</header>
```

### 3.4 Shared State — MobileNavContext

The bottom tab bar and mobile header both control the drawer. Shared context keeps them in sync.

**New file:** `src/components/layout/MobileNavContext.tsx`

```tsx
"use client";
const MobileNavContext = createContext<{
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
}>({ drawerOpen: false, setDrawerOpen: () => {} });

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <MobileNavContext.Provider value={{ drawerOpen, setDrawerOpen }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export const useMobileNav = () => useContext(MobileNavContext);
```

Wrap in `src/app/(dashboard)/layout.tsx` inside `KeyboardShortcutsProvider`.

### 3.5 Dashboard Layout Changes

**File:** `src/app/(dashboard)/layout.tsx`

```tsx
// Current:
<div className="flex h-screen">
  <Sidebar />
  <main className="flex-1 overflow-y-auto">
    <div className="py-6 px-4 md:px-8">{children}</div>
  </main>
</div>

// Updated:
<MobileNavProvider>
  <div className="flex h-screen">
    <Sidebar />
    <div className="flex-1 flex flex-col overflow-hidden">
      <MobileHeader />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="py-4 px-4 md:py-6 md:px-8">{children}</div>
      </main>
    </div>
    <BottomTabBar />
    <MobileNavDrawer />
  </div>
</MobileNavProvider>
```

Key changes:
- `pb-20 md:pb-0` on `<main>` — 80px bottom padding on mobile to clear the tab bar
- `py-4 md:py-6` — slightly tighter top padding on mobile
- Mobile header, bottom bar, and drawer rendered at layout level

### 3.6 QuickViewNav on Mobile

Quick views live in the sidebar `Nav` component. On mobile, they appear in the nav drawer via the shared `Nav` — no separate treatment needed.

### 3.7 Conflict Fixes

**AI Toggle Button** (`src/components/ai/AIToggleButton.tsx`):
Currently `fixed bottom-6 right-6`. On mobile this overlaps the bottom tab bar. Fix:
```
bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 md:bottom-6 md:right-6
```

**PWA Banners** (`InstallPrompt.tsx`, `ServiceWorkerRegistration.tsx`):
Both render at `bottom: 1rem`. On mobile, adjust to `bottom: 5rem` to clear the tab bar (detect via `matchMedia("(max-width: 767px)")`).

### 3.8 Phase 1 Files Summary

| Action | File |
|--------|------|
| CREATE | `src/components/layout/BottomTabBar.tsx` |
| CREATE | `src/components/layout/MobileNavDrawer.tsx` |
| CREATE | `src/components/layout/MobileHeader.tsx` |
| CREATE | `src/components/layout/MobileNavContext.tsx` |
| MODIFY | `src/app/(dashboard)/layout.tsx` |
| MODIFY | `src/components/layout/nav.tsx` |
| MODIFY | `src/components/ai/AIToggleButton.tsx` |
| MODIFY | `src/components/pwa/InstallPrompt.tsx` |
| MODIFY | `src/components/pwa/ServiceWorkerRegistration.tsx` |

### 3.9 Phase 1 Testing

- Open at 375px width in Chrome DevTools (iPhone SE)
- All 4 bottom tabs navigate correctly
- "More" tab and hamburger both open drawer with full nav
- Drawer closes on link click and overlay tap
- Search icon opens GlobalSearch dialog
- AI button floats above tab bar, not overlapping
- Content not hidden behind bottom bar (scroll to bottom of a long list)
- Install/update banners clear the bottom bar
- Test at 320px, 375px, 390px, 428px widths
- Test dark mode
- Test PWA standalone mode

---

## 4. Phase 2 — Layout & Content Responsiveness

**Goal:** Make each page's content work on narrow screens.

### 4.1 Dialogs → Bottom Sheets on Mobile

On mobile, dialogs should slide up from the bottom as full-width sheets instead of centering on screen. This is the single highest-leverage change — every dialog in the app benefits.

**File:** `src/components/ui/dialog.tsx`

Change `DialogContent` classes:

```tsx
// Mobile: bottom-sheet sliding up, max 85vh, scrollable
// Desktop: unchanged centered dialog
className={cn(
  // Mobile (base)
  "fixed inset-x-0 bottom-0 z-50 grid w-full gap-4 border-t bg-background p-6 shadow-lg",
  "max-h-[85vh] overflow-y-auto rounded-t-xl",
  // Desktop (md:)
  "md:inset-auto md:left-[50%] md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%]",
  "md:max-w-lg md:rounded-lg md:border md:border-t-0 md:max-h-none md:overflow-visible",
  // Animations
  "data-[state=open]:animate-in data-[state=closed]:animate-out",
  "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  "data-[state=open]:slide-in-from-bottom md:data-[state=open]:slide-in-from-bottom-0",
  "md:data-[state=open]:zoom-in-95 md:data-[state=closed]:zoom-out-95",
  className
)}
```

### 4.2 iOS Input Zoom Fix

iOS Safari zooms the viewport when focusing an input with `font-size < 16px`. Current inputs use `text-sm` (14px). Fix by using `text-base` (16px) on mobile.

**Files:** `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`

```tsx
// Change from: "text-sm"
// Change to:   "text-base md:text-sm"
```

This prevents the iOS zoom on every form in the app without changing desktop appearance.

### 4.3 Do Now Page

**FilterBar** (`src/components/tasks/FilterBar.tsx`):
- On mobile, collapse filters behind a toggle button: "Filters (N active)"
- When expanded, stack filter selects vertically with `w-full`
- On desktop, keep current inline layout

```tsx
<div className="md:flex md:flex-wrap md:items-center md:gap-2">
  {/* Mobile toggle */}
  <button className="flex items-center gap-2 text-sm w-full py-2 md:hidden" onClick={toggle}>
    <Filter className="h-4 w-4" />
    Filters {hasFilters && `(${count})`}
    <ChevronDown className={cn("h-4 w-4 ml-auto transition-transform", expanded && "rotate-180")} />
  </button>
  {/* Filter content */}
  <div className={cn("space-y-2 md:space-y-0 md:flex md:flex-wrap md:gap-2", !expanded && "hidden md:flex")}>
    {/* selects with w-full md:w-[120px] */}
  </div>
</div>
```

**TaskCard** (`src/components/tasks/TaskCard.tsx`):
- Two-line layout on mobile: title on first line, metadata badges on second line
- Larger checkbox tap zone: wrap in `<div className="p-2 -m-2">` for 48px total target
- Expanded section: `grid-cols-1 md:grid-cols-2` for metadata selectors

```tsx
<div className="flex items-start gap-3 px-3 py-2 md:py-[0.3rem]">
  <div className="p-2 -m-2" onClick={(e) => e.stopPropagation()}>
    <Checkbox className="h-5 w-5 md:h-4 md:w-4" />
  </div>
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium truncate">{task.title}</span>
    </div>
    {/* Mobile metadata row */}
    <div className="flex flex-wrap items-center gap-1.5 mt-1 md:hidden">
      {context badge, time, energy, due date, project name}
    </div>
  </div>
  {/* Desktop inline badges */}
  <div className="hidden md:flex items-center gap-2">{...}</div>
</div>
```

### 4.4 Inbox Page

Stack header on mobile:
```tsx
<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
  <div>{title + description}</div>
  <Button size="lg" className="w-full md:w-auto">Process Inbox</Button>
</div>
```

### 4.5 Projects Page

- Filter select triggers: `w-full md:w-36` on mobile
- "New Project" dialog benefits from the global dialog→bottom-sheet change

### 4.6 Help & Wiki Pages

Both have `hidden md:block` sidebars (same pattern as main sidebar). On mobile, replace with a Sheet trigger:

```tsx
{/* Mobile */}
<Button variant="outline" size="sm" className="md:hidden mb-4" onClick={() => setSidebarOpen(true)}>
  <List className="h-4 w-4 mr-2" /> Browse Articles
</Button>
<Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
  <SheetContent side="left" className="w-[280px] p-4">
    <HelpSidebar articles={articles} onArticleClick={() => setSidebarOpen(false)} />
  </SheetContent>
</Sheet>

{/* Desktop: unchanged */}
<div className="hidden md:block w-56 flex-shrink-0">
  <HelpSidebar articles={articles} />
</div>
```

### 4.7 GlobalSearch

Hide keyboard shortcut hints on mobile (phones don't have arrow keys/Esc):
```tsx
<div className="hidden md:flex border-t px-4 py-2 ...">
  {keyboard hints}
</div>
```

### 4.8 General Page Header Pattern

All pages with `flex items-center justify-between` headers should stack on mobile:
```tsx
<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
```

This applies to: Areas, Horizons, Weekly Review, Settings, Contexts, Waiting For, Someday/Maybe.

### 4.9 Phase 2 Files Summary

| Action | File |
|--------|------|
| MODIFY | `src/components/ui/dialog.tsx` |
| MODIFY | `src/components/ui/input.tsx` |
| MODIFY | `src/components/ui/textarea.tsx` |
| MODIFY | `src/components/tasks/FilterBar.tsx` |
| MODIFY | `src/components/tasks/TaskCard.tsx` |
| MODIFY | `src/app/(dashboard)/inbox/page.tsx` |
| MODIFY | `src/app/(dashboard)/projects/page.tsx` |
| MODIFY | `src/app/(dashboard)/help/page.tsx` |
| MODIFY | `src/app/(dashboard)/help/[slug]/page.tsx` |
| MODIFY | `src/components/help/HelpSidebar.tsx` |
| MODIFY | `src/components/shared/GlobalSearch.tsx` |
| MODIFY | `src/components/ui/checkbox.tsx` |

### 4.10 Phase 2 Testing

- Every dialog on 375px → verify bottom-sheet behavior
- FilterBar collapse/expand on mobile
- TaskCard two-line layout readability
- Focus every input on iOS Safari → verify no viewport zoom
- Help sidebar sheet opens/closes correctly
- Dashboard widgets don't overflow horizontally
- Page headers don't truncate or overflow
- Dark mode for all changes

---

## 5. Phase 3 — Touch & Interaction Polish

**Goal:** Make the app feel native on a phone, not just "not broken."

### 5.1 Swipe to Complete

Swipe right on TaskCard or ProjectTaskItem to complete a task. Uses touch events only (no effect on desktop mouse users).

**New file:** `src/lib/hooks/use-swipe.ts`

```tsx
// Returns { ref, swipeOffset, isSwiping }
// On swipe right past threshold (80px): fires onSwipeRight callback
// On release below threshold: springs back
// Touch events only — no effect on desktop
```

**Visual feedback:**
```tsx
<div className="relative overflow-hidden rounded-lg">
  {/* Green background revealed on swipe */}
  <div className="absolute inset-0 bg-green-500 flex items-center pl-4"
       style={{ opacity: Math.min(swipeOffset / 80, 1) }}>
    <Check className="h-5 w-5 text-white" />
  </div>
  {/* Card slides right */}
  <div style={{ transform: `translateX(${swipeOffset}px)` }}>
    ...existing card...
  </div>
</div>
```

### 5.2 Pull to Refresh

Custom pull-to-refresh on Do Now and Inbox pages. Native pull-to-refresh doesn't work well in standalone PWA mode on iOS.

**New file:** `src/lib/hooks/use-pull-to-refresh.ts`

```tsx
// Detects pull-down gesture when scrolled to top
// Shows spinner indicator above content
// On release past 60px threshold: fires onRefresh callback
// Spinner animates then disappears when refresh resolves
```

### 5.3 Touch Target Sizing

**Global changes:**
- Small ghost buttons (`h-7 w-7 p-0`): expand to `h-9 w-9 md:h-7 md:w-7` on mobile
- FilterBar select triggers (`h-7`): expand to `h-10 md:h-7` on mobile
- Checkbox: visual size stays small, wrap in `p-2 -m-2` for 48px tap zone

### 5.4 Keyboard Handling

Hide bottom tab bar when on-screen keyboard is open (it gets pushed up awkwardly):

```tsx
// In BottomTabBar.tsx
useEffect(() => {
  if (!window.visualViewport) return;
  const handleResize = () => {
    setKeyboardOpen(window.visualViewport!.height < window.innerHeight * 0.75);
  };
  window.visualViewport.addEventListener("resize", handleResize);
  return () => window.visualViewport?.removeEventListener("resize", handleResize);
}, []);

if (keyboardOpen) return null;
```

For `InboxCaptureModal`, ensure input scrolls into view on focus:
```tsx
inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
```

### 5.5 Safe Area Insets

For iPhones with notches/Dynamic Island:

- Bottom tab bar: `padding-bottom: env(safe-area-inset-bottom)` (already in 3.1)
- Mobile header: `padding-top: env(safe-area-inset-top)` for standalone PWA mode
- Requires `viewport-fit=cover` in viewport meta tag

**File:** `src/app/layout.tsx`
```tsx
export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
```

### 5.6 Haptic Feedback

Progressive enhancement — `navigator.vibrate()` on task completion:

```tsx
function hapticFeedback(pattern: "light" | "medium" = "light") {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern === "light" ? 10 : 25);
  }
}
```

iOS Safari doesn't support this API — it silently does nothing, which is fine.

### 5.7 Phase 3 Files Summary

| Action | File |
|--------|------|
| CREATE | `src/lib/hooks/use-swipe.ts` |
| CREATE | `src/lib/hooks/use-pull-to-refresh.ts` |
| MODIFY | `src/components/tasks/TaskCard.tsx` |
| MODIFY | `src/components/projects/ProjectTaskItem.tsx` |
| MODIFY | `src/app/(dashboard)/do-now/page.tsx` |
| MODIFY | `src/app/(dashboard)/inbox/page.tsx` |
| MODIFY | `src/components/layout/BottomTabBar.tsx` |
| MODIFY | `src/app/layout.tsx` |

### 5.8 Phase 3 Testing

- Swipe-to-complete on real phone or touch simulation
- Swipe threshold feels right (not accidentally triggerable)
- Pull-to-refresh on Do Now and Inbox
- Keyboard open/close hides/shows bottom bar
- Safe area insets on notched iPhone
- Haptic fires on Android, no errors on iOS

---

## 6. Phase 4 — Performance & PWA Enhancement

**Goal:** Optimize the mobile experience for real-world conditions.

### 6.1 Offline Indicator

Show a banner when the device loses connectivity:

**New file:** `src/components/shared/OfflineIndicator.tsx`

```tsx
<div className="fixed top-0 inset-x-0 z-50 bg-yellow-500 text-yellow-950 text-center text-xs py-1 font-medium">
  You are offline. Changes will sync when reconnected.
</div>
```

Add to `src/app/layout.tsx` inside `<Providers>`.

### 6.2 Pre-Cache Do Now Shell

Since `/do-now` is the PWA start URL, cache the HTML shell for instant repeat loads:

**File:** `public/sw.js`
```js
const PRECACHE_ASSETS = ['/offline.html', '/do-now'];
```

### 6.3 Manifest Share Target

Allow sharing text from other apps directly into Tandem's inbox (Android only — iOS doesn't support Web Share Target):

**File:** `public/manifest.json`
```json
{
  "share_target": {
    "action": "/inbox?shared=true",
    "method": "GET",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

### 6.4 Phase 4 Files Summary

| Action | File |
|--------|------|
| CREATE | `src/components/shared/OfflineIndicator.tsx` |
| MODIFY | `src/app/layout.tsx` |
| MODIFY | `public/sw.js` |
| MODIFY | `public/manifest.json` |

### 6.5 Phase 4 Testing

- Airplane mode → offline banner appears/disappears
- Do Now loads from cache when offline (after first visit)
- Viewport doesn't zoom on input focus
- Share Target on Android (share link from Chrome to Tandem)
- Lighthouse mobile audit: target 90+ Performance, 100 PWA

---

## 7. Implementation Order Summary

**Phase 1 — Mobile Navigation (implement first, unblocks everything):**
1. MobileNavContext → MobileNavDrawer → BottomTabBar → MobileHeader
2. Update layout.tsx (wire together)
3. Update nav.tsx (onNavItemClick)
4. Fix AI button + PWA banner positioning

**Phase 2 — Content Responsiveness:**
1. dialog.tsx (global bottom-sheet — highest leverage)
2. input.tsx + textarea.tsx (iOS zoom fix)
3. TaskCard (most-used component)
4. FilterBar → page headers → help sidebar → GlobalSearch

**Phase 3 — Touch Polish:**
1. use-swipe.ts → TaskCard/ProjectTaskItem integration
2. use-pull-to-refresh.ts → Do Now/Inbox integration
3. Keyboard handling → safe area insets → haptic feedback

**Phase 4 — PWA Enhancement:**
1. Viewport meta → OfflineIndicator → SW pre-cache → share target

---

## 8. What This Spec Does Not Cover

- **Native app wrapper** (Capacitor/Expo) — PWA is sufficient for now
- **Gesture-based page transitions** — complexity without clear GTD value
- **Offline mutation queue** (IndexedDB write-through) — separate spec if needed
- **Tablet-specific layouts** (768px–1024px) — sidebar appears at 768px, handled by existing `md:` breakpoint
- **Landscape mobile** — manifest locks to portrait-primary
- **Custom splash screens** — would need per-device `apple-touch-startup-image` tags, low priority
