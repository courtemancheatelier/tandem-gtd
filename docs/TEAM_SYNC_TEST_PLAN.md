# Team Sync — Test Plan

Test on alpha (alpha.tandemgtd.com) with a team project and at least 2 team members.

---

## Layer 1: Enriched Events

### Team task completion with note
- [ ] Open a team project, find a task in IN_PROGRESS
- [ ] Click the status circle to complete — dialog should appear (not one-click)
- [ ] Type a note like "Shipped to staging, needs QA" and click "Complete with note"
- [ ] Check task history — event should show blue "Team" badge and note in a styled card (MessageSquare icon, light background)
- [ ] Activity feed should show "(team note)" suffix on the event description

### Team task completion without note
- [ ] Complete another team task, click "Skip" in the dialog
- [ ] Task completes normally, no note on the event, source is MANUAL (not TEAM_SYNC)

### Personal task completion unchanged
- [ ] Complete a personal task (not in a team project)
- [ ] Should be one-click as before — no dialog appears

### Swipe to complete (mobile)
- [ ] On mobile, swipe a team task to complete — dialog should still appear

### MCP note support
- [ ] Via MCP: `tandem_task_complete` with `taskId` and `note: "Done via MCP"`
- [ ] Check history — note should appear on the event

---

## Layer 2: Work-Anchored Threads

### Create a QUESTION thread
- [ ] Go to a team project detail page
- [ ] "Threads" section should appear below the task list
- [ ] Click "New Thread", select QUESTION, add title + message
- [ ] Select a team member to @-mention
- [ ] Create — thread appears in the list
- [ ] Mentioned user should have an inbox item

### Create a BLOCKER thread
- [ ] New Thread > select BLOCKER purpose
- [ ] Check "Set task to Waiting" checkbox (only appears for task-anchored blockers)
- [ ] Create — WaitingFor entry should appear in Waiting For list
- [ ] If checkbox was checked, task status should change to WAITING

### Resolve a BLOCKER thread
- [ ] Open the blocker thread, click "Resolve"
- [ ] WaitingFor should auto-resolve
- [ ] If task was WAITING, it should return to IN_PROGRESS
- [ ] Thread shows green "Resolved" badge

### Reply to a thread
- [ ] Open a thread, type a reply, send
- [ ] Message appears in the thread with author name and timestamp

### Reply reopens resolved thread
- [ ] Open a resolved thread, add a reply
- [ ] Thread should reopen (resolved badge disappears)

### FYI thread — no inbox items
- [ ] Create an FYI thread with @-mentions
- [ ] Mentioned users should NOT get inbox items (FYI = informational only)

### Edit / delete messages
- [ ] Edit your own message — "(edited)" indicator appears
- [ ] Delete your own message — message removed

### Thread events in history
- [ ] Check task/project history — THREAD_OPENED and THREAD_RESOLVED events should appear with blue chat icon

### MCP thread tools
- [ ] `tandem_thread_create` with purpose, title, message, taskId
- [ ] `tandem_thread_list` with taskId or projectId
- [ ] `tandem_thread_reply` with threadId and content
- [ ] `tandem_thread_resolve` with threadId

---

## Layer 3: Decisions

### Create a decision
- [ ] Via API or MCP: create a decision on a team task with 2+ respondents
- [ ] Thread created with QUESTION purpose
- [ ] WaitingFor created for requester
- [ ] Each respondent (except requester) gets an inbox item

### Pending decisions on Do Now
- [ ] Log in as a respondent
- [ ] "Decisions Awaiting Your Response" section should appear on Do Now page
- [ ] Shows question, team name, requester name, deadline, response count

### Vote on a decision
- [ ] POST to `/api/decisions/{id}/respond` with vote (APPROVE/REJECT/COMMENT/DEFER) and optional comment
- [ ] Response recorded; can change vote by calling again (upsert)

### Resolve a decision
- [ ] As the requester, PATCH `/api/decisions/{id}` with `resolution` text
- [ ] Decision status -> RESOLVED
- [ ] Parent thread resolves
- [ ] WaitingFor auto-resolves
- [ ] If task was WAITING, restored to IN_PROGRESS

### Withdraw a decision
- [ ] As the requester, PATCH `/api/decisions/{id}` with `withdraw: true`
- [ ] Decision status -> WITHDRAWN
- [ ] Thread resolves, WaitingFor resolves

### Only requester can resolve/withdraw
- [ ] As a non-requester, attempt to resolve — should get 403

### Only designated respondents can vote
- [ ] As a non-respondent, attempt to vote — should get 403

### Decision events in history
- [ ] DECISION_REQUESTED and DECISION_RESOLVED events appear with purple icon

### MCP decision tools
- [ ] `tandem_decision_create` — creates decision with thread + respondents
- [ ] `tandem_decision_respond` — submit vote
- [ ] `tandem_decision_list_pending` — list unresponded decisions
- [ ] `tandem_decision_resolve` — resolve with summary

---

## Decision Proposals Phase 2: UI + Notifications

