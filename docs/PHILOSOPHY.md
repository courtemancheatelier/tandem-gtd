# Tandem — Philosophy & Narrative

**Date:** February 27, 2026
**Purpose:** Foundational narrative for marketing, community building, and the `/about` page
**Status:** Living document — refine as the story evolves

---

## The Core Belief

**You should own your productivity system the same way you used to own your software.**

There was a time when buying software meant it was yours. You installed it on your machine, your data lived on your disk, and no company could pull the rug out from under you by changing their pricing, shutting down, or deciding your workflow didn't fit their roadmap anymore.

That era ended gradually, then all at once. Today, your task list lives on someone else's server, governed by someone else's terms of service, and accessible only as long as you keep paying. Your productivity data — the map of everything you're responsible for, everything you're working toward — is held hostage by a subscription.

Tandem exists because that trade-off was never necessary.

---

## The Problem with Productivity Software

### The Methodology Gap

Most task management apps treat GTD as a feature checklist: contexts, projects, next actions — done. But they miss the deeper mechanics that make GTD actually work. The Weekly Review isn't a nice-to-have; it's the heartbeat of the system. The distinction between sequential and parallel projects isn't academic; it determines which tasks should be visible right now. The "What Should I Do Now?" decision framework — filtering by context, time available, energy, and priority — is the entire point, not a premium add-on.

When the methodology is diluted, the system stops being trusted. When the system stops being trusted, people stop using it. And then they blame themselves for lacking discipline, when the real failure was the tool.

### The Ownership Gap

Even the apps that get the methodology right lock your data behind their API. Want to leave? Export to CSV and lose all your project structure, context assignments, and history. Want to self-host? Not an option. Want to know exactly how your data is stored and who has access? Read the privacy policy (which can change at any time).

Your productivity data is deeply personal. It contains your commitments, your anxieties, your ambitions. It deserves the same respect as a journal — which is to say, it should be entirely under your control.

### The Integration Gap

The rise of AI assistants has created a new problem: context switching. You're in a conversation with Claude or ChatGPT, thinking through a problem, and you realize you need to capture a task or check your project list. So you leave the conversation, open your task app, do the thing, and come back — having lost the thread of your thinking.

Productivity tools should meet you where you already are, not demand that you come to them.

---

## What Tandem Does Differently

### Faithful GTD Implementation

Tandem doesn't adapt GTD to fit a simpler UI. It implements the full methodology:

- **The Cascade Engine** automatically promotes the next task when you complete one in a sequential project, marks projects complete when all tasks are done, and updates goal progress when projects finish. The system does the bookkeeping so you can focus on the work.

- **Guided Weekly Reviews** turn the most important (and most skipped) GTD practice into a structured workflow. Not a checklist you ignore, but a step-by-step process that walks you through every inbox item, every active project, every waiting-for, every someday/maybe. You can't half-do it.

- **"What Should I Do Now?"** implements David Allen's four-criteria decision model: context, time available, energy level, priority. Instead of staring at a flat list of 200 tasks, you tell the system where you are and how you're feeling, and it shows you what makes sense right now.

- **Horizons of Focus** connects your daily tasks through projects, areas of responsibility, goals, vision, and purpose. Most apps stop at projects. Tandem goes all the way up to the 50,000-foot view because that's what GTD actually calls for.

### True Data Ownership

Tandem is open source under the AGPL license. The entire codebase is available for inspection, modification, and self-hosting. This isn't open-core with the good parts behind a paywall — it's the whole thing.

Every user can export their complete data at any time. Every admin can back up, restore, and migrate their instance without asking permission. The Docker deployment is a single command. If the managed hosting service disappeared tomorrow, every user's data would still be accessible and every self-hosted instance would keep running.

This is a deliberate architectural choice, not a marketing angle. When your data can leave at any time, the only way to keep users is to be genuinely useful. That's the accountability structure we want.

### AI Integration Without Lock-In

Tandem's MCP (Model Context Protocol) server lets you manage your tasks and projects from inside any compatible AI assistant — Claude, ChatGPT, and whatever comes next. You don't need a separate "AI features" subscription. You don't need to give Tandem your API keys. Your existing AI subscription works with your existing Tandem instance, at zero additional cost.

