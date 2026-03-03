# Onboarding Flow — First-Run Experience

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement

### The Need

When a new user logs into Tandem for the first time, they see an empty Do Now page with the message "No available actions. Capture something in your Inbox!" This is a dead end for two reasons:

1. **GTD is unfamiliar to most people** — even users who have heard of GTD need guidance on how Tandem maps to GTD concepts (Inbox = Capture, Do Now = Engage, Weekly Review = Reflect).
2. **An empty system feels dead** — the most critical moment in onboarding is getting data into the system. Every minute a new user spends staring at empty screens is a minute closer to abandonment.

### What Exists

- Default contexts are seeded on first visit to `/contexts` (7 defaults defined in `src/app/(dashboard)/contexts/page.tsx` and also in `src/lib/auth.ts` at signup)
- The Inbox Capture Modal (`Cmd+I`) works from any page
- The Inbox Processing Wizard at `/inbox/process` walks through the clarify/organize steps
- The Help Docs system provides reference material but does not guide first-time users
- The Horizons Guided Review spec (`docs/specs/HORIZONS_GUIDED_REVIEW.md`) has an Initial Setup flow for higher horizons — onboarding should complement it, not overlap

### What Done Looks Like

1. New users are detected on first login and shown an onboarding flow instead of an empty Do Now page.
2. The flow teaches GTD in 4-5 steps by doing — not by reading. Each step uses a real Tandem feature.
3. The "brain dump" step gets items into the inbox immediately — this is the single most important conversion moment.
4. The user processes at least one inbox item through the full clarify workflow.
5. Contexts and areas are set up with sensible defaults and user customization.
6. Experienced GTD users can skip at any point.
7. Onboarding can be replayed from Help or Settings.
8. After completion, the user lands on Do Now with actual tasks to work on.

---

## 2. Data Model Changes

### 2.1 Onboarding Flag on User

Add a nullable timestamp to the `User` model:

```prisma
// In model User (schema.prisma)
onboardingCompletedAt DateTime?
```

- `null` = onboarding not completed (show onboarding on next visit)
- Set to `now()` when onboarding is completed or skipped

This is simpler than a separate model. The flag answers one question: "Has this user been through onboarding?" There is no need to track individual step progress — the onboarding flow is short enough to restart from the beginning if interrupted.

### 2.2 No Other Model Changes

The onboarding flow creates records using existing models and APIs:
- `InboxItem` for brain dump captures
- `Task` for processed items
- `Context` for context setup (already seeded at signup)
- `Area` for area setup

---

## 3. Onboarding Detection

### 3.1 When to Show Onboarding

Detect on the dashboard layout level. The check runs client-side after the page loads:

```typescript
// src/lib/hooks/use-onboarding-check.ts

export function useOnboardingCheck() {
  const [shouldOnboard, setShouldOnboard] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/onboarding/status")
      .then((res) => res.json())
      .then((data) => {
        setShouldOnboard(!data.onboardingCompleted);
        setChecking(false);
      });
  }, []);

  return { shouldOnboard, checking };
}
```

### 3.2 Status API

```
GET /api/onboarding/status
```

Returns:

```json
{
  "onboardingCompleted": false
}
```

Checks `user.onboardingCompletedAt !== null`. This is the only field checked — we do not infer onboarding status from task/project counts, because a user might have data from an import but still want the tutorial.

### 3.3 Entry Point

In the Do Now page component, check onboarding status. If not completed, redirect to `/onboarding`:

```typescript
// In src/app/(dashboard)/do-now/page.tsx (or in the dashboard layout)

const { shouldOnboard, checking } = useOnboardingCheck();
const router = useRouter();

useEffect(() => {
  if (!checking && shouldOnboard) {
    router.replace("/onboarding");
  }
}, [checking, shouldOnboard, router]);
```

Alternatively, show the onboarding as a full-screen overlay within the dashboard layout so the sidebar is still visible. This spec recommends the dedicated `/onboarding` route because it is a linear, focused flow that should not compete with the sidebar for attention.

---

## 4. Onboarding Flow

### 4.1 Step Overview