### Do Now — inline DecisionCard
- [ ] Log in as a respondent with pending decisions
- [ ] "Decisions Awaiting Your Response" section shows on Do Now
- [ ] Click a pending decision item — DecisionCard expands inline below it (accordion)
- [ ] Click again — collapses
- [ ] APPROVAL: vote form appears, can submit APPROVE/REJECT/COMMENT/DEFER
- [ ] POLL: option bars appear, can click to vote for an option
- [ ] As requester: Resolve and Withdraw buttons appear, can resolve with resolution text
- [ ] After voting/resolving, decision disappears from pending list (re-fetches)

### Project page — Decisions tab
- [ ] Open a team project with decisions enabled
- [ ] "Decisions" tab appears (after Threads)
- [ ] Tab shows all decisions for this project (open first, then resolved)
- [ ] "New Decision" button opens NewDecisionDialog
- [ ] Create an APPROVAL decision — appears in the list
- [ ] Create a POLL decision with 3+ options — appears with vote bars
- [ ] Vote on a decision — bars update immediately
- [ ] Resolve a decision — status changes to RESOLVED, resolution text shown
- [ ] Withdraw a decision — disappears or shows WITHDRAWN status
- [ ] Disable decisions in project settings → tab should not appear

### Team page — Decisions tab
- [ ] Open a team page
- [ ] "Decisions" tab appears (after Activity)
- [ ] Shows decisions across all team projects, grouped: Open first, then Resolved
- [ ] Can vote/resolve/withdraw from this view
- [ ] No "New Decision" button (decisions are created from project pages)

### Decision notifications
- [ ] Create a decision with respondents
- [ ] Respondents (excl. requester) get a bell notification: "Decision requested" / "Poll requested"
- [ ] Notification body shows the question text
- [ ] Notification link goes to the task/project page
- [ ] With push enabled, respondents receive browser push notification
- [ ] Resolve a decision
- [ ] ALL respondents get a bell notification: "Decision resolved"
- [ ] Notification body shows "question: resolution" summary
- [ ] With push enabled, respondents receive browser push notification

### Decision notification types in schema
- [ ] `DECISION_REQUESTED` and `DECISION_RESOLVED` appear in notification list
- [ ] Notifications marked as unread, can be read/dismissed normally

---

## Thread Mention Notifications

### Notification bell on @-mention
- [ ] Create a QUESTION thread on a team project, @-mention a team member
- [ ] Log in as the mentioned user — bell should show unread notification
- [ ] Notification uses MessageSquare icon, title shows "{author} mentioned you in {thread title}"
- [ ] Clicking notification navigates to the task/project page

### Push notification on @-mention
- [ ] With push enabled, create a thread with @-mention
- [ ] Mentioned user receives browser push notification
- [ ] Push body shows "{purpose} thread: {title}"

### FYI threads skip notifications
- [ ] Create an FYI thread with @-mentions
- [ ] Mentioned users should NOT get bell notifications (existing behavior preserved)

### Reply @-mention creates notification
- [ ] Reply to an existing thread, @-mention someone in the reply
- [ ] Mentioned user gets bell notification + push

### Threads Needing Response on Do Now
- [ ] Log in as a mentioned user (mentioned in an unresolved thread)
- [ ] "Threads Needing Response" section appears on Do Now between tasks and Pending Decisions
- [ ] Shows purpose icon, thread title, team name, anchor title, message count

### Expand thread inline
- [ ] Click a thread mention item — expands to show last 5 messages
- [ ] Messages show author name, relative timestamp, content
- [ ] If >5 messages, shows "{N} earlier messages not shown" note

### Quick reply from Do Now
- [ ] Type a reply in the expanded textarea
- [ ] Cmd+Enter sends the reply
- [ ] "Reply sent" toast appears
- [ ] Section refreshes (onReplied callback triggers fetchData)

### "View full thread" link
- [ ] Click "View full thread" in expanded item
- [ ] Navigates to the task/project page where the thread lives

### Resolved threads disappear
- [ ] Resolve a thread that appears in "Threads Needing Response"
- [ ] Refresh Do Now — thread should no longer appear

### Empty state
- [ ] User with no thread mentions — "Threads Needing Response" section does not appear

---

## Decision Proposals Phase 3: Notification Preferences, MCP, Task Anchoring

### Notification preference toggle
- [ ] Settings → Notifications → "Decision requests & resolutions" checkbox visible (after Weekly review)
- [ ] Defaults to checked (on) for new users
- [ ] Toggle off → save → refresh → toggle stays off
- [ ] Toggle back on → save → refresh → stays on

### Push gating: preferences respected
- [ ] Disable "Decision requests & resolutions" in notification settings
- [ ] Create a decision targeting that user as respondent
- [ ] User gets in-app notification (bell) but NO push notification
- [ ] Re-enable → create another decision → push notification sent

