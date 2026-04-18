# Tandem — Product Specification v1.0

**Date:** February 21, 2026
**Author:** Jason Courtemanche / Courtemanche Atelier
**Context:** Open-source self-hosted GTD application with multi-user collaboration, extracted from FashionSuite patterns

---

## 1. Vision

A personal GTD (Getting Things Done) application called **Tandem** that faithfully implements David Allen's methodology — including the parts most apps get wrong: automatic next-action promotion, cross-project context views, Horizons of Focus, and a guided Weekly Review. Built for people who've read the book and want a system that *thinks in GTD*, not a generic task app with GTD bolted on.

### What Makes This Different

Most GTD apps fall into two camps: purist-but-ugly (Nirvana, FacileThings) or pretty-but-incomplete (Things 3, Todoist). The gap is an app that:

1. **Automates next-action cascading** — when you complete a task, blocked tasks automatically become available (OmniFocus does this; nobody else does it well)
2. **Shows cross-project context views as the primary work surface** — "Show me everything I can do @home right now" across ALL projects, not buried in a filter
3. **Implements Horizons of Focus as first-class architecture** — not a note buried in a reference folder
4. **Guides the Weekly Review** — not just a checklist, but an interactive workflow that surfaces stale projects, orphaned actions, and neglected areas
5. **Treats energy and time as real filters** — because context alone isn't enough when you're drained after work
6. **Open source and self-hosted** — your GTD data is the most intimate map of your life; it belongs on your hardware, not someone else's cloud
7. **Supports real collaboration** — shared projects and task delegation for families, friends, or small teams sharing a server, without exposing anyone's private data

---

## 2. GTD Methodology Deep Dive

### 2.1 The Five Steps

| Step | What Happens | App Feature |
|------|-------------|-------------|
| **Capture** | Get it out of your head into a trusted system | **Inbox** — global quick-capture (Cmd+I / mobile FAB) |
| **Clarify** | Process each item: Is it actionable? What's the next action? What's the outcome? | **Inbox Processing** — guided routing workflow |
| **Organize** | Put it where it belongs: calendar, next actions, project support, reference, someday/maybe, trash | **Routing destinations** with smart defaults |
| **Reflect** | Review your system regularly to keep it current and trusted | **Weekly Review** — guided interactive workflow |
| **Engage** | Choose what to do based on context, time, energy, priority | **"What Should I Do Now?"** — the primary work surface |

### 2.2 Horizons of Focus (The Vertical Axis)

GTD operates on two axes: the *horizontal* workflow (capture → engage) and the *vertical* perspective (runway → 50,000 ft). Most apps only implement the horizontal. We implement both.

```
50,000 ft  PURPOSE & PRINCIPLES    "Why am I here?"
           ─────────────────────────────────────────
40,000 ft  VISION                  "What does wild success look like in 3-5 years?"
           ─────────────────────────────────────────
30,000 ft  GOALS & OBJECTIVES      "What do I want to achieve in 1-2 years?"
           ─────────────────────────────────────────
20,000 ft  AREAS OF RESPONSIBILITY "What roles/domains require my ongoing attention?"
           ─────────────────────────────────────────
10,000 ft  PROJECTS                "What multi-step outcomes am I committed to?"
           ─────────────────────────────────────────
Runway     NEXT ACTIONS            "What's the next physical, visible thing I can do?"
```

**How they connect in the app:**

- **Purpose & Principles** (50K) → Stored as a personal mission statement / values document. Reviewed quarterly.
- **Vision** (40K) → Narrative descriptions of ideal future states per life area. Reviewed quarterly.
- **Goals** (30K) → SMART goals with 1-2 year horizons, linked to Areas. Reviewed monthly.
- **Areas of Responsibility** (20K) → The "hats you wear" — ongoing domains that generate projects. Reviewed weekly.
- **Projects** (10K) → Multi-step outcomes with defined "done" criteria. Reviewed weekly.
- **Next Actions** (Runway) → Physical, visible actions tagged with context/energy/time. Engaged daily.

### 2.3 Project Types

GTD recognizes that not all projects flow the same way. Our app supports three project execution types:

| Type | Behavior | Example |
|------|----------|---------|
| **Sequential** | Tasks must be done in order. Only the first incomplete task is "available." Completing one auto-promotes the next. | "Apply for passport" (fill form → get photos → mail application → wait for delivery) |
| **Parallel** | All tasks are available simultaneously. Any can be worked in any order. | "Plan birthday party" (buy decorations, send invitations, order cake — all independent) |
| **Single Actions** | A loose collection of related but independent actions. Not really a "project" — more like a checklist or area bucket. | "Home maintenance" (fix leaky faucet, replace light bulb, clean gutters) |

### 2.4 The Clarify Decision Tree

When processing an inbox item, the user walks through this decision tree:

```
┌─────────────────────────┐
│    What is this item?    │
└──────────┬──────────────┘
           │
    Is it actionable?
    ┌──────┴──────┐
    No            Yes
    │             │
    ├─ Trash      ├─ Will it take < 2 minutes?
    ├─ Reference  │   ├─ Yes → DO IT NOW (don't track)
    └─ Someday/   │   └─ No → What's the next action?
       Maybe      │         │
                  │         ├─ Delegate it → Waiting For
                  │         ├─ Defer it → Next Actions list
                  │         └─ Schedule it → Calendar
                  │
                  └─ Is it a multi-step outcome?
                      ├─ Yes → Create PROJECT + define next action
                      └─ No → Single next action on context list
```

**App Implementation:** The inbox processing view presents this as a guided flow, not a wall of dropdowns. Each step is a clear question with tappable answers.

### 2.5 Contexts — Beyond @Computer

Traditional GTD contexts (@office, @computer, @phone, @errands) were designed for a world where you had to physically be somewhere to use tools. For modern personal life, we need a hybrid approach:

**Location-Based Contexts:**
- `@home` — things you can only do at home
- `@errands` — things that require going somewhere
- `@office` — things for your workplace (if applicable)
- `@gym` — exercise-specific tasks

**Tool-Based Contexts:**
- `@computer` — requires a computer
- `@phone` — requires phone calls specifically

**People-Based Contexts:**
- `@partner` — things to discuss with your partner
- `@family` — things involving family members
- Custom people contexts

**Energy-Based Contexts (supplementary, not primary):**
- Used as a *filter on top of* location/tool contexts
- `High Energy` — complex thinking, creative work, difficult conversations
- `Medium Energy` — normal focus, routine tasks
- `Low Energy` — mindless tasks, filing, simple errands

**Time-Based Filter:**
- Not a context, but a filter: "I have 15 minutes" / "30 minutes" / "1 hour" / "2+ hours"

**Users can create custom contexts.** The above are defaults that ship with the app.

---

## 3. The Next-Action Cascade Engine

### 3.1 The Core Problem It Solves

This is the automation Jason loved in ClickUp and that OmniFocus handles with sequential projects: **when you complete a task, the system should automatically figure out what's now unblocked and promote it to "available" / "do now" status.**

Without this, users have to manually scan every project after completing a task to see what opened up. That's cognitive overhead that kills GTD adoption.

### 3.2 How It Works

#### Task States

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  NOT_STARTED │────►│ IN_PROGRESS │────►│  COMPLETE    │
│  (future)    │     │ (active)    │     │  (done)      │
└──────┬──────┘     └──────┬──────┘     └──────────────┘
       │                   │
       │                   ▼
       │            ┌─────────────┐
       │            │   PAUSED    │
       │            │ (interrupted)│
       │            └─────────────┘
       │
       ▼
