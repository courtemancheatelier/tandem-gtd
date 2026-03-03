# Tandem Feature Spec: Calendar, Time Blocking & Google Calendar Integration

**Version:** 1.0  
**Date:** February 22, 2026  
**Author:** Jason Courtemanche  
**Status:** Draft  

---

## 1. Executive Summary

This specification defines Tandem's calendar system — a native GTD "hard landscape" calendar with integrated Google Calendar sync. The calendar is not a separate feature bolted on; it's woven into the existing task management fabric through a persistent sidebar panel, inline awareness across views, and a two-phase Google Calendar integration that turns your phone into Tandem's reminder system.

### The Core Insight

The single most valuable thing this feature does: **when you schedule a task in Tandem, it appears on your phone's Google Calendar with a reminder, so you never need to open Tandem just to know what's next.** This eliminates the #1 friction point of self-hosted GTD apps — they're not in your pocket the way cloud apps are. By pushing to Google Calendar, your existing phone infrastructure (notifications, widgets, Siri/Google Assistant) becomes Tandem's notification layer for free.

### What GTD Says About the Calendar

David Allen is explicit: the calendar is **sacred ground**. Only three things belong there:

1. **Time-specific actions** — "Call Dr. Patel at 3pm" (must happen at this exact time)
2. **Day-specific actions** — "Submit tax extension" (must happen Tuesday, but no specific time)
3. **Day-specific information** — "Conference starts Monday" (not an action, just awareness)

Everything else is a next action filtered by context, energy, and time — NOT a calendar item. Most apps violate this by letting users dump tasks onto the calendar, turning it into a second to-do list that erodes trust in both systems.

Tandem enforces this boundary while adding one GTD-compatible extension: **intentional time blocking** for deep work. This isn't "put my task on the calendar so I don't forget" (that's what next actions are for) — it's "I'm reserving 10am-12pm Saturday for focused pattern drafting because that's when my energy is highest." The distinction matters.

### Feature Overview

| Feature | What It Does | Phase | Complexity |
|---------|-------------|-------|------------|
| **CalendarEvent Model** | Native hard-landscape events (appointments, deadlines, info) | Phase 1 | Medium |
| **Time Blocking** | Link tasks to calendar time slots for intentional scheduling | Phase 1 | Medium |
| **Calendar Sidebar** | Persistent, collapsible panel showing today/week/month alongside any view | Phase 1 | Medium |
| **Google Calendar Write Sync** | Push Tandem events + time blocks → Google Calendar for phone reminders | Phase 1 | High |
| **Google Calendar Read Sync** | Pull external Google events into Tandem's sidebar for unified awareness | Phase 2 | Medium |
| **Weekly Review Calendar Steps** | Feed real calendar data into "Review Previous/Upcoming Calendar" steps | Phase 2 | Low |
| **Recurring Calendar Events** | Repeating appointments (weekly tango class, monthly dentist) | Phase 2 | Medium |

---

## 2. Data Model

### 2.1 New Model: CalendarEvent

This is the GTD hard landscape — things that occupy specific time or must happen on specific days. These are NOT tasks. A dentist appointment is a calendar event. "Call dentist to reschedule" is a task.

```prisma
enum CalendarEventType {
  TIME_SPECIFIC    // "Meeting at 3pm" — has start time and end time
  DAY_SPECIFIC     // "Submit report" — must happen this day, no specific time
  INFORMATION      // "Conference starts" — awareness only, not an action
  TIME_BLOCK       // "Deep work: pattern drafting" — intentional focus time
}

enum CalendarSyncStatus {
  NOT_SYNCED       // Local only (Google Calendar not connected)
  PENDING_SYNC     // Created/updated, waiting to push to Google
  SYNCED           // Successfully synced with Google Calendar
  SYNC_ERROR       // Failed to sync — will retry
  EXTERNAL         // Pulled FROM Google Calendar (Phase 2, read-only in Tandem)
}

model CalendarEvent {
  id            String              @id @default(cuid())
  title         String
  description   String?             @db.Text
  eventType     CalendarEventType
  
  // Temporal fields
  date          DateTime            // The day this event occurs (always set)
  startTime     DateTime?           // Null for DAY_SPECIFIC and INFORMATION types
  endTime       DateTime?           // Null for DAY_SPECIFIC and INFORMATION types
  allDay        Boolean             @default(false)
  
  // Location (optional, passed to Google Calendar)
  location      String?
  
  // Reminder — minutes before event (pushed to Google Calendar)
  // Default: 15 min for TIME_SPECIFIC, 540 (9am) for DAY_SPECIFIC
  reminderMinutes  Int?
  
  // Recurrence (Phase 2 — stored as RRULE string for Google Calendar compat)
  recurrenceRule   String?           // e.g., "RRULE:FREQ=WEEKLY;BYDAY=TU,TH"
  recurringEventId String?           // Links instances to parent recurring event
  
  // Google Calendar sync
  syncStatus       CalendarSyncStatus @default(NOT_SYNCED)
  googleEventId    String?           // Google Calendar event ID (for updates/deletes)
  googleCalendarId String?           // Which Google Calendar it's on
  lastSyncedAt     DateTime?
  syncError        String?           // Last error message if sync failed
  
  // Optional link to a task (for time blocks)
  // A TIME_BLOCK event can reference the task being worked on
  taskId        String?
  task          Task?               @relation(fields: [taskId], references: [id], onDelete: SetNull)
  
  // Optional link to a project (for project-level milestones on calendar)
  projectId     String?
  project       Project?            @relation(fields: [projectId], references: [id], onDelete: SetNull)
  
  // Ownership
  userId        String
  user          User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  @@index([userId])
  @@index([date])
  @@index([userId, date])
  @@index([syncStatus])
  @@index([googleEventId])
  @@index([taskId])
}
```

