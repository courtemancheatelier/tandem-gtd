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
   ssh tandem-vps "sudo -u tandembeta bash -c 'cd /opt/tandem-beta && git fetch && git checkout <branch> && npm run build'"
   ssh tandem-vps "sudo systemctl restart tandem-beta"
   ```
5. **Test on beta** — verify the feature works on the live beta server
6. **Merge to main** — once verified, merge the feature branch into `main` and push

**Important:** Never commit directly to `main`. Always use a feature branch.

## Server Infrastructure

All three instances run on the same bare-metal server (`tandem-vps` SSH alias) with separate Linux users, databases, and systemd services.

| | Beta | Alpha | Production |
|---|---|---|---|
| **URL** | beta.tandemgtd.com | alpha.tandemgtd.com | tandemgtd.com |
| **Branch** | `main` | `main` | `release/1.8` |
| **Linux User** | `tandembeta` | `tandemAlpha` | `tandemprod` |
| **App Path** | `/opt/tandem-beta` | `/opt/tandem-alpha` | `/opt/tandem-prod` |
| **Service** | `tandem-beta` | `tandem-alpha` | `tandem-prod` |
| **Port** | 2000 | 2100 | 2200 |

### Deploy beta + alpha (from main)
```bash
# Beta
ssh tandem-vps "sudo -u tandembeta bash -c 'cd /opt/tandem-beta && git pull origin main && npm run build'"
# Alpha
ssh tandem-vps "sudo -u tandemAlpha bash -c 'cd /opt/tandem-alpha && git pull origin main && npm run build'"
# Restart all
ssh tandem-vps "sudo systemctl restart tandem-beta tandem-alpha"
```

### Deploy production (from release/1.8)
```bash
ssh tandem-vps "sudo -u tandemprod bash -c 'cd /opt/tandem-prod && git pull origin release/1.8 && npm run build'"
ssh tandem-vps "sudo systemctl restart tandem-prod"
```

### Seed help articles (after adding/updating docs/help/ files)
```bash
ssh tandem-vps "sudo -u tandembeta bash -c 'cd /opt/tandem-beta && npx tsx prisma/seed-help.ts'"
ssh tandem-vps "sudo -u tandemAlpha bash -c 'cd /opt/tandem-alpha && npx tsx prisma/seed-help.ts'"
ssh tandem-vps "sudo -u tandemprod bash -c 'cd /opt/tandem-prod && npx tsx prisma/seed-help.ts'"
```

Full ops guide: `docs/ops/ALPHA_ENVIRONMENT.md`

## Important Conventions
- **One Node process per database.** Tandem uses an in-process scheduler (`src/lib/scheduler/`) started from `src/instrumentation.ts` that replaces external cron for notifications and routine sweeps. Running multiple Node processes against the same Tandem DB would double-fire ticks. Set `INTERNAL_SCHEDULER_ENABLED=false` if you ever need to run multi-process against one DB; you would then need to add leader election before re-enabling.
- **Task estimated time field:** The field is `estimatedMins` (NOT `estimatedMinutes` as some specs reference)
- API routes follow REST conventions with Zod validation on inputs
- Use existing patterns in the codebase when adding new features
- Components use shadcn/ui primitives where possible

## Feature Completeness Checklist

Every new feature MUST include all of the following before it is considered done. Do not skip these — they are as important as the implementation itself.

### 1. REST API Coverage
- [ ] Every user-facing action has a corresponding API endpoint under `src/app/api/`
- [ ] All endpoints use `requireAuth()` (supports both session and Bearer token)
- [ ] Zod validation schemas for all inputs in `src/lib/validations/`
- [ ] Endpoints registered in OpenAPI spec at `src/lib/api/openapi/registry.ts`
- [ ] Response schemas defined in `src/lib/api/openapi/response-schemas.ts`
- [ ] REST endpoints tested via Bearer token (not just session UI)

### 2. Help Documentation
- [ ] Help article written in `docs/help/features/` (or `docs/help/admin/` for admin features)
- [ ] Frontmatter: `title`, `category`, `tags`, `sortOrder`
- [ ] Covers: what it does, how to use it, any configuration, edge cases
- [ ] Contextual help link added to the relevant page header (HelpCircle icon pattern)
- [ ] After adding/updating help articles, seed all instances:
  ```bash
  ssh tandem-vps "sudo -u tandembeta bash -c 'cd /opt/tandem-beta && npx tsx prisma/seed-help.ts'"
  ssh tandem-vps "sudo -u tandemAlpha bash -c 'cd /opt/tandem-alpha && npx tsx prisma/seed-help.ts'"
  ssh tandem-vps "sudo -u tandemprod bash -c 'cd /opt/tandem-prod && npx tsx prisma/seed-help.ts'"
  ```

### 3. MCP Tool Coverage
- [ ] If the feature creates, reads, updates, or deletes data — add or update MCP tools in `src/mcp/tools.ts`
- [ ] Tool description should explain what it does and when to use it
- [ ] Test via Claude.ai or Claude Desktop MCP connection

### 4. Reference Updates
- [ ] Update `CLAUDE.md` if the feature adds new architecture, API patterns, or conventions
- [ ] Update `CHANGELOG.md` with feature description under the current version
- [ ] Update `README.md` feature list if it's user-visible

## Spec Documents

### Open
- Share Target URL Metadata (Smart URL Capture, OG Metadata, External Link Field): `docs/specs/SHARE_TARGET.md`
- GTD Education Popup (Landing Page Modal, GTD Orientation for New Visitors): `docs/specs/GTD_EDUCATION_POPUP.md`
- Volunteer & Nonprofit Organizations (Use Case, Feature Mapping, Contributor Mode, Org Onboarding, Board Governance Reports): `docs/specs/VOLUNTEER_ORGS.md`
- Volunteer Roster & Compliance Tracking (Member Profiles, Configurable Credential Categories, Prerequisites, Team Leadership History, Roster Audit, Google Group Cross-Check): `docs/specs/VOLUNTEER_ROSTER.md`
- Organizational Horizons & Team Goal Alignment (Org Mission/Vision/Goals/Areas, Team Goals with Upward Links, Project→Goal Linkage, Alignment Reports, Org Horizon Reviews, Progress Roll-Up): `docs/specs/ORG_HORIZONS.md`
- Google Workspace Group Provisioning (Service Account, Domain-Wide Delegation, Group→Team Mapping, Sign-In Sync, Background Sync, Audit Log): `docs/specs/GOOGLE_WORKSPACE_PROVISIONING.md`
- Cross-Instance Federation (Paired Instances, Federated Teams, Event-Sourced Replication, Cascade Delegation): `docs/specs/FEDERATION.md`
- Multi-AI Provider (OpenAI, Google Gemini, Provider Abstraction, Per-User Provider Choice): `docs/specs/MULTI_AI_PROVIDER.md`
- Load Testing & Data Generation Tool (CLI, Synthetic Data, Concurrent Multi-User Simulation, Conflict Scenarios, Presets): `docs/specs/LOAD_TESTING.md`
- Future Features & Ideas (Team Invites, Planned Improvements): `docs/specs/FUTURE_FEATURES.md`

### Planning & Strategy
- Agentic GTD Vision (Tanda Trust Model, Proactive AI Agents, Suggestion Framework, Pattern Store, Inbox Clarification, Review Briefings, Agent Triggers, Instance-Level Learning): `docs/specs/AGENTIC_GTD_VISION.md`
- Local Model Infrastructure Strategy (Ollama, Qwen 2.5, Agent Task Tiers, Model Router, Cost/Margin Analysis, Hosting Tier Mapping): `docs/specs/LOCAL_MODEL_STRATEGY.md`
- Custom Model Recommendations (LLM vs Custom Classifier, Phased Evaluation, Training Data Pipeline): `docs/specs/CUSTOM_MODEL_RECOMMENDATIONS.md`
- AIRESEC Model Collaboration (Training Data Export, Inference API Contract, Evaluation Framework, Integration Path): `docs/specs/AIRESEC_COLLABORATION.md`
- Security Architecture (Dev/Prod Separation, YubiKey, NixOS): `docs/specs/SECURITY_ARCHITECTURE.md`
- Philosophy & Narrative (Core Beliefs, Messaging, Voice Guidelines, Personas): `docs/PHILOSOPHY.md`

### Moved to [tandem-manage](https://github.com/courtemancheatelier/tandem-manage)
- Support & Ticketing: `docs/specs/SUPPORT_TICKETING.md`
- Managed Hosting Pipeline: `docs/specs/MANAGED_HOSTING_PIPELINE.md`
- Managed Hosting Architecture: `docs/specs/MANAGED_HOSTING.md`
- Managed Hosting Pricing: `docs/specs/MANAGED_HOSTING_PRICING.md`
- Evaluation Mode & Self-Service Funnel: `docs/specs/EVALUATION_MODE.md`
- Launch Strategy & Pricing: `docs/specs/LAUNCH_STRATEGY.md`
- Invite-Based Growth: `docs/specs/INVITE_GROWTH.md`
- Info Website & Operator Landing Page: `docs/specs/INFO_WEBSITE.md`
- Waitlist Email Notifications: `docs/specs/WAITLIST.md`
- Waitlist Origin Tracking & Login Activity: `docs/specs/WAITLIST_TRACKING.md`

### Done (archived in `docs/specs/done/`)
- PM Features, Teams, Teams v2, Deployment/Monetization, DR/Backup, Wiki Collaboration, MCP Cross-Client, Application Security, SSL/TLS, MCP OAuth, Project Outline View, Horizons Guided Review, Help Docs, Beta Access Gate, Release Workflow, Keyboard Shortcuts, Wiki Scalability (Phases 1-3), Public REST API, Onboarding, MCP Teams, MCP Wiki, Account Deletion, Mobile Responsiveness (Phase 1), Mobile Responsiveness (Phase 2), Notifications & Reminders (Phases 1-3), Team Hierarchy v1.9, Event RSVP & Coordination, Share Target, Optimistic Concurrency Control, Organizational Structure Guide, Task Delegation, Decision Proposals, Bulk Operations, Undo, Quick Capture, Calendar/Time Blocking/Google Calendar Sync, Multi-Provider Calendar Sync, AI Weekly Review Coach, Natural Language Tasks, Insights Dashboard, Commitment Drift Dashboard, Email-to-Inbox Capture, Team Sync, Project Templates, Import/Export, OAuth-Only Auth, AI Project Scaffolding, Task History, Sub-Project Sequencing, Operator Support Link, Wiki Inline Editor, Mobile UI Adjustments, Admin Usage Dashboard, Terms & Privacy Pages, Contributing/Code of Conduct, Enhanced Velocity Chart, Focus Timer, Task Duration Tracking, Time Audit Challenge, Recurring Card File, Data Retention & Purge, External Links, GTD Education Popup

## Ops Guides
- Backup & Disaster Recovery (Setup, Restore, WAL/PITR, Off-Site): `docs/BACKUP_GUIDE.md`
- Multi-Instance Environment (Beta/Alpha/Production, Cloudflare Tunnel, Deploy Scripts, Migration Caveat): `docs/ops/ALPHA_ENVIRONMENT.md` (gitignored — contains deployment-specific details)
- Versioning & Release Process (Internal dev- Tags, Public Semver, VERSION_MAP, Release Script, Safety Checklist): `docs/VERSIONING_AND_RELEASE.md`