┌─────────────┐
│   BLOCKED   │  (has incomplete dependencies)
│  (waiting)  │
└─────────────┘
```

#### Availability Calculation

A task is **available** (eligible to be a "next action") if ALL of the following are true:

1. Status is `NOT_STARTED` or `PAUSED`
2. All tasks in its `dependsOn` list are `COMPLETE`
3. Its parent project is `ACTIVE` (not paused, someday/maybe, or archived)
4. If the project is **sequential**: it is the first non-complete task in sequence order
5. If the project is **parallel**: it has no incomplete dependencies
6. It is NOT marked as `isSomedayMaybe`

#### The Cascade Algorithm

When a task is marked `COMPLETE`:

```typescript
async function onTaskComplete(completedTask: Task): Promise<CascadeResult> {
  const result: CascadeResult = {
    promoted: [],
    projectCompleted: null,
    goalProgress: null
  };

  // 1. Find all tasks that were depending on this one
  const unblockedTasks = await findDependentTasks(completedTask.id);

  for (const task of unblockedTasks) {
    // Check if ALL of this task's dependencies are now complete
    const allDepsComplete = await checkAllDependenciesComplete(task.id);

    if (allDepsComplete) {
      // 2. Promote: Set isNextAction = true, status stays NOT_STARTED
      await promoteToNextAction(task);
      result.promoted.push(task);
    }
  }

  // 3. For sequential projects, also check sequence order
  if (completedTask.project.type === 'SEQUENTIAL') {
    const nextInSequence = await findNextIncompleteBySequence(
      completedTask.projectId,
      completedTask.sequence
    );
    if (nextInSequence && !result.promoted.includes(nextInSequence)) {
      await promoteToNextAction(nextInSequence);
      result.promoted.push(nextInSequence);
    }
  }

  // 4. Check if project is now complete (all tasks done)
  const allTasksComplete = await checkProjectComplete(completedTask.projectId);
  if (allTasksComplete) {
    await markProjectComplete(completedTask.projectId);
    result.projectCompleted = completedTask.project;

    // 5. Update goal progress if project is linked to a goal
    if (completedTask.project.goalId) {
      result.goalProgress = await updateGoalProgress(completedTask.project.goalId);
    }
  }

  // 6. Return result so UI can show celebration / notification
  return result;
}
```

#### What the User Sees

When Jason completes "Sew shoulder seams" on his T-shirt project:

1. The task gets a satisfying checkmark animation
2. A toast notification appears: **"Unlocked: Attach sleeves"** (with a link to jump to it)
3. If he's viewing the cross-project context view for `@home`, "Attach sleeves" immediately appears in his available tasks
4. The old task slides out of the list; the new one slides in
5. If the entire project completes, a celebration moment: **"Project complete: T-Shirt Construction! 🎉"**

### 3.3 The `isNextAction` Flag

This is the heart of the system. Every task has a boolean `isNextAction` flag:

- **`true`** = This task is currently available to work on. It appears in context views and "What Should I Do Now?"
- **`false`** = This task exists but isn't available yet (blocked, future, or in a sequential project behind other tasks)

The flag is managed **automatically by the cascade engine**, not manually by the user. The user should rarely (if ever) need to toggle this themselves. The system handles it through:

1. **Inbox processing** — when a new task is created and has no dependencies, `isNextAction = true`
2. **Task completion** — cascade promotes dependent tasks
3. **Project creation** — for sequential projects, only the first task gets `isNextAction = true`
4. **Dependency changes** — adding/removing dependencies recalculates availability

### 3.4 Cross-Project "Waiting For" Cascade

When a task in Project A depends on a task in Project B (cross-project dependency), the cascade works identically. Complete the blocker in Project B → the dependent in Project A gets promoted.

This is powerful for life management:
- "Book flight to Argentina" (Travel project) blocks "Reserve hotel in Buenos Aires" (same project) AND "Tell tango teacher I'll be away" (Tango project)

---

## 4. Predefined Views — The Primary Work Surface

### 4.1 Design Philosophy

The #1 insight from Jason's ClickUp experience: **the primary way you engage with GTD should be through context-filtered, cross-project views — not by drilling into individual projects.**

You don't think "let me open my Bathroom Renovation project and see what's next." You think "I'm at home, I have 30 minutes, what can I get done?" The app should match that mental model.

### 4.2 View Architecture

Every view is a **saved filter combination** applied across ALL projects simultaneously.

#### The "What Should I Do Now?" View (Default Home)

This is the landing page. It shows a filterable list of all available next actions across all projects.

```
┌──────────────────────────────────────────────────────────┐
│  What Should I Do Now?                                    │
│                                                          │
│  ┌─ Context ────────────────────────────────────────┐    │
│  │ [@home] [@errands] [@computer] [@phone] [@gym]   │    │
│  │ [@partner] [@anywhere]          [+ custom]       │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─ Time Available ─────────┐  ┌─ Energy ───────────┐   │
│  │ [15m] [30m] [1hr] [2hr+] │  │ [Low] [Med] [High] │   │
│  │ [Any]                    │  │ [Any]               │   │
│  └──────────────────────────┘  └─────────────────────┘   │
│                                                          │
│  ═══════════════════════════════════════════════════════  │
│                                                          │
│  ▸ Do Now (3)                                            │
│  ┌──────────────────────────────────────────────────┐    │
│  │ ☐ Sew side seams                     30m  Med    │    │
│  │   └ T-Shirt Project · @home                      │    │
│  │ ☐ Call dentist for cleaning          10m  Low    │    │
│  │   └ Health Maintenance · @phone                  │    │
│  │ ☐ Research swim coaches              20m  Low    │    │
│  │   └ Swimming Practice · @computer                │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ▸ Waiting For (2)                                       │
│  ┌──────────────────────────────────────────────────┐    │
│  │ ⏳ Insurance claim response    delegated: Aetna   │    │
│  │   └ Health Insurance · since Feb 14              │    │
│  │ ⏳ Landlord fix heating        delegated: Mgmt    │    │
│  │   └ Apartment Issues · since Feb 10              │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ▸ Due Soon (1)                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ ☐ File state taxes             📅 Mar 15  1hr Hi │    │
│  │   └ Tax Season 2026 · @computer                  │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

**Key behaviors:**
- Context buttons are **toggle filters** — tap `@home` and only home tasks show. Tap `@home` + `@phone` to see both.
- Time and energy are **maximum filters** — "30m" shows tasks estimated at ≤ 30 minutes
- The list updates **instantly** as filters change (client-side filtering, not round-trips)
- Completing a task triggers the cascade and the list updates in place
- Filter state persists across sessions

#### Predefined Quick Views

These are one-tap saved filter combinations, available in the sidebar:

| View Name | Filters | Use Case |
|-----------|---------|----------|
| **Home Focus** | `@home` + Do Now | Evening wind-down, weekend tasks |
| **Errand Run** | `@errands` + Do Now | Out and about, knock out errands |
| **Quick Wins** | Any context + ≤15 min + Do Now | Waiting room, between meetings |
| **Deep Work** | `@computer` + High energy + ≥1hr | Focused creative/technical work |
| **Low Battery** | Any context + Low energy + Do Now | End of day, tired but want progress |
| **Calls to Make** | `@phone` + Do Now | Batch phone calls |
| **Waiting For** | All waiting-for items | Weekly review checkpoint |
| **Due This Week** | Items with due dates this week | Urgency scan |

