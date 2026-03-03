# Horizons of Focus — Guided Setup & Periodic Review

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement

### What Exists

Tandem has a Horizons page (`/horizons`) with six expandable cards — one per GTD altitude. Users can write freeform notes (50K purpose, 40K vision), create Goals (30K), and manage Areas (20K). Projects and actions link out to their respective pages.

The weekly review's Get Creative step mentions horizons with a link, but that's it.

### The Gap

The current horizons page is a **reference view**, not a **guided experience**. There's nothing to help someone:

1. **Set up horizons for the first time** — a blank purpose card with "What gives your life meaning?" is intimidating. People need prompts, examples, and a sense of progression.
2. **Review horizons periodically** — GTD recommends quarterly and annual reviews of the higher altitudes, but there's no flow for it. No tracking of when you last reviewed, no reflection prompts, no way to compare "what I wrote last time" with "what's true now."
3. **Know when a review is due** — the weekly review doesn't nudge you when it's been 3+ months since your last horizons check-in.

### The Vision

Two guided flows that mirror the weekly review wizard pattern:

- **Initial Setup** — a top-down wizard (50K → 20K) that walks first-time users through articulating each horizon, creating Goals and Areas along the way
- **Periodic Review** — a reflection flow for quarterly/annual check-ins that shows what you wrote, prompts "still true?", and tracks when you last reviewed each level

Plus a **weekly review integration** that gently nudges when a horizons review is overdue.

---

## 2. Data Model Changes

### 2.1 HorizonReview Model

New model to track horizon review sessions (parallel to `WeeklyReview`):

```prisma
model HorizonReview {
  id          String              @id @default(cuid())
  type        HorizonReviewType
  status      ReviewStatus        @default(IN_PROGRESS)
  checklist   Json?               // Tracks which levels have been reviewed
  notes       Json?               // Per-level reflection notes
  completedAt DateTime?
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([type])
}

enum HorizonReviewType {
  INITIAL_SETUP   // First-time top-down walkthrough
  QUARTERLY       // Focused check-in (goals, vision, purpose)
  ANNUAL          // Full deep review of all levels
}
```

Reuses existing `ReviewStatus` enum (`IN_PROGRESS`, `COMPLETED`).

### 2.2 Checklist Shape

```typescript
interface HorizonChecklist {
  purpose?: boolean;   // 50K
  vision?: boolean;    // 40K
  goals?: boolean;     // 30K
  areas?: boolean;     // 20K
  projects?: boolean;  // 10K
  actions?: boolean;   // Runway
}
```

### 2.3 Notes Shape

Per-level reflection notes stored as JSON:

```typescript
interface HorizonReviewNotes {
  purpose?: string;
  vision?: string;
  goals?: string;
  areas?: string;
  projects?: string;
  actions?: string;
}
```

### 2.4 No Changes to Existing Models

`HorizonNote`, `Goal`, and `Area` stay as-is. The guided flows use existing APIs to create/update these records — the review model only tracks the *review session itself*, not the data being reviewed.

---

## 3. Flow Definitions

### 3.1 Initial Setup Flow

**Entry:** `/horizons/setup` — linked from the horizons page when no HorizonNotes exist, or from onboarding.

**Steps (4 guided + 2 summary):**

| Step | Horizon | What Happens |
|------|---------|--------------|
| 1 | 50K Purpose | Reflective prompts → write HorizonNote |
| 2 | 40K Vision | Reflective prompts → write HorizonNote |
| 3 | 30K Goals | Review prompts → create Goal records |
| 4 | 20K Areas | Review prompts → create Area records |
| 5 | 10K Projects | Summary of existing projects. Link to /projects. Light prompt: "Any new projects needed to support your goals?" |
| 6 | Runway | Summary of existing actions. Link to /do-now. Light prompt: "Capture any next actions that come to mind." |

Steps 1-4 are the real work. Steps 5-6 are quick check-ins that connect the higher altitudes to the existing ground-level data.

**Step 1 — Purpose (50,000ft)**

The hardest one to write cold. Guide with layered prompts:

```
Your life purpose is the "why" behind everything else.
Don't overthink this — it can evolve. Start with what feels true today.

Prompts to consider:
- What would you do even if nobody paid you?
- What do people consistently come to you for?
- When you're 80, looking back, what mattered most?
- What values do you refuse to compromise on?

Write freely — a sentence, a paragraph, bullet points. There's no wrong format.
```

