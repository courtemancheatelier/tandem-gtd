# Tandem — Organizational Horizons & Team Goal Alignment

**Version:** 1.0
**Date:** March 27, 2026
**Author:** Jason Courtemanche
**Extends:** TEAMS.md, Horizons Guided Review (done), VOLUNTEER_ORGS.md
**Status:** Draft
**Depends On:** Existing personal horizons (Area, Goal, HorizonNote, HorizonReview models)

---

## 1. Overview

Tandem already implements GTD's Horizons of Focus for individuals — a personal purpose, vision, goals, areas, projects, and actions. But organizations need this too. A nonprofit board needs a mission statement that connects down to committee goals, which connect down to projects, which connect down to tasks. Without this, team projects float untethered — people do work without knowing how it connects to the bigger picture.

This spec adds **organizational horizons** (owned by the top-level team) and **team-level goals and areas** (owned by child teams) that link upward, creating a full GTD alignment cascade from org mission to individual task.

### 1.1 The Alignment Problem

Today in Tandem:

- A team can have projects, but those projects aren't connected to any stated goal
- There's no place to capture an organization's mission, vision, or strategic goals
- Team leads can't show their volunteers how their work connects to the org's bigger picture
- During a board meeting, there's no way to see "here are our strategic goals and which teams/projects are advancing each one"
- Personal horizons exist but organizational ones don't — so the GTD methodology breaks at the team boundary

### 1.2 The GTD Alignment Cascade

```
┌─────────────────────────────────────────────────────────────┐
│  ORGANIZATION (top-level team)                               │
│                                                               │
│  H5 — Purpose / Mission                                       │
│  "Facilitating transformation and building community"         │
│                                                               │
│  H4 — Vision (3-5 year)                                       │
│  "Become the leading personal development community           │
│   in New England with 500+ active members"                    │
│                                                               │
│  H3 — Strategic Goals (1-2 year)                              │
│  ┌──────────────────┐  ┌──────────────────┐                  │
│  │ Grow membership   │  │ Modernize IT      │                 │
│  │ by 30%            │  │ infrastructure     │                │
│  └────────┬─────────┘  └────────┬──────────┘                 │
│           │                      │                             │
│  H2 — Organizational Areas                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │Marketing │ │Seminars  │ │Tech      │ │Finance   │         │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────────┘        │
├───────┼─────────────┼───────────┼────────────────────────────┤
│       │             │           │                             │
│  TEAMS (child teams)│           │                             │
│       │             │           │                             │
│       ▼             ▼           ▼                             │
│  ┌─────────┐  ┌──────────┐ ┌──────────┐                     │
│  │Marketing│  │Insight I │ │Tech Team │                      │
│  │  Team   │  │ Creation │ │          │                      │
│  └────┬────┘  └────┬─────┘ └────┬─────┘                     │
│       │             │           │                             │
│  Team Goals         │      Team Goals                         │
│  ┌────────────┐     │      ┌──────────────────┐              │
│  │Launch new  │     │      │Migrate Drive to  │              │
│  │social media│     │      │group permissions │  ← linked    │
│  │campaign    │     │      └────────┬─────────┘  to org goal │
│  └────┬───────┘     │              │             "Modernize  │
│       │             │              │              IT"         │
│  Team Projects      │         Team Projects                   │
│  ┌────────────┐     │         ┌──────────────┐               │
│  │Instagram   │     │         │Phase 1:      │               │
│  │content     │     │         │Create groups │               │
│  │calendar    │     │         └──────┬───────┘               │
│  └────┬───────┘     │                │                        │
│       │             │           Tasks                         │
│       ▼             │           ┌────────────┐               │
│    Tasks            │           │Create tech@│               │
│                     │           │group       │               │
│                     │           └────────────┘               │
└─────────────────────┴────────────────────────────────────────┘
```

Every task can trace its lineage: Task → Project → Team Goal → Org Goal → Org Vision → Org Mission. This is GTD's "vertical alignment" applied to organizations.

### 1.3 Design Principles