**Users can create and save their own custom views.**

### 4.3 Project View (Secondary)

Projects are organized under Areas of Responsibility and are the *planning* surface, not the *doing* surface:

```
┌──────────────────────────────────────────────────────────┐
│  Projects                          [+ New Project]       │
│                                                          │
│  ▾ Health & Fitness                    (Area)            │
│    ├─ 🔵 Swimming Practice            3 actions, 1 next  │
│    ├─ 🟢 Dentist Checkup             1 action, 1 next   │
│    └─ ⚪ Marathon Training            Someday/Maybe      │
│                                                          │
│  ▾ Home & Living                       (Area)            │
│    ├─ 🔵 Bathroom Renovation          7 actions, 2 next  │
│    └─ 🔵 Spring Cleaning             4 actions, 1 next   │
│                                                          │
│  ▾ Creative & Learning                 (Area)            │
│    ├─ 🟡 T-Shirt Construction         3 actions, 1 next  │
│    ├─ 🔵 CLO3D Learning Path         12 actions, 1 next  │
│    └─ ⚪ Learn Portuguese             Someday/Maybe      │
│                                                          │
│  ▾ Spiritual Practice                  (Area)            │
│    └─ 🔵 DSS Coursework              5 actions, 2 next   │
│                                                          │
│  ▾ Relationships                       (Area)            │
│    └─ 🔵 Plan Trip to Argentina       4 actions, 1 next  │
└──────────────────────────────────────────────────────────┘
```

Status indicators:
- 🔵 Active (has next actions)
- 🟡 Active but stalled (no next action defined — Weekly Review will flag this)
- 🟢 Active, nearly complete
- ⚪ Someday/Maybe
- ✅ Complete

### 4.4 Horizons View

A dedicated view for higher-altitude reflection. Each horizon level is an expandable card with inline management, notes, and contextual help.

**Inline management:** Goals (30K) and Areas of Responsibility (20K) can be created, edited, and deleted directly from the Horizons page — no navigation away required. The full `/areas` page is still available for reordering and archiving.

**Contextual help hints:** Each card has a `?` icon that opens a popover with a guiding question and good/bad examples to help users understand what belongs at each level. This prevents common mistakes like putting a project ("Trip to Japan") where an area ("Personal Enrichment") should go, or writing a vague vision ("Be healthier") where a measurable goal ("Run a half marathon by October") is needed.

```
┌──────────────────────────────────────────────────────────┐
│  Horizons of Focus                                       │
│                                                          │
│  ┌─ Purpose & Principles (50K) ───────────── [?] ───┐   │
│  │  "To integrate technical mastery, spiritual depth, │   │
│  │   and creative expression in service of authentic  │   │
│  │   human connection."                               │   │
│  │                                    [Edit] [Review] │   │
│  └────────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─ Vision (40K) ──────────────────────────── [?] ───┐   │
│  │  ▸ Running Courtemanche Atelier full-time          │   │
│  │  ▸ Teaching tango and conscious partnership        │   │
│  │  ▸ Financial independence through multiple streams │   │
│  │                                    [Edit] [Review] │   │
│  └────────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─ Goals (30K) — 1-2 Year ───────────────── [?] ───┐   │
│  │  ▸ Launch LLC by 2/26/26            ████████░░ 80% │   │
│  │    └ 3 projects, 2 active                          │   │
│  │  ▸ Master CLO3D basics by Dec 2026  ██░░░░░░░░ 15% │   │
│  │    └ 1 project, 1 active                           │   │
│  │  ▸ Complete DSS by 2027             ████░░░░░░ 40% │   │
│  │    └ 2 projects, 1 active                          │   │
│  │                            [+ Add Goal] [Review]   │   │
│  └────────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─ Areas of Responsibility (20K) ────────── [?] ───┐   │
│  │  ▸ Health & Fitness       2 projects, 1 goal       │   │
│  │  ▸ Finances               1 project                │   │
│  │  ▸ Career Development     3 projects, 2 goals      │   │
│  │  ▸ Relationships          1 project                │   │
│  │              [+ Add Area] [Manage all (reorder)]   │   │
│  └────────────────────────────────────────────────────┘   │
│                                                          │
│  Projects (10K) → [Go to Projects view]                  │
│  Next Actions (Runway) → [Go to What Should I Do Now?]   │
└──────────────────────────────────────────────────────────┘
```

---

## 5. The Weekly Review — Guided Workflow

The Weekly Review is what keeps GTD alive. Without it, the system decays. Our app makes it interactive and thorough.

### 5.1 The Review Flow

```
Step 1: GET CLEAR
  ├─ Process Inbox to Zero
  │   (show inbox count, process each item)
  ├─ Collect Loose Papers & Materials
  │   (checklist prompt — "Have you gathered everything?")
  ├─ Empty Your Head
  │   (mind sweep — rapid capture with trigger list prompts)
  └─ Review Waiting For
      (show all waiting-for items with age, prompt to follow up)

Step 2: GET CURRENT
  ├─ Review Action Lists
  │   (walk through each context list, mark done/delete stale)
  ├─ Review Previous Calendar (what happened?)
  │   (show last 7 days of calendar events)
  ├─ Review Upcoming Calendar (what's coming?)
  │   (show next 14 days)
  ├─ Review Projects
  │   (for each active project: is it still active? does it have a next action?)
  │   ⚠️ FLAG: Projects with no next action
  │   ⚠️ FLAG: Projects not touched in 2+ weeks
  └─ Review Someday/Maybe
      (anything ready to activate? anything to trash?)

Step 3: GET CREATIVE
  ├─ Review Goals (30K)
  │   (are current projects moving these forward?)
  ├─ Review Areas of Responsibility (20K)
  │   (any neglected areas? new projects needed?)
  └─ Is There Anything Else?
      (open capture for any final thoughts)
```

### 5.2 Trigger Lists

During the "Empty Your Head" step, the app presents GTD trigger list categories to help surface forgotten commitments:

**Professional:** projects started, projects to start, commitments to others, communications to make, meetings to schedule, financial tasks, administrative tasks, professional development

**Personal:** health appointments, home repairs, personal errands, financial tasks (bills, insurance, taxes), family commitments, social engagements, travel planning, hobbies/interests, spiritual practice, gifts/occasions, subscriptions to review

The user taps through categories; each surfaces 5-10 prompts. Captured items go to inbox for processing.

---

## 6. Data Model

### 6.1 Core Models (~16 for MVP, + collaboration models for v1.1)

