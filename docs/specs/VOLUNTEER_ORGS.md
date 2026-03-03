# Tandem — Volunteer & Nonprofit Organizations Use Case Spec

**Version:** 1.0  
**Date:** February 26, 2026  
**Author:** Jason Courtemanche  
**Depends On:** TEAMS.md, DECISION_PROPOSALS.md, TEAM_SYNC.md, TANDEM_SPEC.md  
**Status:** Draft  

---

## 1. Executive Summary

Volunteer and nonprofit organizations represent one of Tandem's most natural market segments — and one of the most underserved by existing tools. These organizations share a universal set of problems: limited budgets that can't absorb $5-10/user/month SaaS pricing, volunteers who can only contribute a few hours per week on unpredictable schedules, decisions that get buried in group chats and email threads, and a "delegation tax" so high that the most capable volunteers become bottlenecks who burn out.

Tandem solves these problems not by building nonprofit-specific features, but by applying GTD methodology to team collaboration in a self-hosted, zero-per-seat-cost model. The hierarchical teams, async decision proposals, cascade engine, and guided workflows already specced for Tandem map directly to how volunteer organizations actually operate.

This document defines the use case, maps existing Tandem features to volunteer org pain points, identifies gaps that need addressing, and establishes a go-to-market approach for this segment.

---

## 2. The Problem Space

### 2.1 The Cost Problem

A typical volunteer organization — Little League, community garden, neighborhood association, local Habitat for Humanity chapter, volunteer fire company, church committee — has 10-50 active members. At SaaS per-seat pricing:

| Tool | Per User/Month | 40 Volunteers/Month | Annual Cost |
|------|---------------|---------------------|-------------|
| Asana (Premium) | $10.99 | $439.60 | $5,275 |
| Monday.com (Standard) | $12 | $480 | $5,760 |
| ClickUp (Business) | $7 | $280 | $3,360 |
| Basecamp (Pro) | $349 flat | $349 | $4,188 |
| **Tandem (self-hosted)** | **$0** | **$0** | **$0** |
| **Tandem (managed)** | **flat fee** | **flat fee** | **TBD** |

For organizations funded by bake sales, membership dues, and small grants, even $200/month is a real budget decision that requires board approval — which is ironic, because they need the tool to make that approval process work in the first place.

**Tandem's model:** One technically capable volunteer sets up a server (or the org pays a single flat fee for managed hosting), and all 40 members get full access. The cost structure is per-server, not per-seat.

### 2.2 The Delegation Tax

This is the core behavioral problem. In a volunteer org, the most reliable people end up doing everything themselves because the cost of delegating exceeds the cost of just doing it:

```
Traditional delegation workflow:
  1. Figure out what needs doing              (thinking time)
  2. Figure out who should do it              (organizational knowledge)
  3. Write up the request clearly             (communication overhead)
  4. Send it via email/text/Slack/WhatsApp    (tool fragmentation)
  5. Hope they see it                         (no delivery guarantee)
  6. Remember to follow up in a few days      (mental tracking burden)
  7. Chase them down when they don't respond  (social awkwardness)
  8. Do it yourself when they still don't     (burnout)
```

The result: 3-5 people carry the entire organization while 30+ volunteers feel disconnected and underutilized. Burnout is the #1 reason volunteer organizations lose their best people.

**Tandem's answer:** Steps 3-7 become automatic. You process your inbox, hit "delegate," the system assigns the task, notifies the person, puts it in their "What Should I Do Now?" view, and surfaces it in your "Waiting For" list during weekly review. The cascade engine handles follow-through. The delegation tax drops from "more work than doing it myself" to "one tap during inbox processing."

### 2.3 The Async Problem

Volunteers have day jobs, families, and lives. They can't attend Tuesday night meetings. They can't monitor a Slack channel throughout the day. They contribute in bursts — 20 minutes before bed, an hour on Saturday morning, 15 minutes during lunch.

Current tools assume synchronous availability: real-time chat, scheduled meetings, "who's online?" presence indicators. This systematically excludes the majority of volunteers who are willing to help but can't participate on someone else's schedule.