This is possible because Tandem treats AI as an integration layer, not a profit center. The MCP server exposes the same capabilities as the web UI: capture to inbox, process items, create tasks and projects, run your weekly review, ask "what should I do now?" It meets you where you're already thinking.

---

## The Federated Model

### Software for Communities, Not Markets

Traditional SaaS scales by acquiring millions of individual customers through aggressive marketing. That model works for the companies that win, but it turns software development into a marketing operation. The product becomes secondary to the growth machine.

Tandem takes a different path. Instead of one company running one giant instance for millions of users, Tandem is designed so that technically capable people can run instances for their natural communities — friend groups, families, small organizations, local nonprofits, teams.

This isn't a compromise. It's a better model for productivity software specifically, because:

- **Trust is personal.** You trust a GTD system more when it's run by someone you know, not a faceless company that might pivot to enterprise or get acquired.
- **Community servers stay small.** A friend group of 15 people doesn't need 99.999% uptime SLAs or a 24/7 SOC. It needs reliable backups, sensible security, and someone who answers when something breaks.
- **Growth happens through replication, not scale.** When someone loves Tandem, they don't just tell friends to sign up — they might spin up their own instance. Each new server is independently operated, independently backed up, and independently owned.

### Managed Hosting as Operational Relief

For communities that don't have a sysadmin friend, managed hosting eliminates the operational burden: automatic updates, seamless database migrations, tested backups, monitored uptime. The value isn't the initial setup — that's a one-time event. The value is never having to think about security patches, PostgreSQL upgrades, or what happens when the VPS disk fills up at 3 AM.

The managed hosting service and the self-hosted open-source version are identical software. There is no "enterprise edition" with features held back. You're paying for ops, not for features.

### The Inverted Pricing Model

Per-seat pricing is the dominant model in productivity software. It made sense when each user consumed meaningful server resources. It hasn't reflected reality for over a decade — but it persists because it's profitable, not because it's honest.

A dedicated server running a GTD application costs the same whether 20 or 500 people use it. The marginal cost of an additional user is effectively zero. Per-seat vendors know this; they charge per seat because the market tolerates it.

Tandem prices based on what things actually cost: a flat fee per community instance, regardless of how many people use it. This creates an inverted incentive structure. With per-seat tools, every new user increases the bill — so organizations resist adding people. With Tandem, every new user makes the per-person cost cheaper — so organizations are incentivized to include everyone.

This isn't a loss-leader strategy or a race to the bottom. The margins are healthy because the infrastructure costs are low relative to the value delivered. It's simply pricing that reflects the actual economics of running software in 2026 — something the industry has conspicuously avoided doing.

### Nonprofits as the Seed

Tandem offers a 50% discount for nonprofit organizations — not as charity, but as strategy rooted in conviction. Nonprofits are communities of people who care deeply about doing things right with limited resources. They're exactly the audience that feels Tandem's philosophy most viscerally: flat pricing that doesn't punish you for adding volunteers, data you own and can take with you, transparent operations with tested backups.

And nonprofit people don't stay in one place. Board terms end. Volunteers rotate. Staff move on. Every person who uses Tandem at a nonprofit and then joins a company using per-seat tools experiences the contrast firsthand. That's not marketing — it's lived experience, and it's the most powerful form of advocacy there is.

---

## Trust Through Transparency

### Open Source as Accountability

When the code is public, security claims are verifiable. Anyone can audit how data is stored, how authentication works, how backups are performed. This is a fundamentally different trust model than "we passed an audit" — it's "here's the code, see for yourself."

### Tested Disaster Recovery

Tandem runs quarterly disaster recovery drills on managed hosting instances. Not theoretical recovery plans — actual end-to-end tests: provision a new server, restore from off-site backups, verify data integrity, document the results. The drill logs are available to customers.

This practice comes from experience. When you've been the person delivering the news that terabytes of data are gone because nobody tested the backups, you build systems differently. You test the restore, not just the backup.

### Security Posture

