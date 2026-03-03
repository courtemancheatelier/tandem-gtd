---
title: Roadmap — Where Tandem Is Headed
category: About
tags: [about, roadmap, upcoming, features]
sortOrder: 2
---

# Roadmap — Where Tandem Is Headed

Tandem is in active beta heading toward its first public release. The core GTD system is complete — inbox, projects, next-action cascading, contexts, Weekly Review, Horizons of Focus, AI integration, team collaboration, recurring tasks, project templates, and a full REST API all work today.

Here's what we're building next and where we're headed long-term.

---

## Coming Soon: Public Release (v1.8)

We're wrapping up the last items before Tandem's first public release on GitHub.

- **Setup experience** ✅ — making sure anyone can clone the repo and get Tandem running on their own server in minutes, with clear documentation and a tested setup script
- **First public release** — tagging v1.8.0, publishing to GitHub, and opening Tandem up to the self-hosting community

---

## Next: Polish, Integrations & Communication (v1.9)

The next major release covers four themes: making the mobile experience feel native, connecting to external tools, enriching team collaboration, and helping you understand where your time goes.

### Mobile & Polish

**Mobile Polish** — swipe-to-complete on task cards, pull-to-refresh on lists, haptic feedback on actions, and better offline indicators. Small touches that make Tandem feel right on a phone.

**Expanded Team Icons** ✅ — expanded from 37 to 92 curated Lucide icons across 7 categories (business, tech, creative, nature, people, sports, objects) with a search filter in the picker popover.

**Contextual Help Links** ✅ — HelpCircle icons next to page titles across 17 GTD pages, linking directly to the relevant help article for in-context documentation.

### Integrations

**Calendar & Google Calendar Sync** — native calendar events inside Tandem for your "hard landscape" — appointments, meetings, deadlines that have a specific time. Bidirectional sync with Google Calendar so changes flow both ways. Time blocking UI to plan your day around your calendar and your task list.

**Email-to-Inbox Capture** — a dedicated email address for your Tandem inbox. Forward any email to it and it shows up as an inbox item, ready to process during your next inbox sweep. Great for capturing things from your phone or from other people.

### Team & Communication

**Team Sync** — work-anchored communication that doesn't turn into a chat app. Three layers: add optional notes when you complete or update a task (so teammates see context, not just a status change), start focused threads on specific tasks or projects (with @-mentions that create inbox items for the other person), and structured decision requests with votes and deadlines. Everything resolves through GTD flows — no endless chat threads.

**Cross-Instance Federation** — the big one for privacy-conscious teams. Two people on separate Tandem servers can pair their instances using an invite code and collaborate on shared projects — while each person's personal data (inbox, projects, horizons, weekly review) stays on their own machine. Your GTD system lives on your server. Team projects sync between instances automatically. If one server goes down, the other keeps working with its local copy.

### Time & Focus

**Focus Timer** — a gentle, opt-in timer you can start when you sit down to work on a task. It floats as a small pill in the corner of your screen — no pressure, no gamification. Pause and resume as needed. When you complete the task, Tandem records how long you actually spent. Over time, this helps you get better at estimating.

**Task Duration Tracking** — when you complete a task, Tandem asks "How long did this actually take?" with quick-tap options relative to your estimate (half, about right, double, custom). This builds an estimation accuracy dashboard so you can see whether you tend to underestimate certain types of work — and by how much.

**Time Audit Challenge** — a one-week awareness exercise to track where your time goes, inspired by [Alex Hormozi's 15-minute time tracking method](https://podcasts.apple.com/de/podcast/the-man-that-makes-millionaires-turn-%24100-to-%2410k/id1291423644?i=1000691729705). Every 15 minutes, Tandem nudges you to tag what you're doing (productive, reactive, maintenance, or untracked). At the end of the week, you get a simple report showing how your actual time maps to your GTD system. No judgment — just awareness.

---

## Then: Growth (v2.0+)

### Decision Proposals

A full PR-style async decision workflow for teams. Named options with structured voting, a research and contribution phase, wiki auto-update on resolution, decision templates (quick poll, approval request, ranked choice), and a dedicated audit trail. Richer governance for teams that need structured decision-making.

### Big Vision

**Agentic GTD** — an AI layer that learns your patterns over time and starts shouldering the overhead of GTD maintenance. Built on a trust model inspired by Argentine tango: the AI starts by suggesting ("you might want to move this to a project"), graduates to queuing suggestions for one-tap approval, and eventually handles routine actions automatically — but only after it's earned your trust through accuracy. The goal: you focus on decisions, the AI handles the bookkeeping.

**Custom Classification Model** — a purpose-built model trained on GTD patterns (inbox classification, context prediction, energy and time estimation) that runs locally on your server. Your data never leaves your machine. Starts as a layer on top of Claude's API, then evaluates whether a custom model outperforms general-purpose AI for these specific tasks.

**Volunteer & Nonprofit Support** — a simplified experience for organizations with casual contributors — people who check in weekly, not daily. Volunteer onboarding flow, guided org setup, board governance reports, and project templates for common nonprofit workflows.

---

## Longer Term: Ecosystem (v2.5+)

- **Support & ticketing** — in-app help widget, GitHub Issues routing, billing integration
- **Managed hosting pipeline** — fully automated provisioning so operators can offer Tandem as a hosted service with zero manual setup
- **Offline write queue** — queue changes when offline, sync when reconnected
- **Workload / capacity view** — energy map and context balance to visualize your capacity

---

## Our Approach to Prioritization

Features ship in the order that makes Tandem more trustworthy as a daily-driver GTD system. If a feature doesn't trace back to the GTD methodology or to self-hosted ownership, it goes to the bottom of the list.

We don't chase trends or add features for the sake of a longer list. The goal is the best GTD app, not the most features.

---

*This roadmap reflects current plans and may shift as we learn from beta users. Have a feature request? We'd love to hear it.*