Input: rich text area that saves to `HorizonNote` (level: HORIZON_5) via existing `/api/horizon-notes` upsert endpoint.

If a note already exists (user restarting setup), pre-populate it.

**Step 2 — Vision (40,000ft)**

```
Your vision is what life looks like in 3-5 years if things go well.
Be specific enough to feel it, loose enough to stay open.

Prompts to consider:
- Where are you living? Who's around you?
- What does a typical Tuesday look like?
- What are you known for professionally?
- What does your relationship with [health/money/creativity/people] look like?
```

Input: rich text area → `HorizonNote` (level: HORIZON_4).

**Step 3 — Goals (30,000ft)**

Different from steps 1-2: this creates structured records, not just narrative.

```
Goals are specific, measurable outcomes you want in the next 1-2 years.
They should connect to your vision — each one moves you closer.

Look at what you wrote for your vision. What goals would make that real?
```

Show the vision note (from step 2) as a reference card above the goal creation area.

UI: list of existing goals (if any) + inline creation form. Each goal gets: title, description (optional), target date (optional), area assignment (optional from existing areas).

Uses existing `/api/goals` POST endpoint.

**Step 4 — Areas (20,000ft)**

```
Areas of responsibility are the ongoing parts of life you need to maintain.
They never "complete" — they're standards you keep.

Common areas: Health, Finances, Career, Home, Relationships, Personal Growth, Creativity.
Think about what would fall apart if you ignored it for 3 months.
```

Show goals from step 3 as reference. Prompt: "Do your areas cover the ground your goals need?"

UI: list of existing areas + inline creation form. Uses existing `/api/areas` POST endpoint.

**Steps 5-6 — Projects & Actions (Summary)**

Light touch — show counts, link out, capture quick thoughts:

```
Step 5: You have [N] active projects. Any new ones needed to support your goals?
[Link to /projects] [Quick capture input]

Step 6: You have [N] next actions. Anything on your mind right now?
[Link to /do-now] [Quick capture input]
```

Quick capture inputs create tasks via existing `/api/tasks` POST (for actions) or items via `/api/inbox` (for unclarified thoughts).

### 3.2 Quarterly Review Flow

**Entry:** `/horizons/review?type=quarterly` — linked from weekly review nudge, or manually from horizons page.

**Focus:** Goals (30K), Vision (40K), Purpose (50K) — the altitudes most likely to shift quarter-to-quarter.

**Steps (3):**

| Step | Horizon | What Happens |
|------|---------|--------------|
| 1 | 30K Goals | Review each goal: progress update, still relevant?, any achieved/deferred? |
| 2 | 40K Vision | Read your vision statement. Still resonate? Edit if needed. |
| 3 | 50K Purpose | Read your purpose. Quick gut check — still aligned? |

**Step 1 — Goals Review**

Show all active goals with current progress. For each:

```
┌─────────────────────────────────────────┐
│ Goal: Save $50k by Dec 2027             │
│ Status: In Progress  Progress: 35%      │
│ Area: Finances       Target: Dec 2027   │
│                                         │
│ [Update Progress: ____%]                │
│                                         │
│ Still pursuing this? [Yes] [Defer] [Achieved] [Drop] │
│                                         │
│ Reflection notes:                       │
│ [___________________________________]  │
└─────────────────────────────────────────┘
```

Actions: updating progress calls `PATCH /api/goals/:id`. Status changes (achieved/deferred) use the same endpoint. Reflection notes are saved to the review's `notes.goals` field.

After reviewing existing goals, prompt: "Any new goals to add?" with inline creation.

**Step 2 — Vision Review**

Show the current vision note with a "last updated" timestamp.

```
You wrote this [3 months ago / 6 months ago / when you set up]:

[Current vision text displayed in a quote block]

Does this still feel right?
- If yes, great — move on.
- If something's shifted, edit below.

Reflection: What's changed since you last looked at this?
[___________________________________]
```

Editing saves via existing `/api/horizon-notes` upsert. Reflection saves to `notes.vision`.

**Step 3 — Purpose Quick Check**

Lighter than vision — purpose rarely changes, but it's worth a pause.

```
Your purpose:

[Current purpose text in a quote block]

Still true? [Yes, moving on] [I want to refine this]

If refining: edit field appears.
```

### 3.3 Annual Review Flow