| Step | Name | What Happens | Key Feature Taught |
|------|------|-------------|-------------------|
| 1 | Welcome | Brief GTD overview, what Tandem is | — |
| 2 | Brain Dump | Multi-line input, everything on your mind | Inbox (Capture) |
| 3 | Process One | Walk through processing a single inbox item | Inbox Processing (Clarify + Organize) |
| 4 | Contexts | Show defaults, let user customize | Contexts |
| 5 | Areas | Prompt for 3-5 life areas | Areas (Horizons) |
| 6 | Done | Celebration, explanation of what to do next | Do Now, Weekly Review |

### 4.2 Step 1 — Welcome

Full-screen card with simple explanation:

```
Welcome to Tandem

Tandem is built on Getting Things Done (GTD), a system for
managing everything on your plate without keeping it all in
your head.

Here's how it works in 30 seconds:

  1. Capture  — Dump everything into your Inbox
  2. Clarify  — Decide what each item means
  3. Organize — Put it in the right place
  4. Reflect  — Weekly review to stay current
  5. Engage   — Do the right thing, right now

Let's get you set up in under 5 minutes.

[Get Started]                    [Skip — I know GTD →]
```

The skip button calls `POST /api/onboarding/complete` and redirects to `/do-now`.

### 4.3 Step 2 — Brain Dump (Critical Step)

This is the most important step in the entire onboarding. If the user captures items here, they have data in the system and a reason to come back.

```
What's on your mind?

Don't filter. Don't organize. Just get it out of your head.
Things to do, ideas, errands, projects, worries — anything.
One item per line.

┌──────────────────────────────────────────────────────────┐
│ Buy groceries                                            │
│ Fix the leaky faucet                                     │
│ Plan birthday party for Mom                              │
│ Research vacation destinations                           │
│ Schedule dentist appointment                             │
│ Learn how to use this app better                         │
│                                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘

{N} items captured

[Add These to Inbox]
```

Implementation:
- Multi-line textarea
- On submit, split by newlines, trim, filter blanks
- Create each line as an `InboxItem` via `POST /api/inbox` (batch)
- Show a running count as user types
- Minimum 1 item required to proceed (but user can skip the whole onboarding)

```typescript
async function handleBrainDump(lines: string[]) {
  const items = lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  await Promise.all(
    items.map((content) =>
      fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
    )
  );
}
```

### 4.4 Step 3 — Process One Item

Take the first item from the brain dump and walk through the existing processing wizard steps, but with explanatory text:

```
Let's process your first item:

  "Plan birthday party for Mom"

Is this actionable? Can you do something about it?

  [Yes, it's actionable]    [No — delete it]    [No — save for someday]
```

If yes → "What's the very next physical action?"

```
The next action is the smallest concrete step.
Not "plan party" but "Text Sarah to ask about venue options."

Next action: [Text Sarah to ask about venue options     ]
Project:     [Mom's Birthday Party                      ] (new)
Context:     [@Phone ▼]
Energy:      [LOW ▼]
Time:        [5 min ▼]

[Create Task]
```

This step reuses the logic from `ProcessingStep1.tsx`, `ProcessingStep2a.tsx`, `ProcessingStep2b.tsx` — but with extra explanatory copy and a simplified layout.

After creating the task, show a success message:

```
  ✓ Task created: "Text Sarah to ask about venue options"
     Project: Mom's Birthday Party
     Context: @Phone

  You have {N-1} more items in your inbox.
  You can process them after onboarding — or any time from
  the Inbox page.

  [Continue →]
```

### 4.5 Step 4 — Contexts

Show the 7 default contexts (already seeded at signup via `src/lib/auth.ts`):

```
Contexts are where you can do work.

When you're at the office, you can only do @Office tasks.
When you're running errands, you see @Errands tasks.

Your default contexts:

  ☑ @Computer    ☑ @Phone     ☑ @Office
  ☑ @Home        ☑ @Errands   ☑ @Anywhere
  ☑ @Agenda

  [+ Add context]    [Remove unchecked]

  These work for most people. You can always change them
  later in Settings → Contexts.

  [Continue →]
```

Implementation: Fetch existing contexts from `GET /api/contexts`. Show checkboxes. Allow rename (inline edit), add, and remove. Changes are saved immediately via existing context API endpoints.

### 4.6 Step 5 — Areas of Responsibility

```
Areas are the big parts of your life you maintain.

They never "complete" — they're ongoing standards.
Think: what would fall apart if you ignored it for 3 months?

Common areas:

  ☑ Health & Fitness      [rename]
  ☑ Finances              [rename]
  ☑ Career / Work         [rename]
  ☑ Relationships         [rename]
  ☑ Home & Environment    [rename]
  ☐ Personal Growth       [rename]
  ☐ Creativity            [rename]

  [+ Add area]

  Check the ones that matter to you. You can always
  adjust these later.

  [Continue →]
```

