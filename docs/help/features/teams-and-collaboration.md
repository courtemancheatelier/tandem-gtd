---
title: Teams & Collaboration
category: Features
tags: [teams, collaboration, threads, decisions, projects, wiki]
sortOrder: 4
---

# Teams & Collaboration

Tandem's team features bring lightweight collaboration into your GTD workflow. Create teams, share projects and wiki articles, communicate through threads, and make group decisions — all without leaving your task management system.

---

## Creating a Team

1. Go to **Teams** from the sidebar
2. Click **Create Team**
3. Give it a name, optional description, and pick an icon
4. You're automatically added as the team admin

### Team Roles

| Role | Can do |
|------|--------|
| **Admin** | Everything — manage members, edit settings, toggle project features, delete team |
| **Member** | View team projects, participate in threads and decisions, complete tasks |

---

## Team Projects

Any personal project can be added to a team, making it visible to all members.

### Adding Projects

From the **team page > Projects tab**:

- **Add Existing** — pick from your personal projects to move into the team
- **New Project** — create a project directly under the team

### Team Feature Toggles

Each team project has three optional collaboration features that admins can enable or disable:

| Feature | Icon | What it does |
|---------|------|-------------|
| **Threads** | Chat bubble (blue) | Discussion threads on tasks and projects |
| **Decisions** | Vote (purple) | Approval and poll workflows with respondents |
| **Completion Notes** | Document (green) | Prompt for a note when completing team tasks |

Toggle these from the **project settings** (chevron icon) on the team page, or from the project's own settings. The colored icons on each project row show at a glance which features are active.

### Completion Notes

When enabled, completing a team task opens a dialog instead of completing instantly. You can add a note (e.g. "Shipped to staging, needs QA") or skip. Notes appear in the task's history with a blue "Team" badge.

---

## Threads

Threads are short, focused discussions anchored to a task or project. They replace scattered messages by keeping conversation right where the work happens.

### Thread Purposes

| Purpose | Behavior |
|---------|----------|
| **Question** | Creates inbox items for @-mentioned team members |
| **Blocker** | Same as Question, plus optionally sets the task to Waiting status and creates a WaitingFor entry |
| **FYI** | Informational only — no inbox items or notifications |

### Creating a Thread

1. Open a team project's detail page
2. Scroll to the **Threads** section below the task list
3. Click **New Thread**
4. Select a purpose, add a title and message
5. @-mention team members who should respond
6. Click **Create**

### Replying and Resolving

- **Reply** — open a thread, type your response, and send
- **Resolve** — click the Resolve button to close the thread (shows a green "Resolved" badge)
- **Reopen** — adding a reply to a resolved thread automatically reopens it

When a **Blocker** thread is resolved:
- The associated WaitingFor entry auto-resolves
- If the task was set to Waiting, it returns to In Progress

### Threads on Do Now

If you've been @-mentioned in an unresolved thread, a **"Threads Needing Response"** section appears on your Do Now page. From there you can:
- Expand to see the last 5 messages
- Quick-reply with Cmd+Enter
- Click "View full thread" to jump to the project page

---

## Decisions

Decisions are structured proposals that let you get input from team members — either as an approval vote or a multi-option poll.

### Decision Types

| Type | How it works |
|------|-------------|
| **Approval** | Respondents vote: Approve, Reject, Comment, or Defer |
| **Poll** | Respondents click to vote for one of several named options (one vote per person, changeable) |

### Creating a Decision

**From the project page:**

1. Open a team project and go to the **Decisions** tab
2. Click **New Decision**
3. Enter your question and optional context
4. Choose Approval or Poll (for polls, add 2+ named options)
5. Select respondents from the team
6. Optionally set a deadline
7. Optionally anchor to a specific task (or leave as project-level)
8. Optionally link a wiki article to auto-record the outcome
9. Click **Create**

**From MCP (AI assistants):**

Use `tandem_decision_create` with question, respondentIds, and optional parameters like `decisionType: "POLL"`, `options`, `deadline`, `taskId`, and `wikiSlug`.

### Responding to a Decision

Respondents see pending decisions in two places:

- **Do Now page** — "Decisions Awaiting Your Response" section with inline expand
- **Notification bell** — "Decision requested" notification linking to the decision detail page

For **Approval** decisions: choose Approve, Reject, Comment, or Defer with an optional comment.

For **Poll** decisions: click an option bar to vote. You can change your vote anytime before resolution.

### Resolving and Withdrawing

Only the requester (the person who created the decision) can:

- **Resolve** — provide a resolution summary (and for polls, select the chosen option). All respondents are notified.
- **Withdraw** — cancel the decision. The thread and WaitingFor entry are cleaned up.

### Deadlines and Expiry

- **Deadline reminders** — 24 hours before a deadline, respondents who haven't voted get a notification
- **Auto-expiry** — decisions past their deadline are automatically expired by the system. All participants are notified.

### Wiki Integration

When creating a decision, you can link it to a team wiki article. On resolution, the outcome is automatically appended to the article as a "Decision: [question]" section with the resolution text and a version snapshot.

### Decision Detail Page

Every decision has a permalink at `/decisions/[id]`. This page shows the full decision card, respondent status (who has and hasn't voted), and metadata. Notification links go directly here.

---

## Team Wiki

Wiki articles can be owned by a team, making them visible to all members.

### Adding Wiki Articles to a Team

From the **team page > Wiki tab**:

- **Add Existing** — move a personal wiki article into the team
- **View All** — opens the wiki page filtered to this team

Articles linked to a team are accessible by all team members and show the team name on the wiki list page.

---

## Activity Feed

The **Activity tab** on the team page shows a unified feed of all task and project events across team projects. Use the filters to focus on what matters:

- **Category** — All activity, Threads only, Decisions only, Tasks only, or Projects only
- **Person** — Filter to a specific team member's actions

The same filters are available on each project's Activity section (expandable on the project detail page).

---

## Notifications

Team features integrate with Tandem's notification system:

| Event | Bell notification | Push notification |
|-------|------------------|-------------------|
| @-mentioned in a thread | Yes | Yes (if enabled) |
| Decision requested (as respondent) | Yes | Yes (if push decisions enabled) |
| Decision resolved | Yes | Yes (if push decisions enabled) |
| Decision expired | Yes | Yes (if push decisions enabled) |
| Decision deadline approaching | Yes | Yes (if push decisions enabled) |

### Notification Preferences

Go to **Settings > Notifications** to control:

- **Decision requests & resolutions** — toggle push notifications for decision events
- **Quiet hours** — push notifications are suppressed during your configured quiet hours (bell notifications still appear)

---

## MCP Tools

All team features are accessible through MCP for AI assistant integration:

| Tool | Description |
|------|-------------|
| `tandem_team_list` | List your teams |
| `tandem_team_create` | Create a new team |
| `tandem_team_members` | List team members |
| `tandem_team_add_member` | Add a member to a team |
| `tandem_team_remove_member` | Remove a member |
| `tandem_thread_create` | Create a thread on a task or project |
| `tandem_thread_list` | List threads for a task or project |
| `tandem_thread_reply` | Reply to a thread |
| `tandem_thread_resolve` | Resolve a thread |
| `tandem_decision_create` | Create an approval or poll decision |
| `tandem_decision_respond` | Submit a vote on a decision |
| `tandem_decision_list_pending` | List decisions awaiting your response |
| `tandem_decision_resolve` | Resolve a decision with a summary |

---

## See Also

- [[mcp-setup-claude-ai|Setting Up MCP with Claude.ai]] — AI tool integration
- [[public-rest-api|Public REST API]] — API endpoint reference
