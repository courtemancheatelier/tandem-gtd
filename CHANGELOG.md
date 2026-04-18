# Changelog

All notable changes to Tandem are documented here. This project follows [Semantic Versioning](https://semver.org/).

---

## v1.9 — Card Files, Routines & Calendar

- **Timer-session history rows** — task History panel now renders each completed focus-timer session as an explicit row with a clock icon and duration (e.g. "Timer session · 5m"), instead of surfacing generic "Updated" events when the timer starts or stops (#34)
- **Routine cards** — supplement, medication, spiritual practice, and recurring regimen tracking with time-of-day windows, per-item check-off, partial completion, dynamic dosing with ramp schedules (linear/step), day number tracking, compliance dashboard with per-window adherence
- **Card file improvements** — user timezone support for recurring task day boundaries (fixes UTC day-skip bug), progression tracking (increment value on a schedule), time-of-day ordering, deactivating a template removes its active task, cleaned up empty state UX
- **Calendar event colors** — custom color picker for calendar events
- **External links** — URL field on projects and tasks for linking to external resources (GitHub, Figma, Google Docs, etc.)
- **Project start/end dates** — optional date range for project planning
- **Missed recurring task cron** — background job catches tasks that were missed (e.g., server was down)
- **Settings reorganization** — new Card Files tab groups recurring templates and routines; General tab simplified
- **Commitment drift dashboard** — deferral patterns, area drift scores, time-of-day heatmaps, displacement lens, outcome summary
- **Persisted filter state** — Do Now and project list filters persist across navigation via localStorage
- **Admin usage dashboard** — per-user adoption metrics, engagement badges (active/drifting/dormant/new), inbox processing signals, setup depth
- **Decision proposals (Phase 1)** — APPROVAL and POLL decision types, named options with proportional vote bars, deadlines with auto-expiry, wiki integration (auto-append outcome on resolution), decision detail permalink page, task-anchored decisions from project UI, MCP tools (create, list, respond, vote, resolve), WaitingFor integration for decision owner, push + in-app notifications for creation and resolution
- **Decision proposals (Phase 2)** — QUICK_POLL type with auto-resolve when all votes are in, task auto-generation for respondents (shows in their Do Now), contributions model for freeform research/analysis submissions, deadline reminder notifications
- **Decision proposals (Phase 3)** — full PR-style async decision workflow: DRAFT → GATHERING_INPUT → UNDER_REVIEW → DECIDED lifecycle, structured input requests with auto-generated tasks per contributor, Decision Hub with status filters and proposal detail view, resolution form with outcome/rationale recording, DecisionEvent audit trail for all state changes, wiki integration for outcome recording, DEFERRED and CANCELED states, notification integration for publish/input/resolve events
- **Team activity filters** — category, person, and project filters on team activity feed; category and person filters on project activity
- **Team enriched events** — reassignment note prompt and project status change note prompt for team projects (same pattern as completion notes)
- **Weekly Review team integration** — open threads, pending decisions, and stale thread detection (7+ days inactive) surfaced in "Get Current" step
- **Thread search** — global search (Cmd+K) now includes team threads by title and message content
- **Push notification preferences** — per-category push toggles (decisions), quiet hours gating for decision notifications
- **OpenAPI spec expansion** — registered thread, decision, and team activity endpoints (now 148 paths)
- **Teams & Collaboration help article** — comprehensive help doc covering teams, threads, decisions, wiki, activity, notifications, MCP tools
- **Focus timer** — opt-in floating timer pill with pause/resume, cumulative sessions per task, 4-hour runaway detection dialog, recorded on task completion
- **Task duration tracking** — "How long did this actually take?" prompt on task completion with quick-tap multiples of estimated time, custom input, auto-fill from timer sessions
- **Time audit challenge** — one-day awareness exercise tracking time in 15-minute intervals, quick tags, GTD alignment score, energy map visualization
- **Time blocking** — drag tasks from Do Now onto the calendar to plan your day, drag-to-move and drag-to-resize events with 15-minute snap grid
- **Microsoft Outlook/365 calendar sync** — bidirectional sync via Microsoft Graph API, OAuth with calendar scopes, calendar selector, read and write sync, settings UI mirroring Google Calendar
- **Estimation accuracy dashboard** — insights widget showing accuracy score, distribution chart (by bucket), weekly trend (improving over time?), breakdown by estimate size (better at short vs long tasks?)
- **Mobile polish** — swipe-to-complete on task cards, pull-to-refresh on Do Now and Inbox, haptic feedback on completions, offline connectivity indicator
- **Email-to-inbox capture** — per-user inbox email address, forward any email to capture as an inbox item, Cloudflare Email Worker with local-part prefix dispatch (supports multi-instance deployments via Subaddressing), webhook endpoint exempted from CSRF origin check (auth is shared-secret only), settings UI with copy/regenerate, source badge on inbox items. **Setup:** operator must configure a Cloudflare Email Worker (or SendGrid Inbound Parse) and set `EMAIL_WEBHOOK_SECRET`, `EMAIL_INBOX_DOMAIN`, and optional `EMAIL_INBOX_LOCAL_PREFIX` in the environment. Deliverability from any given sender depends on the chosen email provider's spam filtering.
- **Optimistic concurrency control** — version-based conflict detection on Task, Project, and WikiArticle; atomic check-and-update via Prisma updateMany; 409 responses with current state on conflict; auto-merge for non-overlapping field changes; conflict dialog for overlapping changes; cascade engine always increments version but never checks it; backward compatible (version optional)
- **Task delegation** — same-server task handoff with Delegation model and full state machine (PENDING → VIEWED → ACCEPTED → DECLINED → COMPLETED → RECALLED); delegator chooses inbox or Do Now landing zone; auto-created WaitingFor with delegation back-reference; DelegationPicker with team-scoped user search; DelegationInboxItem with Accept & Process / Decline; DelegationBadge on task cards; WaitingForDelegation view with status badges and recall; cascade engine guard for sequential projects; completion auto-resolves WaitingFor and notifies delegator
- **Wedding planning template** — flagship project template showcasing Event RSVP, cascade, delegation, and team features; 6 sequential phases (Foundation → Logistics → Details → Confirmation → Final Week → Post-Wedding) with 90+ tasks; team roles (Couple, Maid of Honor, Best Man, Bridesmaid, Groomsman, Family, Guest); pre-configured RSVP fields; Vendor Gratuity Guide wiki page; pre-wired discussion threads; variable substitution for partner names and wedding date
- **Organizational Structure Guide** — help article for administrators setting up teams, child teams, and projects; covers parent/child hierarchy, step-by-step setup, common patterns (nonprofit, company, community, dance school), FAQ
- **Thread/decision cascade** — resolving a BLOCKER thread or decision on a WAITING task now triggers the cascade engine to promote dependent tasks in sequential projects
- **Thread reactions** — emoji reactions on thread messages (👍 ❤️ 🎉 👀 ✅ 😄 🤔 👏) with toggle on/off, grouped display with counts, hover-to-react picker
- **Thread-to-task conversion** — overflow menu on thread messages with "Send to Inbox" (one-click) and "Create Task..." (with optional project, context, next-action); edit and delete actions consolidated into same menu
- **AI thread summarization** — "Summarize" button in thread header streams Claude AI summary of conversation; extracts key points, decisions, action items, and unresolved questions; respects AI enable/disable settings
- **Decision templates** — 7 pre-built presets in decision creation dialog (Quick Poll, Yes/No Vote, Approval Request, Budget Approval, Standard Proposal, Schedule/Date, Go/No-Go) that pre-fill type, options, and context hints
- **Recurring task duration prompt** — quick-completing (✓) a routine-generated recurring task on Do Now now shows the "How long did this actually take?" prompt, matching the status-cycle flow; the prompt falls back to the routine's estimate when the task has none, and the duration prompt now also appears after an auto-retried completion (409 conflict)
- **Sleep tracker** — new `sleep` routine type with `SleepLog` model; three-state card (Going to Bed → I'm Up → summary); target bedtime/wake time on routine with time pickers (default 11pm/7am); auto-completes daily task when wake time logged; Sleep & Performance section on Drift Dashboard with avg sleep, on-time bedtime %, and late night impact (next-day completion rate difference); daily chart with bedtime deviation bars and completion rate overlay; manual time editing for missed/incorrect entries with inline time inputs and recalculation

## v1.8 — Public Release

- **Codebase audit** — remove hardcoded infrastructure references (VPS IPs, domains, personal config), scrub any credentials or sensitive data from code and git history
- **Setup experience** — verify `setup-local.sh` works on a fresh machine, ensure `.env.example` is complete and documented, test the zero-to-running path end-to-end
- **Contributor docs** — CONTRIBUTING.md with DCO sign-off requirement, Code of Conduct (Contributor Covenant v2.1), SECURITY.md (responsible disclosure), GitHub issue/PR templates, BDFL governance model
- **Code cleanup** — resolve TODO/HACK/FIXME comments, remove dead code, clean up anything that would look rough in a public audit
- **Terms of Service & Privacy Policy** — `/terms` and `/privacy` public pages with `(legal)` route group, operator env vars for self-hosters, login footer links
- **API documentation** — OpenAPI 3.1 spec generated from Zod schemas, interactive Scalar UI at `/api-docs`, 117 documented endpoints across 21 tags, Bearer security scheme, updated help article with full endpoint reference
- **API parity audit** — 6 routes upgraded from session-only to Bearer token support, 4 sensitive routes confirmed session-only with documented rationale
- **Apple OAuth** — code wired up and ready; deferred activation until user demand warrants the $99/year Apple Developer membership
- **Project Flow view** — replaced Gantt chart with visual flow view showing actionable, blocked, and completed task zones; compact blocked zone with collapsible dependency chains and team grid layout; shared ProjectBurnDown component with burn-down, burn-up, and velocity chart modes
- **Project-scoped burn-down** — scope burn-down chart to individual projects; task count and hours modes, target date with ideal line, projected completion
- **Burn-up chart** — two-line chart (Total Scope + Completed Work) revealing scope creep; event history walk, 4-week rolling velocity, projected convergence badge, scope change annotations, tasks/hours unit toggle
- **Wiki inline editor** — Tiptap-based WYSIWYG editor with fixed toolbar, slash commands, bubble menu, `[[wiki link]]` autocomplete, visual table editing, task list checkboxes, source view toggle; markdown stays the storage format
- **Trial / evaluation mode** — TRIAL registration mode with time-limited accounts, trial banner with countdown, trial-ended fork-in-road page, anti-gaming via TrialUsage table, cron reminder emails
- **Dashboard GTD restructure** — 4-tier collapsible layout (GTD Health pulse, Horizon Alignment, Needs Attention, Performance), merged project health + progress widgets, project health color filters
- **Insights GTD reorganization** — restructured into 3 collapsible GTD-flow sections (Capture & Process, Getting Things Done, Efficiency)
- **UX polish pass** — notification bell alignment, outline page filter compaction, task input focus persistence, project detail header consolidation, clickable task metadata filters on Do Now, projects page sort dropdown, responsive project header
- **Project templates** — 5 system templates with `{variable}` substitution, sub-project support, context mapping; save any project as reusable template; REST API + MCP tool
- **Enhanced velocity chart** — per-project unit selection with auto-detection, configurable lookback windows, scope change annotations, trend indicator, projected completion integration
- **Mobile UX polish (Phase 2+)** — collapsible BottomFilterTray, customizable bottom toolbar (up to 6 nav items), BulkActionBar mobile wrap, `useKeyboardVisible` hook
- **Docker self-hosting verification** — tested Docker Compose + Caddy deployment end-to-end on a fresh machine
- **Recurring task card file** — SHE-inspired Card File system with completion-triggered recycling, template packs, background scheduler, extended frequencies, color-coded cards, defer/skip/complete actions, skip streak tally marks, area/goal linking
- **Teams nav fix** — always show a "Teams" link in the nav sidebar
- **Login tracking & admin badges** — `loginCount` field, login tracking across all auth paths, "Last Login" column in admin User Management with badge states
- **Data retention & purge** — automated cleanup of completed/dropped project trees after configurable retention period, two-phase execution with grace period notifications, per-project exemption, admin settings UI
- **Expanded team icon picker** — expanded from 37 to 92 curated Lucide icons across 7 categories with search filter
- **Contextual help links** — HelpCircle icons next to page titles across 17 GTD pages

## v1.7 — Business Ready

- **Invite-based growth** — user tiers (ALPHA/BETA/GENERAL), invite codes with referral chain tracking, domain whitelist for org-wide access, 4-mode registration (CLOSED/WAITLIST/INVITE_ONLY/OPEN), admin growth dashboard
- **Info website & operator landing pages** — public landing page at `/`, flagship marketing site for `tandemgtd.com` with email capture, operator-customizable branding (name, logo, accent color, hero/CTA content), admin settings UI, "Powered by Tandem" attribution
- **Operator support link** — optional donation URL in admin settings, visible in help page and sidebar
- **OAuth-only auth** — GitHub + Microsoft OAuth, admin auth mode toggle (OAUTH_ONLY / OAUTH_AND_CREDENTIALS), linked accounts page, auto-link for credentials-only users migrating to OAuth-only
- **Import / export** — JSON + CSV export, Todoist/Things import, column mapping, admin server backup & restore with per-user temp passwords
- **Insights dashboard** — GTD system health score, completion velocity, capture/processing rates, context/energy distribution, weekly review streak
- **Notifications phase 2** — daily digest (push + email), email notification preferences, digest suppresses individual push notifications when active
- **Waitlist email notifications** — SMTP configuration in admin UI, customizable email templates, admin alerts on new signups, welcome emails on approval, password setup tokens

## v1.6 — History & Intelligence

- **Task history UI & event coverage** — MCP history tools (task_history, activity_feed, weekly_summary, cascade_trace, task_revert), TaskTimeline in task cards, Recent Activity dashboard widget, /activity page with source filter tabs, full event coverage across all mutation paths
- **History-powered analytics** — `/insights` page with 7 chart widgets (throughput, cycle time, time-in-status, source distribution, context/energy breakdown, inbox throughput, inbox funnel), time range selector, JSON/CSV event history export

## v1.5 — AI Advantage

- **MCP wiki tools** — search, read, create, update, delete, history, backlinks + wiki resource index
- **MCP team tools** — team-aware scope filtering, team management, task assignment
- **Wiki scalability** — cursor pagination, PostgreSQL full-text search (tsvector/tsquery), indexed WikiBacklink join table, GIN index on tags, ts_headline snippets
- **MCP task/inbox CRUD** — tandem_task_update, tandem_task_delete, tandem_inbox_update, tandem_inbox_delete
- **AI project scaffolding** — AI suggests optimal task order, project type, and dependencies for new projects; create-with-tasks API; MCP `aiSequence` support
- **In-app AI settings hierarchy** — `inAppAiEnabled` as sub-master with separate Chat and Features toggles
- **AI weekly review coach** — embedded AI coach in review wizard (Get Clear/Current/Creative), phase-specific system prompts with live GTD data, streaming AI summary generation with edit

## v1.4 — Daily Driver

- **Public REST API** — Bearer token auth on all 60+ endpoints, API token management, read/write scopes, rate limiting, CORS, admin toggle
- **Natural language tasks** — date parsing, @context, ~duration, !energy markers, preview card, MCP tool, REST API
- **Undo** — toast-based 5-second undo for task completion with full cascade reversal, Cmd+Z shortcut
- **Notifications & reminders** — web push (VAPID), due date alerts, weekly review nudge, notification center, user preferences
- **Quick capture** — source-aware API capture, PWA share target, /capture page, help docs with iOS/Android/CLI recipes

## v1.3 — Mobile & First Impressions

- **Mobile navigation (Phase 1)** — bottom tab bar, nav drawer, mobile header, scrollable dialogs, inline inbox capture, keyboard dismiss support
- **Onboarding** — 6-step first-run wizard (welcome, brain dump, process one, contexts, areas, done) with redirect from Do Now page
- **Account deletion** — self-service delete with email confirmation, cascade schema fixes, session invalidation, Danger Zone UI
- **Bug fix: reopened task sort order** — uncompleting a task in a sequential project restores its original position
- **Team icon picker** — visual Lucide icon grid (36 icons), consistent line-icon aesthetic
- **Projects default to root-only** — scope filter defaults to "Root Only" so users see top-level projects first
- **3-state status circle** — visual NOT_STARTED → IN_PROGRESS → COMPLETED cycle on click
- **Status filter on Do Now** — filter tasks by status with URL-synced state
- **Detach task from project** — remove a task from its project to make it a standalone task
- **Project deletion cascades** — deleting a project deletes all its tasks and sub-projects
- **Sub-project sequencing** — parent type controls child activation, cascade auto-activates next sub-project on completion, bulk reorder
- **Collapsible sidebar sections** — nav groups collapse/expand with persisted state
- **Bulk operations** — multi-select, floating action bar, batch update (context, energy, time, status), batch delete

## v1.2 — Security & Beta Launch

- **Application security hardening** — rehype-sanitize, CSRF origin validation, rate limiting (login + AI chat), security headers (CSP, HSTS, X-Frame-Options), error sanitization, AI prompt injection defense
- **SSL/TLS** — HSTS header, security headers via next.config.js
- **Release workflow** — alpha/public tagging scripts, private-first mirror strategy, `.public-exclude` filter
- **Backup & DR** — encrypted daily/weekly snapshots (GPG AES-256), point-in-time recovery via WAL archiving, automated restore verification, off-site replication, status dashboard
- **MCP HTTP transport** — Streamable HTTP at `/api/mcp`, bearer token auth via personal access tokens, per-session server with CORS support
- **Wiki Editor UX** — markdown toolbar with keyboard shortcuts, live preview with Write/Preview/Split tabs, table of contents sidebar, backlinks, full-text search with snippets, version history with diff and restore
- **Hierarchical admin AI controls** — master toggle → in-app AI chat → MCP server, each with "allow users to toggle" sub-option
- **Deployment** — VPS + Cloudflare Tunnel (no open ports, app-level auth)
- **MCP OAuth 2.1** — authorization server for Claude.ai and ChatGPT remote MCP connectivity (PKCE, dynamic client registration, RFC 9728)
- **OAuth security hardening** — hashed authorization codes, open redirect fix, constant-time PKCE comparison, revocation endpoint auth, automatic expired token cleanup
- **Beta access gate** — WAITLIST/OPEN registration mode toggle, waitlist for admin approval, admin approve/decline UI

## v1.1 — Horizons, AI & Project Management

- **Goals (30K ft) and Horizons view (40K-50K ft)**
- **Wiki / personal reference with [[bracket linking]]**
- **MCP server for Claude Desktop integration**
- **OAuth sign-in (Google, Apple)** with secure account linking
- **Admin settings and server-wide configuration** with hierarchical AI controls
- **AI chat assistant** — embedded panel with streaming responses, GTD-aware context
- **AI inbox capture**, per-user daily limits, privacy controls
- **User-provided API keys** + optional shared server key
- **Sub-projects** — hierarchical parent/child projects with rollup progress and status
- **Project Flow view** — visual task flow with actionable, blocked, and completed zones
- **Task dependencies** — finish-to-start, start-to-start, finish-to-finish, start-to-finish
- **PM dashboard** — project health, burn-down chart, velocity tracker, blocked queue, stale projects, upcoming milestones
- **Milestones and baseline snapshots** for schedule comparison
- **Auto-scheduling engine** based on dependencies
- **Contexts management** — full CRUD with color picker, reorder, auto-seeded GTD defaults
- **Event sourcing** — task/project/inbox history with snapshots and revert capability
- **Activity feed and cascade tracer**

## v1.0 — Core GTD

- **Inbox with quick capture** (Cmd+I / floating action button)
- **Guided inbox processing** with two-minute rule
- **Projects** (sequential, parallel, single actions)
- **Tasks** with contexts, energy levels, time estimates
- **Next-action cascade engine**
- **"What Should I Do Now?" context views**
- **Predefined quick views** (Home Focus, Quick Wins, Deep Work, Low Battery, etc.)
- **Waiting For tracking**
- **Someday/Maybe**
- **Areas of Responsibility**
- **Defer dates** (tickler)
- **Weekly Review**
- **Global search** (Cmd+K)
- **Keyboard shortcuts**
- **Dark mode**
- **PWA + responsive design**
- **Inline task editing** — expand any task card to edit title, notes, context, energy, time estimate, and due date without leaving the page

---

## Roadmap

### v2.0 — Community & Governance

1. Organizational horizons & team goal alignment — org-level mission/vision/strategic goals/areas, team goals that link up to org goals, project→goal linkage, alignment reports showing gaps, org horizon reviews, progress roll-up
2. Roster & credential tracking — configurable credential categories (seminars, certifications, clearances, etc.), prerequisite enforcement per team, team leadership history, member privacy controls, compliance audit system with Google Workspace cross-check
3. Volunteer & nonprofit orgs — contributor experience level, volunteer onboarding, board governance reports

### v2.1 — Federation

- Cross-instance federation — paired instances via Ed25519 keypairs, federated teams with event-sourced replication, push-based sync with pull fallback

### v2.2 — Agentic AI

- Agentic GTD — proactive AI agent layer built on the Tanda trust model (Suggest Only → Suggest and Queue → Auto-Execute)
- Local model infrastructure — Ollama, Qwen 2.5, agent task tiers, model router, cost/margin analysis
- Custom model collaboration (AIRESEC) — purpose-built GTD classification model as alternative to general-purpose LLMs
- Multi-AI provider — OpenAI, Google Gemini, provider abstraction, per-user provider choice

### Future

- Support & ticketing — in-app help widget, GitHub Issues routing, Stripe billing integration
- Managed hosting onboarding pipeline — fully automated provisioning, multi-tenant architecture
- Offline write queue
- Workload / capacity view (energy map + context balance)
