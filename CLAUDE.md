# Tandem — Agent Instructions

## Tech Stack
- **Framework:** Next.js 14 (App Router)
- **UI:** React 18, Tailwind CSS, shadcn/ui, Recharts (dashboard charts)
- **Language:** TypeScript (strict)
- **ORM:** Prisma 5
- **Database:** PostgreSQL
- **Auth:** NextAuth.js
- **Testing:** Jest

## Commands
- **Test:** `npm test`
- **Build:** `npm run build`
- **Dev server:** `npm run dev` (port 2000)
- **Lint:** `npm run lint`
- **DB migrate:** `npx prisma migrate dev`
- **DB generate:** `npx prisma generate`
- **DB push:** `npx prisma db push`

## Architecture
- **App Router:** All routes under `src/app/`
- **API routes:** `src/app/api/`
- **Pages:** `src/app/(dashboard)/`
- **Components:** `src/components/<feature>/`
- **Cascade engine:** `src/lib/cascade.ts` — core GTD dependency promotion logic
- **Service layer:** `src/lib/services/` — business logic (task-service, project-service, etc.)
- **Validation:** `src/lib/validations/` — Zod schemas for API input validation
- **Dashboard:** `src/components/dashboard/` — PM dashboard widgets (health, progress, velocity, blocked queue, stale projects, milestones, burn-down)
- **Dashboard API:** `GET /api/dashboard/stats` — single endpoint returning all dashboard widget data
- **Contexts:** `src/app/(dashboard)/contexts/` — GTD context management (@Home, @Computer, etc.) with auto-seeded defaults on first visit
- **Contexts API:** `GET/POST /api/contexts`, `PATCH/DELETE /api/contexts/[id]`
- **MCP stdio:** `src/mcp/server.ts` — standalone process for Claude Desktop/Claude Code
- **MCP HTTP:** `src/app/api/mcp/route.ts` — Streamable HTTP transport for claude.ai, ChatGPT, etc.
- **MCP shared:** `src/mcp/tools.ts`, `src/mcp/resources.ts`, `src/mcp/prisma-client.ts` (AsyncLocalStorage for per-request context)
- **Onboarding:** `src/components/onboarding/` — 6-step first-run wizard (Welcome, Brain Dump, Process One, Contexts, Areas, Done) with redirect from Do Now page
- **Onboarding API:** `GET /api/onboarding/status`, `POST /api/onboarding/complete`, `POST /api/onboarding/reset`
- **Notifications:** `src/components/notifications/` — bell icon, notification panel, push subscription hook
- **Notifications API:** `GET /api/notifications`, `PATCH /api/notifications/[id]`, `GET /api/notifications/unread-count`, `POST /api/notifications/mark-all-read`, `POST/DELETE /api/push-subscriptions`, `GET/PATCH /api/notification-preferences`, `POST /api/cron/notifications`
- **Push infra:** `src/lib/push.ts` (VAPID + sendPushToUser), `public/sw.js` (push + notificationclick handlers)

## Development & Deploy Workflow
1. **Feature branch** — create a branch off `main` (e.g. `feat/my-feature`)
2. **Develop locally** — make changes, test on `localhost:2000` (`npm run dev`)
3. **Commit & push** — commit to the feature branch and push to GitHub
4. **Deploy to beta** — pull the feature branch on the beta server, build, restart
   ```
   ssh tandem-vps "sudo -u tandem bash -c 'cd /opt/tandem && git fetch && git checkout <branch> && npm run build'"
   ssh tandem-vps "sudo systemctl restart tandem"
   ```
5. **Test on beta** — verify the feature works on the live beta server
6. **Merge to main** — once verified, merge the feature branch into `main` and push

**Important:** Never commit directly to `main`. Always use a feature branch.

## Server Infrastructure

All three instances run on the same bare-metal server (`tandem-vps` SSH alias) with separate Linux users, databases, and systemd services.

