# Tandem — Volunteer Roster & Compliance Tracking

**Version:** 1.0
**Date:** March 27, 2026
**Author:** Jason Courtemanche
**Extends:** TEAMS.md, VOLUNTEER_ORGS.md, GOOGLE_WORKSPACE_PROVISIONING.md
**Status:** Draft
**Origin:** InsightBoston IT compliance work — designed from a real nonprofit's needs

---

## 1. Overview

Tandem's team system already tracks who is on which team, what role they hold, and when they joined. This spec extends that foundation into a **roster and compliance management system** — a single source of truth that tracks member credentials (configurable per organization), team leadership history, and prerequisite enforcement.

The driving principle: **when you look at a team roster in Tandem, you should be able to trust that everyone listed belongs there, meets the prerequisites, and that the record matches reality** (including external systems like Google Groups if provisioning is enabled).

### 1.1 Problem This Solves

Organizations need to answer questions that Tandem's current team system cannot:

- Has this member completed the credentials required to serve on this team?
- Who is leading this team right now, and who led it before?
- When did this person join, and how long have they been on each team?
- Is everyone in our external system (Google Groups, etc.) accounted for in our roster?
- Which members have credentials that are about to expire?

### 1.2 The Credential System — Configurable, Not Hardcoded

Different organizations track different things. Rather than building "seminars" and "trainings" as fixed concepts, Tandem provides **Credential Categories** — admin-defined groupings that each org configures for their own needs.

| Organization | Category | Credentials |
|:---|:---|:---|
| **Insight Boston** (nonprofit seminars) | Seminars | Insight I, Insight II, Insight III, Teen Insight, CSP |
| | Internal Trainings | Sound/AV, Safeguarding, Registration Procedures |
| **Little League** (youth sports) | Certifications | Background Check, First Aid, Concussion Protocol |
| | Coaching Levels | Level 1 Coaching, Level 2 Coaching, Tournament Director |
| **Volunteer Fire Co.** | Clearances | NFPA Firefighter I, NFPA Firefighter II, EMT-Basic |
| | Annual Drills | Live Burn, Hazmat Refresher, Apparatus Operations |
| **Church Committee** | Membership | Member in Good Standing, Deacon, Elder |
| | Training | Safeguarding, Financial Oversight |
| **Makerspace** | Access Levels | Laser Cutter Certified, CNC Certified, Welding Certified |
| | Safety | Shop Safety Orientation, First Aid |

The admin creates categories and credentials in the admin panel. Credentials within a category can be linked as prerequisites for specific teams. The system doesn't know or care what "Insight II" or "Background Check" means — it just knows that Team X requires Credential Y, and Member Z either has it or doesn't.

### 1.3 Design Principles

