# Organizing Your Team in Tandem

**Who this is for:** Administrators setting up Tandem for a group, organization, or company.

---

## The Core Idea

Tandem uses two layers to organize collaborative work:

- **Teams** — the people. Who belongs to this group?
- **Projects** — the work. What is this group trying to accomplish?

A team can have many projects running at the same time. Projects belong to a team, not the other way around. This keeps your organizational structure (who works together) separate from your work structure (what you're working on).

---

## When You Need More Than One Team

If your organization has distinct groups that work independently — departments, committees, subgroups, chapters — each of those groups should be its own team.

**Don't do this:**
```
One big team: "Acme Corp"
  └─ One big project: "All Company Work"
       ├─ Sub-project: Engineering stuff
       └─ Sub-project: Marketing stuff
```

**Do this instead:**
```
Parent team: "Acme Corp"
  ├─ Child team: "Engineering"
  │    ├─ Project: API Redesign
  │    └─ Project: Bug Backlog
  └─ Child team: "Marketing"
       ├─ Project: Q2 Campaign
       └─ Project: Website Refresh
```

The first approach collapses everything into one place and quickly becomes unmanageable. The second approach gives each group their own space while keeping them connected under a shared parent.

---

## How the Structure Works

### Parent Teams (the organization level)

A parent team represents the whole organization or a major division. Think of it as the umbrella. Members you add here are typically leadership or people who need visibility across the entire organization.

Examples of parent teams:
- A nonprofit's board ("Habitat for Humanity — Local Chapter")
- A company's top-level org ("Acme Corp")
- A community organization ("Buenos Aires Tango Community")
- A friend or family group that runs multiple initiatives ("The Martinez Family")

### Child Teams (the department or group level)

A child team belongs to a parent team and represents a specific department, committee, or working group. Each child team has its own members, its own projects, and its own focus.

Examples of child teams under a parent:
- "Engineering", "Marketing", "Operations" — under a company
- "Build Committee", "Fundraising", "Outreach" — under a nonprofit
- "Milonga Planning", "Workshop Series" — under a tango community
- "House Projects", "Shared Finances" — under a family group

### Projects (the work)

Once your teams are set up, projects live inside teams. A project is one specific outcome your team is working toward — not a container for everything the team does.

Good projects:
- "Spring Fundraising Gala" ✓
- "API v2 Launch" ✓
- "New Member Onboarding Process" ✓

Too broad to be a single project:
- "All of Marketing's Work" ✗
- "Engineering Backlog" ✗ (use multiple focused projects instead)

---

## Step-by-Step Setup

### Step 1: Create your parent team

This is your organization's top-level presence in Tandem. Give it your organization's name. Add the people who need visibility across the whole organization (leadership, coordinators, etc.).

1. Go to **Teams** in the sidebar
2. Click **+ New Team**
3. Name it after your organization
4. Leave "This group belongs to..." blank — this is a top-level team
5. Add members and assign any leadership roles

### Step 2: Create child teams for each department or group

For each distinct working group in your organization, create a child team under the parent.

1. From the parent team dashboard, click **+ Add Group**
2. Name it after the department or working group
3. Add the members who work in that specific group
4. Repeat for each department or group

> **Note:** Being a member of a parent team does not automatically give someone access to child team projects. If someone needs to see a child team's work, add them to that child team directly.

### Step 3: Create projects inside each team

Now that your teams are structured, create projects where the actual work lives.

1. Navigate to the child team that owns the work
2. Click **+ New Project**
3. Name it after the specific outcome you're working toward
4. Add tasks and assign them to team members

Repeat for each project your team is running. There's no limit — a team can have as many active projects as it needs.

---

## Common Setups

### Small nonprofit (two-level structure)

```
Habitat for Humanity — Local Chapter   (parent team)
  ├─ Build Committee                   (child team)
  │    ├─ Project: Spring Build Weekend
  │    └─ Project: Volunteer Coordination
  ├─ Fundraising Committee             (child team)
  │    ├─ Project: Annual Gala
  │    └─ Project: Grant Applications
  └─ Outreach                          (child team)
       └─ Project: Social Media Presence
```

**Who's in the parent team:** Chapter president, vice president — people who oversee everything.  
**Who's in each child team:** Only the people doing that committee's work.

---

### Small company (two-level structure)

```
Acme Corp                              (parent team)
  ├─ Engineering                       (child team)
  │    ├─ Project: API v2
  │    └─ Project: Performance Improvements
  ├─ Design                            (child team)
  │    └─ Project: Brand Refresh
  └─ Operations                        (child team)
       ├─ Project: Onboarding Overhaul
       └─ Project: Vendor Contracts
```

**Who's in the parent team:** CEO, COO, anyone who needs a bird's-eye view.  
**Who's in each child team:** The people doing the work in that department.

---

### Community or volunteer group (flat or simple structure)

Not every organization needs a parent/child structure. If you're a single group with no subgroups, one team with multiple projects is all you need.

```
Camping Crew                           (single team, no children)
  ├─ Project: August Trip
  └─ Project: Gear Inventory
```

Add the parent/child structure only when you have genuinely separate groups that should manage their own work independently.

---

### Dance school or studio (two-level structure)

```
Studio Name                            (parent team)
  ├─ Teaching Staff                    (child team)
  │    ├─ Project: Fall Curriculum
  │    └─ Project: Workshop Series
  └─ Events Team                       (child team)
       ├─ Project: Monthly Milonga
       └─ Project: Annual Festival
```

---

## Frequently Asked Questions

**Can someone be in both the parent team and a child team?**  
Yes. If someone needs to participate in a child team's day-to-day work *and* have org-level access, add them to both. Common for leadership who also do hands-on work.

**Does joining a parent team give access to child team projects?**  
Not automatically in the current version. Add people directly to the teams whose projects they need to see.

**Can a child team have its own child teams?**  
Not yet — currently limited to one level of nesting. Multi-level hierarchy (grandchild teams, full org charts) is coming in a future release.

**What if I set up the wrong structure and want to change it?**  
You can rename teams, add or remove members, and create new projects at any time. Re-parenting (moving a child team under a different parent) is coming in a future release.

**Should I put personal projects in a team?**  
No. Personal projects stay outside of teams entirely — they're only visible to you. Teams are for collaborative work. Your personal GTD stays private.

**How many projects can a team have?**  
As many as you need. The goal is one project per discrete outcome. A team running three initiatives should have three projects, not one big project with sub-sections.

---

## Quick Reference

| What you're organizing | Use this |
|---|---|
| Your whole organization | Parent team |
| A department, committee, or working group | Child team under the parent |
| A single initiative or outcome | Project inside a team |
| A major phase or workstream within one initiative | Sub-project |
| Something only you are doing | Personal project (no team) |