| | Beta | Alpha | Production |
|---|---|---|---|
| **URL** | beta.tandemgtd.com | alpha.tandemgtd.com | tandemgtd.com |
| **Linux User** | `tandem` | `tandemAlpha` | `tandemprod` |
| **App Path** | `/opt/tandem` | `/opt/tandem-alpha` | `/opt/tandem-prod` |
| **Service** | `tandem` | `tandem-alpha` | `tandem-prod` |
| **Port** | 2000 | 2100 | 2200 |

### Deploy to all instances (from main)
```bash
# Beta
ssh tandem-vps "sudo -u tandem bash -c 'cd /opt/tandem && git pull origin main && npm run build'"
# Alpha
ssh tandem-vps "sudo -u tandemAlpha bash -c 'cd /opt/tandem-alpha && git pull origin main && npm run build'"
# Production
ssh tandem-vps "sudo -u tandemprod bash -c 'cd /opt/tandem-prod && git pull origin main && npm run build'"
# Restart all
ssh tandem-vps "sudo systemctl restart tandem tandem-alpha tandem-prod"
```

### Seed help articles (after adding/updating docs/help/ files)
```bash
ssh tandem-vps "sudo -u tandem bash -c 'cd /opt/tandem && npx tsx prisma/seed-help.ts'"
ssh tandem-vps "sudo -u tandemAlpha bash -c 'cd /opt/tandem-alpha && npx tsx prisma/seed-help.ts'"
ssh tandem-vps "sudo -u tandemprod bash -c 'cd /opt/tandem-prod && npx tsx prisma/seed-help.ts'"
```

Full ops guide: `docs/ops/ALPHA_ENVIRONMENT.md`

## Important Conventions
- **Task estimated time field:** The field is `estimatedMins` (NOT `estimatedMinutes` as some specs reference)
- API routes follow REST conventions with Zod validation on inputs
- Use existing patterns in the codebase when adding new features
- Components use shadcn/ui primitives where possible

## Spec Documents