**Tandem's answer:** Everything is async-first. The decision proposal workflow (specced in DECISION_PROPOSALS.md) replaces meetings with structured propose → contribute → review → resolve cycles. Each step generates a GTD task that appears in the volunteer's personal system, filtered by their context and energy. They contribute when they can, and the system tracks progress without requiring anyone to be online simultaneously.

### 2.4 The Accountability Gap

Without a structured system, volunteer organizations suffer from invisible work, unclear ownership, and no audit trail:

- **"Who's handling that?"** — Nobody knows, so either nobody does it or three people do it redundantly.
- **"What happened to the budget approval?"** — It's buried in a WhatsApp thread from three weeks ago.
- **"Why did we decide to go with Vendor X?"** — Nobody remembers. The person who made the call has since rotated off the board.

Grant funders, board governance requirements, and regulatory compliance increasingly demand traceability. Nonprofits need to show how decisions were made and resources were allocated.

**Tandem's answer:** Event sourcing captures every task creation, assignment, completion, and decision with timestamps and actor attribution. Decision proposals create a permanent, searchable record of what was proposed, who contributed input, and what was decided with rationale. The wiki stores the outcomes. This is built-in audit trail, not a separate compliance layer.

---

## 3. Feature Mapping — What's Already Specced

Every feature below already exists in Tandem's spec documents. This section maps them to volunteer org use cases.

### 3.1 Hierarchical Teams → Org Structure

**Spec:** TEAMS.md §2, §4.2

A typical volunteer org maps directly to the two-level team hierarchy:

```
🏛️ Friends of the Library (top-level org)
  → Board President: ADMIN, label: "President"
  → Vice President: ADMIN, label: "VP"
  
  📚 Programs Committee (child team)
    → Programs Chair: ADMIN, label: "Chair"
    → Volunteer 1: MEMBER, label: "Children's Events"
    → Volunteer 2: MEMBER, label: "Adult Programs"
    
  💰 Fundraising Committee (child team)
    → Fundraising Chair: ADMIN, label: "Chair"
    → Volunteer 3: MEMBER, label: "Annual Gala"
    → Volunteer 4: MEMBER, label: "Grant Writing"
    
  📣 Outreach Committee (child team)
    → Outreach Lead: ADMIN, label: "Lead"
    → Volunteer 5: MEMBER, label: "Social Media"
    → Volunteer 6: MEMBER, label: "Newsletter"
    
  💻 Tech Committee (child team)
    → Tech Lead: ADMIN, label: "Lead"
    → Volunteer 7: MEMBER, label: "Website"
```

**Visibility inheritance** means the board president sees all committee projects while each volunteer only sees their own committee's work — exactly how real governance works.

**Invite links** (TEAMS.md §6.3) let committee chairs onboard new volunteers without needing admin access to the whole system.

### 3.2 Decision Proposals → Cross-Team Approvals

**Spec:** DECISION_PROPOSALS.md

The scenario from our conversation maps directly:

```
Marketing committee needs new email software ($50/month)

Step 1: Marketing chair creates Decision Proposal
  → Question: "Should we switch to Mailchimp for newsletters?"
  → Context: Current free tier doesn't support our 2,000 subscriber list
  → Options: A) Mailchimp $50/mo, B) SendGrid $30/mo, C) Stay with current tool
  → Contributors: Tech lead (review technical fit), Treasurer (review budget)
  → Approver: Board president
  → Deadline: March 15

Step 2: System auto-generates tasks
  → Tech lead gets: "Review email platform options for marketing" (@computer, Medium energy)
  → Treasurer gets: "Review budget impact of email platform change" (@computer, Low energy)
  → Both tasks appear in their personal "What Should I Do Now?" views

Step 3: Async contributions
  → Tech lead reviews over lunch break, submits: "SendGrid has better API, 
     Mailchimp has better templates. Either works technically."
  → Treasurer reviews Saturday morning, submits: "$50/mo fits within 
     the communications budget line. $30/mo preferred."

Step 4: Board president reviews and resolves
  → Sees all input in one place
  → Decides: "Go with SendGrid — saves $240/year and tech team prefers the API"
  → Resolution recorded with rationale
  → Wiki article auto-updated with the decision

Step 5: Cascade
  → Marketing chair gets new task: "Set up SendGrid account" (auto-promoted)
  → Audit trail shows: who proposed it, who reviewed it, who approved it, why
```