```prisma
// ============================================================================
// AUTH
// ============================================================================

model User {
  id             String    @id @default(cuid())
  email          String    @unique
  name           String?
  passwordHash   String    @map("password_hash")
  timezone       String    @default("America/New_York")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  // Relations
  areas          Area[]
  goals          Goal[]
  projects       Project[]
  tasks          Task[]
  inboxItems     InboxItem[]
  contexts       Context[]
  wikiArticles   WikiArticle[]
  weeklyReviews  WeeklyReview[]
  waitingFors    WaitingFor[]
  recurringTemplates RecurringTemplate[]
  horizonNotes   HorizonNote[]

  // Collaboration
  projectMemberships ProjectMember[]       // shared projects user belongs to
  assignedTasks      Task[]    @relation("assignedTasks")  // tasks delegated to this user

  @@map("users")
}

// ============================================================================
// HORIZONS OF FOCUS
// ============================================================================

/// Areas of Responsibility (20,000 ft) — ongoing life domains
model Area {
  id          String    @id @default(cuid())
  userId      String    @map("user_id")
  user        User      @relation(fields: [userId], references: [id])
  name        String    // e.g., "Health & Fitness", "Home & Living"
  description String?   // What this area encompasses
  icon        String?   // Emoji or icon identifier
  sortOrder   Int       @default(0) @map("sort_order")
  isActive    Boolean   @default(true) @map("is_active")

  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  // Relations
  goals       Goal[]
  projects    Project[]

  @@index([userId])
  @@map("areas")
}

/// Goals (30,000 ft) — 1-2 year objectives
model Goal {
  id             String    @id @default(cuid())
  userId         String    @map("user_id")
  user           User      @relation(fields: [userId], references: [id])
  areaId         String?   @map("area_id")
  area           Area?     @relation(fields: [areaId], references: [id])
  name           String    // e.g., "Master CLO3D basics"
  description    String?   // Detailed description of the goal
  successCriteria String?  @map("success_criteria") // How you know it's done
  targetDate     DateTime? @map("target_date")
  progressPercent Int      @default(0) @map("progress_percent") // 0-100
  status         GoalStatus @default(ACTIVE)

  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  // Relations
  projects    Project[]

  @@index([userId])
  @@index([areaId])
  @@map("goals")
}

enum GoalStatus {
  ACTIVE
  ACHIEVED
  ABANDONED
  ON_HOLD
}

/// Purpose, Vision, Principles (40K-50K ft) — narrative documents
model HorizonNote {
  id        String       @id @default(cuid())
  userId    String       @map("user_id")
  user      User         @relation(fields: [userId], references: [id])
  horizon   HorizonLevel
  title     String       // e.g., "Personal Mission Statement"
  content   String       // Markdown content
  lastReviewedAt DateTime? @map("last_reviewed_at")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([userId])
  @@map("horizon_notes")
}

enum HorizonLevel {
  PURPOSE_PRINCIPLES  // 50K
  VISION              // 40K
}

// ============================================================================
// PROJECTS
// ============================================================================

model Project {
  id              String        @id @default(cuid())
  userId          String        @map("user_id")
  user            User          @relation(fields: [userId], references: [id])
  areaId          String?       @map("area_id")
  area            Area?         @relation(fields: [areaId], references: [id])
  goalId          String?       @map("goal_id")
  goal            Goal?         @relation(fields: [goalId], references: [id])
  name            String
  description     String?
  successOutcome  String?       @map("success_outcome") // "What does 'done' look like?"
  status          ProjectStatus @default(ACTIVE)
  projectType     ProjectType   @default(PARALLEL)
  isSomedayMaybe  Boolean       @default(false) @map("is_someday_maybe")
  sortOrder       Int           @default(0) @map("sort_order")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // Relations
  tasks          Task[]
  parentProjectId String?   @map("parent_project_id")
  parentProject   Project?  @relation("ProjectChildren", fields: [parentProjectId], references: [id], onDelete: SetNull)
  childProjects   Project[] @relation("ProjectChildren")

  @@index([userId])
  @@index([areaId])
  @@index([goalId])
  @@index([status])
  @@map("projects")
}

enum ProjectStatus {
  ACTIVE
  ON_HOLD
  COMPLETE
  ARCHIVED
}

enum ProjectType {
  SEQUENTIAL  // Only first incomplete task is available
  PARALLEL    // All non-blocked tasks are available
  SINGLE_ACTIONS // Loose collection, all always available
}

// ============================================================================
// TASKS (THE CORE ENGINE)
// ============================================================================

model Task {
  id               String      @id @default(cuid())
  userId           String      @map("user_id")
  user             User        @relation(fields: [userId], references: [id])
  projectId        String?     @map("project_id")
  project          Project?    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name             String
  description      String?     // Supports markdown + [[wiki links]]
  status           TaskStatus  @default(NOT_STARTED)
  contextId        String?     @map("context_id")
  context          Context?    @relation(fields: [contextId], references: [id])
  energyLevel      EnergyLevel @default(MEDIUM)
  estimatedMinutes Int?        @map("estimated_minutes")
  actualMinutes    Int?        @map("actual_minutes")
  sequence         Int         @default(0) // Order within project (for sequential)
  dueDate          DateTime?   @map("due_date")
  scheduledDate    DateTime?   @map("scheduled_date") // "Defer until" / start date

  // GTD FLAGS — managed by the cascade engine
  isNextAction     Boolean     @default(false) @map("is_next_action")
  // ↑ THE KEY FLAG: true = appears in context views and "What Should I Do Now?"

  // Hierarchy
  parentTaskId     String?     @map("parent_task_id")
  parentTask       Task?       @relation("TaskHierarchy", fields: [parentTaskId], references: [id], onDelete: SetNull)
  childTasks       Task[]      @relation("TaskHierarchy")

  // Completion tracking
  completedAt      DateTime?   @map("completed_at")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // Dependencies (the cascade backbone)
  dependsOn   Task[] @relation("TaskDependencies")
  dependents  Task[] @relation("TaskDependencies")

  @@index([userId])
  @@index([projectId])
  @@index([contextId])
  @@index([status])
  @@index([isNextAction])
  @@index([dueDate])
  @@map("tasks")
}

enum TaskStatus {
  NOT_STARTED
  IN_PROGRESS
  PAUSED
  COMPLETE
  SKIPPED
}

enum EnergyLevel {
  LOW
  MEDIUM
  HIGH
}

// ============================================================================
// CONTEXTS
// ============================================================================

model Context {
  id        String  @id @default(cuid())
  userId    String  @map("user_id")
  user      User    @relation(fields: [userId], references: [id])
  name      String  // e.g., "Home", "Errands", "Computer"
  icon      String? // Emoji
  color     String? // Hex color for pills/badges
  isDefault Boolean @default(false) @map("is_default") // Ships with app
  sortOrder Int     @default(0) @map("sort_order")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // Relations
  tasks     Task[]

  @@unique([userId, name])
  @@index([userId])
  @@map("contexts")
}

// ============================================================================
// GTD SUPPORTING FEATURES
// ============================================================================

/// Inbox — quick capture
model InboxItem {
  id        String          @id @default(cuid())
  userId    String          @map("user_id")
  user      User            @relation(fields: [userId], references: [id])
  content   String          // Raw captured text
  status    InboxItemStatus @default(NEW)
  capturedAt DateTime       @default(now()) @map("captured_at")
  processedAt DateTime?     @map("processed_at")

  @@index([userId])
  @@index([status])
  @@map("inbox_items")
}

enum InboxItemStatus {
  NEW
  PROCESSED
  TRASHED
}

/// Waiting For — delegated items
model WaitingFor {
  id            String    @id @default(cuid())
  userId        String    @map("user_id")
  user          User      @relation(fields: [userId], references: [id])
  description   String    // What you're waiting for
  delegatedTo   String    @map("delegated_to") // Person or entity
  projectId     String?   @map("project_id") // Optional link to project
  delegatedDate DateTime  @default(now()) @map("delegated_date")
  followUpDate  DateTime? @map("follow_up_date")
  isResolved    Boolean   @default(false) @map("is_resolved")
  resolvedAt    DateTime? @map("resolved_at")
  notes         String?

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([userId])
  @@index([isResolved])
  @@map("waiting_for")
}

/// Wiki — personal reference / knowledge base
model WikiArticle {
  id          String     @id @default(cuid())
  userId      String     @map("user_id")
  user        User       @relation(fields: [userId], references: [id])
  title       String
  slug        String
  content     String     // Markdown with [[bracket syntax]]
  category    String?    // User-defined categories
  isSomedayMaybe Boolean @default(false) @map("is_someday_maybe")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([userId, slug])
  @@index([userId])
  @@map("wiki_articles")
}

/// Recurring Templates — life rhythms
model RecurringTemplate {
  id               String          @id @default(cuid())
  userId           String          @map("user_id")
  user             User            @relation(fields: [userId], references: [id])
  name             String          // "Weekly grocery run"
  contextId        String?         @map("context_id")
  energyLevel      EnergyLevel     @default(MEDIUM)
  estimatedMinutes Int?            @map("estimated_minutes")
  recurrenceRule   String          // iCal RRULE format
  nextOccurrence   DateTime?       @map("next_occurrence")
  isActive         Boolean         @default(true) @map("is_active")
  projectId        String?         @map("project_id") // Optional: auto-create in this project

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([userId])
  @@map("recurring_templates")
}

/// Weekly Review — checklist state
model WeeklyReview {
  id           String    @id @default(cuid())
  userId       String    @map("user_id")
  user         User      @relation(fields: [userId], references: [id])
  weekOf       DateTime  @map("week_of") // Monday of the review week
  status       ReviewStatus @default(IN_PROGRESS)
  checklistState Json    @map("checklist_state") // Which steps are complete
  notes        String?   // Review reflections
  startedAt    DateTime  @default(now()) @map("started_at")
  completedAt  DateTime? @map("completed_at")

  @@unique([userId, weekOf])
  @@index([userId])
  @@map("weekly_reviews")
}

enum ReviewStatus {
  IN_PROGRESS
  COMPLETE
  SKIPPED
}

// ============================================================================
// COLLABORATION (multi-user shared projects & task delegation)
// ============================================================================

model ProjectMember {
  id        String   @id @default(cuid())
  projectId String   @map("project_id")
  userId    String   @map("user_id")
  role      ProjectRole @default(MEMBER)
  joinedAt  DateTime @default(now()) @map("joined_at")

  project   Project  @relation(fields: [projectId], references: [id])
  user      User     @relation(fields: [userId], references: [id])

  @@unique([projectId, userId])
  @@map("project_members")
}

enum ProjectRole {
  OWNER       // Created the project, full control
  MEMBER      // Can view, complete assigned tasks, add tasks
}
```