### Open
- Bulk Operations (Multi-Select, Floating Action Bar, Batch Complete/Move/Delete): `docs/specs/BULK_OPERATIONS.md`
- Undo (Toast-Based Reversal, Cascade Undo, Soft-Delete Recovery): `docs/specs/UNDO.md`
- Quick Capture (Personal API Tokens, Shortcuts Integration, Browser Extension, Share Target): `docs/specs/QUICK_CAPTURE.md`
- Calendar, Time Blocking & Google Calendar Sync: `docs/specs/CALENDAR_FEATURES.md`
- AI Weekly Review Coach (Guided Review with AI, Stale Project Detection, Goal Progress): `docs/specs/AI_WEEKLY_REVIEW_COACH.md`
- Natural Language Tasks (Date Parsing, Context Inference, AI Enhancement, Preview Card): `docs/specs/NATURAL_LANGUAGE_TASKS.md`
- Insights Dashboard (Productivity Analytics, Completion Trends, System Health Score): `docs/specs/INSIGHTS_DASHBOARD.md`
- Email-to-Inbox Capture (Inbound Email Processing, Per-User Inbox Address): `docs/specs/EMAIL_CAPTURE.md`
- Team Sync (Enriched Events, Work-Anchored Threads, Decision Requests, GTD-Integrated Communication): `docs/specs/TEAM_SYNC.md`
- Decision Proposals (Full PR-Style Decision Workflow, Named Options, Research Phase, Wiki Integration, Templates): `docs/specs/DECISION_PROPOSALS.md` — richer Layer C alternative to Team Sync's lightweight decision requests; explore overlap before implementation
- Project Templates (Reusable Skeletons, System + User Templates, Variable Substitution): `docs/specs/PROJECT_TEMPLATES.md`
- Import / Export (JSON + CSV Export, Todoist/Things Import, Column Mapping, Admin Backup): `docs/specs/IMPORT_EXPORT.md`
- Support & Ticketing (In-App Widget, GitHub Issues, Billing): `docs/specs/SUPPORT_TICKETING.md`
- OAuth-Only Auth (Remove Password Login, Add Apple + GitHub + Microsoft OAuth, Auth Mode Toggle, Migration): `docs/specs/OAUTH_ONLY_AUTH.md`
- AI Project Scaffolding (Smart Task Sequencing, Dependency Suggestion, Project Type Inference): `docs/specs/AI_PROJECT_SCAFFOLDING.md`
- Multi-AI Provider (OpenAI, Google Gemini, Provider Abstraction, Per-User Provider Choice): `docs/specs/MULTI_AI_PROVIDER.md`
- Task History System (MCP History Tools, Revert UI, Weekly Summary API, Retention, Advanced Analytics): `docs/specs/TASK_HISTORY.md`
- Invite-Based Growth (User Tiers, Invite Codes, Referral Tracking, Domain Whitelist, Phased Registration): `docs/specs/INVITE_GROWTH.md`
- Sub-Project Sequencing (Cascade-Driven Activation, Sequential/Parallel Child Status, Reorder API): `docs/specs/SUB_PROJECT_SEQUENCING.md`
- Info Website & Operator Landing Page (Public Routes, Flagship Site, Instance Branding, Content Blocks, Admin UI): `docs/specs/INFO_WEBSITE.md`
- Operator Support Link (Donation URL, Buy Me a Coffee, Community-Funded Servers): `docs/specs/OPERATOR_SUPPORT_LINK.md`
- Volunteer & Nonprofit Organizations (Use Case, Feature Mapping, Contributor Mode, Org Onboarding, Board Governance Reports): `docs/specs/VOLUNTEER_ORGS.md`
- Waitlist Email Notifications (SMTP Config, Admin Alerts, Welcome Emails, Password Setup Tokens): `docs/specs/WAITLIST.md`
- Wiki Inline Editor (Tiptap WYSIWYG, Floating Toolbar, Slash Commands, Wiki Link Nodes, Source Toggle): `docs/specs/WIKI_INLINE_EDITOR.md`
- Mobile UI Adjustments (Bottom Filter Tray, Nav Routing Fix, Customizable Bottom Toolbar): `docs/specs/MOBILE_UI_ADJUSTMENTS.md`
- Cross-Instance Federation (Paired Instances, Federated Teams, Event-Sourced Replication, Cascade Delegation): `docs/specs/FEDERATION.md`
- Managed Hosting Pipeline (Legacy — superseded by MANAGED_HOSTING.md): `docs/specs/done/MANAGED_HOSTING_PIPELINE.md`
- Evaluation Mode & Self-Service Funnel (30-Day Trial, Fork-in-the-Road, Stripe Checkout, Automated Provisioning): `docs/specs/EVALUATION_MODE.md`
- Waitlist Origin Tracking & Login Activity (UserSource Enum, First/Last Login, Admin Table Indicators, Stale User Detection): `docs/specs/WAITLIST_TRACKING.md`
- Optimistic Concurrency Control (Version-Based Conflict Detection, 409 Responses, Cascade Integration, Auto-Merge, Conflict UI): `docs/specs/OPTIMISTIC_CONCURRENCY.md`
- Load Testing & Data Generation Tool (CLI, Synthetic Data, Concurrent Multi-User Simulation, Conflict Scenarios, Presets): `docs/specs/LOAD_TESTING.md`
- Terms of Service & Privacy Policy (/terms and /privacy Public Pages, Legal Route Group, Operator Env Vars, OAuth Console Config): `docs/specs/TERMS_PRIVACY_PAGES.md`
- Contributor Guidelines (DCO, Code of Conduct, SECURITY.md, Issue/PR Templates, BDFL Governance, AGPL Obligations): `docs/specs/CONTRIBUTING_SPEC.md`
- Enhanced Velocity Chart (Per-Project Units, Auto-Detection, Lookback Windows, Scope Annotations, Burndown Integration): `docs/specs/VELOCITY_CHART.md`
- Focus Timer (Opt-In Focus Timer, Floating Pill, Pause/Resume, Cumulative Sessions, Runaway Handling, MCP Tools): `docs/specs/FOCUS_TIMER.md`
- Task Duration Tracking (Actual vs Estimated Time, Completion Prompt, Estimation Accuracy Dashboard, Enhanced Burn-Down/Up): `docs/specs/TASK_DURATION_TRACKING.md`
- Time Audit Challenge (One-Day Awareness Exercise, 15-Min Intervals, Quick Tags, GTD Alignment Score, Energy Map): `docs/specs/TIME_AUDIT_CHALLENGE.md`
- Public Release Readiness (Codebase Audit, Setup Experience, Contributor Docs, Code Cleanup): tracked in README.md roadmap v1.8