Implementation: Show suggested areas with checkboxes. Checked areas are created via `POST /api/areas` on continue. Unchecked areas are not created. User can add custom areas inline.

### 4.7 Step 6 — Done

```
  🎉 You're all set!

  You have:
    • {N} items in your Inbox to process
    • 1 task ready to do
    • {M} contexts set up
    • {A} areas of responsibility

  What's next?

  → Process your Inbox — clarify the rest of your brain dump
  → Do Now — see your available actions
  → Weekly Review — do this every week to stay on track

  [Go to Do Now]
```

On this step:
1. Call `POST /api/onboarding/complete` to set `onboardingCompletedAt`
2. Optionally show a confetti animation (use a lightweight library like `canvas-confetti`)
3. Redirect to `/do-now`

---

## 5. API Routes

### 5.1 Onboarding Status

```
GET /api/onboarding/status
```

```typescript
// src/app/api/onboarding/status/route.ts

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { onboardingCompletedAt: true },
  });

  return NextResponse.json({
    onboardingCompleted: user.onboardingCompletedAt !== null,
  });
}
```

### 5.2 Complete Onboarding

```
POST /api/onboarding/complete
```

```typescript
// src/app/api/onboarding/complete/route.ts

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  await prisma.user.update({
    where: { id: userId },
    data: { onboardingCompletedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
```

### 5.3 Reset Onboarding (Replay)

```
POST /api/onboarding/reset
```

Sets `onboardingCompletedAt = null` so the flow triggers again. Available from Help or Settings. Does not delete any data created during previous onboarding.

---

## 6. UI Components

### 6.1 Component Hierarchy

```
src/components/onboarding/
  OnboardingWizard.tsx       — Main wizard (step management, progress bar)
  steps/
    WelcomeStep.tsx          — GTD overview + get started
    BrainDumpStep.tsx        — Multi-line capture
    ProcessOneStep.tsx       — Guided inbox processing
    ContextsStep.tsx         — Context review/customization
    AreasStep.tsx            — Area creation
    DoneStep.tsx             — Celebration + next steps
```

### 6.2 Page Route

```
src/app/(dashboard)/onboarding/page.tsx
```

Full-width page within the dashboard layout (sidebar visible but secondary). The onboarding wizard takes center stage.

### 6.3 Wizard Component Pattern

Follow the same wizard pattern used in `src/components/horizons/HorizonReviewWizard.tsx` and `src/components/review/ReviewWizard.tsx`:

```typescript
// src/components/onboarding/OnboardingWizard.tsx

const STEPS = [
  { key: "welcome", component: WelcomeStep, label: "Welcome" },
  { key: "braindump", component: BrainDumpStep, label: "Brain Dump" },
  { key: "process", component: ProcessOneStep, label: "Process" },
  { key: "contexts", component: ContextsStep, label: "Contexts" },
  { key: "areas", component: AreasStep, label: "Areas" },
  { key: "done", component: DoneStep, label: "Done" },
];

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();

  async function handleSkip() {
    await fetch("/api/onboarding/complete", { method: "POST" });
    router.push("/do-now");
  }

  async function handleComplete() {
    await fetch("/api/onboarding/complete", { method: "POST" });
    router.push("/do-now");
  }

  return (
    <div className="max-w-2xl mx-auto py-10">
      {/* Progress indicator */}
      <div className="flex gap-2 mb-8">
        {STEPS.map((step, i) => (
          <div
            key={step.key}
            className={cn(
              "h-1 flex-1 rounded-full",
              i <= currentStep ? "bg-primary" : "bg-muted"
            )}
          />
        ))}
      </div>

      {/* Current step */}
      <StepComponent
        onNext={() => setCurrentStep((s) => s + 1)}
        onSkip={handleSkip}
        onComplete={handleComplete}
      />
    </div>
  );
}
```

---

## 7. Implementation Phases

### Phase 1: Detection + Brain Dump

**Goal:** Detect first-run users, redirect to onboarding, and capture inbox items.

**Schema changes:**
- Add `onboardingCompletedAt DateTime?` to `User` model
- Migration: `npx prisma migrate dev --name add-onboarding-flag`