Tandem's managed hosting runs on OVHcloud infrastructure, which maintains SOC 2 Type 2 attestation, ISO 27001 certification, and GDPR compliance. Backups are encrypted and stored off-site with a separate provider. All traffic is encrypted in transit via TLS. There are no third-party analytics, no ad trackers, no data sharing.

For self-hosters, the same security primitives are available: the backup scripts, the Docker configuration with security headers, the Caddy reverse proxy with automatic SSL. The documentation covers what we do and why, so self-hosters can make informed decisions about their own deployments.

---

## Who Tandem Is For

### The Individual Who's Tried Everything

You've bounced between every task management app on the market. Some were close but none of them implemented GTD faithfully enough to earn your trust. You want a system that takes the methodology seriously — all of it, including the parts that are hard to build — so you can stop managing your system and start doing your work.

### The Community Organizer

You run a nonprofit board, a volunteer group, a community garden committee. You need shared projects and task delegation, but you don't need enterprise project management software. You want something your people can actually use without a training session, something that respects that everyone's volunteering their time. And you're tired of watching your budget bleed $11/seat/month for tools half your people never log into.

### The Technical Idealist

You believe in software freedom, data ownership, and the right to self-host. You're tired of vendor lock-in, subscription fatigue, and the creeping enclosure of tools that used to respect their users. You want productivity software that aligns with your values.

### The Small Team That Doesn't Want to Become an Enterprise

You're 5-15 people who need to collaborate on projects without adopting a tool designed for 5,000-person organizations. You want the GTD methodology applied to team work — shared projects with cascading next actions, clear delegation, and a unified view that shows both personal and team tasks without requiring separate "workspaces."

---

## The Name

**Tandem** — working together, in partnership. A tandem bicycle requires coordination and trust between riders. Neither rider can see everything the other sees, but they share the same vehicle and the same destination.

This captures the relationship between you and your productivity system, between team members on shared projects, and between the person running a community server and the people who trust it with their data.

---

## The Story in One Paragraph

Tandem is an open-source GTD application that takes both the methodology and your data ownership seriously. It implements the full Getting Things Done framework — including the cascade engine that automates next-action promotion, guided weekly reviews, and the four-criteria "What Should I Do Now?" decision model — while giving you complete control over your data through self-hosting, full export, and transparent operations. Built for individuals and small communities rather than enterprise markets, Tandem represents a return to the era when you owned your software and your data, updated for a world where AI assistants are part of how you think and work.

---

## Voice & Tone Guidelines

When writing about Tandem — in docs, marketing, community posts, or changelogs — keep these principles in mind:

- **Confident without being aggressive.** We're not attacking other tools. We're offering an alternative for people who want something different. Let the philosophy speak for itself.
- **Never name competitors in public.** No "unlike Asana" or "better than Todoist." Talk about what Tandem does and what it costs. People will compare on their own — and the conclusion is more persuasive when they reach it themselves. Competitive analysis stays internal.
- **Honest about trade-offs.** Self-hosting requires effort. The federated model means no single massive community. GTD itself has a learning curve. Acknowledge these openly — it builds more trust than pretending they don't exist.
- **Technical when it matters, human when it counts.** The spec docs are precise. The marketing is warm. The security page is factual. Match the register to the context.
- **Show the scar tissue.** The backup story is more compelling when you mention that it comes from delivering bad news about lost data. The methodology decisions are more credible when you explain the GTD failures that informed them. Experience is the differentiator — don't hide it.
- **Respect the reader's intelligence.** Don't oversimplify. The people drawn to Tandem's philosophy are people who think carefully about their tools. Write for them.

---

## Key Phrases & Messaging

Use when the phrasing fits naturally. Don't force them into every conversation.

- "Own your productivity data."
- "The methodology is the product."
- "Backups you don't test are backups you don't have."
- "Software for communities, not markets."
- "Growth through replication, not scale."
- "Their price goes up with every user. Ours goes down."
- "AI integration at zero additional cost."
- "No enterprise edition. No features held back."
- "Trust is personal."
- "We test the restore, not just the backup."
- "We price based on what things actually cost."

---

*This document captures the philosophical foundation as of early 2026. The narrative will evolve as the community grows and real users tell us what resonates. Update it, but don't lose the core.*