**Collaboration fields on existing models:**

The `Task` model gains an optional `assignedToId` field:
```prisma
model Task {
  // ... existing fields ...
  assignedToId  String?  @map("assigned_to_id")  // null = unassigned (owner's task)
  assignedTo    User?    @relation("assignedTasks", fields: [assignedToId], references: [id])
}
```

The `Project` model gains a `members` relation:
```prisma
model Project {
  // ... existing fields ...
  isShared   Boolean         @default(false) @map("is_shared")
  members    ProjectMember[]
}
```

The `WaitingFor` model gains an optional link to a delegated task:
```prisma
model WaitingFor {
  // ... existing fields ...
  delegatedTaskId  String?  @map("delegated_task_id")  // auto-created when assigning task
  delegatedTask    Task?    @relation(fields: [delegatedTaskId], references: [id])
}
```

---

## 7. UI Standards

### 7.1 Design Principles

1. **Context views are the front door.** The app opens to "What Should I Do Now?" — not a project list, not a dashboard of charts. The first thing you see is what you can *do*.

2. **One-tap filtering, zero typing.** Context buttons, time chips, and energy selectors are all tappable toggles. You should never have to type a filter query.

3. **Completion feels good.** Checking off a task should have a satisfying micro-interaction: haptic feedback (mobile), smooth animation, and an immediate cascade showing what just unlocked.

4. **Minimal chrome, maximum content.** No sidebar-heavy layouts. Use a bottom nav (mobile) or slim left rail (desktop). The task list IS the app.

5. **Dense but scannable.** Each task card shows: name, project, context badge, time estimate, energy indicator. No clicking to see essential metadata.

6. **Respect dark mode.** Full dark mode support from day one. Many people do their evening review in low light.

### 7.2 Component Library

Use shadcn/ui for consistency with FS and rapid development.

**Core Components:**

| Component | Usage |
|-----------|-------|
| **ContextPill** | Colored badge for context tags (`@home`, `@errands`). Tappable as filter toggles. |
| **EnergyDot** | Small colored circle: 🟢 Low, 🟡 Medium, 🔴 High |
| **TimeBadge** | Compact time estimate: "15m", "1hr" |
| **TaskCard** | The atomic unit. Shows task name, project reference, context pill, time badge, energy dot. Swipeable on mobile. |
| **ProjectBadge** | Small link showing which project a task belongs to |
| **CascadeToast** | Notification that appears when completing a task unlocks others: "Unlocked: [task name]" |
| **FilterBar** | Horizontal scrollable row of filter toggles (contexts, time, energy) |
| **InboxCapture** | Global quick-entry modal (Cmd+I / floating action button) |
| **ReviewStep** | Card component for guided weekly review steps |
| **HorizonCard** | Expandable card for each level of Horizons of Focus |

### 7.3 Navigation Structure

```
Mobile (Bottom Nav):
  [Do Now]  [Inbox]  [+]  [Projects]  [More]
                      ↑
                Quick Capture

Desktop (Left Rail):
  ┌──────────────────┐
  │ 🏠 Do Now        │  ← Primary work surface
  │ 📥 Inbox (3)     │  ← Badge shows unprocessed count
  │ 📋 Projects      │
  │ ⏳ Waiting For   │
  │ 💭 Someday/Maybe │
  │ ───────────────  │
  │ 🔍 Quick Views   │
  │   Home Focus     │
  │   Errand Run     │
  │   Quick Wins     │
  │   Deep Work      │
  │   Low Battery    │
  │ ───────────────  │
  │ 🎯 Horizons      │
  │ 📖 Wiki          │
  │ 🔄 Weekly Review │
  │ ⚙️ Settings      │
  └──────────────────┘
```

### 7.4 Key Interactions

**Completing a Task:**
1. Tap checkbox (or swipe right on mobile)
2. Checkbox fills with satisfying animation (not instant — ~300ms)
3. If cascade promotes tasks: toast slides in from top showing unlocked items
4. Completed task fades out and list reflows
5. If project completes: celebration animation + toast

**Quick Capture (Cmd+I / FAB):**
1. Modal slides up with text input auto-focused
2. Type freely — just the raw thought
3. Hit Enter to capture and keep modal open (batch capture mode)
4. Hit Escape to close
5. Items appear in Inbox with red badge count

**Processing Inbox:**
1. Show one item at a time, full screen
2. Below the item: action buttons following the clarify decision tree
3. "Is it actionable?" → [No: Trash / Reference / Someday] [Yes: continue]
4. "What's the next action?" → task creation form with context/project/energy
5. "< 2 minutes?" → prominent "Do It Now" button that marks it done immediately
6. After routing, next item slides in automatically

**Switching Views via Context:**
1. Tap a context pill in the filter bar
2. List instantly filters (no loading spinner — client-side)
3. Active filter pill shows a highlight/border
4. Tap again to deselect
5. Multiple contexts can be active simultaneously (OR logic)

---