| Principle | Rationale |
|:---|:---|
| **Org horizons belong to the top-level team** | The org's mission/vision/goals are owned by the parent team, not a specific user |
| **Teams have goals and areas, not full horizons** | A sub-team doesn't need its own "purpose" — it has goals that serve the org's purpose |
| **Linkage is optional but visible** | Teams can create goals without linking to org goals (flexibility), but unlinked goals are flagged during reviews (accountability) |
| **Personal horizons remain personal** | This doesn't replace individual GTD horizons — it adds an organizational layer alongside them |
| **Read-down, link-up** | Org admins can see all team goals rolling up. Team leads link their goals up to org goals. Regular members see how their projects connect. |

---

## 2. Data Model

### 2.1 Org Horizons

Org-level horizon notes — the organization's mission, vision, and strategic narrative. Owned by the top-level team rather than a user.

```prisma
/// Organization-level horizon note. One per horizon level per team.
/// Only top-level teams (parentTeamId = null) should have these,
/// but the model doesn't enforce that — the UI/API does.
model OrgHorizonNote {
  id        String       @id @default(cuid())
  teamId    String       @map("team_id")
  team      Team         @relation(fields: [teamId], references: [id], onDelete: Cascade)
  level     HorizonLevel
  title     String
  content   String       @db.Text
  updatedById String?    @map("updated_by_id")
  updatedBy   User?      @relation("OrgHorizonUpdates", fields: [updatedById], references: [id], onDelete: SetNull)
  createdAt DateTime     @default(now()) @map("created_at")
  updatedAt DateTime     @updatedAt @map("updated_at")

  @@unique([teamId, level])
  @@index([teamId])
}
```

**Key difference from personal `HorizonNote`:** `teamId` instead of `userId`. Tracks who last updated it via `updatedById`.

Org horizons use the same `HorizonLevel` enum but with organizational framing:

| Level | Personal (existing) | Organizational (new) |
|:---|:---|:---|
| H5 — Purpose | Life purpose & principles | Organization's mission |
| H4 — Vision | 3-5 year personal vision | Org's 3-5 year strategic vision |
| H3 — Goals | 1-2 year personal goals | Org's strategic goals (→ OrgGoal model) |
| H2 — Areas | Personal areas of focus | Org's functional areas (→ OrgArea model) |
| H1 — Projects | Current personal projects | *(handled by existing team projects)* |
| Runway | Next actions | *(handled by existing tasks)* |

### 2.2 Org Goals

Strategic goals for the organization. These are what team goals link up to.

```prisma
/// Organization-level strategic goal (Horizon 3).
/// Owned by a top-level team. Team goals link to these via parentGoalId.
model OrgGoal {
  id          String     @id @default(cuid())
  teamId      String     @map("team_id")
  team        Team       @relation(fields: [teamId], references: [id], onDelete: Cascade)

  title       String
  description String?    @db.Text
  status      GoalStatus @default(NOT_STARTED)
  targetDate  DateTime?  @map("target_date")
  progress    Int        @default(0) // 0-100, can auto-calculate from child goals
  sortOrder   Int        @default(0) @map("sort_order")

  // Optional link to an org area
  orgAreaId   String?    @map("org_area_id")
  orgArea     OrgArea?   @relation(fields: [orgAreaId], references: [id], onDelete: SetNull)

  // Child team goals that contribute to this org goal
  teamGoals   TeamGoal[]

  createdById String?    @map("created_by_id")
  createdBy   User?      @relation("OrgGoalsCreated", fields: [createdById], references: [id], onDelete: SetNull)
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")

  @@index([teamId])
  @@index([orgAreaId])
}
```

### 2.3 Org Areas

Organizational areas of responsibility (Horizon 2). These map to functional areas like "Marketing", "Finance", "Seminars" — not to be confused with personal areas.

```prisma
/// Organization-level area of responsibility (Horizon 2).
/// Represents a functional domain like "Marketing", "Finance", "Technology".
/// Can optionally link to a child team that owns this area.
model OrgArea {
  id          String   @id @default(cuid())
  teamId      String   @map("team_id")       // The org (top-level team) this belongs to
  team        Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)

  name        String
  description String?  @db.Text
  icon        String?
  isActive    Boolean  @default(true) @map("is_active")
  sortOrder   Int      @default(0) @map("sort_order")

  // Optional: which child team is responsible for this area
  ownerTeamId String?  @map("owner_team_id")
  ownerTeam   Team?    @relation("TeamOwnedAreas", fields: [ownerTeamId], references: [id], onDelete: SetNull)

  orgGoals    OrgGoal[]
  teamGoals   TeamGoal[]  // Team goals can also link to an org area directly

  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([teamId])
  @@index([ownerTeamId])
}
```

