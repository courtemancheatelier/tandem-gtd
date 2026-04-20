---
title: Roadmap — Where Tandem Is Headed
category: About
tags: [about, roadmap, upcoming, features]
sortOrder: 2
---

# Roadmap — Where Tandem Is Headed

Tandem is in active development with its first public release (v1.8) already shipped. The core GTD system is complete — inbox, projects, next-action cascading, contexts, Weekly Review, Horizons of Focus, AI integration, team collaboration, recurring tasks, routines, project templates, calendar sync, and a full REST API all work today.

Here's what we're building next and where we're headed long-term.

---

## Current: v1.9 — Card Files, Routines & Communication

v1.9 is feature-complete and in final testing.

### Shipped

- **Routine Cards** — supplement, medication, spiritual practice, and recurring regimen tracking with time-of-day windows, per-item check-off, partial completion, dynamic dosing with ramp schedules, and a compliance dashboard
- **Card File Improvements** — timezone-aware scheduling, progression tracking, time-of-day ordering, improved empty state UX
- **Calendar Enhancements** — custom event colors, project start/end dates
- **External Links** — URL field on projects and tasks for linking to GitHub, Figma, Google Docs, etc.
- **Commitment Drift Dashboard** — deferral patterns, area drift scores, time-of-day heatmaps, displacement lens, outcome summary
- **Admin Usage Dashboard** — per-user adoption metrics, engagement badges, inbox processing signals, setup depth
- **Settings Reorganization** — new Card Files tab grouping recurring templates and routines
- **Decision Proposals (Phase 1)** — APPROVAL and POLL decision types with named options and proportional vote bars, deadlines with auto-expiry, wiki auto-update on resolution, decision detail page, task-anchored decisions from project UI, full MCP tool support, push + in-app notifications
- **Decision Proposals (Phase 2)** — QUICK_POLL type with auto-resolve when all votes are in, task auto-generation for decision respondents (shows in their Do Now), contributions model for freeform research/analysis, deadline reminder notifications
- **Team Collaboration** — enriched events with reassignment/status notes, team activity filters, thread search in Cmd+K, weekly review integration (open threads, pending decisions, stale detection), push notification preferences
- **OpenAPI Expansion** — thread, decision, and team activity endpoints (now 148 paths)
- **Focus Timer** — opt-in floating timer pill with pause/resume, cumulative sessions per task, 4-hour runaway detection, recorded on task completion
- **Task Duration Tracking** — "How long did this actually take?" prompt on completion with quick-tap options, auto-fill from timer sessions
- **Estimation Accuracy Dashboard** — insights widget showing accuracy score, distribution chart, weekly trend, breakdown by estimate size
- **Time Audit Challenge** — one-day awareness exercise tracking time in 15-minute intervals, quick tags, GTD alignment score, energy map
- **Time Blocking** — drag tasks from Do Now onto the calendar, drag-to-move and drag-to-resize with 15-minute snap grid
- **Microsoft Outlook/365 Calendar Sync** — bidirectional sync via Microsoft Graph API, OAuth with calendar scopes, calendar selector, settings UI mirroring Google Calendar
- **Mobile Polish** — swipe-to-complete on task cards, pull-to-refresh on lists, haptic feedback, offline connectivity indicator
- **Email-to-Inbox Capture** — per-user inbox email address, forward any email to capture as an inbox item, Cloudflare Email Worker, settings UI with copy/regenerate

---

## Next: v2.0 — Community & Governance

**Volunteer & Nonprofit Support** — a simplified experience for organizations with casual contributors — people who check in weekly, not daily. Volunteer onboarding flow, guided org setup, board governance reports, and project templates for common nonprofit workflows.

---

## v2.1 — Federation

**Cross-Instance Federation** — the big one for privacy-conscious teams. Two people on separate Tandem servers can pair their instances using an invite code and collaborate on shared projects — while each person's personal data (inbox, projects, horizons, weekly review) stays on their own machine. Your GTD system lives on your server. Team projects sync between instances automatically. If one server goes down, the other keeps working with its local copy.

---

## v2.2 — Agentic AI

**Agentic GTD** — an AI layer that learns your patterns over time and starts shouldering the overhead of GTD maintenance. Built on a trust model inspired by Argentine tango: the AI starts by suggesting ("you might want to move this to a project"), graduates to queuing suggestions for one-tap approval, and eventually handles routine actions automatically — but only after it's earned your trust through accuracy. The goal: you focus on decisions, the AI handles the bookkeeping.

**Local Model Infrastructure** — run AI locally on your server with Ollama and open models. Agent task tiers route simple operations to lightweight models and complex reasoning to capable ones. Your data never leaves your machine.

**Custom Classification Model** — a purpose-built model trained on GTD patterns (inbox classification, context prediction, energy and time estimation) that runs locally. Starts as a layer on top of Claude's API, then evaluates whether a custom model outperforms general-purpose AI for these specific tasks.

**Multi-AI Provider** — bring your own AI provider. OpenAI, Google Gemini, or Anthropic — provider abstraction with per-user provider choice.

---

## Future

- **Support & ticketing** — in-app help widget, GitHub Issues routing, billing integration
- **Managed hosting pipeline** — fully automated provisioning so operators can offer Tandem as a hosted service with zero manual setup
- **Offline write queue** — queue changes when offline, sync when reconnected
- **Workload / capacity view** — energy map and context balance to visualize your capacity

---

## Our Approach to Prioritization

Features ship in the order that makes Tandem more trustworthy as a daily-driver GTD system. If a feature doesn't trace back to the GTD methodology or to self-hosted ownership, it goes to the bottom of the list.

We don't chase trends or add features for the sake of a longer list. The goal is the best GTD app, not the most features.

---

*This roadmap reflects current plans and may shift as we learn from users. Have a feature request? We'd love to hear it.*