## 8. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 14 (App Router) | Same as FS — shared muscle memory |
| Database | PostgreSQL + Prisma | Proven combo, same as FS |
| UI | Tailwind + shadcn/ui | Same as FS |
| Auth | NextAuth.js | Multi-user from day one |
| Validation | Zod | Same as FS |
| Markdown | react-markdown + remark-gfm | Wiki + task descriptions |
| Icons | lucide-react | Same as FS |
| Language | TypeScript | Same as FS |
| PWA | next-pwa / Serwist | Installable on all devices, offline task viewing |
| Deployment | Docker + Caddy | One-command self-hosting with auto-SSL |

### 8.1 Key Architectural Differences from FS

| Aspect | FS | This App |
|--------|-----|---------|
| Users | Single user (Jason) | Multi-user (self-hosted, open source) |
| Auth | Basic credential auth | Email/password + OAuth (Google, Apple) |
| Data isolation | None needed | Full multi-tenant (userId on everything) |
| Deployment | localhost:2600 | Docker Compose: local, VPN, or public with Caddy auto-SSL |
| Offline | Aspirational PWA | Real PWA: installable, offline task viewing, write queue |
| API design | Internal only | Public-ready (rate limiting, pagination, error codes) |
| Distribution | Private repo | Open source (MIT or AGPL) |

---

## 9. MVP Feature Set (v1.0)

### Must Have (Launch)

- [ ] User auth (email/password)
- [ ] Inbox with Cmd+I / FAB quick capture
- [ ] Inbox processing with guided decision tree (including two-minute rule)
- [ ] Projects (sequential, parallel, single actions)
- [ ] Tasks with contexts, energy, time estimates
- [ ] **Next-action cascade engine** (the core differentiator)
- [ ] **"What Should I Do Now?" cross-project context view**
- [ ] Predefined quick views (Home Focus, Quick Wins, etc.)
- [ ] Custom context creation
- [ ] Waiting For tracking
- [ ] Someday/Maybe with promotion
- [ ] Areas of Responsibility
- [ ] Defer dates / tickler logic (hidden until scheduled date)
- [ ] Basic Weekly Review checklist
- [ ] Global search (Cmd+K)
- [ ] Keyboard shortcuts
- [ ] Docker Compose deployment (all three options: local, VPN, public)
- [ ] PWA manifest + service worker (installable on phone/desktop)
- [ ] Responsive design (mobile-first, works on all screen sizes)
- [ ] Dark mode

### Should Have (v1.1)

- [ ] Goals (30K ft) with project linking
- [ ] Horizons view (40K-50K narrative notes)
- [ ] Wiki / personal reference
- [ ] Recurring task templates + checklists
- [ ] Due date reminders / notifications (in-app + push)
- [ ] **Shared projects + task delegation** (multi-user collaboration)
- [ ] User invitation flow (admin invites via email or link)
- [ ] Data export (JSON, CSV, Markdown)
- [ ] Archive with search
- [ ] Calendar view
- [ ] Automated database backups

### Nice to Have (v1.2+)

- [ ] OAuth (Google, Apple sign-in)
- [ ] Offline write queue (capture tasks offline, sync when reconnected)
- [ ] Task time tracking
- [ ] Import from Todoist / OmniFocus / Things
- [ ] API for integrations
- [ ] Trigger lists for mind sweeps
- [ ] Natural language input ("Call dentist tomorrow @phone 10m")
- [ ] Email-to-inbox capture
- [ ] Statistics dashboard (tasks completed, productive contexts, streaks)
- [ ] Plugin/extension architecture

---

## 10. Name

**Tandem**