**The `ownerTeamId` link** is the bridge: an org area like "Technology" can be linked to the "Tech Team" child team. This means when you view the Tech Team, you see which org area they're responsible for.

### 2.4 Team Goals

Goals owned by a child team that optionally link up to an org goal and/or org area.

```prisma
/// Team-level goal. Owned by a specific team (usually a child team).
/// Can link upward to an OrgGoal and/or OrgArea to show alignment.
model TeamGoal {
  id          String     @id @default(cuid())
  teamId      String     @map("team_id")
  team        Team       @relation(fields: [teamId], references: [id], onDelete: Cascade)

  title       String
  description String?    @db.Text
  status      GoalStatus @default(NOT_STARTED)
  targetDate  DateTime?  @map("target_date")
  progress    Int        @default(0) // 0-100, can auto-calculate from linked projects
  sortOrder   Int        @default(0) @map("sort_order")

  // Upward links — optional but encouraged
  orgGoalId   String?    @map("org_goal_id")
  orgGoal     OrgGoal?   @relation(fields: [orgGoalId], references: [id], onDelete: SetNull)

  orgAreaId   String?    @map("org_area_id")
  orgArea     OrgArea?   @relation(fields: [orgAreaId], references: [id], onDelete: SetNull)

  // Downward link — projects that advance this goal
  projects    Project[]

  createdById String?    @map("created_by_id")
  createdBy   User?      @relation("TeamGoalsCreated", fields: [createdById], references: [id], onDelete: SetNull)
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")

  @@index([teamId])
  @@index([orgGoalId])
  @@index([orgAreaId])
}
```

### 2.5 Project Extension

The existing `Project` model needs an optional link to a `TeamGoal`.

```prisma
model Project {
  // ... existing fields ...

  // NEW: Link to team goal
  teamGoalId  String?  @map("team_goal_id")
  teamGoal    TeamGoal? @relation(fields: [teamGoalId], references: [id], onDelete: SetNull)
}
```

This completes the chain: **OrgGoal → TeamGoal → Project → Task**

### 2.6 Org Horizon Review

Organizational review — the board/leadership reviews the org's horizons periodically.

```prisma
/// Organization-level horizon review.
/// Triggered quarterly or annually by the org admin or board.
model OrgHorizonReview {
  id          String                @id @default(cuid())
  teamId      String                @map("team_id")
  team        Team                  @relation(fields: [teamId], references: [id], onDelete: Cascade)

  type        HorizonReviewType     // QUARTERLY or ANNUAL (not INITIAL_SETUP — that's personal)
  status      ReviewStatus          @default(IN_PROGRESS)
  checklist   Json?                 // { mission: bool, vision: bool, goals: bool, areas: bool, teamAlignment: bool }
  notes       Json?                 // { mission: string, vision: string, goals: string, areas: string, teamAlignment: string }
  completedAt DateTime?             @map("completed_at")

  initiatedById String?             @map("initiated_by_id")
  initiatedBy   User?               @relation("OrgReviewsInitiated", fields: [initiatedById], references: [id], onDelete: SetNull)

  createdAt   DateTime              @default(now()) @map("created_at")
  updatedAt   DateTime              @updatedAt @map("updated_at")

  @@index([teamId])
  @@index([type])
}
```

---

## 3. The Full Alignment Chain

### 3.1 How Everything Connects

```
OrgHorizonNote (H5: Mission)
       │
OrgHorizonNote (H4: Vision)
       │
OrgGoal ──────────── OrgArea
  "Modernize IT"      "Technology"
       │                    │
       │               ownerTeamId
       │                    │
       ▼                    ▼
TeamGoal ─────────── Team: "Tech Team"
  "Migrate Drive         │
   to groups"            │
       │                 │
       ▼                 │
Project ─────────── (owned by Tech Team)
  "Phase 1:              │
   Create groups"        │
       │                 │
       ▼                 │
Task                     │
  "Create tech@          │
   group"                │
```

### 3.2 Relationship Summary