### 2.2 Schema Additions to Existing Models

```prisma
// Add to User model:
model User {
  // ... existing fields ...
  
  // Google Calendar integration
  googleCalendarEnabled   Boolean  @default(false)  // User has connected + authorized
  googleCalendarId        String?  // ID of the "Tandem" calendar in Google (created on first sync)
  googleCalendarSyncToken String?  @db.Text  // Incremental sync token for Phase 2 read
  
  // Relations
  calendarEvents    CalendarEvent[]
}

// Add to Task model:
model Task {
  // ... existing fields ...
  
  // Calendar time blocks linked to this task
  calendarEvents    CalendarEvent[]
}

// Add to Project model:
model Project {
  // ... existing fields ...
  
  // Calendar events linked to this project (milestones, deadlines)
  calendarEvents    CalendarEvent[]
}
```

### 2.3 How Calendar Events Relate to Existing Date Fields

This is crucial to get right. Tandem already has three temporal concepts on tasks:

| Field | GTD Concept | Calendar Relationship |
|-------|------------|----------------------|
| `scheduledDate` | **Tickler / Defer** — "Don't show me this until Feb 15" | NOT a calendar event. This is visibility control, not time commitment. |
| `dueDate` | **Hard deadline** — "This must be done by March 1" | Optionally creates a DAY_SPECIFIC calendar event for awareness |
| `CalendarEvent (TIME_BLOCK)` | **Intentional scheduling** — "I'll work on this Saturday 10-12" | This IS the calendar event. Links back to the task via `taskId`. |

The key distinction: `scheduledDate` controls *when Tandem shows you the task*. A `CalendarEvent` controls *when you've committed time to work on it*. A task can have a `scheduledDate` of Feb 15 (hidden until then), a `dueDate` of March 1 (hard deadline), AND a `CalendarEvent` time block on Feb 22 at 10am (when you'll actually do it). All three can coexist without conflict because they represent different things.

### 2.4 Google Calendar Sync Model

```prisma
// Tracks per-user Google Calendar connection state
model GoogleCalendarSync {
  id                String    @id @default(cuid())
  
  // Which Google Account is connected
  googleAccountId   String    // Maps to Account.providerAccountId where provider="google"
  
  // The dedicated "Tandem" calendar created in the user's Google Calendar
  tandemCalendarId  String?   // Google Calendar ID (e.g., "abc123@group.calendar.google.com")
  tandemCalendarCreated Boolean @default(false)
  
  // Phase 2: Which calendars to READ from
  // Stored as JSON array of {id, name, color, enabled} objects
  watchedCalendars  Json?     // e.g., [{"id": "primary", "name": "Personal", "enabled": true}]
  
  // Sync state
  lastWriteSyncAt   DateTime?
  lastReadSyncAt    DateTime?
  readSyncToken     String?   @db.Text  // Google's incremental sync token
  syncEnabled       Boolean   @default(true)
  
  // Error tracking
  consecutiveErrors Int       @default(0)
  lastError         String?
  lastErrorAt       DateTime?
  
  userId            String    @unique
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}
```

---

## 3. Google Calendar Integration Architecture

### 3.1 OAuth Scope Expansion

The existing Google OAuth provider in `src/lib/auth.ts` currently requests basic authentication scopes. For Calendar access, we need to request additional scopes:

```typescript
// src/lib/auth.ts — Updated GoogleProvider config
GoogleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  authorization: {
    params: {
      scope: [
        'openid',
        'email', 
        'profile',
        'https://www.googleapis.com/auth/calendar',      // Full calendar access
      ].join(' '),
      access_type: 'offline',  // Required to get refresh_token
      prompt: 'consent',       // Force consent screen to ensure refresh_token
    },
  },
})
```

**Important:** The `access_type: 'offline'` parameter is critical. Without it, Google only returns an `access_token` (expires in 1 hour) with no `refresh_token`. We need the refresh token for background sync operations.

The existing `Account` model already stores `accessToken`, `refreshToken`, and `expiresAt` — no schema changes needed for token storage.

### 3.2 Token Refresh Flow

Google access tokens expire after 1 hour. For any Calendar API call:

```typescript
// src/lib/google-calendar/token.ts

import { prisma } from '@/lib/prisma';
import { google } from 'googleapis';

export async function getGoogleCalendarClient(userId: string) {
  // Find the user's Google OAuth account
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'google' },
  });
  
  if (!account?.refreshToken) {
    throw new Error('Google Calendar not connected. Please re-authorize with Google.');
  }
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  
  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    expiry_date: account.expiresAt ? account.expiresAt * 1000 : undefined,
  });
  
  // Auto-refresh: Listen for new tokens and persist them
  oauth2Client.on('tokens', async (tokens) => {
    const updateData: Record<string, unknown> = {};
    if (tokens.access_token) updateData.accessToken = tokens.access_token;
    if (tokens.refresh_token) updateData.refreshToken = tokens.refresh_token;
    if (tokens.expiry_date) updateData.expiresAt = Math.floor(tokens.expiry_date / 1000);
    
    await prisma.account.update({
      where: { id: account.id },
      data: updateData,
    });
  });
  
  return google.calendar({ version: 'v3', auth: oauth2Client });
}
```

### 3.3 Dedicated "Tandem" Calendar

Rather than writing events to the user's primary Google Calendar (which would pollute their personal/work calendar), Tandem creates a **dedicated secondary calendar** called "Tandem" in the user's Google Calendar account.

Benefits:
- Clean separation — users can toggle Tandem visibility in Google Calendar
- Color-coded in Google Calendar (users choose their preferred color)
- Easy to delete all Tandem events if disconnecting
- Doesn't interfere with work calendar sharing/delegation

```typescript
// src/lib/google-calendar/setup.ts

export async function ensureTandemCalendar(userId: string): Promise<string> {
  const calendarApi = await getGoogleCalendarClient(userId);
  
  const sync = await prisma.googleCalendarSync.findUnique({ where: { userId } });
  
  // If we already have a Tandem calendar, verify it still exists
  if (sync?.tandemCalendarId) {
    try {
      await calendarApi.calendars.get({ calendarId: sync.tandemCalendarId });
      return sync.tandemCalendarId; // Still exists, use it
    } catch {
      // Calendar was deleted externally — fall through to create new one
    }
  }
  
  // Create the "Tandem" calendar
  const newCalendar = await calendarApi.calendars.insert({
    requestBody: {
      summary: 'Tandem',
      description: 'Tasks and events from Tandem GTD. Managed automatically.',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
  
  const calendarId = newCalendar.data.id!;
  
  // Save the calendar ID
  await prisma.googleCalendarSync.upsert({
    where: { userId },
    create: {
      userId,
      googleAccountId: '', // Will be set from Account record
      tandemCalendarId: calendarId,
      tandemCalendarCreated: true,
    },
    update: {
      tandemCalendarId: calendarId,
      tandemCalendarCreated: true,
    },
  });
  
  return calendarId;
}
```

### 3.4 Phase 1: Write Sync (Tandem → Google Calendar)

#### What Gets Pushed to Google Calendar

| Tandem Item | Google Calendar Event | Reminder Default |
|------------|----------------------|-----------------|
| CalendarEvent (TIME_SPECIFIC) | Timed event with start/end | 15 minutes before |
| CalendarEvent (DAY_SPECIFIC) | All-day event | 9:00 AM on the day |
| CalendarEvent (INFORMATION) | All-day event (different color/prefix) | No reminder |
| CalendarEvent (TIME_BLOCK) | Timed event, title prefixed with "⏱️" | 15 minutes before |
| Task with dueDate + sync enabled | All-day event on due date | 9:00 AM on the day |

#### Sync Trigger Points

Sync happens **eagerly on mutation** (not via polling or cron):

1. **CalendarEvent created** → Immediately push to Google Calendar
2. **CalendarEvent updated** → Immediately update in Google Calendar  
3. **CalendarEvent deleted** → Immediately delete from Google Calendar
4. **Task dueDate set/changed** (if user opts into due date sync) → Create/update/delete corresponding CalendarEvent

