# Tandem Feature Spec: Decision Proposals — Async Decision-Making Without Meetings

**Version:** 1.0  
**Date:** February 22, 2026  
**Author:** Jason Courtemanche  
**Extends:** TEAMS.md, WIKI_COLLABORATION.md  
**Status:** Draft  

---

## 1. Executive Summary

Decision Proposals bring the power of GitHub's pull request workflow to people who've never heard of Git. The core pattern — propose a change, gather input asynchronously, review contributions, approve and merge — is how the best engineering teams in the world avoid meetings. But that workflow is locked behind technical tools that require knowledge of branches, diffs, and merge conflicts.

Tandem translates this pattern into something a camping crew, a tango community, a family planning Thanksgiving, or a nonprofit board can use: **someone frames a decision that needs to be made, the system generates tasks so people know their input is needed, everyone contributes when their schedule allows, and the decision owner resolves it with a full audit trail of who said what and why.**

### The Problem This Solves

Group chats are where decisions go to die. Someone asks "which campsite should we book?" and what follows is a mess: three people respond immediately with half-formed opinions, two people miss the conversation entirely because they were at work, someone changes the subject, and a week later nobody remembers if a decision was actually made or what it was. The information is scattered, there's no record of the reasoning, and the people who weren't online feel steamrolled.

Meetings aren't much better. You pull six people into a 30-minute call to decide something that three of them could have resolved async. Half the meeting is catching people up. Decisions are made in the moment with whatever information happens to be in the room. The outcome lives in someone's meeting notes — if they took any.

### The Solution

A Decision Proposal is a structured, async workflow with a clear lifecycle:

```
PROPOSE → GATHER INPUT → REVIEW → DECIDE → RECORD
```

Each stage generates GTD-compatible tasks and notifications, so the decision process integrates naturally into everyone's existing workflow. The outcome gets recorded in the wiki with full context of how and why the decision was made.

### Why This Matters

| Group Chat | Meeting | Decision Proposal |
|-----------|---------|-------------------|
| Whoever's online decides | Whoever's in the room decides | Everyone contributes on their schedule |
| No record of reasoning | Meeting notes (maybe) | Full audit trail of every contribution |
| Late arrivals miss context | Requires synchronous time | Async by design |
| No clear "this is decided" moment | Verbal agreement (did everyone agree?) | Explicit resolution with rationale |
| Decisions get relitigated | "Wait, I thought we decided..." | Permanent record linked to wiki |
| No accountability for input | Loudest voice wins | Tasks assigned, contributions tracked |

---

## 2. The Git PR → Decision Proposal Translation

For those familiar with the Git workflow, here's the direct mapping:

| Git / GitHub | Tandem Decision Proposal |
|-------------|--------------------------|
| Create a branch | Open a proposal |
| Write code / make changes | Contributors add their input (research, options, preferences) |
| Open a pull request | Proposal moves to "Gathering Input" with description of what's needed |
| PR description & context | Proposal context: background, constraints, options, deadline |
| Request reviewers | System generates "Input Needed" tasks assigned to specific people |
| Code review comments | Contributions: research findings, preferences, concerns, votes |
| CI/CD checks pass | All required inputs received |
| Reviewer approves | Contributors submit their input |
| Merge conflicts | Conflicting preferences surfaced for the decision owner |
| Merge the PR | Decision owner resolves: records the outcome + rationale |
| Merged commit in main | Wiki updated with decision + full audit trail |
| Git blame / history | "Why did we decide this?" → open the proposal, see everything |

**The key insight:** People don't need to understand branching, diffs, or merge strategies. They need to understand "someone is asking for my input on something, here's the context, and here's where I put my response." The GTD system handles the rest — tasks appear in their next-action lists, notifications tell them something needs attention, and the structured lifecycle ensures nothing falls through the cracks.

---

## 3. The Decision Lifecycle

### 3.1 States

```
┌──────────┐     ┌─────────────────┐     ┌──────────────┐     ┌──────────┐
│  DRAFT   │────►│ GATHERING_INPUT │────►│ UNDER_REVIEW │────►│ DECIDED  │
│          │     │                 │     │              │     │          │
└──────────┘     └────────┬────────┘     └──────┬───────┘     └──────────┘
                          │                     │
                          │                     │
                          ▼                     ▼
                   ┌──────────┐          ┌──────────┐
                   │ DEFERRED │          │ CANCELED │
                   │          │          │          │
                   └──────────┘          └──────────┘
```