The name works on multiple levels:
- **Tango** — partner connection, moving in sync (Jason's world)
- **Twin collaboration** — two people working together, side by side
- **GTD parallel/sequential** — tasks and projects moving in tandem
- **Self-hosted multi-user** — friends and family running the app in tandem on shared infrastructure

Domain: tandem.gtd, tandemgtd.com, or similar (to be secured)
GitHub: `tandem-gtd`

---

## 11. Open Source & Licensing

This is a **fully open source** project. All features are available to everyone — no artificial tiers, no gated functionality, no telemetry.

**License:** MIT (or AGPL-3.0 — to be decided; AGPL ensures hosted forks remain open)

**Philosophy:** GTD is a personal system. Your task data is some of the most intimate information about your life — what you're worried about, what you're procrastinating on, what you dream about. That data should live on hardware you control, not on someone else's server.

**Contribution model:** Open to community PRs. Plugin/extension architecture planned for v2 so contributors can add features without bloating the core.

---

## 12. Deployment & Self-Hosting

### 12.1 The Goal: One App, Everywhere

The app should feel like a single unified experience whether you're:
- On your desktop browser at home
- On your phone while running errands
- On your work laptop during a break
- On a tablet on the couch

This is achieved through **responsive web design + PWA (Progressive Web App)** — one codebase, one URL, installable on every device. No separate iOS/Android apps to maintain. The PWA installs to the home screen and runs full-screen like a native app.

### 12.2 Deployment Options

Users have three paths depending on their comfort level:

#### Option A: Local Only (Simplest)

For someone who only uses it on one machine, or on their home network:

```bash
git clone https://github.com/courtemancheatelier/tandem-gtd.git
cd tandem
cp .env.example .env.local
docker compose up -d
```

Access at `http://localhost:3000`. Done. No domain, no SSL, no port forwarding.

To access from other devices on the same Wi-Fi (phone, tablet):
- Find your machine's local IP (e.g., `192.168.1.50`)
- Access at `http://192.168.1.50:3000` from any device on the network

#### Option B: VPN Access (Private + Mobile)

For someone who wants phone access outside the house without exposing anything to the public internet:

```
┌─────────────────────────────────────────────────────┐
│  Your Home Server / VPS                              │
│  ┌───────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ WireGuard │  │ Next.js  │  │   PostgreSQL     │ │
│  │ VPN       │──│ App      │──│   Database       │ │
│  │ :51820    │  │ :3000    │  │   :5432          │ │
│  └───────────┘  └──────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────┘
         ▲
         │ Encrypted WireGuard tunnel
         │
    ┌────┴────┐
    │  Phone  │  (WireGuard app installed)
    │  Laptop │
    │  Tablet │
    └─────────┘
```

**Setup:**
1. Deploy with Docker Compose (same as Option A) on a home server or cheap VPS
2. Install WireGuard on the server
3. Install WireGuard client on phone/laptop/tablet
4. Connect to VPN → access the app at its local address

**Recommended VPN tools:**
- **WireGuard** — fast, modern, simple config
- **Tailscale** — zero-config WireGuard mesh (free for personal use, easiest option)
- **Headscale** — self-hosted Tailscale control server (fully self-contained)

With **Tailscale**, setup is literally:
```bash
# On server
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up

# On phone
# Install Tailscale app, sign in, done
# Access app at http://[tailscale-ip]:3000
```

#### Option C: Public Internet (Open to the World)

For someone who wants a proper URL with HTTPS, accessible from anywhere without VPN:

```
┌──────────────────────────────────────────────────────────┐
│  Your Server (VPS / Home Server with port forwarding)     │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────────────┐│
│  │  Caddy  │  │ Next.js  │  │      PostgreSQL          ││
│  │ (Proxy) │──│  App     │──│      Database             ││
│  │ :80/443 │  │  :3000   │  │      :5432               ││
│  └─────────┘  └──────────┘  └──────────────────────────┘│
└──────────────────────────────────────────────────────────┘
       ▲
       │ HTTPS (automatic Let's Encrypt via Caddy)
       │
  https://gtd.yourdomain.com
       │
    Any device, anywhere
```

**Setup:**
1. Get a VPS ($4-6/mo — see hosting guide below)
2. Point a domain/subdomain to your server's IP
3. Deploy with the included Docker Compose + Caddyfile
4. Caddy auto-provisions HTTPS via Let's Encrypt

### 12.3 VPS Hosting Guide

For most users going with Option B (VPN) or Option C (public), a $4-6/month VPS is more than enough for a personal GTD app. Here are the top choices as of 2026:

| Provider | Starting Price | Best For | Locations |
|----------|---------------|----------|-----------|
| **Hetzner** | ~$4/mo (2 vCPU, 4GB RAM) | Best price-to-performance overall | Germany, Finland, US (Virginia, Oregon), Singapore |
| **OVHcloud** | ~$5.50/mo (1 vCPU, 2GB RAM) | Unlimited bandwidth, strong EU privacy | US (Virginia, Oregon), France, Canada, and more |
| **DigitalOcean** | $6/mo (1 vCPU, 1GB RAM) | Easiest setup, best docs for beginners | 15+ regions globally |
| **Vultr** | ~$6/mo (1 vCPU, 1GB RAM) | Most locations worldwide | 30+ cities globally |
| **Linode (Akamai)** | $5/mo (1 vCPU, 1GB RAM) | Reliable, good support | US, EU, Asia-Pacific |

**Recommended minimum spec for Tandem:** 1 vCPU, 2GB RAM, 20GB SSD. That's enough to run the Docker stack (Caddy + Next.js + PostgreSQL) comfortably for a single user.

**Why VPS over home hosting:** A VPS gives you a **static IP address** that never changes. Home internet connections typically have dynamic IPs that your ISP can reassign at any time, which breaks your VPN tunnel, your domain DNS, and any bookmarks your devices have saved. With a VPS, the address is fixed — your Tailscale mesh, your domain, your phone bookmark all keep working indefinitely. No messing with dynamic DNS services or discovering your server went offline because your IP rotated overnight.

**The typical self-host setup:** A VPS running Ubuntu 24.04 on Hetzner or OVHcloud, with Tailscale installed for VPN access from phone and laptop. Total cost: $4-6/month for the VPS + $0 for Tailscale (free personal plan). That's it — a full GTD system accessible from every device, data under your control, for less than a coffee.

### 12.3.1 Group Hosting: Bare Metal for Friends & Family

A VPS is a slice of a shared physical machine — fine for a single user, but if a group of friends, a family, or a small team wants to go in together on a server, **dedicated bare metal** gives you the whole machine to yourself. No noisy neighbors, no shared CPU, more storage, and complete physical isolation of your data.

**Why bare metal for groups:**
- A small friend group (3-5 people) can split a ~$55-130/month server and each pay less than a solo VPS
- Each person gets their own user account with fully isolated data (multi-tenant by design)
- Shared projects and collaborative task lists between accounts (see Section 12.3.2)
- Massively more storage and compute than any VPS — room to grow, run backups, host other services
- Physical hardware isolation means nobody else's workload touches your machine
- Full disk encryption possible — your data is on hardware only your group controls

**OVHcloud bare metal tiers (2026):**

| Tier | Starting Price | Specs | Best For |
|------|---------------|-------|----------|
| **Rise 2026** | ~$55/mo | AMD Ryzen/EPYC, 32GB RAM, NVMe SSD | Small groups (2-4 people), EU/Canada data centers |
| **Advance 2026** | ~$130/mo | AMD EPYC 4245P 6c/12t, 32-256GB RAM, NVMe | Larger groups (4-8 people), global availability |

Split an Advance server 4 ways and you're each paying ~$32/month for a machine that could comfortably serve 50+ users. For Tandem, that's absurd overkill in the best possible way — the server could simultaneously run Tandem, a Nextcloud instance, a Vaultwarden password manager, and still be bored.

**The group setup looks like:**
```
┌─────────────────────────────────────────────────────────────┐
│  OVHcloud Bare Metal (dedicated physical server)             │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────────────┐   │
│  │  Caddy  │  │ Next.js  │  │    PostgreSQL             │   │
│  │ (Proxy) │──│ Tandem   │──│    (multi-tenant)         │   │
│  │ :80/443 │  │ :3000    │  │    :5432                  │   │
│  └─────────┘  └──────────┘  └──────────────────────────┘   │
│                                                              │
│  Tailscale mesh network (all members connected)              │
└─────────────────────────────────────────────────────────────┘
         ▲              ▲              ▲              ▲
         │              │              │              │
    ┌────┴────┐   ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
    │  Jason  │   │  Twin   │   │ Friend  │   │ Friend  │
    │ (admin) │   │ Brother │   │   #1    │   │   #2    │
    └─────────┘   └─────────┘   └─────────┘   └─────────┘
    Phone+Desktop  Phone+Desktop  Phone+Desktop  Phone+Desktop
```

One person in the group acts as admin (handles updates, backups). Everyone else just installs Tailscale and opens the app. Each person has their own private GTD system, but they can optionally share projects and delegate tasks to each other.

### 12.3.2 Multi-User Collaboration

The app is designed as multi-tenant from the ground up — every piece of data has a `userId` on it, and users can only see their own data by default. But real life involves other people, and GTD explicitly handles this through Waiting For items and delegated tasks. The collaboration layer extends this naturally:

**Shared Projects:**
- Any project owner can invite other users on the same server to a shared project
- Shared projects appear in both users' project lists
- Tasks within shared projects can be assigned to specific users
- Each user's "What Should I Do Now?" view only shows tasks assigned to them (or unassigned)
- Project owner retains control (can archive, delete, modify structure)

**Task Delegation:**
- Assign a task to another user on the server → it appears in their task list with the assigner noted
- The assigner automatically gets a Waiting For entry tracking the delegated task
- When the delegate completes the task, the assigner's Waiting For resolves automatically
- Both users see the task in context views appropriate to their own filters

**Concrete example — Jason and his twin brother:**
- Jason creates a shared project: "Mom's Birthday Party Planning"
- Jason assigns himself: "Order cake @phone 15min" and "Book restaurant @computer 30min"
- Jason assigns his brother: "Pick up decorations @errands 1hr" and "Send invites to family @computer 30min"
- Jason's @phone view shows "Order cake" among his other calls
- His brother's @errands view shows "Pick up decorations" alongside his own errands
- When his brother marks "Pick up decorations" done, Jason gets a notification and his Waiting For clears
- Both can see overall project progress

**Privacy boundaries:**
- Users NEVER see each other's private projects, tasks, inbox, or review data
- Collaboration is opt-in per project — sharing one project doesn't expose anything else
- The admin who manages the server cannot see other users' private data (enforced at the application layer, not just UI)
- Users can leave shared projects at any time

### 12.4 The PWA Desktop App Experience

This is how most people will use the app day-to-day — as an installed desktop application via PWA (Progressive Web App). The experience is:

**Installation (one-time):**
1. Open the app URL in Chrome or Edge (Safari support is limited)
2. Click the install icon in the address bar (or the browser prompts you)
3. The app installs to your dock/taskbar with its own icon
4. From now on, it launches in its own window — no browser chrome, no tabs, no URL bar

**What it looks and feels like:**
- Opens in a standalone window, just like a native app
- Has its own icon in the dock/taskbar and alt-tab/app switcher
- No address bar, no back button, no bookmarks bar — just the app
- Supports system-level keyboard shortcuts (Cmd+I for quick capture works even when the window is focused)
- Badge notifications on the app icon (inbox count, due items)
- Works identically whether you're accessing it from a home server, VPN, or public URL

**On mobile (iOS / Android):**
1. Open the URL in Safari (iOS) or Chrome (Android)
2. "Add to Home Screen"
3. Launches full-screen with the app icon — indistinguishable from a native app
4. Pull-to-refresh, smooth scrolling, haptic feedback on task completion
5. The FAB (floating action button) for quick capture is always visible

**Why PWA instead of native apps:**
- One codebase serves desktop, mobile, and web — no App Store submissions, no separate iOS/Android codebases
- Updates are instant (refresh the page) — no waiting for app store approval
- Works on every platform: Mac, Windows, Linux, iOS, Android, ChromeOS
- For an open source self-hosted app, this is the only practical approach — you can't distribute through app stores with user-specific server URLs

**Included files in the repo:**

```
deploy/
├── docker-compose.yml          # All three services (Caddy + App + Postgres)
├── docker-compose.local.yml    # Local-only override (no Caddy, port 3000 exposed)
├── Dockerfile                  # Multi-stage Next.js production build
├── Caddyfile                   # Reverse proxy + auto-SSL + security headers
├── .env.example                # Template with all required env vars
└── scripts/
    ├── setup.sh                # One-command server provisioning
    ├── deploy.sh               # Pull + build + restart with pre-deploy backup
    ├── backup-db.sh            # Compressed PostgreSQL dump
    ├── restore-db.sh           # Interactive restore from backup
    └── migrate-db.sh           # Run Prisma migrations in container
```

### 12.5 Docker Compose Configuration

```yaml
# docker-compose.yml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    depends_on:
      - app
    networks:
      - tandem-net

  app:
    build: .
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql://tandem:${DB_PASSWORD}@db:5432/tandem
      - NEXTAUTH_URL=${APP_URL}
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
    depends_on:
      db:
        condition: service_healthy
    networks:
      - tandem-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      - POSTGRES_USER=tandem
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=tandem
    volumes:
      - db_data:/var/lib/postgresql/data
      - ./backups:/backups
    networks:
      - tandem-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tandem -d tandem"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  db_data:
  caddy_data:

networks:
  tandem-net:
    driver: bridge
```

### 12.6 PWA Configuration

The app ships as a Progressive Web App so it installs natively on any device:

```json
// public/manifest.json
{
  "name": "Tandem — Personal GTD",
  "short_name": "Tandem",
  "description": "Get things done — with automatic next-action cascading and real collaboration",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**What PWA gives you:**
- "Add to Home Screen" on iOS/Android — launches full-screen, no browser chrome
- App icon on desktop (Chrome/Edge) — opens in its own window
- Offline capability for viewing cached task lists (writes queue until reconnected)
- Push notifications for due dates and reminders (when browser supports it)

### 12.7 Database Backups

Automated daily backups with 30-day retention, included in the Docker setup:

```bash
# Cron job installed by setup.sh
0 2 * * * cd /opt/tandem && ./scripts/backup-db.sh
```

Restore is interactive with confirmation:
```bash
./scripts/restore-db.sh backups/tandem_20260221_020000.sql.gz
```

### 12.8 Update Path

```bash
cd /opt/tandem
git pull origin main
./scripts/deploy.sh    # Backs up DB, rebuilds container, runs migrations, health check
```

---

## 13. Missing Features to Add Before v1.0

Items identified during spec review that need to be addressed:

### 13.1 Defer Dates (Tickler File)

GTD's "tickler file" (43 folders) concept digitized. The `scheduledDate` field on Task already exists in the schema, but the logic needs to be explicit:

- A task with `scheduledDate` in the future is **hidden from all views** until that date arrives
- On the scheduled date, it automatically appears in the appropriate context view
- Use case: "Call landlord about lease renewal" — defer until 30 days before lease expires
- Use case: "Buy anniversary gift" — defer until 2 weeks before the date
- The daily "tickler check" runs on app load and surfaces newly-available deferred items with a notification: "3 items became available today"

### 13.2 The Two-Minute Rule (Inbox Processing)

During inbox clarification, when the user indicates an item IS actionable, present a prominent choice:

**"Will this take less than 2 minutes?"**
- **Yes** → Show a "Do It Now" button. Tapping it marks the item as done immediately (no project, no context, no tracking — just gone). The point is to NOT create overhead for trivial tasks.
- **No** → Continue to the full task creation flow (project, context, energy, dependencies)

This is a core GTD principle that most apps skip entirely.

### 13.3 Global Search

Search across everything — tasks, projects, wiki articles, inbox items, waiting-for items, someday/maybe, goals, horizon notes. Results grouped by type. Accessible via `Cmd+K` / `Ctrl+K` (command palette pattern).

### 13.4 Keyboard Shortcuts

Power users live on the keyboard. Ship with these from day one:

| Shortcut | Action |
|----------|--------|
| `Cmd+I` | Quick capture to inbox |
| `Cmd+K` | Global search |
| `Cmd+1` | Go to "What Should I Do Now?" |
| `Cmd+2` | Go to Inbox |
| `Cmd+3` | Go to Projects |
| `Cmd+Enter` | Complete selected task |
| `Tab` / `Shift+Tab` | Navigate between tasks |
| `E` | Edit selected task |
| `D` | Set due date on selected task |
| `P` | Assign project to selected task |
| `C` | Set context on selected task |
| `?` | Show keyboard shortcut overlay |

### 13.5 Data Portability (Import / Export)

Critical for open source — users must own their data completely:

**Export:**
- Full JSON export of all data (one click)
- CSV export of tasks/projects (for spreadsheet users)
- Markdown export of wiki articles
- Standard iCal export of calendar items

**Import:**
- Todoist JSON/CSV
- OmniFocus OFocus backup (XML-based)
- Things 3 JSON (via Shortcuts export)
- Plain text / Markdown task lists
- Generic CSV with column mapping

### 13.6 Checklists (Repeating Non-Projects)

Some recurring things aren't "projects" — they're checklists that reset:
- Morning routine (meditate, journal, stretch, make bed)
- Packing list for travel
- Weekly grocery staples
- Pre-tango-class warmup

These are `RecurringTemplate` instances that, when triggered, create a set of tasks in a temporary "checklist" grouping. When all items are checked off, the checklist completes and resets for next time.

### 13.7 Notifications & Reminders

- **Due date reminders** — configurable (day before, morning of, 1 hour before)
- **Tickler surfacing** — "3 deferred items became available today"
- **Weekly Review nudge** — if it's been 7+ days since last review, gentle reminder
- **Stale project warning** — "Project X has had no activity in 14 days"
- **Waiting-for follow-up** — "You've been waiting on [person] for 10 days"

Delivered via:
- In-app notification badge + drawer
- Browser push notifications (PWA)
- Optional email digest (daily or weekly)

### 13.8 Archive & History

Completed projects and tasks should be searchable but not clutter active views:

- Completing a project moves it to Archive after 7 days (configurable)
- Archive is fully searchable
- "Show completed" toggle on any view to include archived items
- Statistics: tasks completed this week/month, average completion time, most productive contexts

---

*This spec is a living document. Bring it to Claude Code sessions for Tandem implementation.*