```typescript
// src/lib/google-calendar/sync-write.ts

export async function syncEventToGoogle(
  eventId: string,
  operation: 'create' | 'update' | 'delete'
): Promise<void> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    include: { user: true, task: true },
  });
  
  if (!event) return;
  
  // Check if user has Google Calendar connected
  const sync = await prisma.googleCalendarSync.findUnique({
    where: { userId: event.userId },
  });
  
  if (!sync?.syncEnabled || !sync.tandemCalendarId) {
    // Not connected — mark as NOT_SYNCED and return
    await prisma.calendarEvent.update({
      where: { id: eventId },
      data: { syncStatus: 'NOT_SYNCED' },
    });
    return;
  }
  
  try {
    const calendarApi = await getGoogleCalendarClient(event.userId);
    const calendarId = sync.tandemCalendarId;
    
    if (operation === 'delete' && event.googleEventId) {
      await calendarApi.events.delete({
        calendarId,
        eventId: event.googleEventId,
      });
      // Event is being deleted from Tandem too, so no status update needed
      return;
    }
    
    const googleEvent = tandemEventToGoogleEvent(event);
    
    if (operation === 'create' || !event.googleEventId) {
      const created = await calendarApi.events.insert({
        calendarId,
        requestBody: googleEvent,
      });
      
      await prisma.calendarEvent.update({
        where: { id: eventId },
        data: {
          googleEventId: created.data.id,
          googleCalendarId: calendarId,
          syncStatus: 'SYNCED',
          lastSyncedAt: new Date(),
          syncError: null,
        },
      });
    } else {
      await calendarApi.events.update({
        calendarId,
        eventId: event.googleEventId,
        requestBody: googleEvent,
      });
      
      await prisma.calendarEvent.update({
        where: { id: eventId },
        data: {
          syncStatus: 'SYNCED',
          lastSyncedAt: new Date(),
          syncError: null,
        },
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';
    
    await prisma.calendarEvent.update({
      where: { id: eventId },
      data: {
        syncStatus: 'SYNC_ERROR',
        syncError: errorMessage,
      },
    });
    
    // Increment error counter on sync record
    await prisma.googleCalendarSync.update({
      where: { userId: event.userId },
      data: {
        consecutiveErrors: { increment: 1 },
        lastError: errorMessage,
        lastErrorAt: new Date(),
      },
    });
    
    // If 5+ consecutive errors, disable sync and notify user
    if ((sync.consecutiveErrors + 1) >= 5) {
      await prisma.googleCalendarSync.update({
        where: { userId: event.userId },
        data: { syncEnabled: false },
      });
      // TODO: Surface "Google Calendar sync disabled due to errors" in UI
    }
  }
}

function tandemEventToGoogleEvent(event: CalendarEventWithRelations) {
  const isAllDay = event.eventType === 'DAY_SPECIFIC' || 
                   event.eventType === 'INFORMATION' ||
                   event.allDay;
  
  const titlePrefix = event.eventType === 'TIME_BLOCK' ? '⏱️ ' :
                      event.eventType === 'INFORMATION' ? 'ℹ️ ' : '';
  
  const description = [
    event.description,
    event.task ? `Task: ${event.task.title}` : null,
    'Managed by Tandem GTD',
  ].filter(Boolean).join('\n\n');
  
  const googleEvent: Record<string, unknown> = {
    summary: `${titlePrefix}${event.title}`,
    description,
    location: event.location,
  };
  
  if (isAllDay) {
    // All-day events use date (not dateTime)
    const dateStr = event.date.toISOString().split('T')[0];
    googleEvent.start = { date: dateStr };
    googleEvent.end = { date: dateStr };
  } else {
    googleEvent.start = {
      dateTime: event.startTime!.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    googleEvent.end = {
      dateTime: event.endTime!.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }
  
  // Reminders
  if (event.reminderMinutes !== null && event.reminderMinutes !== undefined) {
    googleEvent.reminders = {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: event.reminderMinutes }],
    };
  } else if (event.eventType === 'INFORMATION') {
    googleEvent.reminders = { useDefault: false, overrides: [] }; // No reminder
  }
  
  // Recurrence (Phase 2)
  if (event.recurrenceRule) {
    googleEvent.recurrence = [event.recurrenceRule];
  }
  
  return googleEvent;
}
```

#### Retry Logic

Failed syncs are retried on next app load or next mutation to that event. A background check on app startup finds all `PENDING_SYNC` and `SYNC_ERROR` events and retries them:

```typescript
// src/lib/google-calendar/retry.ts
// Called on app load (e.g., in a layout component's useEffect)

export async function retryFailedSyncs(userId: string): Promise<number> {
  const failedEvents = await prisma.calendarEvent.findMany({
    where: {
      userId,
      syncStatus: { in: ['PENDING_SYNC', 'SYNC_ERROR'] },
    },
    orderBy: { updatedAt: 'asc' },
    take: 20, // Batch to avoid rate limits
  });
  
  let retried = 0;
  for (const event of failedEvents) {
    await syncEventToGoogle(event.id, event.googleEventId ? 'update' : 'create');
    retried++;
  }
  
  // Reset consecutive error counter on successful batch
  if (retried > 0) {
    await prisma.googleCalendarSync.update({
      where: { userId },
      data: { consecutiveErrors: 0 },
    });
  }
  
  return retried;
}
```

### 3.5 Phase 2: Read Sync (Google Calendar → Tandem)

In Phase 2, Tandem pulls external events from selected Google Calendars into the sidebar. These are read-only in Tandem — stored as `CalendarEvent` records with `syncStatus: EXTERNAL`.

#### Calendar Selection UI

After connecting Google Calendar, users see a list of their Google Calendars with checkboxes:

```
☑ Personal (primary)
☑ Work
☐ Holidays in United States
☐ Birthdays
☑ Tango Classes
☐ Tandem (managed — always visible, not toggleable)
```

Selected calendars are stored in `GoogleCalendarSync.watchedCalendars` as JSON.

#### Incremental Sync

Google Calendar API supports incremental sync via `syncToken`. On first sync, we do a full pull of events within a date range (past 30 days to future 90 days). Subsequent syncs use the `syncToken` to get only changes.

