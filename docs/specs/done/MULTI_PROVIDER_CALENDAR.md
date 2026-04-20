# Tandem Feature Spec: Multi-Provider Calendar Sync

**Version:** 1.0
**Date:** March 7, 2026
**Author:** Jason Courtemanche
**Status:** Draft
**Target:** v1.9.0

---

## 1. Executive Summary

Tandem currently syncs bidirectionally with Google Calendar. This spec extends that to Microsoft Outlook/365 Calendar via the Microsoft Graph API, and refactors the sync layer to be provider-agnostic so future providers (Apple Calendar via CalDAV, etc.) can be added without duplicating infrastructure.

### Why This Matters

Google Calendar covers most personal users, but teams and organizations often run on Microsoft 365. Since Tandem already supports Microsoft OAuth for login, adding Outlook Calendar sync is a natural extension — the auth plumbing exists, we just need to request the right scopes and build the sync layer.

### Design Principle

Rather than building a second parallel implementation (`src/lib/microsoft-calendar/` mirroring `src/lib/google-calendar/`), we refactor the sync system into a provider-agnostic architecture with pluggable provider adapters. Each provider implements a common interface; the sync engine, error handling, circuit breaker, and UI are shared.

---

## 2. Architecture

### 2.1 Provider Adapter Interface

```typescript
// src/lib/calendar-sync/types.ts

interface CalendarProvider {
  id: "google" | "microsoft";
  displayName: string;

  // Auth
  getClient(userId: string): Promise<CalendarClient>;

  // Calendar management
  listCalendars(client: CalendarClient): Promise<ExternalCalendar[]>;
  ensureTandemCalendar(client: CalendarClient): Promise<string>;
  deleteTandemCalendar(client: CalendarClient, calendarId: string): Promise<void>;

  // Event mapping
  toProviderEvent(event: TandemEvent): ProviderEvent;
  fromProviderEvent(event: ProviderEvent, userId: string, calendarId: string): TandemEventData;

  // Sync operations
  fetchEvents(client: CalendarClient, calendarId: string, opts: FetchOpts): Promise<FetchResult>;
  insertEvent(client: CalendarClient, calendarId: string, event: ProviderEvent): Promise<string>;
  updateEvent(client: CalendarClient, calendarId: string, eventId: string, event: ProviderEvent): Promise<void>;
  deleteEvent(client: CalendarClient, calendarId: string, eventId: string): Promise<void>;
}

interface FetchOpts {
  syncToken?: string | null;  // Google: syncToken, Microsoft: deltaLink
  timeMin?: Date;
  timeMax?: Date;
  pageToken?: string;
}

interface FetchResult {
  events: ProviderEvent[];
  deletedEventIds: string[];
  nextPageToken?: string;
  nextSyncToken?: string;  // Google: nextSyncToken, Microsoft: deltaLink
}

interface ExternalCalendar {
  id: string;
  summary: string;
  color: string;
}
```

### 2.2 File Structure

```
src/lib/calendar-sync/
  types.ts              # Shared interfaces (CalendarProvider, etc.)
  engine.ts             # Provider-agnostic sync engine (read + write)
  registry.ts           # Provider registry (getProvider("google"), etc.)
  providers/
    google.ts           # Google Calendar adapter (refactored from current code)
    microsoft.ts        # Microsoft Graph adapter (new)
```

### 2.3 What Moves, What's New

| Current File | Action |
|---|---|
| `src/lib/google-calendar/client.ts` | Refactor into `providers/google.ts` |
| `src/lib/google-calendar/setup.ts` | Merge into `providers/google.ts` |
| `src/lib/google-calendar/sync-read.ts` | Extract generic logic into `engine.ts`, keep Google-specific in adapter |
| `src/lib/google-calendar/sync-write.ts` | Extract generic logic into `engine.ts`, keep Google-specific in adapter |
| `src/lib/calendar-sync/providers/microsoft.ts` | **New** — Microsoft Graph adapter |

---

## 3. Data Model Changes

### 3.1 Rename & Generalize GoogleCalendarSync

The current `GoogleCalendarSync` model is Google-specific. Rename to `CalendarSync` and add a provider field.

```prisma
model CalendarSync {
  id                    String   @id @default(cuid())
  userId                String
  user                  User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider              String   // "google" | "microsoft"
  syncEnabled           Boolean  @default(true)
  tandemCalendarId      String?  // Provider calendar ID for the "Tandem GTD" calendar
  tandemCalendarCreated Boolean  @default(false)
  consecutiveErrors     Int      @default(0)
  lastError             String?
  lastErrorAt           DateTime?
  lastSyncedAt          DateTime?
  watchedCalendars      Json?    // [{ id, summary, color, enabled, syncToken/deltaLink }]
  lastReadSyncAt        DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@unique([userId, provider])
}
```