| State | What's Happening | Who Acts |
|-------|-----------------|----------|
| **DRAFT** | Owner is framing the decision. Not yet visible to contributors. | Owner |
| **GATHERING_INPUT** | Published. Tasks generated for contributors. Input welcome. | Contributors |
| **UNDER_REVIEW** | Input deadline reached or all required inputs received. Owner is reviewing. | Owner |
| **DECIDED** | Decision made. Rationale recorded. Wiki updated. | Owner (final), everyone (notified) |
| **DEFERRED** | Decision postponed. Linked to a Someday/Maybe or future date. | Owner |
| **CANCELED** | No longer relevant. Preserved for history but marked inactive. | Owner |

### 3.2 Lifecycle Flow — The Camping Trip Example

```
Day 1: Jason opens a Decision Proposal
  ┌─────────────────────────────────────────────────────┐
  │ 📋 Decision: Which campsite should we book?          │
  │                                                      │
  │ Context: We need to book by March 15 to guarantee    │
  │ availability. Budget is $30-50/night per site.       │
  │ We need 2 adjacent sites for 8 people.               │
  │                                                      │
  │ Options to evaluate:                                 │
  │   A) Upper Pines, Yosemite                           │
  │   B) Kirk Creek, Big Sur                             │
  │   C) Steep Ravine, Mt. Tam                           │
  │                                                      │
  │ Input needed from:                                   │
  │   🔵 Mike — Research availability & pricing          │
  │   🔵 Sarah — Check drive times from everyone's home  │
  │   🔵 Everyone — Vote on preference                   │
  │                                                      │
  │ Deadline: March 8                                    │
  │ Decision owner: Jason                                │
  │ Wiki link: [[Camping Trip#Campsite Selection]]       │
  └─────────────────────────────────────────────────────┘

  System auto-generates:
  ├─ Task for Mike: "Research campsite availability & pricing"
  │   └─ Context: @computer, Energy: Medium, Wiki: [[Camping Trip#Sites]]
  ├─ Task for Sarah: "Check drive times for campsite options"
  │   └─ Context: @computer, Energy: Low, Wiki: [[Camping Trip#Sites]]
  ├─ Task for all 6 members: "Vote on campsite preference"
  │   └─ Context: @anywhere, Energy: Low
  └─ Notifications sent to all contributors: "Your input is needed"

Day 3: Mike completes his research task
  ├─ Mike's contribution recorded on the proposal
  ├─ Wiki section [[Camping Trip#Sites]] updated with his findings
  ├─ Jason gets notification: "Mike submitted input on campsite decision"
  └─ Proposal shows: 1 of 3 research inputs received

Day 5: Sarah completes her research task
  ├─ Sarah's contribution recorded
  ├─ Jason notified again
  └─ Proposal shows: 2 of 3 research inputs received, 0 of 6 votes

Day 6: Votes trickle in async over 2 days
  ├─ Each vote recorded with optional comment
  ├─ No one needs to be online at the same time
  └─ Proposal dashboard shows real-time vote tally

Day 8 (deadline): Jason reviews all input
  ├─ Proposal auto-transitions to UNDER_REVIEW
  ├─ Jason sees: research from Mike & Sarah + 5 of 6 votes
  ├─ One person hasn't voted → Jason can decide to wait or proceed
  └─ Jason has full context to make the call

Day 8: Jason resolves the decision
  ├─ Records: "Kirk Creek — best balance of drive time and availability"
  ├─ Adds rationale: "3/5 votes for Kirk Creek. Mike confirmed March dates
  │   available. Sarah showed drive time is 15min longer than Steep Ravine
  │   but the sites are much better for groups."
  ├─ Wiki [[Camping Trip#Campsite Selection]] auto-updated with outcome
  ├─ All team members notified: "Decision made: Kirk Creek, Big Sur"
  └─ Audit trail preserved: every contribution, vote, and comment
```

---

## 4. Data Model

### 4.1 Core Models