```typescript
// src/lib/google-calendar/sync-read.ts

export async function pullExternalEvents(userId: string): Promise<number> {
  const sync = await prisma.googleCalendarSync.findUnique({ where: { userId } });
  if (!sync?.syncEnabled || !sync.watchedCalendars) return 0;
  
  const calendarApi = await getGoogleCalendarClient(userId);
  const calendars = sync.watchedCalendars as WatchedCalendar[];
  
  let imported = 0;
  
  for (const cal of calendars.filter(c => c.enabled)) {
    // Skip the Tandem calendar (we manage that ourselves)
    if (cal.id === sync.tandemCalendarId) continue;
    
    const params: Record<string, unknown> = {
      calendarId: cal.id,
      singleEvents: true,     // Expand recurring events into instances
      orderBy: 'startTime',
    };
    
    if (sync.readSyncToken) {
      params.syncToken = sync.readSyncToken;
    } else {
      // First sync: pull events from -30 days to +90 days
      const now = new Date();
      params.timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      params.timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
    }
    
    const response = await calendarApi.events.list(params);
    
    for (const gEvent of response.data.items || []) {
      await upsertExternalEvent(userId, cal.id, gEvent);
      imported++;
    }
    
    // Save sync token for next incremental sync
    if (response.data.nextSyncToken) {
      await prisma.googleCalendarSync.update({
        where: { userId },
        data: { readSyncToken: response.data.nextSyncToken, lastReadSyncAt: new Date() },
      });
    }
  }
  
  return imported;
}
```

#### Read Sync Frequency

External events are refreshed:
- On app load (if last sync > 15 minutes ago)
- When user opens the calendar sidebar
- When user enters the Weekly Review "calendar" steps
- Manual refresh button in sidebar

NOT via webhook/push notifications (too complex for self-hosted; polling is fine for personal use).

---

## 4. Calendar Sidebar UI

### 4.1 Layout

The calendar sidebar is a **persistent, collapsible panel** on the right side of the app. It's visible alongside any view (Do Now, Projects, Inbox, etc.) and can be toggled with a keyboard shortcut.

```
┌─────────────────────────────────────────┬──────────────────────┐
│                                         │  📅 Calendar         │
│  [Current View: Do Now / Projects /     │  ──────────────────  │
│   Inbox / etc.]                         │  ◀ Feb 22, 2026 ▶   │
│                                         │  [Day] [Week] [Mo]  │
│  ... existing view content ...          │                      │
│                                         │  ┌─ 8:00 AM ──────┐ │
│                                         │  │                 │ │
│                                         │  ├─ 9:00 AM ──────┤ │
│                                         │  │ ⏱️ Deep Work:   │ │
│                                         │  │ Pattern draft   │ │
│                                         │  │ (9:00-11:00)    │ │
│                                         │  ├─ 10:00 AM ─────┤ │
│                                         │  │      ↕          │ │
│                                         │  ├─ 11:00 AM ─────┤ │
│                                         │  │                 │ │
│                                         │  ├─ 12:00 PM ─────┤ │
│                                         │  │ 🍽️ Lunch w/ Sam │ │
│                                         │  │ (external)      │ │
│                                         │  ├─ 1:00 PM ──────┤ │
│                                         │  │                 │ │
│                                         │  ├─ 2:00 PM ──────┤ │
│                                         │  │ 📞 Call dentist │ │
│                                         │  │ (2:00 PM)       │ │
│                                         │  └─────────────────┘ │
│                                         │                      │
│                                         │  ── Day Items ──     │
│                                         │  📋 Submit tax ext.  │
│                                         │  ℹ️ Conference starts │
│                                         │                      │
│                                         │  [+ New Event]       │
│                                         │  ── Sync: ✓ ──       │
└─────────────────────────────────────────┴──────────────────────┘
```

### 4.2 View Modes

| Mode | Shows | Best For |
|------|-------|----------|
| **Day** | Hour-by-hour timeline for selected day + day-specific items below | Today's schedule, time blocking |
| **Week** | 7-day grid with events as blocks (compact) | Planning the week, Weekly Review |
| **Month** | Traditional month grid with dots/counts per day | Overview, date picking for scheduling |

Default: **Day view showing today.** Toggle between modes with segmented control buttons or keyboard shortcuts.

### 4.3 Sidebar Behavior