| From | To | Cardinality | Required? |
|:---|:---|:---|:---|
| OrgArea | OrgGoal | One area → many goals | No — goals can exist without an area |
| OrgArea | Team (owner) | One area → one team | No — not every area has a dedicated team |
| OrgGoal | TeamGoal | One org goal → many team goals | No — org goals can exist without team goals yet |
| TeamGoal | OrgGoal | Many team goals → one org goal | **No but flagged** — unlinked goals show during review |
| TeamGoal | OrgArea | Many team goals → one org area | No — optional additional context |
| TeamGoal | Project | One team goal → many projects | No — goals can exist before projects are created |
| Project | TeamGoal | Many projects → one team goal | No — existing projects continue to work without goals |

**Nothing is required.** An org can set up just a mission and vision without goals. A team can have goals without linking them to org goals. A project can exist without a goal. But the alignment review (Section 6) surfaces the gaps.

---

## 4. Permissions

### 4.1 Who Can Do What

| Action | Instance Admin | Org Admin (ADMIN on top-level team) | Team Lead (ADMIN on child team) | Team Member |
|:---|:---|:---|:---|:---|
| **View org horizons** (mission, vision) | Yes | Yes | Yes | Yes |
| **Edit org horizons** | Yes | Yes | No | No |
| **Create/edit org goals** | Yes | Yes | No | No |
| **Create/edit org areas** | Yes | Yes | No | No |
| **View org goals & areas** | Yes | Yes | Yes | Yes |
| **Create/edit team goals** (their team) | Yes | Yes | Yes | No |
| **Link team goal to org goal** | Yes | Yes | Yes | No |
| **Link project to team goal** | Yes | Yes | Yes | Yes (own projects) |
| **View team goals** (their team) | Yes | Yes | Yes | Yes |
| **View team goals** (other teams) | Yes | Yes | No | No |
| **Initiate org review** | Yes | Yes | No | No |
| **View alignment report** | Yes | Yes | Yes (their team) | No |

**Key principle:** Everyone can see the org's mission, vision, goals, and areas — that's the point, transparency of purpose. But only leadership can edit them. Team leads manage their own team's goals and link them upward.

---

## 5. API Endpoints

### 5.1 Org Horizon Notes

| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/teams/[teamId]/horizons` | Get all org horizon notes for a team |
| POST | `/api/teams/[teamId]/horizons` | Upsert a horizon note (by level) |

### 5.2 Org Goals

| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/teams/[teamId]/org-goals` | List org goals (filters: status, area) |
| POST | `/api/teams/[teamId]/org-goals` | Create org goal |
| GET | `/api/teams/[teamId]/org-goals/[id]` | Get org goal with linked team goals and their projects |
| PATCH | `/api/teams/[teamId]/org-goals/[id]` | Update org goal |
| DELETE | `/api/teams/[teamId]/org-goals/[id]` | Delete org goal |

### 5.3 Org Areas

| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/teams/[teamId]/org-areas` | List org areas (filters: active, ownerTeam) |
| POST | `/api/teams/[teamId]/org-areas` | Create org area |
| PATCH | `/api/teams/[teamId]/org-areas/[id]` | Update org area (including ownerTeamId) |
| DELETE | `/api/teams/[teamId]/org-areas/[id]` | Delete org area |

### 5.4 Team Goals

| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/teams/[teamId]/goals` | List team goals (filters: status, orgGoal, orgArea) |
| POST | `/api/teams/[teamId]/goals` | Create team goal (with optional orgGoalId, orgAreaId) |
| GET | `/api/teams/[teamId]/goals/[id]` | Get team goal with linked projects |
| PATCH | `/api/teams/[teamId]/goals/[id]` | Update team goal (including org linkage) |
| DELETE | `/api/teams/[teamId]/goals/[id]` | Delete team goal |
| POST | `/api/teams/[teamId]/goals/[id]/link-project` | Link existing project to this goal |

### 5.5 Alignment Reports

| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/teams/[teamId]/alignment` | Full alignment report: org goals → team goals → projects (with gap analysis) |
| GET | `/api/teams/[teamId]/alignment/unlinked` | Team goals not linked to any org goal + projects not linked to any team goal |

### 5.6 Org Horizon Reviews

| Method | Path | Description |
|:---|:---|:---|
| POST | `/api/teams/[teamId]/horizon-reviews` | Start an org horizon review |
| GET | `/api/teams/[teamId]/horizon-reviews/current` | Get current in-progress org review |
| PATCH | `/api/teams/[teamId]/horizon-reviews/[id]` | Update review checklist/notes |
| POST | `/api/teams/[teamId]/horizon-reviews/[id]/complete` | Complete the review |
| GET | `/api/teams/[teamId]/horizon-reviews` | List past org reviews |

---

## 6. UI Components

### 6.1 Org Horizons Page

**Route:** `/teams/[teamId]/horizons`

Available on top-level teams only. Shows the org's full horizon stack with the same expandable card pattern as personal horizons, but with organizational content.

```
┌──────────────────────────────────────────────────────────────┐
│  🏛️ Insight Boston — Organizational Horizons                  │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ H5 — Mission                                      [▼]  │   │
│  │ "Facilitating transformation and building community"    │   │
│  │ Last updated: March 2026 by Jason C.                    │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ H4 — Vision (3-5 Year)                            [▼]  │   │
│  │ "Become the leading personal development community..."  │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ H3 — Strategic Goals                              [▼]  │   │
│  │                                                         │   │
│  │  ● Grow membership by 30%        [In Progress] 45%     │   │
│  │    ↳ 3 team goals linked                                │   │
│  │                                                         │   │
│  │  ● Modernize IT infrastructure   [In Progress] 20%     │   │
│  │    ↳ 2 team goals linked                                │   │
│  │                                                         │   │
│  │  ● Launch 2 new seminar locations [Not Started]         │   │
│  │    ↳ 0 team goals linked  ⚠️                            │   │
│  │                                                         │   │
│  │  [+ Add Strategic Goal]                                 │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ H2 — Organizational Areas                         [▼]  │   │
│  │                                                         │   │
│  │  📣 Marketing          → Marketing Team                 │   │
│  │  🎓 Seminars           → (no team assigned)             │   │
│  │  💻 Technology         → Tech Team                      │   │
│  │  💰 Finance            → (no team assigned)             │   │
│  │                                                         │   │
│  │  [+ Add Area]                                           │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  [Start Organizational Review]                                 │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Org Goal Detail (Drill-Down)

Clicking an org goal expands or navigates to show all team goals linked to it, and all projects under those team goals.

```
┌──────────────────────────────────────────────────────────────┐
│  Org Goal: Modernize IT Infrastructure                        │
│  Status: In Progress  Progress: 20%  Target: June 2026       │
│  Area: Technology                                              │
│                                                                │
│  TEAM GOALS CONTRIBUTING TO THIS                               │
│                                                                │
│  Tech Team                                                     │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ ● Migrate Drive to group permissions   [In Progress]    │   │
│  │   Projects:                                              │   │
│  │     📁 Phase 1: Create groups          12/28 tasks ██▓░ │   │
│  │     📁 Phase 2: Drive migration        0/15 tasks  ░░░░ │   │
│  │                                                          │   │
│  │ ● Implement onboarding checklists     [Not Started]      │   │
│  │   Projects: (none yet)                                   │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  Marketing Team                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ ● Update website infrastructure        [In Progress]    │   │
│  │   Projects:                                              │   │
│  │     📁 WordPress migration             8/12 tasks ███▓  │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  UNLINKED TEAMS                                                │
│  Registration Team — no goals linked to this org goal          │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 Team Goals Tab

**Location:** Existing team detail page → new "Goals" tab

Each child team gets a Goals tab showing their team goals with upward links.

```
┌──────────────────────────────────────────────────────────────┐
│  Tech Team — Goals                                            │
│                                                                │
│  ● Migrate Drive to group permissions     [In Progress] 40%   │
│    ↗ Org Goal: Modernize IT infrastructure                    │
│    ↗ Org Area: Technology                                      │
│    📁 3 projects linked                                        │
│                                                                │
│  ● Implement onboarding checklists        [Not Started]        │
│    ↗ Org Goal: Modernize IT infrastructure                    │
│    📁 0 projects                                               │
│                                                                │
│  ● Evaluate MFA providers                 [Not Started]        │
│    ⚠️ Not linked to an org goal                                │
│    📁 0 projects                                               │
│                                                                │
│  [+ Add Team Goal]                                             │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