```prisma
/// A structured async decision-making workflow.
/// Translates the Git PR pattern for non-technical users.
model DecisionProposal {
  id          String   @id @default(cuid())
  title       String   // "Which campsite should we book?"
  description String   @db.Text  // Full context, background, constraints
  
  // Lifecycle
  status      DecisionStatus @default(DRAFT)
  deadline    DateTime?      // When input should be gathered by
  
  // Resolution (populated when status = DECIDED)
  outcome     String?  @db.Text  // The actual decision
  rationale   String?  @db.Text  // Why this was decided
  decidedAt   DateTime?  @map("decided_at")
  
  // Ownership
  ownerId     String   @map("owner_id")
  owner       User     @relation("DecisionOwner", fields: [ownerId], references: [id])
  
  // Scoping — same pattern as wiki articles and projects
  teamId      String?  @map("team_id")
  team        Team?    @relation(fields: [teamId], references: [id], onDelete: SetNull)
  projectId   String?  @map("project_id")
  project     Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)
  
  // Wiki integration — link to article/section where outcome is recorded
  wikiArticleId String?  @map("wiki_article_id")
  wikiArticle   WikiArticle? @relation(fields: [wikiArticleId], references: [id], onDelete: SetNull)
  wikiSection   String?  // Specific heading within the article
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  // Relations
  options       DecisionOption[]
  inputRequests DecisionInputRequest[]
  contributions DecisionContribution[]
  votes         DecisionVote[]
  events        DecisionEvent[]
  
  @@index([ownerId])
  @@index([teamId])
  @@index([projectId])
  @@index([status])
  @@map("decision_proposals")
}

enum DecisionStatus {
  DRAFT
  GATHERING_INPUT
  UNDER_REVIEW
  DECIDED
  DEFERRED
  CANCELED
}
```

### 4.2 Options — What's Being Decided Between

```prisma
/// A specific option within a decision proposal.
/// Not all decisions have discrete options (some are open-ended),
/// but when they do, this enables structured voting.
model DecisionOption {
  id          String   @id @default(cuid())
  proposalId  String   @map("proposal_id")
  proposal    DecisionProposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  
  label       String   // "Kirk Creek, Big Sur"
  description String?  @db.Text  // Details, pros/cons
  sortOrder   Int      @default(0) @map("sort_order")
  isChosen    Boolean  @default(false) @map("is_chosen")  // Set when decision is resolved
  
  votes       DecisionVote[]
  
  @@index([proposalId])
  @@map("decision_options")
}
```

### 4.3 Input Requests — The Task Generator

This is the mechanism that turns a decision into GTD tasks. Each input request generates a task for the assignee, so "your input is needed" shows up in their next-action list alongside everything else.

```prisma
/// A request for a specific person's input on a decision.
/// Each request auto-generates a Task for the assignee.
model DecisionInputRequest {
  id          String   @id @default(cuid())
  proposalId  String   @map("proposal_id")
  proposal    DecisionProposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  
  assigneeId  String   @map("assignee_id")
  assignee    User     @relation(fields: [assigneeId], references: [id])
  
  // What kind of input is needed
  type        InputRequestType @default(RESEARCH)
  prompt      String?  @db.Text  // "Research campsite availability & pricing"
  isRequired  Boolean  @default(true) @map("is_required")  // Must respond before resolution
  
  // Status tracking
  status      InputRequestStatus @default(PENDING)
  respondedAt DateTime?  @map("responded_at")
  
  // Auto-generated task link
  taskId      String?  @unique @map("task_id")
  task        Task?    @relation(fields: [taskId], references: [id], onDelete: SetNull)
  
  createdAt   DateTime @default(now()) @map("created_at")
  
  @@index([proposalId])
  @@index([assigneeId])
  @@index([status])
  @@map("decision_input_requests")
}

enum InputRequestType {
  RESEARCH    // "Go find out about X and report back"
  VOTE        // "Choose your preference from the options"
  REVIEW      // "Read what others contributed and give your assessment"
  APPROVAL    // "Sign off on this decision"
  OPEN_INPUT  // "Share your thoughts, no specific ask"
}

enum InputRequestStatus {
  PENDING     // Task generated, waiting for response
  SUBMITTED   // Person has contributed their input
  WAIVED      // Decision owner proceeded without this input
  EXPIRED     // Deadline passed without response
}
```

### 4.4 Contributions — The Async Input