**Entry:** `/horizons/review?type=annual`

**All 6 levels**, deeper reflection than quarterly. Same structure but every level gets the "read what you wrote, reflect, update" treatment.

**Steps (6):**

| Step | Horizon | Depth |
|------|---------|-------|
| 1 | 50K Purpose | Deep reflection. "Has your sense of purpose evolved this year?" |
| 2 | 40K Vision | "What's your 3-5 year vision now? What came true? What shifted?" |
| 3 | 30K Goals | Full goal audit: achieved, deferred, new goals for the year. Year-in-review stats if available. |
| 4 | 20K Areas | "Any areas to add, archive, or reprioritize?" |
| 5 | 10K Projects | "Which projects are stale? Which align with your updated goals?" |
| 6 | Runway | "Any lingering actions that no longer serve your direction?" |

Steps 5-6 are more substantial than in the initial setup — they prompt active pruning rather than just quick capture.

---

## 4. Weekly Review Integration

### 4.1 Nudge in Get Creative Step

The Get Creative step already has a "Horizons of Focus" card. Enhance it with a due-date check.

In `GetCreativeStep.tsx`, fetch the latest completed `HorizonReview` and compute days since:

```typescript
// In GetCreativeStep, alongside existing data fetches
const [lastHorizonReview, setLastHorizonReview] = useState<{
  completedAt: string;
  type: string;
} | null>(null);

useEffect(() => {
  fetch("/api/horizon-reviews/latest")
    .then(res => res.ok ? res.json() : null)
    .then(setLastHorizonReview);
}, []);

const daysSinceReview = lastHorizonReview
  ? Math.floor((Date.now() - new Date(lastHorizonReview.completedAt).getTime()) / 86400000)
  : null;
const isOverdue = daysSinceReview === null || daysSinceReview > 90;
```

Display logic:

- **Never reviewed:** "You haven't set up your horizons yet. Take 15 minutes to define your purpose, vision, and goals." → [Start Setup]
- **Overdue (>90 days):** "It's been {N} days since your last horizons review. A quarterly check-in keeps your system aligned." → [Start Quarterly Review]
- **Recent (<90 days):** "Horizons reviewed {N} days ago." (info only, no nudge)

### 4.2 API Endpoint

`GET /api/horizon-reviews/latest` — returns the most recent completed `HorizonReview` for the current user, or 404 if none.

---

## 5. API Routes

### 5.1 Horizon Reviews CRUD

**`GET /api/horizon-reviews`** — list reviews (paginated)
- Query params: `page`, `limit`, `type` (filter by INITIAL_SETUP, QUARTERLY, ANNUAL)
- Returns: reviews sorted by createdAt desc

**`POST /api/horizon-reviews`** — start a new review
- Body: `{ type: "INITIAL_SETUP" | "QUARTERLY" | "ANNUAL" }`
- Validation: only one IN_PROGRESS review at a time (across all types)
- Initializes checklist based on type:
  - INITIAL_SETUP: `{ purpose: false, vision: false, goals: false, areas: false, projects: false, actions: false }`
  - QUARTERLY: `{ goals: false, vision: false, purpose: false }`
  - ANNUAL: `{ purpose: false, vision: false, goals: false, areas: false, projects: false, actions: false }`

**`GET /api/horizon-reviews/current`** — get the active in-progress review (or null)

**`GET /api/horizon-reviews/latest`** — get the most recent completed review (or null)

**`GET /api/horizon-reviews/[id]`** — get a specific review

**`PATCH /api/horizon-reviews/[id]`** — update checklist, notes
- Body: `{ checklist?: Partial<HorizonChecklist>, notes?: Partial<HorizonReviewNotes> }`
- Checklist updates merge with existing values (same pattern as WeeklyReview)
- Notes updates merge at the key level

**`POST /api/horizon-reviews/[id]/complete`** — mark review as completed
- Sets `status = COMPLETED`, `completedAt = now()`

**`DELETE /api/horizon-reviews/[id]`** — delete a review

### 5.2 Validation Schemas