- **Toggle:** `Cmd+\` or calendar icon in the top nav bar
- **Width:** 280px default, resizable 240px-400px (drag handle on left edge)
- **Persistence:** Sidebar open/closed state saved to localStorage
- **Mobile:** Sidebar becomes a bottom sheet or full-screen overlay
- **Interaction:** Click any empty time slot to create a new event. Click existing event to edit. Drag event edges to resize. Drag event body to reschedule.

### 4.4 Event Display

Events are color-coded by type and source:

| Type | Color | Icon |
|------|-------|------|
| TIME_SPECIFIC | Blue (primary) | 📅 |
| DAY_SPECIFIC | Amber | 📋 |
| INFORMATION | Gray | ℹ️ |
| TIME_BLOCK | Green (matches energy theme) | ⏱️ |
| External (Google) | Purple or source calendar color | 🔗 |

Time blocks linked to tasks show the task title and, on hover, the task's context and energy level. Clicking opens a popover with options to: open the linked task, reschedule the block, or delete the block (without affecting the task).

### 4.5 Quick Time Block Creation

The fastest path to "I want to work on this task Saturday at 10am":

1. **From the task card** (Do Now, project view, anywhere): Click "⏱️ Block Time" button → time picker popover → creates CalendarEvent with `TIME_BLOCK` type and `taskId` link
2. **From the calendar sidebar**: Click empty time slot → "New Event" dialog with option to link an existing task
3. **Drag and drop** (future): Drag a task card from the main view onto a calendar time slot

### 4.6 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+\` | Toggle calendar sidebar |
| `T` (in sidebar) | Jump to today |
| `←` / `→` (in sidebar) | Previous / next day/week/month |
| `N` (in sidebar) | New event |
| `1` / `2` / `3` (in sidebar) | Switch to Day / Week / Month view |

---

## 5. API Routes

### 5.1 Calendar Events CRUD

```
GET    /api/calendar                    # List events (with date range filters)
POST   /api/calendar                    # Create event
GET    /api/calendar/:id                # Get single event
PATCH  /api/calendar/:id                # Update event
DELETE /api/calendar/:id                # Delete event (+ delete from Google)
POST   /api/calendar/time-block         # Quick time-block creation (accepts taskId + time)
```

#### Query Parameters for GET /api/calendar

| Param | Type | Description |
|-------|------|-------------|
| `start` | ISO datetime | Start of date range (required) |
| `end` | ISO datetime | End of date range (required) |
| `types` | comma-separated | Filter by event type(s) |
| `includeExternal` | boolean | Include events pulled from Google (Phase 2) |
| `taskId` | string | Show only time blocks for a specific task |

### 5.2 Google Calendar Sync

```
GET    /api/calendar/google/status      # Connection status + sync health
POST   /api/calendar/google/connect     # Initiate Google Calendar connection flow
POST   /api/calendar/google/disconnect  # Remove connection, optionally delete Tandem calendar
POST   /api/calendar/google/sync        # Trigger manual sync (retry failed + pull external)
GET    /api/calendar/google/calendars   # List user's Google Calendars (for Phase 2 selection)
PATCH  /api/calendar/google/calendars   # Update which calendars to watch (Phase 2)
```

### 5.3 Settings API

```
GET    /api/settings/calendar           # User's calendar preferences
PATCH  /api/settings/calendar           # Update preferences
```

Calendar settings object:

```typescript
interface CalendarSettings {
  sidebarOpen: boolean;
  sidebarWidth: number;
  defaultView: 'day' | 'week' | 'month';
  defaultReminderMinutes: number;        // Default: 15
  syncDueDatesToGoogle: boolean;          // Auto-create calendar events for task due dates
  timeBlockDefaultDuration: number;       // Minutes. Default: 60
  workingHoursStart: string;             // e.g., "09:00" — used to gray out off-hours
  workingHoursEnd: string;               // e.g., "17:00"
  weekStartsOn: 0 | 1;                  // 0 = Sunday, 1 = Monday
}
```

---

## 6. Integration with Existing Features

### 6.1 "What Should I Do Now?" View

The Do Now view gains calendar awareness:

- **Time conflicts:** If a task is time-blocked for right now, surface it at the top with "Scheduled now (10:00-11:00)" badge
- **Upcoming awareness:** Show "Next: Dentist at 2:00 PM (in 45 min)" at the top of the view so you don't over-commit to a long task
- **Available time calculation:** If you have 45 minutes before your next event, the view can optionally filter to tasks with `estimatedMins <= 45`

### 6.2 Weekly Review — Calendar Steps

The Weekly Review spec describes two calendar-dependent steps that currently have no data source:

**"Review Previous Calendar (what happened?)"**
- Phase 1: Show the past 7 days from the CalendarEvent model (Tandem-native events)
- Phase 2: Also include external Google Calendar events pulled via read sync
- UI: Scrollable list grouped by day, with "Did this generate any new actions?" prompt per event

**"Review Upcoming Calendar (what's coming?)"**
- Same pattern but for next 14 days
- UI: Grouped by day, with "Do you need to prepare for this?" prompt per event
- Any captured actions during this step go to inbox for processing

### 6.3 Inbox Processing

During clarification, when a task IS actionable and NOT a 2-minute task, add an optional step:

**"Does this need to happen at a specific time?"**
- **Yes, specific time** → Create as task + CalendarEvent (TIME_SPECIFIC) 
- **Yes, specific day** → Create as task with `dueDate` + optional CalendarEvent (DAY_SPECIFIC)
- **No, just needs the right context** → Normal task creation (context + energy + time estimate)

This reinforces the GTD calendar discipline at the point of capture.

### 6.4 Recurring Templates

Existing `RecurringTemplate` records generate tasks on a schedule. When a template has a time-specific nature (e.g., "Weekly tango class every Tuesday at 7pm"), the generated task should also create a corresponding CalendarEvent. Add an optional `calendarEventDefaults` JSON field to `RecurringTemplate`:

```typescript
interface CalendarEventDefaults {
  createCalendarEvent: boolean;
  eventType: CalendarEventType;
  startTime?: string;  // "19:00" — combined with the generated date
  endTime?: string;    // "20:30"
  location?: string;
  reminderMinutes?: number;
}
```

### 6.5 MCP Server Integration

Add calendar tools to the MCP server for Claude Desktop / claude.ai access:

```typescript
// New MCP tools
tandem_calendar_list     // List events for a date range
tandem_calendar_create   // Create a calendar event
tandem_calendar_block    // Quick time-block a task
tandem_calendar_today    // Show today's schedule (convenience)
```

This enables natural language scheduling: "Block 2 hours for pattern drafting this Saturday morning" → Claude calls `tandem_calendar_block`.

---

## 7. User Flows

### 7.1 First-Time Google Calendar Setup

```
1. User goes to Settings > Calendar
2. Clicks "Connect Google Calendar"
3. Redirected to Google OAuth consent screen
   — Shows: "Tandem wants to access your Google Calendar"
   — Scopes: View and edit events