No meeting was held. No email thread was created. Every step is traceable.

### 3.3 Cascade Engine → Volunteer Workflow Continuity

**Spec:** TANDEM_SPEC.md §3

For volunteer orgs, the cascade engine solves the "ball drop" problem. Volunteers finish a task and leave — they don't check what else needs doing. The cascade engine does that for them:

```
Sequential project: "Annual Fundraising Gala"
  ✅ Book venue (Sarah) — COMPLETED
  → Cascade promotes: "Send save-the-date to donor list" (assigned: Mike)
  → Mike gets notification, task appears in his "What Should I Do Now?"
  
  ✅ Send save-the-date (Mike) — COMPLETED
  → Cascade promotes: "Design event program" (assigned: Kim)
  → Kim gets notification
  
  ...and so on through 15 sequential steps
```

Nobody needs to manage this chain manually. The system knows what's next and who's responsible.

### 3.4 Weekly Review → Committee Check-ins

**Spec:** TANDEM_SPEC.md §5, TEAMS.md §7.2

The committee chair's weekly review automatically surfaces team awareness:

```
Get Current — Fundraising Committee Projects

💰 Annual Gala
  🔵 12 of 28 tasks complete (43%)
  ⏳ Sarah: "Confirm catering menu" (assigned 8 days ago)
  ⏳ Mike: "Get donor list from database" (assigned 12 days ago — STALE)
  → Do you want to follow up with anyone?

💰 Grant Applications  
  🟡 Q2 Community Foundation — no next action defined!
  → Add a next action or mark as on hold?
```

This replaces the "status update meeting" that nobody wants to attend. The chair can see at a glance where things stand and decide whether a follow-up is needed — all in 5 minutes during their weekly review.

### 3.5 "What Should I Do Now?" → Volunteer Time Optimization

**Spec:** TANDEM_SPEC.md §4

A volunteer opens Tandem with 30 minutes before they need to pick up their kids. Instead of trying to remember what they committed to across three committees, they see:

```
What Should I Do Now?
  Context: @computer  Energy: Low  Time: < 30min

  📋 Update social media calendar       (Outreach)         15min  🟢
  📋 Review grant draft for typos        (Fundraising)      20min  🟢
  📋 Reply to venue email                (Gala Planning)    10min  🟡
```

Every task is actionable, filtered to their current reality, and drawn from across all their team commitments. They do one or two things, feel productive, and move on with their day. This is how you keep volunteers engaged without overwhelming them.

### 3.6 Wiki → Institutional Knowledge

**Spec:** WIKI_COLLABORATION.md

Volunteer organizations hemorrhage institutional knowledge every time someone rotates off a committee. The volunteer who ran the gala for three years retires and takes all the vendor contacts, venue preferences, and lessons learned with them.

Tandem's wiki becomes the organizational memory:

- **[[Annual Gala]]** — Vendor list, timeline template, budget history, post-mortem notes
- **[[Board Governance]]** — Bylaws, decision log, officer responsibilities
- **[[New Volunteer Onboarding]]** — How to get set up, committee descriptions, key contacts
- **[[Grant Writing]]** — Funder database, application templates, past submissions

Decision proposals automatically link to wiki articles, so the decision log builds itself over time.

---

## 4. Gaps to Address

### 4.1 Volunteer Onboarding Flow

**Status:** Not yet specced  
**Priority:** High  

When a new volunteer joins, they need a zero-friction path from "I clicked an invite link" to "I can see my tasks and start contributing." This is more critical for volunteer orgs than any other segment because these users may have zero familiarity with project management tools.

**Requirements:**

- Account creation from invite link with minimal fields (name, email, password)
- Auto-assignment to the correct team and role based on the invite
- Welcome screen that explains the three things they need to know:
  1. "Your tasks are here" → What Should I Do Now?
  2. "New stuff goes here" → Inbox capture
  3. "Check in weekly" → Weekly Review (simplified)
- Optional 60-second interactive walkthrough (skippable)
- No GTD jargon on the welcome screen — "Your tasks," "Capture ideas," "Weekly check-in"