```prisma
/// A person's substantive contribution to a decision.
/// This is the equivalent of a PR comment — research findings,
/// analysis, concerns, or general input.
model DecisionContribution {
  id          String   @id @default(cuid())
  proposalId  String   @map("proposal_id")
  proposal    DecisionProposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  
  authorId    String   @map("author_id")
  author      User     @relation(fields: [authorId], references: [id])
  
  content     String   @db.Text  // The actual contribution (markdown)
  
  // Optional link to the input request this fulfills
  inputRequestId String?  @map("input_request_id")
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  @@index([proposalId])
  @@index([authorId])
  @@map("decision_contributions")
}
```

### 4.5 Votes — Structured Preference

```prisma
/// A vote for a specific option within a decision.
/// Separated from contributions because votes are structured
/// (tied to a specific option) while contributions are freeform.
model DecisionVote {
  id          String   @id @default(cuid())
  proposalId  String   @map("proposal_id")
  proposal    DecisionProposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  
  voterId     String   @map("voter_id")
  voter       User     @relation(fields: [voterId], references: [id])
  
  optionId    String   @map("option_id")
  option      DecisionOption @relation(fields: [optionId], references: [id], onDelete: Cascade)
  
  weight      Int      @default(1)  // For ranked-choice or weighted voting
  comment     String?  // Optional: "Kirk Creek because the sites are bigger"
  
  createdAt   DateTime @default(now()) @map("created_at")
  
  @@unique([proposalId, voterId, optionId])  // One vote per person per option
  @@index([proposalId])
  @@index([optionId])
  @@map("decision_votes")
}
```

### 4.6 Decision Events — The Audit Trail

```prisma
/// Immutable audit log of everything that happened in a decision.
/// This is the "git log" equivalent — who did what, when.
model DecisionEvent {
  id          String   @id @default(cuid())
  proposalId  String   @map("proposal_id")
  proposal    DecisionProposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  
  actorId     String   @map("actor_id")
  actor       User     @relation(fields: [actorId], references: [id])
  
  type        DecisionEventType
  details     Json?    // Event-specific data
  message     String?  // Human-readable summary
  
  createdAt   DateTime @default(now()) @map("created_at")
  
  @@index([proposalId])
  @@index([actorId])
  @@map("decision_events")
}

enum DecisionEventType {
  CREATED           // Proposal opened
  PUBLISHED         // Moved from DRAFT to GATHERING_INPUT
  INPUT_REQUESTED   // New input request added
  CONTRIBUTION_ADDED // Someone submitted research/input
  VOTE_CAST         // Someone voted
  VOTE_CHANGED      // Someone changed their vote
  DEADLINE_SET      // Deadline added or changed
  DEADLINE_REACHED  // Deadline passed (system event)
  MOVED_TO_REVIEW   // Transitioned to UNDER_REVIEW
  DECIDED           // Decision resolved with outcome
  DEFERRED          // Decision postponed
  CANCELED          // Decision abandoned
  COMMENT_ADDED     // General discussion comment
  REMINDER_SENT     // System sent a nudge notification
}
```

---

## 5. Notification System Integration

This is where Decision Proposals really come alive. Without notifications, async workflows stall. The notification system ensures people know when their input is needed, when decisions are made, and when deadlines are approaching — all without requiring anyone to check a dashboard.

### 5.1 Notification Triggers

| Event | Who Gets Notified | Channel | Priority |
|-------|------------------|---------|----------|
| Proposal published | All input requestees | Push + In-app | High |
| Input requested (new) | The specific assignee | Push + In-app | High |
| Contribution submitted | Decision owner | In-app | Normal |
| Vote cast | Decision owner | In-app (batched) | Low |
| All required inputs received | Decision owner | Push + In-app | High |
| Deadline approaching (24h) | People with pending inputs | Push + In-app | High |
| Deadline reached | Decision owner + unresponsive | Push + In-app | High |
| Decision resolved | All team members | Push + In-app | High |
| Decision deferred | All contributors | In-app | Normal |
| Decision canceled | All contributors | In-app | Normal |

### 5.2 Notification Content Examples

**Push notification (contributor):**
```
🔔 Camping Crew
Your input is needed: "Which campsite should we book?"
Jason is asking you to research campsite availability & pricing.
Due: March 8
```