### Planning & Strategy
- Agentic GTD Vision (Tanda Trust Model, Proactive AI Agents, Suggestion Framework, Pattern Store, Inbox Clarification, Review Briefings, Agent Triggers, Instance-Level Learning): `docs/specs/AGENTIC_GTD_VISION.md`
- Local Model Infrastructure Strategy (Ollama, Qwen 2.5, Agent Task Tiers, Model Router, Cost/Margin Analysis, Hosting Tier Mapping): `docs/specs/LOCAL_MODEL_STRATEGY.md`
- Philosophy & Narrative (Core Beliefs, Messaging, Voice Guidelines, Personas): `docs/PHILOSOPHY.md`
- **Managed Hosting Architecture** (OVHcloud Bare Metal, Multi-Tenant Provisioning, Caddy/Cloudflare, Pricing, Scaling Path, Monitoring, Multi-Server Geo-Routing): `docs/MANAGED_HOSTING.md`
- Managed Hosting Pricing (Legacy — superseded by MANAGED_HOSTING.md): `docs/specs/done/MANAGED_HOSTING_PRICING.md`
- Deployment & Monetization (Legacy — superseded by MANAGED_HOSTING.md): `docs/specs/done/DEPLOYMENT_MONETIZATION.md`
- Launch Strategy & Pricing (Phased Rollout, Tiers, Activation Metrics): `docs/specs/LAUNCH_STRATEGY.md`
- Custom Model Recommendations (LLM vs Custom Classifier, Phased Evaluation, Training Data Pipeline): `docs/specs/CUSTOM_MODEL_RECOMMENDATIONS.md`
- AIRESEC Model Collaboration (Training Data Export, Inference API Contract, Evaluation Framework, Integration Path): `docs/specs/AIRESEC_COLLABORATION.md`
- Security Architecture (Dev/Prod Separation, YubiKey, NixOS): `docs/specs/SECURITY_ARCHITECTURE.md`
- Future Features & Ideas (Team Invites, Planned Improvements): `docs/specs/FUTURE_FEATURES.md`

- Recurring Task Card File (Completion Recycling, Background Scheduler, Extended Frequencies, SHE Card File View): `docs/specs/RECURRING_CARD_FILE.md`
- Data Retention & Purge (Closed Project Auto-Delete, Grace Period, Export Before Purge, Retention Exemptions, Admin Controls): `docs/specs/DATA_RETENTION_PURGE.md`

### Done (archived in `docs/specs/done/`)
- PM Features, Teams, Teams v2, Deployment/Monetization, DR/Backup, Wiki Collaboration, MCP Cross-Client, Application Security, SSL/TLS, MCP OAuth, Project Outline View, Horizons Guided Review, Help Docs, Beta Access Gate, Release Workflow, Keyboard Shortcuts, Wiki Scalability (Phases 1-3), Public REST API, Onboarding, MCP Teams, MCP Wiki, Account Deletion, Mobile Responsiveness (Phase 1), Mobile Responsiveness (Phase 2), Notifications & Reminders (Phases 1-3)

## Ops Guides
- Backup & Disaster Recovery (Setup, Restore, WAL/PITR, Off-Site): `docs/BACKUP_GUIDE.md`
- Multi-Instance Environment (Beta/Alpha/Production, Cloudflare Tunnel, Deploy Scripts, Migration Caveat): `docs/ops/ALPHA_ENVIRONMENT.md` (gitignored — contains deployment-specific details)
- Versioning & Release Process (Internal dev- Tags, Public Semver, VERSION_MAP, Release Script, Safety Checklist): `docs/VERSIONING_AND_RELEASE.md`