### 4.2 Simplified Role for Casual Volunteers

**Status:** Not yet specced  
**Priority:** Medium  

Not every volunteer needs the full GTD experience. A parent who signed up to bring snacks to three Little League games needs to see their three tasks and nothing else. The full inbox processing wizard, horizons of focus, and someday/maybe lists would be overwhelming and unnecessary.

**Concept: "Contributor" experience level**

```
Full GTD Experience (default for team admins and power users):
  → Inbox, Projects, Contexts, Energy, Weekly Review, Horizons, Someday/Maybe

Contributor Experience (opt-in for casual volunteers):
  → "My Tasks" — flat list of assigned tasks with due dates
  → "Done" button on each task
  → Notification badge when new tasks are assigned
  → That's it
```

This is a UI layer, not a data model change. Contributor-mode users still have tasks in the same database, still trigger cascades when they complete work, and still show up in Waiting For lists. They just see a radically simplified interface.

**Implementation approach:** A `experienceLevel` field on `TeamMember` (or user preferences) that controls which UI components render. The API surface is identical.

### 4.3 Notification Preferences for Volunteers

**Status:** Partially specced in TANDEM_SPEC.md §13.7  
**Priority:** High  

Volunteers who check in twice a week need different notification patterns than daily users:

- **Email digest:** "Here's what's waiting for you this week" — sent Monday and Thursday
- **Assignment notification:** Immediate email/push when a new task is assigned to you
- **Decision request notification:** Immediate when your input is needed on a proposal
- **Deadline warning:** 48 hours before a due date (not 1 hour — volunteers need lead time)
- **Stale task nudge:** Gentle "You have a task that's been waiting 7 days" — once, not repeatedly

**Critical UX principle:** Notifications must never feel like nagging. Volunteers are donating their time. The tone should be "Here's what's ready for you when you have a moment" not "You haven't done this yet."

### 4.4 Reporting for Board Governance

**Status:** Not yet specced  
**Priority:** Medium  

Board members and executive directors need high-level views that answer governance questions:

- **Activity report:** How many tasks were completed across the org this month? Which committees are active vs. stagnant?
- **Decision log:** Chronological list of all resolved Decision Proposals with outcomes and rationale — exportable as PDF for board meeting packets
- **Volunteer engagement:** Which members are active? Who hasn't logged in for 30+ days? (Framed as engagement support, not surveillance)
- **Project status summary:** One-page view of all active projects with completion percentages — printable for board meetings

These reports leverage existing event sourcing data. No new tracking is needed — just query and presentation layers.

### 4.5 Guided Setup for Org Admins

**Status:** Not yet specced  
**Priority:** High  

The person setting up Tandem for their volunteer org needs a guided experience:

```
Welcome to Tandem — Let's set up your organization

Step 1: What's your organization?
  → Name, description, icon/logo
  
Step 2: What are your committees or teams?
  → Add teams with names and descriptions
  → Suggest common patterns: "Board, Programs, Fundraising, Operations"
  
Step 3: Invite your team leads
  → Email addresses for committee chairs
  → Each gets ADMIN role for their committee
  → They can then invite their own members
  
Step 4: Create your first project
  → Walk through creating a project with 3-5 tasks
  → Demonstrate assignment and the cascade engine
  
Step 5: You're ready!
  → Link to wiki template: "Organization Handbook"
  → Link to first decision proposal template: "Quick Poll"
  → Reminder to do your first weekly review in 7 days
```

### 4.6 Template Library for Common Nonprofit Workflows

**Status:** Not yet specced  
**Priority:** Low (post-launch)  

Pre-built project templates that org admins can import:

- **Annual Fundraising Event** — 25-task sequential project covering venue, sponsors, marketing, logistics, follow-up
- **Board Meeting Prep** — Recurring project template: agenda, minutes, action items, distribution
- **New Member Onboarding** — Checklist for welcoming and integrating a new volunteer
- **Grant Application Cycle** — Sequential: research → draft → internal review → submit → follow-up
- **Seasonal Program Launch** — Parallel project for programs with multiple independent workstreams
- **Annual Budget Process** — Committee budgets → consolidation → board review → approval