**Push notification (decision owner):**
```
🔔 Camping Crew
Mike submitted input on "Which campsite should we book?"
3 of 5 required inputs received.
```

**Push notification (deadline approaching):**
```
⏰ Camping Crew
Decision deadline tomorrow: "Which campsite should we book?"
You haven't submitted your vote yet.
[Vote Now]
```

**Push notification (decision made):**
```
✅ Camping Crew
Decision made: "Which campsite should we book?"
Outcome: Kirk Creek, Big Sur
Tap to see the full rationale.
```

### 5.3 In-App Notification Badge

The notification drawer (spec'd in TANDEM_SPEC.md §13.7) gains a new category:

```
Notifications
├── 📋 Decisions (2 new)
│   ├── 🔵 "Which campsite?" — your vote is needed (due Mar 8)
│   └── ✅ "What food should we bring?" — decided: potluck style
├── ✅ Tasks (1 promoted)
│   └── "Book campsite" is now available
├── ⏰ Due Soon (1)
│   └── "Finalize packing list" due tomorrow
└── 👥 Collaboration (1)
    └── Mike completed "Research campsites"
```

### 5.4 GTD Integration — Decisions as Next Actions

The magic is that notification alone isn't enough. People ignore notifications. What they don't ignore is a task that shows up in their "What Should I Do Now?" view alongside everything else they need to do.

When a Decision Proposal requests someone's input, it generates a real Task:

```
Title: "Vote on campsite preference"
Project: Summer Camping Trip
Context: @anywhere
Energy: Low
Time estimate: 5 min
Notes: "Jason is asking the group to vote on which campsite to book.
        Options: Upper Pines (Yosemite), Kirk Creek (Big Sur), Steep Ravine (Mt. Tam).
        Open the decision to see research from Mike and Sarah before voting."
Wiki link: [[Camping Trip#Campsite Selection]]
Due date: March 8 (matches proposal deadline)
```

This task appears in context views just like any other task. When the person completes it (by submitting their input on the proposal), the task auto-completes and the cascade engine does its thing. If all input tasks complete, the decision owner gets notified that everything is in.

### 5.5 Waiting For Integration

When a decision owner publishes a proposal, the system auto-creates WaitingFor entries for each required input:

```
Waiting For
├── Mike — "Research campsite availability" (Campsite Decision)     2 days ago
├── Sarah — "Check drive times" (Campsite Decision)                 2 days ago
├── Everyone — "Vote on campsite" (Campsite Decision)               2 days ago
└── Guest Teacher — "Send bio and photo" (Workshop)                 5 days ago
```

These resolve automatically when contributions are submitted, just like delegated tasks.

---

## 6. Decision Types & Templates

Not all decisions need the full proposal workflow. Tandem supports different weights:

### 6.1 Quick Poll

For simple preference gathering. No research phase, just a question with options.

```
┌─────────────────────────────────────────┐
│ 🗳️ Quick Poll: Friday dinner spot?      │
│                                         │
│  🍕 Tony's Pizza         ████░░ 3 votes │
│  🍣 Sushi Palace         ██░░░░ 2 votes │
│  🌮 Taco Truck           █░░░░░ 1 vote  │
│                                         │
│  5 of 6 people voted  ·  Closes tonight │
└─────────────────────────────────────────┘
```

Quick Polls auto-resolve when all votes are in or the deadline passes. The winning option is the decision. No owner review needed unless it's a tie.

### 6.2 Standard Proposal

The full workflow described throughout this spec. Research + input + review + decide.

### 6.3 Approval Request

A simplified flow where one person proposes something and needs sign-off from one or more approvers. Binary outcome: approved or not.

```
┌─────────────────────────────────────────────────┐
│ ✋ Approval: Book Kirk Creek for March 20-22?    │
│                                                  │
│ I've researched options (see wiki) and Kirk      │
│ Creek has the best availability for our dates.   │
│ Cost: $35/night x 2 sites = $70/night total.     │
│                                                  │
│ Approvals needed: 4 of 6 members                 │
│                                                  │
│  ✅ Jason — approved                              │
│  ✅ Mike — approved ("looks great")               │
│  ✅ Sarah — approved                              │
│  🔵 Dave — pending                                │
│  🔵 Lisa — pending                                │
│  🔵 Tom — pending                                 │
│                                                  │
│  3 of 4 required approvals received               │
└─────────────────────────────────────────────────┘
```

### 6.4 Decision Templates

Pre-built templates for common decision types:

| Template | Input Requests | Options Style |
|----------|---------------|---------------|
| **Where to go** | Research locations, check schedules, vote | Multi-option vote |
| **Budget approval** | Review budget, provide concerns, approve | Approval (threshold) |
| **Schedule/date** | Check availability, vote on date | Date picker poll |
| **Design/creative** | Create options, review, vote | Multi-option with attachments |
| **Go/no-go** | Research risks, provide input, approve | Binary (yes/no) |
| **Priority ranking** | Review options, rank preferences | Ranked choice |
| **Custom** | Define your own | Flexible |

---

## 7. UI Design

### 7.1 Decision Hub — Team View

A new section in the team dashboard showing active decisions:

```
┌─ 📋 Decisions ──────────────────────────────────────────┐
│                                                          │
│  Active (2)                                              │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🟡 Which campsite should we book?                   │  │
│  │    Gathering Input · 3/5 inputs · Due Mar 8         │  │
│  │    Your action: Vote on preference                  │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🔵 What food should everyone bring?                 │  │
│  │    Draft · Jason is writing it up                   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Recently Decided (1)                                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ✅ Shared gear responsibilities                     │  │
│  │    Decided Feb 20 · See outcome in wiki             │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  [+ New Decision]                                        │
└──────────────────────────────────────────────────────────┘
```

### 7.2 Proposal Detail View

```
┌─────────────────────────────────────────────────────────┐
│ ← Back to Decisions                                      │
│                                                          │
│ Which campsite should we book?                           │
│ Status: 🟡 Gathering Input        Due: March 8, 2026    │
│ Owner: Jason           Wiki: [[Camping Trip#Campsites]]  │
│                                                          │
├─ Context ────────────────────────────────────────────────┤
│                                                          │
│ We need to book by March 15 to guarantee availability.   │
│ Budget is $30-50/night per site. We need 2 adjacent      │
│ sites for 8 people.                                      │
│                                                          │
├─ Options ────────────────────────────────────────────────┤
│                                                          │
│  A) Upper Pines, Yosemite        ██░░░░ 2 votes         │
│  B) Kirk Creek, Big Sur          ████░░ 3 votes         │
│  C) Steep Ravine, Mt. Tam        █░░░░░ 1 vote          │
│                                                          │
│  [Cast Your Vote]                                        │
│                                                          │
├─ Input Progress ─────────────────────────────────────────┤
│                                                          │
│  Research:                                               │
│  ✅ Mike — Availability & pricing (submitted Feb 22)     │
│  ✅ Sarah — Drive times (submitted Feb 24)               │
│                                                          │
│  Votes:                                                  │
│  ✅ Jason ✅ Mike ✅ Sarah ✅ Dave ✅ Lisa 🔵 Tom        │
│  5 of 6 voted                                            │
│                                                          │
├─ Contributions ──────────────────────────────────────────┤
│                                                          │
│  Mike · Feb 22                                           │
│  "I checked recreation.gov — Upper Pines is sold out     │
│  for March 20-22. Kirk Creek and Steep Ravine both       │
│  have sites available. Kirk Creek is $35/night,          │
│  Steep Ravine is $25/night but only tent cabins."        │
│                                                          │
│  Sarah · Feb 24                                          │
│  "Drive times from SF: Kirk Creek 2h45m, Steep Ravine   │
│  45min, Yosemite 3h30m. From Jason's place add 20min    │
│  to each."                                               │
│                                                          │
│  [Add Your Input]                                        │
│                                                          │
├─ Activity ───────────────────────────────────────────────┤
│                                                          │
│  📝 Lisa voted for Kirk Creek — 1 hour ago               │
│  📝 Dave voted for Upper Pines — 3 hours ago             │
│  📝 Sarah submitted drive time research — Feb 24         │
│  📝 Mike submitted availability research — Feb 22        │
│  📋 Jason published this decision — Feb 21               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 7.3 Resolution View

When the owner resolves a decision, this view replaces the active proposal:

```
┌─────────────────────────────────────────────────────────┐
│ ✅ DECIDED · February 26, 2026                           │
│                                                          │
│ Which campsite should we book?                           │
│                                                          │
├─ Outcome ────────────────────────────────────────────────┤
│                                                          │
│ Kirk Creek, Big Sur — March 20-22, 2026                  │
│ 2 adjacent sites reserved                                │
│                                                          │
├─ Rationale ──────────────────────────────────────────────┤
│                                                          │
│ Kirk Creek won the vote 3-2-1. Upper Pines was the       │
│ runner-up but Mike's research showed it's sold out for    │
│ our dates. Sarah's drive time analysis showed Kirk Creek  │
│ is only 15min longer than Steep Ravine, and the sites    │
│ are much better for group camping. Budget fits at         │
│ $35/night × 2 sites.                                     │
│                                                          │
├─ Recorded in Wiki ───────────────────────────────────────┤
│                                                          │
│ → [[Camping Trip Planning#Campsite Selection]]           │
│                                                          │
├─ Full Audit Trail ───────────────────────────────────────┤
│                                                          │
│  [Expand to see all 12 events]                           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Wiki Integration

### 8.1 Auto-Update on Resolution

When a decision is resolved, the linked wiki section gets an auto-appended decision record:

```markdown
## Campsite Selection

**Decision: Kirk Creek, Big Sur** ✅  
*Decided February 26, 2026 by Jason · [View full proposal →](/decisions/clu1234)*

Kirk Creek won the group vote 3-2-1 over Upper Pines and Steep Ravine.
Key factors: availability confirmed, budget fits at $35/night × 2 sites,
drive time 2h45m from SF.

[Research and contributions from Mike and Sarah available in the decision record.]
```

### 8.2 Decision Archive in Wiki

Teams can optionally maintain a "Decisions Log" wiki article that auto-accumulates resolved decisions:

```markdown
# Camping Crew — Decisions Log

## 2026

### Campsite Selection — Decided Feb 26
**Outcome:** Kirk Creek, Big Sur, March 20-22
**Owner:** Jason · **Votes:** 6 · [Full proposal →](/decisions/clu1234)

### Shared Gear — Decided Feb 20
**Outcome:** Jason brings tent & stove, Mike brings cooler & chairs
**Owner:** Mike · **Approvals:** 5/6 · [Full proposal →](/decisions/clu5678)
```

This becomes the team's institutional memory — the answer to "why did we decide that?" is always one click away.

---

## 9. API Surface

### 9.1 New Endpoints

```
Proposals:
  POST   /api/decisions                       Create proposal
  GET    /api/decisions                       List accessible proposals
  GET    /api/decisions/:id                   Get proposal with all relations
  PATCH  /api/decisions/:id                   Update proposal (owner only)
  POST   /api/decisions/:id/publish           Move DRAFT → GATHERING_INPUT
  POST   /api/decisions/:id/review            Move to UNDER_REVIEW
  POST   /api/decisions/:id/resolve           Record decision + outcome
  POST   /api/decisions/:id/defer             Defer with optional date
  POST   /api/decisions/:id/cancel            Cancel proposal

Options:
  POST   /api/decisions/:id/options           Add option
  PATCH  /api/decisions/:id/options/:optId    Update option
  DELETE /api/decisions/:id/options/:optId    Remove option

Input Requests:
  POST   /api/decisions/:id/inputs            Request input from user(s)
  PATCH  /api/decisions/:id/inputs/:reqId     Update request (waive, etc.)

Contributions:
  POST   /api/decisions/:id/contributions     Submit input/research
  PATCH  /api/decisions/:id/contributions/:cId  Edit contribution
  
Votes:
  POST   /api/decisions/:id/votes             Cast vote
  PATCH  /api/decisions/:id/votes/:voteId     Change vote

Team/Project Scoped:
  GET    /api/teams/:id/decisions             Team decisions
  GET    /api/projects/:id/decisions           Project decisions

Activity:
  GET    /api/decisions/:id/events            Full audit trail
```

### 9.2 MCP Tools

```typescript
// New MCP tools for Claude integration
decision_create(title, description, teamId?, options?)
decision_list(teamId?, status?)
decision_contribute(proposalId, content)
decision_vote(proposalId, optionId, comment?)
decision_resolve(proposalId, outcome, rationale)
decision_status(proposalId)  // "3 of 5 inputs received, 4 of 6 votes cast"
```

This enables conversational decision support: "Claude, what's the status of our campsite decision?" → Claude checks via MCP and says "You have 5 of 6 votes in. Tom hasn't voted yet. Kirk Creek is leading 3-2-1. Deadline is tomorrow."

---

## 10. Implementation Roadmap

### Phase 1: Core Decision Engine (Weeks 1-2)

- [ ] Create DecisionProposal, DecisionOption, DecisionInputRequest models
- [ ] Create DecisionContribution, DecisionVote, DecisionEvent models
- [ ] Run Prisma migration
- [ ] Build CRUD API for proposals, options, and input requests
- [ ] Implement lifecycle state machine (DRAFT → GATHERING → REVIEW → DECIDED)
- [ ] Build task auto-generation when input requests are created
- [ ] Build WaitingFor auto-generation for decision owner
- [ ] Implement auto-completion of input tasks when contributions are submitted

**Deliverable:** Decisions can be created, published, contributed to, and resolved via API.

### Phase 2: UI — Proposal Views (Weeks 2-3)

- [ ] Build Decision Hub component (list view with status filters)
- [ ] Build Proposal Detail View (context, options, progress, contributions, activity)
- [ ] Build proposal creation form with option builder
- [ ] Build contribution submission form (markdown editor with toolbar from wiki spec)
- [ ] Build voting UI (option cards with vote counts, one-click voting)
- [ ] Build resolution form (outcome + rationale fields)
- [ ] Add Decisions section to team dashboard
- [ ] Add decision link to project sidebar

**Deliverable:** Full UI for creating, participating in, and resolving decisions.

### Phase 3: Notifications & GTD Integration (Weeks 3-4)

- [ ] Implement notification triggers for all decision events (§5.1)
- [ ] Build push notification templates for decisions
- [ ] Add "Decisions" category to notification drawer
- [ ] Implement deadline reminder logic (24h before, on deadline)
- [ ] Auto-transition to UNDER_REVIEW when deadline passes
- [ ] Wire up task completion → contribution submission flow
- [ ] Wire up WaitingFor resolution when inputs are received
- [ ] Add decision tasks to "What Should I Do Now?" context views

**Deliverable:** Decisions generate notifications and tasks that integrate with the full GTD workflow.

### Phase 4: Wiki Integration & Templates (Weeks 4-5)

- [ ] Build wiki auto-update on decision resolution
- [ ] Build decision archive / decisions log wiki article
- [ ] Create Quick Poll, Standard Proposal, and Approval Request templates
- [ ] Build template selector in proposal creation
- [ ] Add "Linked Decisions" section to wiki article view
- [ ] Implement MCP tools for decision support
- [ ] Add decision events to team activity feed

**Deliverable:** Decisions are fully integrated with wiki and available as templates. MCP enables conversational decision support.

---

## 11. Future Considerations

### 11.1 Ranked-Choice Voting

For decisions with many options, ranked-choice eliminates the "split vote" problem. Each person ranks their preferences 1-N, and the system runs instant-runoff to find the consensus winner.

### 11.2 Consent-Based Decision Making

Inspired by sociocracy: instead of majority vote, a proposal passes unless someone has a "reasoned objection." This maps well to the Approval Request type — the question isn't "do you like this?" but "can you live with this?"

### 11.3 Decision Dependencies

Just like task dependencies: "We can't decide the meal plan until we've decided the campsite" → the meal plan proposal is blocked until the campsite proposal resolves. The cascade engine handles this naturally.

### 11.4 AI-Assisted Decision Framing

Claude could help frame decisions: "I see you have a lot of discussion in the project about campsites but no formal decision. Want me to draft a Decision Proposal based on the options people have mentioned?" This uses the MCP tools + wiki content to bootstrap proposals from organic conversations.

### 11.5 Recurring Decisions

Some decisions repeat: "Where should we have our monthly dinner?" A recurring decision template generates a new proposal on a schedule, pre-populated with the same team members and input structure.

### 11.6 Decision Analytics

Over time, teams can see patterns: average time-to-decision, participation rates per member, how often deadlines are met. This helps teams improve their decision-making process itself.