The `↗` arrow visually shows the upward link. The `⚠️` flags unlinked goals — not an error, but a nudge during reviews.

### 6.4 Project → Goal Link

On the existing project detail page, add a "Goal" field:

```
┌──────────────────────────────────────────────────────────────┐
│  Project: Phase 1 — Create Groups                             │
│  Team: Tech Team                                               │
│  Goal: Migrate Drive to group permissions  [Change] [Unlink]  │
│         ↗ Org Goal: Modernize IT infrastructure               │
│  ...                                                           │
└──────────────────────────────────────────────────────────────┘
```

When linking a project to a goal, the picker shows only goals belonging to the project's team. The org goal connection is shown read-only — it comes from the team goal's upward link.

### 6.5 Alignment Report

**Route:** `/teams/[teamId]/alignment`

Board-level view showing how well the organization is aligned.

```
┌──────────────────────────────────────────────────────────────┐
│  🏛️ Insight Boston — Alignment Report                         │
│                                                                │
│  STRATEGIC GOAL COVERAGE                                       │
│                                                                │
│  ● Grow membership by 30%           3 team goals  ✅          │
│    Marketing Team: 2 goals, 4 projects                         │
│    Events Team: 1 goal, 2 projects                             │
│                                                                │
│  ● Modernize IT infrastructure      2 team goals  ✅          │
│    Tech Team: 2 goals, 3 projects                              │
│                                                                │
│  ● Launch 2 new seminar locations    0 team goals  ⚠️         │
│    No team has picked this up yet                              │
│                                                                │
│  UNLINKED WORK                                                 │
│                                                                │
│  ⚠️ 3 team goals not linked to any org goal:                  │
│    Tech Team: "Evaluate MFA providers"                         │
│    Marketing Team: "Update swag designs"                       │
│    Sound Team: "Replace mixer board"                           │
│                                                                │
│  ⚠️ 7 projects not linked to any team goal                    │
│                                                                │
│  AREA COVERAGE                                                 │
│                                                                │
│  📣 Marketing     → Marketing Team    2 goals  4 projects     │
│  💻 Technology    → Tech Team         2 goals  3 projects     │
│  🎓 Seminars      → (no team)         0 goals  ⚠️            │
│  💰 Finance       → (no team)         0 goals  ⚠️            │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### 6.6 Org Horizon Review Wizard

Follows the same pattern as the personal horizon review wizard, but for the org:

**Org Quarterly Review steps:**
1. Review strategic goals — status, progress, any to add/remove/defer?
2. Review vision — still accurate? Any shifts?
3. Review mission — still resonant?
4. **Team alignment check** (new) — are team goals linked? Any org goals with no team coverage?

**Org Annual Review steps:**
1. Review mission
2. Review vision
3. Review strategic goals
4. Review org areas — any to add/remove? Are owner teams correct?
5. Team alignment check
6. Action items — what changes need to cascade to teams?

The team alignment step is unique to org reviews — it surfaces the alignment report data inline so leadership can make decisions about gaps.

---

## 7. Progress Roll-Up

### 7.1 Automatic Progress Calculation

Progress can roll up from the bottom:

```
Task completion %
       ↓
Project progress = completed tasks / total tasks
       ↓
TeamGoal progress = average of linked project progress values
       ↓