Templates are just pre-populated project structures with placeholder task titles. No special data model needed — implement as JSON fixtures that create projects via the existing API.

---

## 5. Technical Considerations

### 5.1 Server Sizing for Volunteer Orgs

Most volunteer organizations are small enough that Tandem's lightest deployment handles them easily:

| Org Size | Concurrent Users | Database Rows (est.) | Server Spec |
|----------|-----------------|---------------------|-------------|
| 10-20 members | 2-5 | < 10,000 | 1 vCPU, 1GB RAM |
| 20-50 members | 5-10 | < 50,000 | 2 vCPU, 2GB RAM |
| 50-100 members | 10-20 | < 200,000 | 2 vCPU, 4GB RAM |

For self-hosted deployments, a $5-10/month VPS handles most volunteer orgs. This reinforces the cost advantage.

For managed hosting, volunteer org pricing should reflect the low resource consumption — this is a volume play, not a margin play.

### 5.2 Multi-Org on Single Server

A single Tandem server could host multiple small organizations if tenant isolation is clean. This is already handled by the team hierarchy — each org is a top-level team with complete data isolation via the membership-based visibility rules in TEAMS.md §2.2.

However, true multi-tenancy (separate orgs sharing infrastructure without any cross-visibility) may require explicit tenant boundaries beyond what team hierarchy provides. This is a future consideration for managed hosting at scale.

### 5.3 Data Portability

Volunteer org leadership rotates. When a new president takes over, or when an org decides to move to a different platform, they need to export everything:

- All projects, tasks, and completion history
- All decision proposals with contributions and resolutions  
- All wiki articles
- Team structure and membership roster
- Event history / audit trail

Export format: JSON (machine-readable) + Markdown (human-readable). This is partially specced in TANDEM_SPEC.md §9 (Should Have: Data export) but should be prioritized for the volunteer org segment where leadership transitions are frequent.

---

## 6. Go-to-Market Strategy

### 6.1 Target Segments (by size and type)

**Tier 1 — Ideal early adopters (10-30 members):**
- Youth sports leagues (Little League, swim clubs, soccer associations)
- Community service clubs (Rotary, Lions, Kiwanis local chapters)
- Homeowner associations and neighborhood groups
- Church/faith community committees
- Parent-teacher organizations
- Local hobby groups with organizational structure (garden clubs, maker spaces)

**Tier 2 — Growth targets (30-100 members):**
- Habitat for Humanity local chapters
- Volunteer fire companies and rescue squads
- Community theater groups
- Local food banks and pantries
- Animal rescue organizations
- Scout troops and leadership teams

**Tier 3 — Aspirational (100+ members):**
- Regional nonprofit chapters
- University clubs and student organizations
- Large community organizations with multiple programs

### 6.2 Value Proposition (one sentence per audience)

- **Board president:** "See every committee's progress and every major decision without calling a meeting."
- **Committee chair:** "Delegate tasks to your volunteers and know they'll get done without you chasing people."
- **Regular volunteer:** "Open the app, see what needs doing, knock it out in 15 minutes, feel good about contributing."
- **Treasurer/operations:** "Every decision has an audit trail — who proposed it, who reviewed it, what was decided and why."

### 6.3 Positioning Against Alternatives

| Need | What They Use Now | Why It Fails | Tandem's Answer |
|------|------------------|-------------|-----------------|
| Task tracking | Spreadsheets, email, nothing | No notifications, no accountability, gets stale | GTD workflow with cascade engine |
| Communication | WhatsApp/GroupMe/text chains | Decisions buried, no search, no structure | Decision proposals with audit trail |
| Project management | Trello/Asana (free tiers) | Limited features, per-seat cost for upgrades | Full-featured, zero per-seat cost |
| Document storage | Google Drive folders | No connection to tasks or decisions | Wiki with task linking and decision integration |
| Meeting coordination | Doodle polls + email | Still requires synchronous attendance | Fully async decision-making |

### 6.4 Distribution Strategy

**Self-hosted (free):**
- GitHub README section: "Running Tandem for Your Volunteer Organization"
- Setup guide specifically for the "one tech person in the org" persona
- Docker Compose one-liner that gets from zero to running in 10 minutes
- Guided setup wizard (§4.5) handles the org structure configuration

