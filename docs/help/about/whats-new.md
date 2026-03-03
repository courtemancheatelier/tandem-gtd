---
title: What's New
category: About
tags: [about, changelog, releases, features]
sortOrder: 1
---

# What's New

A summary of recent features and improvements. Tandem is in active development — new capabilities ship regularly.

## March 2026

### Recurring Task Card File

A SHE-inspired Card File system for recurring tasks. Create templates for things like "Clean the fridge" or "Water the plants" with any frequency (daily, weekly, monthly, yearly, or every N days). When you complete a recurring task, the next one generates automatically.

Color-coded cards with defer, skip, and complete actions. Skip streak tracking prevents skipping the same task more than twice in a row. Template packs ("Running a House" and "Small Garden") give you a head start. A new **Source filter** on Do Now lets you see just Card File tasks or just regular tasks.

### Data Retention & Purge

Automated cleanup for completed projects. After a configurable retention period (default 180 days), Tandem exports the project data (encrypted), then removes it. Per-project exemptions, grace period notifications, and admin controls. Your active work stays untouched — this only cleans up finished projects that have been sitting idle.

### Dashboard Restructure

The dashboard got a full GTD-focused redesign with four collapsible sections: **GTD Health** (inbox zero, review streak, stuck projects), **Horizon Alignment** (area and goal coverage with orphan detection), **Needs Attention** (stuck projects with inline fix, waiting-for summary), and **Performance** (burn-down, velocity charts). Project health cards now have color filters (red/yellow/green) and a "Show more" toggle.

### Project Charts

- **Burn-up chart** — shows total scope vs. completed work over time, revealing scope creep that burn-down charts hide
- **Enhanced velocity chart** — per-project unit selection (tasks vs. hours), configurable lookback windows, scope change annotations, and trend indicators
- **Flow page charts** — the Flow page now has the same full chart suite as the project detail page

### Project Templates

Five built-in templates (Plan a Trip, Hire Someone, Launch a Product, Move Apartments, Weekly Grocery Run) with variable substitution — enter "Japan" and every task title updates automatically. Save any of your own projects as a reusable template. Sub-project support included.

### Wiki Inline Editor

A full WYSIWYG editor replacing the raw markdown textarea. Formatting toolbar, slash commands (`/`), bubble menu on text selection, `[[wiki link]]` autocomplete with live search, visual table editing, and task list checkboxes. Toggle to source view anytime. Markdown stays the storage format — your existing content works unchanged.

### UX Polish

- Clickable metadata badges on Do Now (tap a context, energy, or time badge to filter by it)
- Projects page sort dropdown (newest, oldest, name)
- Compact project detail page with tighter spacing
- Outline page filter compaction with single expand/collapse toggle
- Responsive project header (buttons wrap on narrow screens)

### Mobile UX (Phase 2)

- Collapsible bottom filter tray on Do Now, Projects, and Outline pages
- Customizable bottom toolbar — choose up to 6 nav items and reorder them in Settings
- Bulk action bar wraps to two rows on mobile for easier thumb reach
- Keyboard-aware hiding so the nav doesn't cover your input

### Admin & Ops

- **Login tracking** — admin User Management table now shows a "Last Login" column with badges (Never logged in / Inactive / active), login count in tooltips
- **Trial mode** — time-limited accounts for evaluation, with configurable duration, countdown banner, and anti-gaming protections
- **Docker self-hosting** — verified end-to-end Docker Compose + Caddy deployment
- **API documentation** — interactive OpenAPI docs at `/api-docs` covering all 117 endpoints
- **Terms & Privacy pages** — `/terms` and `/privacy` public pages (required by OAuth providers)

### Insights Reorganization

The Insights page was restructured into three collapsible GTD-flow sections: Capture & Process, Getting Things Done, and Efficiency. Pending inbox count now links directly to your inbox.

---

## February 2026

### Invite-Based Growth & Waitlist

User tiers (Alpha, Beta, General), invite codes with referral tracking, and domain whitelists for organizations. Four registration modes: Closed, Waitlist, Invite Only, and Open. Admin growth dashboard shows the invite chain. Waitlist email notifications with SMTP configuration and customizable templates.

### Info Website & Branding

Public landing page so visitors learn about your Tandem instance before seeing a login screen. Flagship marketing site for tandemgtd.com with email capture. Operator-customizable branding (name, logo, accent color, hero content). Optional support/donation link.

### OAuth Expansion

Added GitHub and Microsoft (Entra ID) OAuth providers alongside Google and Apple. Admin auth mode toggle lets you go OAuth-only (hiding the password login form) or keep both. Linked accounts page for users to manage their OAuth connections.

### Import & Export

JSON and CSV export of your full dataset. Import from Todoist, Things, or generic CSV with column mapping. Admin server backup and restore.

### AI Weekly Review Coach

An AI assistant embedded in the Weekly Review wizard. It surfaces stale projects, suggests cleanups, and generates a review summary you can edit and save. Phase-specific prompts for Get Clear, Get Current, and Get Creative.

### History & Analytics

Task history timeline on every task card showing all changes. Activity feed page with source filter tabs. Insights page with 7 chart widgets covering throughput, cycle time, context/energy breakdown, and inbox funnel. JSON/CSV event history export.

### Status Circles & Bulk Actions

Tasks display a **3-state status circle** — Not Started, In Progress, Completed — that cycles on click. Bulk actions let you multi-select tasks and batch-update context, energy, time, status, or delete.

### Sub-Project Sequencing

Parent projects control when child projects activate. Sequential parents unlock sub-projects one at a time. The cascade engine handles promotion automatically.

### Notifications (Phase 2)

Daily digest (push + email), email notification preferences, digest suppresses individual push when active. Timezone-aware scheduling.

### Infrastructure

- Public REST API with bearer token auth, scopes, and rate limiting (117 endpoints)
- Account self-deletion with email confirmation
- Mobile navigation — bottom tab bar, nav drawer, responsive dialogs
- MCP wiki, team, and task CRUD tools for Claude and ChatGPT
- AI project scaffolding with smart task ordering

### Onboarding

A 6-step guided wizard for new users: brain dump, process your first inbox item, set up contexts, create areas of responsibility. No more blank-screen confusion.

### Wiki Scalability

Cursor pagination, PostgreSQL full-text search, indexed backlinks, and search result snippets for large knowledge bases.

### MCP OAuth 2.1

Claude.ai and ChatGPT connect to Tandem via standard OAuth — no API keys needed. Add your server URL as an MCP integration, authorize, and go.

### Beta Access Gate

Registration set to waitlist mode. New signups queue for admin approval, giving operators control over who gets access during beta.