| Principle | Rationale |
|:---|:---|
| **Built on existing models** | Extends Team, TeamMember, and TeamEvent — no parallel structures |
| **Opt-in per instance** | Not every Tandem instance needs roster tracking. Feature flag controls visibility |
| **Configurable credential system** | Admin defines their own categories and credentials — no hardcoded "seminars" or "trainings" |
| **Audit-first** | Every roster view answers "is this correct?" not just "what's the data?" |
| **Prerequisite enforcement at assignment time** | Warn (don't block) when prerequisites aren't met — organizations need flexibility |
| **Leadership history is data, not metadata** | Team lead changes are tracked records with dates, not overwritten fields |

---

## 2. Data Model

### 2.1 Instance Setting

```prisma
// Add to existing Settings model or InstanceConfig
rosterEnabled  Boolean @default(false) @map("roster_enabled")
```

When `false` (the default), all roster-specific UI, navigation items, and API endpoints are completely hidden. The sidebar doesn't show "Roster", the team detail page doesn't show a "Roster" tab, and the admin panel doesn't show credential configuration. The underlying data model still exists (Prisma migrations run regardless) but is inert.

**This is off by default.** A family using Tandem with one team, a friend group planning camping, or a small startup never sees roster, credentials, prerequisite enforcement, or audit features — it's just their task manager. An instance admin turns it on in Admin Settings when their organization needs it.

```
Admin Settings → Features
┌──────────────────────────────────────────────────┐
│  OPTIONAL FEATURES                                │
│                                                    │
│  Roster & Credential Tracking          [OFF] ──── │
│  Track member credentials, prerequisites,         │
│  team leadership history, and compliance.          │
│  Best for: nonprofits, volunteer orgs,             │
│  clubs, and organizations with compliance needs.   │
│                                                    │
└──────────────────────────────────────────────────┘
```

### 2.2 Member Profile Extension

Extends the existing `User` model with roster-specific fields. These are nullable so non-roster instances are unaffected.

**Privacy controls:** Each member controls what contact information is visible to teammates. This is their choice, not the admin's.

```prisma
/// Roster-specific profile data. One-to-one with User.
/// Only populated when rosterEnabled = true.
model MemberProfile {
  id              String    @id @default(cuid())
  userId          String    @unique @map("user_id")
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  status          MemberStatus @default(ACTIVE)
  startDate       DateTime?    @map("start_date")    // When they joined the org
  endDate         DateTime?    @map("end_date")       // When they left (if applicable)
  personalEmail   String?      @map("personal_email") // Backup contact
  phone           String?
  boardMember     Boolean      @default(false) @map("board_member")
  notes           String?
  lastAuditDate   DateTime?    @map("last_audit_date")

  // Privacy — member controls what teammates can see
  showEmail       ContactVisibility @default(TEAM_LEADS) @map("show_email")
  showPhone       ContactVisibility @default(NOBODY)     @map("show_phone")

  credentials     CredentialCompletion[]

  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
}

enum MemberStatus {
  ACTIVE
  INACTIVE
  ON_LEAVE
  OFFBOARDED
}

/// Controls who can see a specific contact field on a member's profile.
/// The member sets this themselves from their profile settings.
enum ContactVisibility {
  EVERYONE     // All roster members (anyone on at least one shared team)
  TEAM_LEADS   // Only team leads/co-leads of teams the member belongs to
  NOBODY       // Only instance admins and board can see (for admin/compliance purposes)
}
```

### 2.3 Credential Categories & Credentials

The core of the configurable system. Admins define **categories** (groupings) and **credentials** (specific items within a category). Then they record **completions** against member profiles.

```
Category: "Seminars"              Category: "Certifications"
  ├── Insight I                     ├── Background Check
  ├── Insight II                    ├── First Aid
  ├── Insight III                   ├── Concussion Protocol
  └── Teen Insight                  └── CPR

Category: "Internal Trainings"    Category: "Access Levels"
  ├── Sound/AV Training             ├── Laser Cutter Certified
  ├── Safeguarding                  ├── CNC Certified
  └── Registration Procedures       └── Welding Certified
```

```prisma
/// Admin-defined grouping of credentials.
/// Each org creates categories that make sense for them.
/// Examples: "Seminars", "Certifications", "Clearances", "Access Levels"
model CredentialCategory {
  id          String   @id @default(cuid())
  name        String   // e.g., "Seminars", "Certifications", "Clearances"
  description String?
  icon        String?  // Emoji or icon identifier
  sortOrder   Int      @default(0) @map("sort_order")
  color       String?  // Badge color for UI (e.g., "blue", "green", "orange")

  credentials Credential[]

  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
}

/// A specific credential within a category.
/// Examples: "Insight II", "Background Check", "NFPA Firefighter I"
model Credential {
  id          String   @id @default(cuid())
  categoryId  String   @map("category_id")
  category    CredentialCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  name        String   // e.g., "Insight II", "CPR", "Laser Cutter Certified"
  description String?
  duration    String?  // e.g., "3 days", "8 hours", "online" — informational only
  expires     Boolean  @default(false) // Does this credential type expire?
  expiryMonths Int?    @map("expiry_months") // Default expiry period (e.g., 12 = annual renewal)
  sortOrder   Int      @default(0) @map("sort_order")

  completions  CredentialCompletion[]
  prerequisites TeamPrerequisite[]

  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([categoryId])
}

/// Records that a member completed/earned a specific credential.
/// One row per member per credential.
model CredentialCompletion {
  id          String   @id @default(cuid())
  profileId   String   @map("profile_id")
  profile     MemberProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  credentialId String  @map("credential_id")
  credential  Credential @relation(fields: [credentialId], references: [id], onDelete: Cascade)

  completionDate DateTime  @map("completion_date")
  expiresAt      DateTime? @map("expires_at")    // Null = never expires (auto-calculated from Credential.expiryMonths if set)
  location       String?                          // Where it was completed
  verifiedBy     String?   @map("verified_by")   // Who confirmed this
  issuer         String?                          // External body if applicable
  notes          String?

  createdAt   DateTime @default(now()) @map("created_at")

  @@unique([profileId, credentialId])
  @@index([credentialId])
}
```

**How the admin configures this (InsightBoston example):**

1. Create category "Seminars" → add credentials: Insight I, Insight II, Insight III, Teen Insight, CSP
2. Create category "Internal Trainings" → add credentials: Sound/AV (expires: false), Safeguarding (expires: true, expiryMonths: 12)
3. Set team prerequisites: "Insight II Creation Team" requires credential "Insight II"

**How a different org configures it (Little League example):**

1. Create category "Certifications" → add credentials: Background Check (expires: true, 24 months), First Aid (expires: true, 12 months), Concussion Protocol (expires: true, 12 months)
2. Create category "Coaching Levels" → add credentials: Level 1, Level 2, Tournament Director
3. Set team prerequisites: "Head Coaches" requires "Background Check" + "Level 1 Coaching" + "Concussion Protocol"

### 2.4 Team Prerequisites

Links teams to required credentials. A team can have multiple prerequisites from any category.

```prisma
/// Defines that a team requires a specific credential for membership.
/// When a member is added to this team, the system checks whether
/// they have the required completion and warns if not.
model TeamPrerequisite {
  id            String   @id @default(cuid())
  teamId        String   @map("team_id")
  team          Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)

  credentialId  String   @map("credential_id")
  credential    Credential @relation(fields: [credentialId], references: [id], onDelete: Cascade)

  createdAt     DateTime @default(now()) @map("created_at")

  @@unique([teamId, credentialId])
  @@index([teamId])
}
```

### 2.5 TeamMember Extensions

The existing `TeamMember` model needs two additions:

```prisma
model TeamMember {
  // ... existing fields ...

  role     TeamRole @default(MEMBER)
  label    String?
  joinedAt DateTime @default(now())

  // NEW: Leadership tracking
  leftAt   DateTime? @map("left_at")  // Null = still active on this team

  // NEW: Provisioning sync flag (for Google Workspace bridge audit)
  provisionedSource String? @map("provisioned_source") // "google_group:marketing-team@org.com" or null if manual
}
```

> **Note on leadership history:** The existing `role` field (ADMIN/MEMBER) combined with `label` (e.g., "Team Lead", "Co-Lead") already supports leadership tracking. Combined with the new `leftAt` field and `joinedAt`, you get full history: who led the team, in what capacity, from when to when. No new models needed — just query TeamMember records including ended ones.

### 2.6 Audit Log

```prisma
/// Records discrepancies found during roster audits.
/// Used when comparing Tandem team membership against external systems
/// (Google Groups, etc.) or checking prerequisite compliance.
model RosterAudit {
  id            String   @id @default(cuid())
  teamId        String?  @map("team_id")
  team          Team?    @relation(fields: [teamId], references: [id], onDelete: SetNull)

  auditType     RosterAuditType
  finding       String                    // Human-readable description
  resolution    String?                   // How it was resolved
  resolvedById  String?  @map("resolved_by_id")
  resolvedBy    User?    @relation("RosterAuditsResolved", fields: [resolvedById], references: [id], onDelete: SetNull)
  resolvedAt    DateTime? @map("resolved_at")

  createdAt     DateTime @default(now()) @map("created_at")

  @@index([teamId])
  @@index([auditType])
}

enum RosterAuditType {
  IN_EXTERNAL_NOT_IN_TANDEM    // Person in Google Group but not in Tandem team
  IN_TANDEM_NOT_IN_EXTERNAL    // Person in Tandem team but not in Google Group
  PREREQUISITE_NOT_MET         // Team member missing required seminar/training
  INACTIVE_IN_TEAM             // Offboarded/inactive volunteer still on a team
  CREDENTIAL_EXPIRED           // Credential has passed its expiry date
  OTHER
}
```

---

## 3. Permissions Model

### 3.1 Permission Tiers

The roster uses four permission tiers that map naturally to existing Tandem concepts:

| Tier | Who | How It's Determined |
|:---|:---|:---|
| **Instance Admin** | Tech team, IT compliance | User has Tandem instance admin role |
| **Board** | Board members, oversight | `MemberProfile.boardMember = true` |
| **Team Lead** | Team leads, co-leads | `TeamMember.role = ADMIN` with label "Team Lead" or "Co-Lead" on any team |
| **Member** | Regular volunteers | Everyone else with a `MemberProfile` |

### 3.2 Access Matrix — What Each Tier Can See

| Data | Instance Admin | Board | Team Lead | Member |
|:---|:---|:---|:---|:---|
| **Own profile** (full) | Yes | Yes | Yes | Yes |
| **Own credentials** | Yes | Yes | Yes | Yes |
| **Own team roster** (names, roles, join dates) | Yes | Yes | Yes | Yes |
| **Teammate credentials** | Yes | Yes | Their team(s) only | No |
| **Teammate contact info** (email, phone) | Yes | Yes | **Subject to member's privacy setting** | **Subject to member's privacy setting** |
| **Any member's full profile** | Yes | Yes (read-only) | No — only their team members | No |
| **Browse full roster** (`/roster` page) | Yes | Yes (read-only) | Filtered to their team(s) | Hidden |
| **Prerequisite status per member** | Yes | Yes | Their team(s) only | Own only |
| **Audit log** | Yes | Yes (read-only) | No | No |
| **Audit findings for their team** | Yes | Yes | Yes (read-only) | No |

### 3.3 Access Matrix — What Each Tier Can Do

| Action | Instance Admin | Board | Team Lead | Member |
|:---|:---|:---|:---|:---|
| **Create/edit credential categories** | Yes | No | No | No |
| **Create/edit credentials** | Yes | No | No | No |
| **Set team prerequisites** | Yes | No | No | No |
| **Create member profiles** | Yes | No | No | No |
| **Edit any member profile** (status, dates, notes) | Yes | No | No | No |
| **Record credential completion — anyone** | Yes | No | No | No |
| **Record credential completion — their team** | Yes | No | **Yes** | No |
| **Edit own profile** (phone, personal email, notes) | Yes | Yes | Yes | Yes |
| **Run full audit** | Yes | No | No | No |
| **Resolve audit findings** | Yes | No | No | No |
| **Export roster / reports** | Yes | Yes | Their team(s) only | No |
| **Bulk import completions** | Yes | No | No | No |

### 3.4 Member Privacy Controls

Members control their own contact visibility. This is not an admin setting — it's a personal choice.

**Settings (on the member's own profile page):**

```
┌──────────────────────────────────────────────────┐
│  MY CONTACT VISIBILITY                            │
│                                                    │
│  Who can see my email?                             │
│  ( ) Everyone on my teams                          │
│  (●) Team leads only                               │
│  ( ) Nobody (admins only)                          │
│                                                    │
│  Who can see my phone number?                      │
│  ( ) Everyone on my teams                          │
│  ( ) Team leads only                               │
│  (●) Nobody (admins only)                          │
│                                                    │
│  Note: Your name is always visible to teammates.   │
│  Instance admins and board members can always see   │
│  your full profile for compliance purposes.         │
│                                                    │
│  [Save]                                            │
└──────────────────────────────────────────────────┘
```

**Defaults:** Email → Team Leads only. Phone → Nobody. Conservative by default — members opt in to sharing, not opt out.

**How it affects API responses:**

When a team lead or teammate requests a member's profile, the API checks the target member's visibility settings and redacts fields they shouldn't see:

```typescript
// Pseudocode — filtering profile response based on viewer + member privacy settings
function filterProfileForViewer(profile: MemberProfile, viewerTier: RosterTier, isTeamLead: boolean) {
  // Admins and board always see everything
  if (viewerTier === 'ADMIN' || viewerTier === 'BOARD') return profile;

  const filtered = { ...profile };

  // Email visibility
  if (profile.showEmail === 'NOBODY') filtered.personalEmail = null;
  if (profile.showEmail === 'TEAM_LEADS' && !isTeamLead) filtered.personalEmail = null;

  // Phone visibility
  if (profile.showPhone === 'NOBODY') filtered.phone = null;
  if (profile.showPhone === 'TEAM_LEADS' && !isTeamLead) filtered.phone = null;

  return filtered;
}
```

**What's always visible regardless of privacy settings:**

| Field | Visible To | Reason |
|:---|:---|:---|
| Name | All teammates | You need to know who's on your team |
| Team membership + role | All teammates | You need to know who leads your team |
| Credential completions | Team leads + above | Team leads need to verify prerequisites |
| Credential completions | NOT visible to regular members | Privacy — your qualifications are between you and your lead |

**What members control:**

| Field | Options | Default |
|:---|:---|:---|
| Email (org `@` address) | Everyone / Team Leads / Nobody | Team Leads |
| Phone | Everyone / Team Leads / Nobody | Nobody |

> **Note:** The org email address (`@insightboston.org`) and personal email are both governed by `showEmail`. If a member wants their org email visible but personal email hidden (or vice versa), we could split this into two settings in a future iteration. For v1, one toggle covers both.

### 3.5 Key Design Decisions

**Team leads can record credentials for their team members.**

This is the critical permission. When a team lead runs a training session, they need to go into the roster and mark their attendees as complete — without filing a ticket with the tech team. This scales the workload across team leads instead of bottlenecking on a single admin.

Scoping rules:
- A team lead can only record completions for members of team(s) where they hold ADMIN role
- They can record completions for **any credential in any category** — not just ones related to their team. Reason: a Marketing team lead might also run a GHL training for their members. The credential category is "Internal Trainings" but the team lead is from Marketing.
- They **cannot** delete or modify completion records they didn't create. Only instance admins can correct/remove records. This preserves audit integrity.

**Board sees everything, edits nothing.**

Board members need full read access for governance and oversight, but they shouldn't be editing credentials or profiles. Their role is verify and govern, not administer. If a board member is also a team lead, they get team lead write permissions through that role.

**Members see their own profile + team names/roles only.**

A regular volunteer can see:
- Their own full profile, credentials, and prerequisite status
- The names and roles of people on their team(s) — so they know who their Team Lead is and who else is on the team
- They **cannot** see other members' credentials, contact info, or profiles

This protects privacy while keeping basic team awareness.

**The `/roster` page adapts to the viewer's tier.**

| Viewer | What `/roster` shows |
|:---|:---|
| Instance Admin | Full searchable roster — all members, all columns |
| Board | Full roster — all members, all columns (read-only, no edit buttons) |
| Team Lead | Filtered to their team(s) — members, credentials, contact info, with edit capability |
| Member | Redirects to their own profile page (no roster browse) |

### 3.6 Implementation Approach

Permissions are enforced at the API layer, not just the UI. Every roster API endpoint checks the caller's tier:

```typescript
// Pseudocode for permission check
function getRosterPermission(user: User, targetProfileId?: string): RosterTier {
  if (isInstanceAdmin(user)) return 'ADMIN';

  const profile = getMemberProfile(user.id);
  if (profile?.boardMember) return 'BOARD';

  // Check if user is ADMIN on any team that the target member belongs to
  if (targetProfileId) {
    const targetTeams = getTeamIds(targetProfileId);
    const userAdminTeams = getAdminTeamIds(user.id);
    const overlap = targetTeams.filter(t => userAdminTeams.includes(t));
    if (overlap.length > 0) return 'TEAM_LEAD';
  } else {
    // No target — checking general access
    if (getAdminTeamIds(user.id).length > 0) return 'TEAM_LEAD';
  }

  return 'MEMBER';
}
```

API responses are filtered based on tier — a team lead calling `GET /api/roster/members` only receives members from their team(s). The full dataset is never sent to the client and filtered in the UI.

### 3.7 Edge Cases

| Scenario | Resolution |
|:---|:---|
| Person is Team Lead on Team A AND member of Team B | Can see/edit Team A member profiles. Cannot see Team B member profiles (only names/roles). |
| Person is board member AND Team Lead | Gets board-level read access (all profiles) PLUS team lead write access (record credentials for their team) |
| Person leads multiple teams | Can see/edit profiles for members across all teams where they hold ADMIN role |
| Team lead leaves their team | Loses team lead permissions immediately when `leftAt` is set on their TeamMember record |
| New team has no lead yet | Only instance admin can manage that team's roster until a lead is assigned |
| Volunteer is on zero teams | Profile exists but is only visible to instance admin and board — no team lead has access |

---

## 4. API Endpoints

### 4.1 Member Profiles

| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/roster/members` | List all member profiles (filters: status, team, credential) |
| GET | `/api/roster/members/[id]` | Full profile: personal info, teams, credentials, tenure |
| POST | `/api/roster/members` | Create profile for existing user |
| PATCH | `/api/roster/members/[id]` | Update profile fields (status, dates, notes, etc.) |
| POST | `/api/roster/members/bulk-create` | Bootstrap: create profiles for all existing users |

### 4.2 Credential Categories

| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/roster/categories` | List all credential categories with their credentials |
| POST | `/api/roster/categories` | Create category (admin) |
| PATCH | `/api/roster/categories/[id]` | Update category (name, description, icon, color) |
| DELETE | `/api/roster/categories/[id]` | Delete category (cascade deletes credentials + completions — confirm prompt) |

### 4.3 Credentials

| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/roster/categories/[id]/credentials` | List credentials in a category |
| POST | `/api/roster/categories/[id]/credentials` | Create credential within a category |
| PATCH | `/api/roster/credentials/[id]` | Update credential |
| DELETE | `/api/roster/credentials/[id]` | Delete credential (cascade deletes completions — confirm prompt) |

### 4.4 Credential Completions

| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/roster/members/[id]/credentials` | List all completions for a member (grouped by category) |
| POST | `/api/roster/members/[id]/credentials` | Record a credential completion |
| DELETE | `/api/roster/members/[id]/credentials/[credentialId]` | Remove a completion record |
| POST | `/api/roster/credentials/[id]/bulk-complete` | Mark multiple members as complete (bulk import) |

### 4.5 Team Prerequisites

| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/teams/[id]/prerequisites` | List prerequisites for a team |
| POST | `/api/teams/[id]/prerequisites` | Add a prerequisite credential |
| DELETE | `/api/teams/[id]/prerequisites/[prereqId]` | Remove a prerequisite |
| GET | `/api/teams/[id]/prerequisite-check` | Check all current members against prerequisites — returns violations |

### 4.6 Roster Audit

| Method | Path | Description |
|:---|:---|:---|
| POST | `/api/roster/audit/run` | Run audit: compare Tandem team membership vs. Google Groups (if provisioning enabled) + check prerequisites + check inactive members + check expired credentials |
| GET | `/api/roster/audit` | List audit findings (filterable by type, team, resolved/unresolved) |
| PATCH | `/api/roster/audit/[id]` | Resolve a finding (add resolution text) |
| GET | `/api/roster/audit/summary` | Aggregate: total findings by type, last audit date, unresolved count |

### 4.7 Reports

| Method | Path | Description |
|:---|:---|:---|
| GET | `/api/roster/reports/team/[teamId]` | Full roster: members, roles, join dates, prerequisite status |
| GET | `/api/roster/reports/leadership/[teamId]` | Leadership history: current + past leads/co-leads with dates |
| GET | `/api/roster/reports/tenure` | All members sorted by tenure (org-wide and per-team) |
| GET | `/api/roster/reports/compliance` | All teams with prerequisites: who meets them, who doesn't |
| GET | `/api/roster/reports/expiring` | Credentials expiring within N days (default 30) |

---

## 5. UI Components

### 5.1 Roster Page

**Route:** `/roster` (visible when `rosterEnabled = true`)

The primary view. A searchable, filterable table of all members.

| Column | Source |
|:---|:---|
| Name | User + MemberProfile |
| Status | MemberProfile.status (color-coded badge) |
| Teams | TeamMember records (comma-separated team names) |
| Role | Highest role across teams (Team Lead > Co-Lead > Member) |
| Credentials | Color-coded badges per category (e.g., blue "Insight III", green "Sound/AV") |
| Tenure | Calculated from startDate |
| Last Audit | MemberProfile.lastAuditDate |

**Filters:** Status (Active/Inactive/On Leave/Offboarded), Team, Credential category, Specific credential

**Actions:** Click row → Member Profile detail page

### 5.2 Member Profile Detail

**Route:** `/roster/[id]`

Single-member view showing everything about them. Credentials are grouped by their admin-defined categories:

```
┌──────────────────────────────────────────────────┐
│  Jane Smith                          [Active] ✅  │
│  jane@insightboston.org                           │
│  Member since: March 2023 (3 years)               │
│  Board Member: Yes                                │
├──────────────────────────────────────────────────┤
│                                                    │
│  TEAMS                                             │
│  ┌─────────────────────────────────────────────┐  │
│  │ Marketing Team    │ Team Lead │ Since Jan 25 │  │
│  │ Oversight Team    │ Member   │ Since Mar 23 │  │
│  │ Sound Team        │ Co-Lead  │ Since Jun 24 │  │
│  └─────────────────────────────────────────────┘  │
│  Past: Registration (Mar 23 – Dec 24)              │
│                                                    │
│  CREDENTIALS                                       │
│                                                    │
│  🔵 Seminars                                       │
│  ✅ Insight I    — June 2022, Boston               │
│  ✅ Insight II   — November 2022, Cape Cod         │
│  ✅ Insight III  — April 2023, Boston              │
│                                                    │
│  🟢 Internal Trainings                             │
│  ✅ Sound/AV Training — March 2024                 │
│  ✅ Safeguarding      — January 2025               │
│  ⚠️ CPR Certification — Expired February 2026     │
│                                                    │
│  PREREQUISITE STATUS                               │
│  All prerequisites met ✅                          │
│                                                    │
└──────────────────────────────────────────────────┘
```

The category names and colors ("Seminars" in blue, "Internal Trainings" in green) come from the admin-configured `CredentialCategory` records. A Little League would see "Certifications" and "Coaching Levels" here instead.

### 5.3 Team Roster Tab

**Location:** Existing Team detail page → new "Roster" tab (alongside existing Projects, Activity tabs)

Shows team-specific roster with:

- Current members with roles, labels, and join dates
- Leadership section: current Team Lead + Co-Lead(s), highlighted
- Past leadership history (expandable)
- Prerequisite requirements for this team
- Prerequisite compliance: green checkmarks or orange warnings per member
- "Run Audit" button (checks this team against Google Group if provisioned)

### 5.4 Prerequisite Warning on Team Add

When adding a member to a team that has prerequisites:

```
┌──────────────────────────────────────────────────┐
│  ⚠️ Prerequisite Warning                         │
│                                                    │
│  Adding Mike Chen to "Insight II Creation Team"    │
│                                                    │
│  This team requires:                               │
│  ❌ Insight II seminar — not found in Mike's       │
│     completion records                             │
│                                                    │
│  [Add Anyway]  [Cancel]                            │
│                                                    │
│  Note: Adding without prerequisites will create    │
│  an audit finding.                                 │
└──────────────────────────────────────────────────┘
```

The system warns but does not block. Nonprofits sometimes need flexibility (e.g., adding someone who completed a seminar at a different chapter with no digital record yet). If the admin adds anyway, a `PREREQUISITE_NOT_MET` audit finding is auto-created.

### 5.5 Audit Dashboard

**Route:** `/roster/audit`

Summary view for the compliance lead:

- Last full audit date
- Unresolved findings count (by type)
- "Run Full Audit" button
- Findings table: filterable by type, team, resolved/unresolved
- Each finding shows: team, description, date found, resolution (if any)

### 5.6 Admin: Credential Configuration

**Route:** `/admin/roster` (or tab within existing admin settings)

**Categories & Credentials:**
- CRUD for Credential Categories (name, description, icon, color, sort order)
- CRUD for Credentials within each category (name, description, duration, expires flag, expiry months, sort order)
- Drag-to-reorder within categories

**Team Prerequisites:**
- Per-team prerequisite mapping: select a team → add required credentials from any category
- Shows which credentials are required and which category they belong to

**Bulk Import:**
- Upload CSV or paste list to create credential completions for multiple members
- CSV format: `email, credential_name, completion_date, location, notes`
- Auto-matches credential by name within the specified category

**Example admin view:**

```
┌──────────────────────────────────────────────────┐
│  CREDENTIAL CATEGORIES                            │
│                                                    │
│  🔵 Seminars                          [Edit] [+]  │
│     Insight I · Insight II · Insight III ·         │
│     Teen Insight · Creating Success Program        │
│                                                    │
│  🟢 Internal Trainings                [Edit] [+]  │
│     Sound/AV · Safeguarding (expires: 12mo) ·     │
│     Registration Procedures · GHL Basics           │
│                                                    │
│  [+ Add Category]                                  │
│                                                    │
│  TEAM PREREQUISITES                               │
│                                                    │
│  Insight II Creation Team                          │
│     Requires: Insight II (Seminars)                │
│                                                    │
│  Sound Team                                        │
│     Requires: Sound/AV (Internal Trainings)        │
│                                                    │
│  Teen Seminar Team                                 │
│     Requires: Insight I (Seminars)                 │
│              Safeguarding (Internal Trainings)     │
│                                                    │
└──────────────────────────────────────────────────┘
```

---

## 6. Prerequisite Enforcement Logic

### 6.1 Check Flow

```
Admin adds User X to Team T
       │
       ▼
  Query TeamPrerequisite where teamId = T
       │
       ├── No prerequisites → Add to team, done
       │
       └── Has prerequisites →
              │
              Query CredentialCompletion for User X
              │
              Compare against required credential IDs
              │
              ├── All met (and none expired) → Add to team, done
              │
              └── Some missing or expired →
                     │
                     Show warning dialog (Section 5.4)
                     │
                     ├── Admin clicks "Add Anyway"
                     │   → Add to team
                     │   → Create RosterAudit finding (PREREQUISITE_NOT_MET)
                     │
                     └── Admin clicks "Cancel"
                         → Do not add
```

### 6.2 Ongoing Compliance Check

The audit endpoint (`POST /api/roster/audit/run`) checks all active team members against all team prerequisites and creates findings for any violations. This catches:

- Members who were added before prerequisites were defined
- Members whose credentials have expired since they were added
- Members added via "Add Anyway" who still haven't completed the prerequisite

---

## 7. Leadership History

### 7.1 How It Works

Leadership tracking requires no new models. It uses the existing `TeamMember` model:

- **`role`** = `ADMIN` indicates someone with admin/leadership permissions
- **`label`** = "Team Lead", "Co-Lead", etc. — the human-readable leadership title
- **`joinedAt`** = when they started this role on this team
- **`leftAt`** (new) = when they ended this role (null = current)

When a leadership change happens:

1. Set `leftAt` on the outgoing leader's TeamMember record
2. Create a new TeamMember record for the incoming leader (or update role/label if they're already a member)
3. If the outgoing leader stays on the team as a regular member, create a new record with `role = MEMBER`

This produces a full audit trail:

| user | team | role | label | joinedAt | leftAt |
|:---|:---|:---|:---|:---|:---|
| Sarah | Marketing | ADMIN | Team Lead | 2023-06 | 2025-01 |
| Mike | Marketing | ADMIN | Co-Lead | 2024-03 | 2025-01 |
| Sarah | Marketing | MEMBER | — | 2025-01 | — |
| Lisa | Marketing | ADMIN | Team Lead | 2025-01 | — |
| Tom | Marketing | ADMIN | Co-Lead | 2025-03 | — |

Reading this: Sarah led Marketing for 18 months with Mike as co-lead. In January 2025 Lisa took over as lead and Sarah stayed on as a member. Tom joined as co-lead in March 2025.

### 7.2 Leadership Report Query

```sql
-- Current leadership for all teams
SELECT t.name as team, u.name as leader, tm.label, tm."joinedAt"
FROM "TeamMember" tm
JOIN "Team" t ON tm."teamId" = t.id
JOIN "User" u ON tm."userId" = u.id
WHERE tm.role = 'ADMIN'
  AND tm.label IN ('Team Lead', 'Co-Lead')
  AND tm."leftAt" IS NULL
ORDER BY t.name, tm.label;

-- Leadership history for a specific team
SELECT u.name, tm.label, tm."joinedAt", tm."leftAt"
FROM "TeamMember" tm
JOIN "User" u ON tm."userId" = u.id
WHERE tm."teamId" = $1
  AND tm.role = 'ADMIN'
  AND tm.label IN ('Team Lead', 'Co-Lead')
ORDER BY tm."joinedAt" DESC;
```

---

## 8. Integration with Google Workspace Provisioning

When `GOOGLE_WORKSPACE_PROVISIONING.md` is also enabled, the roster audit gains an additional check:

### 8.1 Cross-System Audit

The `POST /api/roster-audit/run` endpoint:

1. For each team with a `GoogleGroupMapping`:
   - Fetch current Google Group members via Admin Directory API
   - Fetch current Tandem TeamMember records
   - Compare and create findings for discrepancies
2. For each team with `TeamPrerequisite` records:
   - Check all active members against prerequisites
   - Create findings for violations
3. For all teams:
   - Check for inactive/offboarded volunteers still listed as active members
   - Check for expired credentials

### 8.2 Sync Direction

Tandem is the source of truth. If a discrepancy is found:

- **Person in Google Group but not in Tandem** → Finding suggests: add to Tandem or remove from Google Group
- **Person in Tandem but not in Google Group** → Finding suggests: add to Google Group or investigate why they were removed

The audit does not auto-resolve. It creates findings for a human to review and act on. This is deliberate — auto-remediation in a volunteer org context is risky (someone may have been removed from a Google Group intentionally for a reason not captured in Tandem).

---

## 9. MCP Tools

```typescript
// New MCP tools for AI-assisted roster management

tandem_member_profile       // Get full member profile (teams, credentials, tenure)
tandem_member_search        // Search members by name, status, team, credential
tandem_team_roster          // Get current roster for a team with prerequisite status
tandem_team_leadership      // Get current and past leadership for a team
tandem_roster_audit_summary // Get latest audit findings summary
tandem_prerequisite_check   // Check if a member meets prerequisites for a team
tandem_expiring_credentials // List credentials expiring within N days
tandem_credential_categories // List all categories and their credentials
```

---

## 10. Relationship to Existing Specs

| Spec | Relationship |
|:---|:---|
| **TEAMS.md** | This spec extends Team and TeamMember. No breaking changes — only additive fields and new related models. |
| **VOLUNTEER_ORGS.md** | §4.4 (Board Governance Reports) is partially fulfilled by the reporting endpoints here. The roster + audit system is the data foundation for those reports. |
| **GOOGLE_WORKSPACE_PROVISIONING.md** | The audit system in this spec consumes the Google Group mapping data to run cross-system compliance checks. |
| **TEAM_SYNC.md** | Team events (threads, decisions) are unaffected. Volunteer profiles are a parallel concern — team collaboration features remain independent. |

---

## 11. Implementation Phases

### Phase 1 — Data Model & Core CRUD

- Prisma schema additions (all new models + TeamMember extensions)
- Migration
- API endpoints for member profiles, credential categories, credentials, completions
- Admin UI for credential category/credential/prerequisite configuration
- Feature flag: `rosterEnabled`

### Phase 2 — Roster UI

- Roster page (`/roster`)
- Member profile detail page (`/roster/[id]`)
- Team roster tab on team detail page
- Prerequisite warning dialog on team member add
- Leadership history display

### Phase 3 — Audit System

- Audit run endpoint (prerequisite check + expired credential check + inactive member check)
- Audit dashboard UI (`/roster/audit`)
- Integration with Google Workspace provisioning (if enabled)
- Audit finding resolution workflow

### Phase 4 — Reporting & MCP

- Report endpoints (tenure, compliance, leadership, expiring credentials)
- MCP tools
- Bulk import for credential completions (CSV upload)
- Export roster as CSV/PDF

---

## 12. Dogfooding: InsightBoston

This spec was designed directly from InsightBoston's compliance needs (see `InsightBoston/IB-Volunteer-CMS-Spec-v1.md`). The dogfooding plan:

1. **Enable on alpha** with `rosterEnabled = true`
2. **Create credential category "Seminars"** → add: Insight I, II, III, Teen Insight, Creating Success Program
3. **Create credential category "Internal Trainings"** → add: Sound/AV, Safeguarding (expires: 12mo), Registration Procedures, WyzeTribe/GHL Basics
4. **Set team prerequisites:** e.g., Insight II Creation Team requires "Insight II" credential
5. **Import data** from registration platform export via bulk completion endpoint
6. **Map Google Groups** via the provisioning bridge (if InsightBoston adopts Tandem)
7. **Run first audit** — compare Tandem roster against Google Group membership
8. **Iterate** based on real-world friction

This replaces the Google Sheets CMS approach from the InsightBoston spec with a proper application — while the Sheets spec remains valid as a standalone option for orgs not yet on Tandem.

---

*This spec is a living document. It connects to TEAMS.md, VOLUNTEER_ORGS.md, GOOGLE_WORKSPACE_PROVISIONING.md, and TANDEM_SPEC.md.*