**Managed hosting:**
- Nonprofit/volunteer pricing tier (flat monthly, not per-seat)
- Landing page: "Your volunteer org deserves real tools without enterprise prices"
- Case studies from beta organizations
- 30-day free trial with full onboarding support

### 6.5 Community Growth Loop

Volunteers are members of multiple organizations. A soccer coach who uses Tandem for their league tells the PTA president about it. The PTA president sets it up for their school, and a teacher on that PTA brings it to their church committee.

Each organization is a potential seed for 3-5 more organizations through its members' other affiliations. This is organic, word-of-mouth growth driven by the product's actual utility — no marketing spend required.

---

## 7. Dogfooding Plan

Jason is currently a board member and tech team member of a volunteer organization, having also served on the marketing team. This provides a direct testing ground:

**Phase 1: Personal pilot**
- Set up Tandem for the organization with the existing team structure
- Model the current committees as child teams under the org
- Import active projects and assign current tasks
- Use Decision Proposals for the next cross-team decision that would normally require a meeting or email chain

**Phase 2: Committee adoption**
- Onboard the tech team first (lowest resistance to a new tool)
- Expand to one additional committee willing to try it
- Gather feedback on the Contributor experience level for casual volunteers
- Identify friction points in the onboarding flow

**Phase 3: Org-wide rollout**
- All committees on Tandem
- Board using Decision Proposals for governance decisions
- Wiki populated with organizational knowledge
- Weekly Review adopted by committee chairs
- Measure: reduction in email/chat volume, decision cycle time, volunteer engagement

**Key metrics to track:**
- Time from task assignment to completion (before/after Tandem)
- Number of "stale" tasks older than 14 days
- Decision proposal cycle time (creation to resolution)
- Volunteer login frequency (weekly active users)
- Number of tasks completed by non-chair members (delegation effectiveness)

---

## 8. Roadmap Placement

This use case doesn't require a dedicated release — it's an assembly of features already on the roadmap, with targeted additions:

**Available now (v1.0 features):**
- Personal GTD (inbox, projects, tasks, cascade engine, weekly review)
- Wiki
- Contexts, energy levels, time estimates

**v1.1 — Flat Teams (TEAMS.md Phase 1):**
- Team creation, membership, shared projects
- Task delegation and Waiting For
- Basic volunteer org use case works here with flat committees

**v1.2 — Team Hierarchy + Decision Proposals:**
- Hierarchical teams (board → committees)
- Decision proposal workflow (cross-team routing and approvals)
- Team Sync for async collaboration
- Notification system (email + push)
- **NEW: Volunteer onboarding flow (§4.1)**
- **NEW: Guided org setup wizard (§4.5)**

**v1.3 — Volunteer Org Polish:**
- **NEW: Contributor experience level (§4.2)**
- **NEW: Board governance reports (§4.4)**
- **NEW: Notification preferences for infrequent users (§4.3)**
- **NEW: Project template library (§4.6)**
- Data export (JSON + Markdown)

**v2.0+ — Scale:**
- Multi-org managed hosting
- Nonprofit pricing tier
- Template marketplace (community-contributed)

---

## 9. Success Criteria

This use case is successful when:

1. **A volunteer organization of 20+ members can be fully operational on Tandem within one week** — from server setup through onboarding all members and running their first decision proposal.

2. **The delegation tax is measurably reduced** — committee chairs report that assigning tasks to volunteers takes less effort than doing the work themselves.

3. **Decision cycle time decreases by 50%+** — decisions that previously took 2-3 weeks of email chains and a meeting resolve in under a week via async proposals.

4. **Volunteer engagement increases** — more members complete tasks, not fewer. The tool brings people in rather than creating another obligation that drives them away.

5. **Zero per-seat cost is a real competitive advantage** — organizations choose Tandem specifically because they can onboard all volunteers without budget approval for per-user SaaS fees.

---

*This spec is a living document. It connects to TEAMS.md, DECISION_PROPOSALS.md, TEAM_SYNC.md, and TANDEM_SPEC.md. Bring it to Claude Code sessions for implementation of the new components identified in §4.*