**Migration strategy:** Rename the table, add `provider` column defaulting to `"google"` for existing rows, change the unique constraint from `userId` to `[userId, provider]`.

### 3.2 CalendarEvent Changes

The existing `CalendarEvent` model already has `googleEventId` and `googleCalendarId` fields. Generalize these:

| Current Field | New Field | Notes |
|---|---|---|
| `googleEventId` | `externalEventId` | Provider's event ID |
| `googleCalendarId` | `externalCalendarId` | Provider's calendar ID |
| (none) | `syncProvider` | `"google" \| "microsoft" \| null` |

The unique constraint `userId_googleEventId_googleCalendarId` becomes `userId_externalEventId_externalCalendarId`.

**Migration strategy:** Rename columns, update unique constraint. Backfill `syncProvider = "google"` for rows with non-null `externalEventId`.

---

## 4. Microsoft Graph Implementation

### 4.1 Auth — Scope Addition

Add `Calendars.ReadWrite` to the AzureAD provider in `auth.ts`:

```typescript
AzureADProvider({
  clientId: process.env.MICROSOFT_ENTRA_ID_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_ENTRA_ID_CLIENT_SECRET,
  tenantId: process.env.MICROSOFT_ENTRA_ID_TENANT_ID || "common",
  authorization: {
    params: {
      scope: "openid email profile User.Read Calendars.ReadWrite",
    },
  },
})
```

This requires:
- Updating the Azure App Registration to include `Calendars.ReadWrite` under API permissions
- Requesting admin consent if targeting organizational accounts (personal accounts consent individually)

### 4.2 Microsoft Graph Client

```typescript
// Uses @microsoft/microsoft-graph-client (or direct fetch to Graph API)
// Token comes from the Account record (same as Google — NextAuth stores it)

async function getMicrosoftClient(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "azure-ad" },
  });
  // Build authenticated Graph client with account.accessToken
  // Handle token refresh via account.refreshToken
}
```

### 4.3 Key API Mappings

| Operation | Google Calendar API | Microsoft Graph API |
|---|---|---|
| List calendars | `calendarList.list()` | `GET /me/calendars` |
| Create calendar | `calendars.insert()` | `POST /me/calendars` |
| Delete calendar | `calendars.delete()` | `DELETE /me/calendars/{id}` |
| List events | `events.list()` with `syncToken` | `GET /me/calendars/{id}/events/delta` with `deltaLink` |
| Create event | `events.insert()` | `POST /me/calendars/{id}/events` |
| Update event | `events.update()` | `PATCH /me/calendars/{id}/events/{id}` |
| Delete event | `events.delete()` | `DELETE /me/calendars/{id}/events/{id}` |
| Incremental sync | `syncToken` / 410 Gone → full resync | `deltaLink` / expired → full resync |

### 4.4 Event Field Mapping

| Tandem Field | Google Field | Microsoft Field |
|---|---|---|
| `title` | `summary` | `subject` |
| `description` | `description` | `body.content` |
| `location` | `location` (string) | `location.displayName` |
| `startTime` | `start.dateTime` | `start.dateTime` + `start.timeZone` |
| `endTime` | `end.dateTime` | `end.dateTime` + `end.timeZone` |
| `allDay` | `start.date` (no time) | `isAllDay: true` |
| `recurrenceRule` | `recurrence[0]` (RRULE string) | `recurrence.pattern` + `recurrence.range` (structured object) |
| `reminderMinutes` | `reminders.overrides[0].minutes` | `reminderMinutesBeforeStart` |

**Recurrence note:** Google uses RRULE strings directly. Microsoft uses a structured `recurrencePattern` + `recurrenceRange` object. The adapter must convert between Tandem's RRULE string and Microsoft's format.

---

## 5. API Routes

### 5.1 New Provider-Aware Routes

Restructure from `/api/calendar/google/...` to `/api/calendar/sync/[provider]/...`:

| Route | Method | Purpose |
|---|---|---|
| `/api/calendar/sync/[provider]/connect` | POST | Initialize sync for provider |
| `/api/calendar/sync/[provider]/disconnect` | POST | Disconnect and optionally delete Tandem calendar |
| `/api/calendar/sync/[provider]/status` | GET | Sync status, errors, last sync time |
| `/api/calendar/sync/[provider]/calendars` | GET | List user's calendars from provider |
| `/api/calendar/sync/[provider]/calendars` | PATCH | Enable/disable watched calendars |
| `/api/calendar/sync/[provider]/read-sync` | POST | Trigger read sync (pull external events) |
| `/api/calendar/sync/[provider]/sync` | POST | Trigger write sync (push/retry failed) |

**Backward compatibility:** Keep the existing `/api/calendar/google/...` routes as redirects during transition, or update the frontend in the same PR.

### 5.2 Existing Routes (Unchanged)

These are provider-agnostic already:

| Route | Purpose |
|---|---|
| `/api/calendar` | CRUD for Tandem calendar events |
| `/api/calendar/[id]` | Single event operations |
| `/api/calendar/time-block` | Time block creation |
| `/api/calendar/review` | Weekly review calendar data |

---

## 6. Settings UI

### 6.1 Current State

`CalendarSettingsSection.tsx` has a Google-specific connect/disconnect flow and watched calendar picker.

### 6.2 Updated Design

Refactor to show a **provider card** for each supported provider:

```
Calendar Sync
-----------------------------------------
| Google Calendar        [Connected]     |
| Syncing to "Tandem GTD" calendar       |
| Last synced: 2 minutes ago             |
| [Manage Calendars] [Sync Now] [Disconnect] |
-----------------------------------------
| Microsoft Outlook      [Connect]       |
| Sign in with Microsoft to sync your    |
| Outlook calendar with Tandem           |
|                        [Connect]       |
-----------------------------------------
```

- Each provider card shows independently
- A user can connect both simultaneously (events from both appear in Tandem)
- The watched calendars picker is per-provider
- "Sync Now" triggers both read and write sync for that provider

### 6.3 Calendar Event Card

`CalendarEventCard.tsx` currently shows a Google icon for external events. Update to show the correct provider icon based on `syncProvider`.

---

## 7. Implementation Phases

### Phase 1: Refactor to Provider-Agnostic (No new functionality)

1. Create `src/lib/calendar-sync/types.ts` with the adapter interface
2. Create `src/lib/calendar-sync/providers/google.ts` — move existing logic, implement interface
3. Create `src/lib/calendar-sync/engine.ts` — extract shared sync logic
4. Create `src/lib/calendar-sync/registry.ts`
5. Run Prisma migration: rename model + columns, add `provider` + `syncProvider` fields
6. Update API routes to use the new engine
7. Update `CalendarSettingsSection.tsx` to use provider abstraction
8. **Verify:** All existing Google Calendar functionality works identically

### Phase 2: Microsoft Outlook Calendar

1. Add `Calendars.ReadWrite` scope to AzureAD provider
2. Create `src/lib/calendar-sync/providers/microsoft.ts`
3. Implement Graph API client with token refresh
4. Implement event mapping (including RRULE <-> recurrencePattern conversion)
5. Add Microsoft provider card to settings UI
6. Add Microsoft connect/disconnect API routes
7. Test: connect, read sync, write sync, disconnect
8. Test: simultaneous Google + Microsoft connections

### Phase 3: Polish

1. Provider icon on external event cards
2. Error handling for Microsoft-specific edge cases (Teams meetings, shared calendars, etc.)
3. Help article for Microsoft Calendar setup
4. Update MCP tools if any reference Google-specific sync

---

## 8. Dependencies

| Dependency | Purpose | Notes |
|---|---|---|
| `@microsoft/microsoft-graph-client` | Graph API client | Or use direct `fetch` to avoid the dependency |
| `@azure/identity` | Token management | May not be needed if NextAuth handles refresh |

**Lightweight option:** The Microsoft Graph REST API is straightforward enough to call with `fetch` + the stored access token from NextAuth, avoiding both packages. Google's `googleapis` package is already in the project, so we're not adding a new pattern — but if we want to keep dependencies lean, raw fetch is viable for Microsoft.

---

## 9. Risks & Open Questions

1. **Token refresh for Microsoft** — NextAuth stores the initial tokens. Google's `googleapis` client handles refresh automatically and we persist new tokens via the `on("tokens")` listener. Need to verify NextAuth's Azure AD provider returns a refresh token and confirm the refresh flow works the same way (or build a manual refresh using `fetch` to the Microsoft token endpoint).

2. **Recurrence conversion** — Google uses standard RRULE strings. Microsoft uses a proprietary structured format. We need a reliable converter. Consider using `rrule` npm package as an intermediate representation.

3. **Microsoft account types** — Personal Microsoft accounts vs. organizational (Work/School) accounts have different consent flows. The `tenantId: "common"` setting supports both, but calendar permissions may behave differently.

4. **Simultaneous providers** — If a user connects both Google and Microsoft, events from both appear in Tandem's calendar. Need to ensure no visual confusion (provider icon on each external event) and no sync loops (Tandem events only write to one provider's "Tandem GTD" calendar, or optionally both).

5. **Google OAuth verification dependency** — Google Calendar sync is currently pending OAuth verification (submitted Mar 7, 2026). Microsoft Calendar can proceed independently since it's a separate app registration.

---

## 10. Success Criteria

- [ ] Existing Google Calendar sync works identically after refactor
- [ ] Microsoft Outlook Calendar bidirectional sync works (read + write)
- [ ] Users can connect both providers simultaneously
- [ ] External events show correct provider icon
- [ ] Settings UI clearly shows each provider's status
- [ ] Circuit breaker and error handling work per-provider independently
- [ ] No regression in sync performance
