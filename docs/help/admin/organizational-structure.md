---
title: Organizational Structure Guide
category: Admin
tags: [admin, teams, hierarchy, structure, projects, organization, setup]
sortOrder: 2
adminOnly: true
---

# Organizational Structure Guide

This guide walks you through setting up teams, child teams, and projects in Tandem. Whether you're a small friend group or a multi-department organization, the same building blocks apply.

---

## Core Idea: Teams vs Projects

Tandem has two organizational layers:

| Concept | What it is | Examples |
|---------|-----------|----------|
| **Team** | A group of people who work together | "Board of Directors", "Marketing", "Dance Instructors" |
| **Project** | A multi-step outcome with tasks | "Plan Spring Gala", "Redesign Landing Page", "Prepare Tax Filing" |

**Teams hold people. Projects hold work.** A project is always owned by a team, and everyone on that team can see the project's tasks, threads, and decisions.

---

## When You Need More Than One Team

A single team works fine when everyone sees everything. You need multiple teams when different groups of people should see different projects.

### Do: Create separate teams when

- **Different people need different access** — The board shouldn't see day-to-day volunteer tasks, and volunteers don't need board meeting agendas.
- **You have distinct working groups** — Marketing and Engineering have their own projects and don't need to see each other's task lists.
- **Privacy matters** — HR projects with sensitive information should only be visible to HR staff.

### Don't: Create separate teams when

- **Everyone sees everything anyway** — If all five of you work on all the same projects, one team is simpler.
- **You just want to categorize projects** — Use project names or areas of focus instead of creating teams.
- **You want per-project permissions** — Every project in a team is visible to all members. If that's fine, one team works.

---

## Parent & Child Teams

Teams can be nested. A **parent team** sits above one or more **child teams**, forming a hierarchy.

```
Org (parent)
├── Board (child)
├── Programs (child)
│   ├── Youth Programs (grandchild)
│   └── Adult Programs (grandchild)
└── Operations (child)
```

### How Membership Works

- **Downward inheritance** — Members of a parent team can see projects in all child teams below them.
- **No upward access** — Members of a child team cannot see parent team projects unless they are also members of the parent.
- **Admin inheritance** — Admins of a parent team are automatically admins of all child teams.

### Practical Effect

If you add someone to the top-level "Org" team, they can see projects in Board, Programs, Youth Programs, Adult Programs, and Operations. If you add someone only to "Youth Programs", they see only Youth Programs projects.

This means your **org-wide leader** joins the top team, while **specialists** join only the teams they need.

---

## Step-by-Step Setup

### 1. Plan Your Structure

Before creating anything, sketch out:
- Who are the groups of people?
- What projects does each group own?
- Who needs to see what?

### 2. Create the Top-Level Team

1. Go to **Teams** in the sidebar
2. Click **Create Team**
3. Enter the team name (e.g., your organization name)
4. Add a description and pick an icon
5. You're automatically the admin

### 3. Create Child Teams

1. Open your top-level team
2. Click **Create Child Team**
3. Name it after the department, committee, or working group
4. Repeat for each group that needs its own set of projects

### 4. Add Members

For each team:
1. Go to the team's **Members** tab
2. Click **Add Member**
3. Select users from your Tandem instance
4. Set their role: **Admin** or **Member**

**Tip:** Add leaders to the parent team so they inherit access to all child teams. Add everyone else only to the specific teams they belong to.

### 5. Create or Assign Projects

For each team:
1. Go to the team's **Projects** tab
2. **Add Existing** to move a personal project into the team, or
3. **New Project** to create one directly under the team
4. Enable collaboration features (Threads, Decisions, Completion Notes) as needed

---

## Common Setups

### Nonprofit Organization

```
Riverdale Community Center
├── Board of Directors
│   └── Projects: Strategic Plan 2026, Bylaw Revision
├── Programs
│   ├── Youth Programs
│   │   └── Projects: Summer Camp, After-School Tutoring
│   └── Adult Programs
│       └── Projects: Job Skills Workshop, ESL Classes
├── Fundraising
│   └── Projects: Spring Gala, Grant Applications
└── Operations
    └── Projects: Building Maintenance, Volunteer Onboarding
```

- The **Executive Director** joins "Riverdale Community Center" (top level) → sees everything
- **Board members** join "Board of Directors" → see only board projects
- **Youth Program staff** join "Youth Programs" → see only youth projects
- The **Programs Director** joins "Programs" → sees both Youth and Adult projects

### Small Company

```
Acme Co
├── Engineering
│   └── Projects: API v3, Mobile App, Infrastructure
├── Marketing
│   └── Projects: Q2 Campaign, Blog Relaunch
└── Operations
    └── Projects: Office Move, Hiring Pipeline
```

- **CEO** joins "Acme Co" → sees everything
- **Engineers** join "Engineering" → see only engineering projects
- **Marketing team** joins "Marketing" → see only marketing projects

### Community Group or Club

```
Downtown Dance Studio
├── Instructors
│   └── Projects: Spring Recital, New Class Curriculum
├── Admin Staff
│   └── Projects: Registration System, Studio Renovations
└── Competition Team
    └── Projects: Regional Comp Prep, Costume Orders
```

- **Studio Owner** joins "Downtown Dance Studio" → sees everything
- **Instructors** join "Instructors" → see class and recital planning
- **Competition coaches** join "Competition Team" → see competition-specific projects

### Flat Friend Group

No hierarchy needed. Just create one team, add everyone, and put all projects in it.

```
Weekend Warriors (single team)
└── Projects: Camping Trip, Book Club, Game Night Rotation
```

---

## FAQ

**Can a person be on multiple teams?**
Yes. A user can belong to as many teams as needed. They see the union of all projects across their teams.

**Can a project belong to multiple teams?**
No. Each project belongs to exactly one team. If two teams need to collaborate on the same work, consider creating a shared parent team or restructuring.

**What happens if I move a project to a different team?**
The project becomes visible to the new team's members and invisible to the old team's members (unless they also belong to the new team or a parent of it).

**How deep can the hierarchy go?**
Tandem supports up to 5 levels of nesting, but in practice 2–3 levels cover most organizations.

**Can a child team have members who aren't on the parent team?**
Yes. Child teams can have their own members independently. Those members only see the child team's projects, not the parent's.

**What's the difference between team Admin and Member roles?**
Admins can manage team settings, add/remove members, create child teams, and toggle project features. Members can view projects, participate in threads and decisions, and complete tasks.

---

## Quick Reference

| Want to... | Do this |
|-----------|---------|
| Give someone access to everything | Add them to the top-level parent team |
| Limit someone to one department | Add them only to that department's team |
| Let a manager see their reports' work | Add them to the parent team above those child teams |
| Share a project with the whole org | Put it in the top-level team |
| Keep a project private to a small group | Put it in a child team with only those members |
| Reorganize teams later | Move projects between teams and adjust membership — no data is lost |

---

## See Also

- [[teams-and-collaboration|Teams & Collaboration]] — threads, decisions, and collaboration features
- [[welcome|Welcome to Tandem]] — getting started overview