### Push gating: quiet hours respected
- [ ] Set quiet hours that cover the current hour (e.g., 00:00–23:00 for testing)
- [ ] Create a decision → respondent gets bell notification but NO push
- [ ] Resolve a decision → respondents get bell but NO push
- [ ] Disable quiet hours → create decision → push sent normally

### MCP: tandem_decision_list by project
- [ ] `tandem_decision_list` with `projectId` for a project with decisions
- [ ] Returns count summary (open/resolved/withdrawn) and list of decisions
- [ ] Each line shows status, question, requester name, response count

### MCP: tandem_decision_list by team
- [ ] `tandem_decision_list` with `teamId`
- [ ] Returns decisions across all team projects
- [ ] Verify membership check (non-member gets error)

### MCP: tandem_decision_list validation
- [ ] Call with neither projectId nor teamId → error
- [ ] Call with both projectId and teamId → error
- [ ] Call with projectId for a non-team project → error

### Task-anchored decision creation
- [ ] Open a team project's Decisions tab
- [ ] Click "New Decision" — if project has tasks, "Anchor to task" dropdown appears
- [ ] Default is "Project-level"
- [ ] Select a specific task → create decision
- [ ] Decision appears in the project's decision list
- [ ] Thread and WaitingFor are anchored to the task (not project)
- [ ] In task history, DECISION_REQUESTED event appears

### Task-anchored decision: empty task list
- [ ] Open a team project with zero tasks
- [ ] Click "New Decision" — "Anchor to task" dropdown does NOT appear
- [ ] Can still create project-level decisions normally

---

## Decision Proposals Phase 4: Deadline Reminders, Expiry, Wiki Integration, Detail Page

### Deadline reminders (cron)
- [ ] Create a decision with a deadline ~1 hour from now
- [ ] Trigger cron (POST /api/cron/notifications) — respondents who haven't voted get "Decision deadline approaching" notification
- [ ] Notification links to the task/project page
- [ ] With push enabled + pushDecisions on, push notification sent
- [ ] With pushDecisions off, only in-app notification created
- [ ] Already-voted respondents do NOT get a reminder
- [ ] Running cron again in the same day — idempotent, no duplicate notifications

### Decision expiry (cron)
- [ ] Create a decision with a past deadline (or wait for deadline to pass)
- [ ] Trigger cron — decision status changes to EXPIRED
- [ ] Parent thread auto-resolves
- [ ] WaitingFor auto-resolves
- [ ] All respondents + requester get "Decision expired" notification
- [ ] DecisionCard renders EXPIRED status with amber badge
- [ ] Expired message shown: "Decision expired — deadline passed without resolution"

### Wiki auto-update on resolution
- [ ] Create a team wiki article
- [ ] Create a decision with wikiSlug set to that article's slug
- [ ] Resolve the decision with a resolution text
- [ ] Check the wiki article — a "Decision: [question]" section was appended
- [ ] Wiki version history shows a new version with message "Decision resolved: ..."
- [ ] DecisionCard shows "Recorded in wiki" link for resolved decisions with wikiSlug

### Wiki link in NewDecisionDialog
- [ ] Open a team project's Decisions tab
- [ ] Click "New Decision" — if team has wiki articles, "Record outcome in wiki" dropdown appears
- [ ] Default is "None"
- [ ] Select an article, create decision — decision.wikiSlug is set
- [ ] No wiki articles exist — dropdown does not appear

### Decision detail page (/decisions/[id])
- [ ] Navigate to /decisions/[id] directly — full decision renders
- [ ] Back arrow links to the anchored task or project page
- [ ] DecisionCard is fully interactive (vote, resolve, withdraw)
- [ ] Respondent list shows who has/hasn't voted (checkmark vs pending)
- [ ] Metadata shows created date, resolved date (if applicable), decision ID
- [ ] Non-team-member gets "You don't have access" error
- [ ] Invalid ID shows "Decision not found"

### Permalink on DecisionCard
- [ ] On project/team Decisions tab, each non-OPEN decision shows a "Permalink" link
- [ ] Clicking opens the /decisions/[id] detail page

### MCP: wikiSlug support
- [ ] `tandem_decision_create` with `wikiSlug` parameter — decision created with wiki link
- [ ] On resolution, wiki article is updated

### Notification deep links (polish)
- [ ] Create a decision — respondent's bell notification links to `/decisions/[id]` (not task/project page)
- [ ] Push notification URL goes to `/decisions/[id]`
- [ ] Resolve a decision — respondent notifications link to `/decisions/[id]`
- [ ] Expired decision notifications link to `/decisions/[id]`
- [ ] Clicking a notification opens the decision detail page directly

### PendingDecisionItem "View details" link
- [ ] On Do Now page, pending decisions show an external-link icon on the right
- [ ] Clicking the icon navigates to `/decisions/[id]` detail page
- [ ] Clicking the rest of the row still toggles the inline DecisionCard (stopPropagation works)

---

## General

- [ ] `npm run build` clean on each branch
- [ ] No regressions on personal task workflows
- [ ] No regressions on existing team features (assign, project CRUD)