**Code changes:**
- `src/app/api/onboarding/status/route.ts` — GET status (new)
- `src/app/api/onboarding/complete/route.ts` — POST complete (new)
- `src/lib/hooks/use-onboarding-check.ts` — Client hook (new)
- `src/components/onboarding/OnboardingWizard.tsx` — Wizard shell (new)
- `src/components/onboarding/steps/WelcomeStep.tsx` — Welcome (new)
- `src/components/onboarding/steps/BrainDumpStep.tsx` — Brain dump (new)
- `src/components/onboarding/steps/DoneStep.tsx` — Temporary completion step (new)
- `src/app/(dashboard)/onboarding/page.tsx` — Page route (new)
- `src/app/(dashboard)/do-now/page.tsx` — Add onboarding redirect check

**Files touched:** 9 (1 schema, 2 API routes, 1 hook, 5 components, 1 page, 1 page update)

### Phase 2: Process One Item Walkthrough

**Goal:** Guide user through processing their first inbox item.

**Code changes:**
- `src/components/onboarding/steps/ProcessOneStep.tsx` — Guided processing (new)
- Reuses logic from existing `ProcessingStep1.tsx`, `ProcessingStep2a.tsx`, `ProcessingStep2b.tsx`

**Files touched:** 1

### Phase 3: Context & Area Setup

**Goal:** Let users customize contexts and create areas during onboarding.

**Code changes:**
- `src/components/onboarding/steps/ContextsStep.tsx` — Context review (new)
- `src/components/onboarding/steps/AreasStep.tsx` — Area creation (new)

**Files touched:** 2

### Phase 4: Polish — GTD Explainers, Replay, Confetti

**Goal:** Add educational copy, skip-all-steps, replay option, and celebration.

**Code changes:**
- `src/app/api/onboarding/reset/route.ts` — POST reset (new)
- Update `DoneStep.tsx` with confetti animation
- Add "Replay Tutorial" button to Settings page and/or Help page
- Add educational copy to each step component

**Files touched:** ~4 (1 API route, 3 component updates)

---

## 8. Edge Cases

- **User created via admin** — Admin-created users should also see onboarding. The `onboardingCompletedAt` field starts null for all new users regardless of creation method.
- **User with imported data** — A user who imported data from another tool should still see onboarding for the GTD tutorial. Onboarding is based on the flag, not data presence.
- **Browser back button** — Steps should work with browser history. Use `useSearchParams` to track step: `/onboarding?step=2`.
- **Multiple devices** — If onboarding is completed on one device, it should not appear on another. The flag is server-side.
- **Interrupted onboarding** — If the user closes the browser mid-onboarding, they will see it again next time (flag not set until completion/skip). Brain dump items already captured are preserved in the inbox.
- **Accessibility** — All onboarding steps must be keyboard-navigable. The brain dump textarea should auto-focus. Steps should have descriptive headings for screen readers.

---

## 9. What This Spec Does Not Cover

- **Onboarding for team features** — This spec covers individual user onboarding only. Team onboarding (inviting members, sharing projects) is a separate concern.
- **Onboarding for admin features** — Admin-specific setup (AI configuration, server settings) is not part of user onboarding.
- **Horizons setup** — The Horizons Guided Review spec covers the deep-dive into purpose/vision/goals. Onboarding focuses on ground-level GTD (inbox, tasks, contexts). The Done step can link to the Horizons Setup flow for users who want to go deeper.
- **A/B testing** — No experimentation framework for testing different onboarding flows.
- **Analytics/tracking** — No tracking of step completion rates or drop-off points.

---

## 10. Future Considerations

- **Onboarding for specific features** — Feature-level onboarding tooltips when a user encounters a feature for the first time (e.g., first time visiting Weekly Review, first time using MCP).
- **Progressive disclosure** — Hide advanced features (Gantt, sub-projects, PM dashboard) until the user has been active for a few weeks or completes a threshold of reviews.
- **Personalized onboarding** — Ask "What tool are you coming from?" on step 1 and tailor the experience (e.g., Todoist users get different context suggestions).
- **AI-assisted onboarding** — Use the AI chat to help users with their brain dump: "Tell me about your week — what do you need to get done?"
- **Onboarding checklist** — A persistent sidebar widget showing "Getting Started" progress (like Notion or Linear) that persists beyond the initial wizard.
```

---