```typescript
// src/lib/validations/horizon-review.ts

export const createHorizonReviewSchema = z.object({
  type: z.enum(["INITIAL_SETUP", "QUARTERLY", "ANNUAL"]),
});

export const updateHorizonReviewSchema = z.object({
  checklist: z.object({
    purpose: z.boolean().optional(),
    vision: z.boolean().optional(),
    goals: z.boolean().optional(),
    areas: z.boolean().optional(),
    projects: z.boolean().optional(),
    actions: z.boolean().optional(),
  }).optional(),
  notes: z.object({
    purpose: z.string().optional(),
    vision: z.string().optional(),
    goals: z.string().optional(),
    areas: z.string().optional(),
    projects: z.string().optional(),
    actions: z.string().optional(),
  }).optional(),
});
```

---

## 6. UI Components

### 6.1 Component Hierarchy

```
src/components/horizons/
  HorizonReviewWizard.tsx      — Main wizard (parallel to ReviewWizard.tsx)
  steps/
    PurposeStep.tsx            — 50K: reflective prompts + note editor
    VisionStep.tsx             — 40K: reflective prompts + note editor
    GoalsReviewStep.tsx        — 30K: goal audit + creation
    AreasReviewStep.tsx        — 20K: area audit + creation
    ProjectsSummaryStep.tsx    — 10K: project summary + quick capture
    ActionsSummaryStep.tsx     — Runway: action summary + quick capture
```

### 6.2 HorizonReviewWizard

Follows the same pattern as `ReviewWizard.tsx`:

- Fetches current in-progress `HorizonReview` on mount
- Restores step position from checklist state
- Saves progress (notes + checklist) after each step
- Step count varies by review type (4+2 for setup, 3 for quarterly, 6 for annual)
- Progress bar and step indicators
- Completes review on final step

**Key difference from ReviewWizard:** the step list is dynamic based on `review.type`. A config array defines which steps appear for each type:

```typescript
const STEP_CONFIG: Record<HorizonReviewType, StepDef[]> = {
  INITIAL_SETUP: [
    { key: "purpose", component: PurposeStep, label: "Purpose" },
    { key: "vision", component: VisionStep, label: "Vision" },
    { key: "goals", component: GoalsReviewStep, label: "Goals" },
    { key: "areas", component: AreasReviewStep, label: "Areas" },
    { key: "projects", component: ProjectsSummaryStep, label: "Projects" },
    { key: "actions", component: ActionsSummaryStep, label: "Actions" },
  ],
  QUARTERLY: [
    { key: "goals", component: GoalsReviewStep, label: "Goals" },
    { key: "vision", component: VisionStep, label: "Vision" },
    { key: "purpose", component: PurposeStep, label: "Purpose" },
  ],
  ANNUAL: [
    { key: "purpose", component: PurposeStep, label: "Purpose" },
    { key: "vision", component: VisionStep, label: "Vision" },
    { key: "goals", component: GoalsReviewStep, label: "Goals" },
    { key: "areas", component: AreasReviewStep, label: "Areas" },
    { key: "projects", component: ProjectsSummaryStep, label: "Projects" },
    { key: "actions", component: ActionsSummaryStep, label: "Actions" },
  ],
};
```

### 6.3 Step Components — Behavioral Modes

Each step component receives a `mode` prop that changes its behavior:

- **`setup`** — blank slate prompts, creation-focused, more hand-holding
- **`review`** — shows existing content, reflection-focused, "still true?" framing

The step components are shared across all three flow types. The mode determines the prompt text and whether existing data is shown as "here's what you have" (review) vs. "let's create this" (setup).

```typescript
interface StepProps {
  mode: "setup" | "review";
  notes: string;
  onNotesChange: (val: string) => void;
  onMarkComplete: () => void;
  onBack?: () => void;
  saving: boolean;
}
```

### 6.4 Entry Points

**Horizons page (`/horizons`):**
- If no HorizonNotes exist and no completed INITIAL_SETUP review: show a banner at top → "New here? Set up your horizons" → links to `/horizons/setup`
- If horizons review is overdue (>90 days): show a subtle banner → "Quarterly check-in recommended" → links to `/horizons/review?type=quarterly`

**Sidebar navigation:**
- No new nav items needed — the flows live under `/horizons/*`

**Weekly review (Get Creative step):**
- Nudge card as described in section 4.1

### 6.5 Page Routes

```
/horizons/setup     → HorizonReviewWizard with type=INITIAL_SETUP
/horizons/review    → HorizonReviewWizard with type from query param (quarterly or annual)
/horizons/history   → List of completed horizon reviews (optional, can be a section on /horizons)
```

---

## 7. Implementation Phases

### Phase 1: Data Model + API