4. User approves → redirected back to Tandem
5. Tandem creates the "Tandem" secondary calendar in Google
6. Success message: "Connected! Tandem events will appear 
   on a 'Tandem' calendar in your Google Calendar."
7. Settings show:
   — ✅ Google Calendar connected (user@gmail.com)
   — Sync: Enabled / Disabled toggle
   — "Sync due dates to Google Calendar" checkbox
   — [Disconnect] button
```

### 7.2 Creating a Time Block for a Task

```
1. User is in Do Now view, sees "Draft tango workshop curriculum"
2. Clicks ⏱️ icon on the task card
3. Popover appears:
   — Date picker (defaults to today)
   — Start time picker
   — Duration dropdown (30m, 1h, 1.5h, 2h, custom)
   — [Block Time] button
4. User selects: Saturday, 10:00 AM, 2 hours
5. CalendarEvent created:
   — type: TIME_BLOCK
   — taskId: linked to "Draft tango workshop curriculum"
   — title: "Draft tango workshop curriculum"
   — startTime: Sat 10:00 AM
   — endTime: Sat 12:00 PM
6. Immediately synced to Google Calendar → appears on phone
7. Saturday 9:45 AM: phone notification "⏱️ Draft tango workshop curriculum in 15 minutes"
```

### 7.3 Creating a Hard Landscape Calendar Event

```
1. User clicks [+ New Event] in calendar sidebar
2. Dialog appears:
   — Title: "Dentist appointment"
   — Type: [Time-specific] [Day-specific] [Information]
   — Date: March 5, 2026
   — Start time: 2:00 PM
   — End time: 3:00 PM
   — Location: "123 Main St" (optional)
   — Reminder: 1 hour before
   — Link to task: [None] (optional dropdown)
   — [Create Event]
3. CalendarEvent created + synced to Google Calendar
4. Optionally: "Create a preparation task?" → generates inbox item 
   "Prepare for dentist appointment" deferred to 1 day before
```

---

## 8. Error Handling & Edge Cases

### 8.1 Google Calendar Disconnected

If the user revokes Tandem's access in Google Account settings:
- Next sync attempt gets 401 → mark sync as disabled
- Show banner in Tandem: "Google Calendar disconnected. Events will be saved locally. [Reconnect]"
- All existing CalendarEvents remain in Tandem (local data is never deleted by sync issues)
- `syncStatus` set to `NOT_SYNCED` for all events

### 8.2 Offline / Network Failure

Tandem is self-hosted, so the app is always "online" relative to its own database. Google Calendar sync failures are handled by the retry mechanism (Section 3.4). Events are created locally immediately and synced when connectivity to Google is available.

### 8.3 Conflict Resolution

Since Phase 1 is write-only (Tandem → Google), there are no conflicts. Tandem is the source of truth. If a user edits an event in Google Calendar directly, it won't be reflected in Tandem until Phase 2 read sync is implemented.

In Phase 2, conflict resolution is simple: **last write wins** for Tandem-managed events. External events (from other Google Calendars) are always read-only in Tandem.

### 8.4 Token Expiration

Google refresh tokens can expire if:
- User changes their Google password
- User revokes access
- Token is unused for 6+ months (Google's policy for apps in "Testing" mode)

Handle by catching 401 errors during any Calendar API call and prompting re-authorization.

### 8.5 Rate Limits

Google Calendar API allows 1,000,000 queries/day and 500 queries/100 seconds per user. For a personal/family Tandem instance, this is effectively unlimited. No throttling needed.

---

## 9. Implementation Roadmap

### Phase 1a: Foundation (Calendar Without Google)

**Goal:** Native calendar events + sidebar working locally, no Google integration yet.

1. Database migration: `CalendarEvent` model
2. API routes: CRUD for calendar events
3. Calendar sidebar component (day/week/month views)
4. Time block creation from task cards
5. Integration with Do Now view (upcoming event awareness)
6. Keyboard shortcuts

**Estimated effort:** 2-3 focused sessions

### Phase 1b: Google Calendar Write Sync

**Goal:** Events created in Tandem appear on Google Calendar with reminders.

1. Expand Google OAuth scopes (calendar access)
2. Token refresh infrastructure
3. "Tandem" calendar creation in Google
4. Write sync on event mutation (create/update/delete)
5. Retry logic for failed syncs
6. Settings UI for Google Calendar connection
7. Sync status indicator in sidebar

**Estimated effort:** 2-3 focused sessions

### Phase 2a: Google Calendar Read Sync

**Goal:** External Google Calendar events visible in Tandem's sidebar.

1. Calendar selection UI (which Google Calendars to watch)
2. Incremental sync with `syncToken`
3. External event display in sidebar (read-only, color-coded)
4. Refresh on app load + manual refresh button
5. Weekly Review calendar step integration

**Estimated effort:** 1-2 focused sessions

### Phase 2b: Recurring Calendar Events + Drag-and-Drop Time Blocking

**Goal:** Repeating events and the most intuitive time-blocking interaction.

1. Recurrence rule builder UI (weekly, biweekly, monthly, custom)
2. RRULE generation for Google Calendar compatibility
3. RecurringTemplate integration (auto-create calendar events)
4. Drag-and-drop from task cards (Do Now, project views) onto calendar sidebar time slots

**Estimated effort:** 2-3 focused sessions

### Future Roadmap

- **Multiple Google Accounts** — Connect personal + work Google accounts, choose which calendar receives which event types
- **Apple Calendar sync** — iCal protocol support for non-Google users
- **Calendar-aware task suggestions** — Do Now factors in available time between calendar events when suggesting tasks

---

## 10. Technical Dependencies

| Dependency | Purpose | Notes |
|-----------|---------|-------|
| `googleapis` | Google Calendar API client | npm package, handles auth + API calls |
| `date-fns` or `dayjs` | Date manipulation | Already in use? Check Tandem's current date library |
| Google Cloud Console | OAuth credentials | Need to add `calendar` scope to existing OAuth app |

### Google Cloud Console Changes Required

1. Go to APIs & Services → Library → Enable "Google Calendar API"
2. Go to OAuth consent screen → Add scope: `https://www.googleapis.com/auth/calendar`
3. If app is in "Testing" mode: add test users, or publish to avoid token expiration issues