OrgGoal progress = average of linked team goal progress values
```

This is **opt-in**, not forced. An admin or team lead can manually set progress on any goal, overriding the calculation. But if they leave progress at the default (0), and there are linked items below, the system offers to auto-calculate.

### 7.2 Status Roll-Up Rules

| Child Statuses | Suggested Parent Status |
|:---|:---|
| All NOT_STARTED | NOT_STARTED |
| Any IN_PROGRESS | IN_PROGRESS |
| All ACHIEVED | ACHIEVED |
| All DEFERRED | DEFERRED |
| Mix of ACHIEVED + DEFERRED | Manual decision needed |

Status is **never auto-changed** — only suggested. A banner appears: "All team goals under this org goal are now achieved. Mark org goal as achieved?" The human decides.

---

## 8. Relationship to Personal Horizons

### 8.1 Two Parallel Systems

Personal horizons and org horizons coexist. They are separate systems with no data dependency.

| Aspect | Personal Horizons | Org Horizons |
|:---|:---|:---|
| Owned by | Individual user | Top-level team |
| Scope | "My life, my goals" | "Our org, our mission" |
| Areas | Personal areas (Health, Finance, Career) | Org areas (Marketing, Seminars, Technology) |
| Goals | Personal goals | Org goals → Team goals |
| Review | Personal weekly/quarterly/annual | Org quarterly/annual |
| Visible to | Only the user | All org members (read), leadership (edit) |

### 8.2 Where They Connect

A volunteer's personal goals might reference org work:

> Personal Goal: "Develop leadership skills" (H3)
> → Personal Project: "Lead the Marketing Team's social media initiative"
> → Team Project: "Instagram content calendar" (linked to Team Goal: "Launch social media campaign")
> → Org Goal: "Grow membership by 30%"

The personal goal and the org goal aren't formally linked in the data model — and they shouldn't be (personal horizons are private). But the projects are shared, creating a natural intersection point.

---

## 9. MCP Tools

```typescript
// Org horizon management
tandem_org_horizons        // Get org's mission, vision, and horizon notes
tandem_org_goals           // List org strategic goals with team goal counts
tandem_org_areas           // List org areas with owner team assignments
tandem_org_alignment       // Full alignment report (goals → team goals → projects)

// Team goal management
tandem_team_goals          // List team goals with org goal linkage
tandem_team_goal_create    // Create team goal with optional org goal link
tandem_team_goal_link      // Link/unlink team goal to org goal

// Reporting
tandem_alignment_gaps      // Unlinked goals and uncovered org goals
tandem_goal_progress       // Progress roll-up for an org goal through its chain
```

---

## 10. Implementation Phases

### Phase 1 — Org Horizons & Goals (Core)

- Prisma schema: OrgHorizonNote, OrgGoal, OrgArea, TeamGoal models
- Migration
- Add `teamGoalId` to Project model
- API endpoints for org horizons, org goals, org areas, team goals
- Org horizons page (`/teams/[teamId]/horizons`)
- Org goal CRUD UI

### Phase 2 — Team Goals & Linking

- Team goals tab on team detail page
- Goal picker on project detail page
- Upward link UI (team goal → org goal selector)
- Org area → owner team assignment
- Alignment report page

### Phase 3 — Reviews & Roll-Up

- Org horizon review wizard (quarterly + annual)
- Team alignment check step
- Progress roll-up calculation (opt-in)
- Status suggestion banners
- "Unlinked work" warnings in team views

### Phase 4 — MCP & Polish

- MCP tools
- Org horizons in sidebar navigation (under the org team)
- Personal horizons page: subtle "Org Horizons" link for context
- Alignment gaps in weekly review nudges for team leads

---

## 11. Example: InsightBoston Setup

**Org Horizons (top-level team: Insight Boston):**

| Level | Content |
|:---|:---|
| H5 — Mission | Facilitating transformation and building community |
| H4 — Vision | Become the leading personal development community in New England |
| H3 — Goals | Grow membership 30%, Modernize IT, Launch Cape Cod seminars, Improve volunteer retention |
| H2 — Areas | Marketing (→ Marketing Team), Seminars (→ Seminar Teams), Technology (→ Tech Team), Finance, Community Events |

**Team Goals (Tech Team):**

| Team Goal | Linked Org Goal | Projects |
|:---|:---|:---|
| Migrate Drive to group permissions | Modernize IT | Phase 1: Create groups, Phase 2: Migration |
| Implement volunteer CMS | Modernize IT | CMS build, Data import |
| Enforce MFA on all accounts | Modernize IT | (not started) |

**Team Goals (Marketing Team):**

| Team Goal | Linked Org Goal | Projects |
|:---|:---|:---|
| Launch Instagram presence | Grow membership 30% | Content calendar, Photography |
| Redesign website | Grow membership 30% | WordPress migration |

Now Jason can sit in a board meeting, pull up the alignment report, and show exactly how each team's work connects to the org's strategic goals — or where the gaps are.

---

*This spec is a living document. It connects to TEAMS.md, VOLUNTEER_ORGS.md, VOLUNTEER_ROSTER.md, and the existing personal horizons implementation.*