**Goal:** HorizonReview CRUD and validation, no UI yet.

**Schema changes:**
- Add `HorizonReview` model and `HorizonReviewType` enum to `schema.prisma`
- Add `horizonReviews` relation on `User`
- Migration: `npx prisma migrate dev --name add-horizon-review`

**Code changes:**
- `src/lib/validations/horizon-review.ts` — Zod schemas (new)
- `src/app/api/horizon-reviews/route.ts` — GET (list), POST (create)
- `src/app/api/horizon-reviews/current/route.ts` — GET (active review)
- `src/app/api/horizon-reviews/latest/route.ts` — GET (most recent completed)
- `src/app/api/horizon-reviews/[id]/route.ts` — GET, PATCH, DELETE
- `src/app/api/horizon-reviews/[id]/complete/route.ts` — POST

**Files touched:** 8 (1 schema, 1 validation, 6 API routes)

### Phase 2: Initial Setup Wizard

**Goal:** First-time guided experience from 50K → Runway.

**Code changes:**
- `src/components/horizons/HorizonReviewWizard.tsx` — Main wizard component
- `src/components/horizons/steps/PurposeStep.tsx` — 50K prompts + note editor
- `src/components/horizons/steps/VisionStep.tsx` — 40K prompts + note editor
- `src/components/horizons/steps/GoalsReviewStep.tsx` — 30K goal creation/review
- `src/components/horizons/steps/AreasReviewStep.tsx` — 20K area creation/review
- `src/components/horizons/steps/ProjectsSummaryStep.tsx` — 10K summary
- `src/components/horizons/steps/ActionsSummaryStep.tsx` — Runway summary
- `src/app/(dashboard)/horizons/setup/page.tsx` — Setup page route

**Files touched:** 8 (7 components, 1 page)

### Phase 3: Periodic Review Flows (Quarterly + Annual)

**Goal:** Reflection-mode review for existing horizons.

**Code changes:**
- Update step components with `mode="review"` behavior (show existing content, reflection prompts)
- `src/app/(dashboard)/horizons/review/page.tsx` — Review page route (reads `type` from query)
- Update `HorizonReviewWizard` to handle all three types via `STEP_CONFIG`

**Files touched:** ~8 (step component updates + 1 new page)

### Phase 4: Weekly Review Integration + Entry Points

**Goal:** Nudges and navigation to connect the flows to existing UI.

**Code changes:**
- `src/components/review/steps/GetCreativeStep.tsx` — Add horizon review due-date check and nudge card
- `src/app/(dashboard)/horizons/page.tsx` — Add setup banner (no notes) and overdue review banner
- Optional: horizon review history section on horizons page

**Files touched:** 2-3

---

## 8. Key Design Decisions

### Why a separate model instead of extending WeeklyReview?

WeeklyReview has a fixed 3-step checklist (getClear, getCurrent, getCreative) and weekly cadence. Horizon reviews have variable steps depending on type and a quarterly/annual cadence. Forcing them into the same model would require making every field dynamic. Separate models keep each clean.

### Why not just improve the existing horizons page?

The horizons page is a **reference view** — good for quick edits and browsing. A guided flow is a different UX pattern: linear progression, reflective prompts, progress tracking, completion state. Trying to make the reference view do both would compromise each.

### Why start at 50K for initial setup but 30K for quarterly?

Initial setup works top-down because you need purpose and vision *first* to create meaningful goals. Quarterly reviews start at goals because that's what shifts most — you check in on progress, then glance up to make sure the bigger picture still holds.

### Why not track which specific goals/areas were reviewed?

Keeping it at the level of "did you review goals? yes/no" is simpler and matches the weekly review pattern. Individual goal updates are tracked on the goal records themselves (status, progress, updatedAt). The review just confirms you looked at everything.

---

## 9. Future Considerations

- **AI-assisted reflection:** Use the AI chat to help users articulate their purpose/vision. "Tell me about what matters to you" → AI helps distill into a purpose statement.
- **Review scheduling:** Recurring templates that auto-schedule quarterly/annual reviews as tasks.
- **Diff view:** "Here's what you wrote last quarter vs. now" — requires storing snapshots of HorizonNotes at review completion.
- **Team horizons:** Shared organizational purpose/vision at the team level (requires Teams feature).
- **MCP tools:** `tandem_horizon_review_status` tool for AI to check if a review is due and prompt the user.