---

## 11. Privacy & Security Considerations

### What Data Flows to Google

- Event titles, descriptions, locations, times
- Task titles (for time blocks)
- "Managed by Tandem GTD" marker in description

### What Does NOT Flow to Google

- Task notes, context, energy level, project details
- Inbox items, waiting-for items
- Wiki content, goals, horizon notes
- Any item with `aiVisibility: REDACTED` (respect existing privacy controls)

### Self-Hosted Advantage

Since Tandem is self-hosted, the Google Calendar integration runs from the user's own server. There's no Tandem cloud service in the middle. The data path is: User's Tandem server ↔ Google Calendar API. Anthropic/Tandem never sees the data.

### Encryption at Rest

Google OAuth tokens (access + refresh) are stored in the `Account` model. Consider encrypting `refreshToken` at rest using `TANDEM_ENCRYPTION_KEY` (same pattern as `anthropicApiKey` encryption already in the codebase).

---

## 12. Design Decisions (Resolved)

1. **Due date → Calendar auto-sync:** Global toggle in settings (default: off), with per-task override. Not all tasks need calendar presence — only those with true hard deadlines that you need your phone to remind you about.

2. **Time zone handling:** Store all times in UTC, display in user's browser timezone, pass timezone to Google Calendar API. Covers multi-user scenarios if users are in different zones.

3. **No full-page calendar view.** The calendar is NOT a work surface — Do Now is. This is core GTD: the calendar shows the "hard landscape" you work *around*, not the work itself. Tandem's job is to push calendar events to where people already look (Google Calendar on their phone), not to become another calendar app. The sidebar provides enough in-app awareness for time blocking and scheduling decisions. Users view and manage their calendar in their preferred calendar app.

4. **Drag-and-drop from task list to calendar:** Planned for Phase 2. This is the most intuitive time-blocking interaction (drag a task card from Do Now onto a calendar time slot), but technically complex (cross-component drag). Phase 1 uses the "⏱️ Block Time" button on task cards, which is sufficient and simpler.

5. **Single Google Account for v1.** The connected Google account's calendar is used for sync. If someone uses Tandem with their work email, that becomes the primary calendar target. Multi-account support (personal + work Google accounts) is a future roadmap item — the Account model already supports multiple providers per user, so the data model is ready when we get there.

### GTD Calendar Discipline

David Allen's calendar rules, codified into Tandem's behavior:

- **The calendar is sacred ground.** Only three things belong: time-specific actions, day-specific actions, and day-specific information. Tandem enforces this through the `CalendarEventType` enum — there is no "put a task on the calendar" shortcut that bypasses this categorization.
- **The calendar is not a to-do list.** Tasks live in context-based next-action lists (Do Now). The calendar shows commitments you've made to specific times or days. Tandem keeps these systems separate by design — `CalendarEvent` and `Task` are distinct models with an optional link, not the same thing.
- **Time blocks are intentional, not aspirational.** When you block time for a task, you're making a commitment to your future self: "I will sit down and do this at this time." Tandem pushes this to Google Calendar so your phone holds you to it. This is different from "I hope to get to this today" — that's what the Do Now context view handles.
- **Review the calendar, don't live in it.** The Weekly Review includes "Review Previous Calendar" and "Review Upcoming Calendar" steps that surface calendar data for reflection. But daily engagement happens through Do Now, not the calendar. The sidebar exists for quick awareness and time blocking, not as a primary navigation surface.
