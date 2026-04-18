# Google Calendar Sync (Phase 1b) — Test Plan

## Prerequisites (MUST DO BEFORE TESTING)

1. **Google Cloud Console — Enable Calendar API**
   - Go to [APIs & Services > Library](https://console.cloud.google.com/apis/library)
   - Search for "Google Calendar API" and enable it

2. **Google Cloud Console — Update OAuth Consent Screen**
   - Go to [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
   - Add scope: `https://www.googleapis.com/auth/calendar`
   - Save

3. **Run migration on alpha**
   ```bash
   ssh tandem-vps "sudo -u tandemAlpha bash -c 'cd /opt/tandem-alpha && npx prisma migrate deploy'"
   ```

4. **Re-authenticate with Google**
   - Existing users must sign out and sign back in with Google to grant the new calendar scope
   - The consent screen will now show "View and edit events on all your calendars"
   - Google only returns a `refresh_token` on consent, so `prompt: consent` forces this every time

## Test Scenarios

### Settings Page — Connection Flow
- [ ] Settings page shows "Google Calendar" section (collapsed by default)
- [ ] Section shows "Not connected" badge when no sync is set up
- [ ] If no Google account linked, shows guidance to link one first
- [ ] "Connect Google Calendar" button calls the connect endpoint
- [ ] On success: creates a "Tandem" secondary calendar in Google Calendar
- [ ] Section updates to show "Connected" badge, sync toggle, last synced time
- [ ] Verify the "Tandem" calendar appears in Google Calendar (web or mobile)

### Write Sync — Create
- [ ] Create a TIME_SPECIFIC event in Tandem → appears in Google "Tandem" calendar with correct time
- [ ] Create a DAY_SPECIFIC event → appears as all-day event in Google
- [ ] Create an INFORMATION event → appears with "ℹ️" prefix, no reminder
- [ ] Create a TIME_BLOCK → appears with "⏱️" prefix and correct duration
- [ ] Event description in Google includes "Managed by Tandem GTD"
- [ ] Reminder minutes set on Tandem event show as popup reminder in Google

### Write Sync — Update
- [ ] Edit event title in Tandem → title updates in Google
- [ ] Change event time → time updates in Google
- [ ] Change event type → Google event updates accordingly

### Write Sync — Delete
- [ ] Delete event in Tandem → event removed from Google "Tandem" calendar

### Sidebar Sync Indicator
- [ ] Calendar sidebar shows green dot next to "Calendar" when connected and synced
- [ ] Shows red dot when there are sync errors
- [ ] No dot when not connected

### Error Handling & Retry
- [ ] If Google API is unreachable, event saves locally with `SYNC_ERROR` status
- [ ] Manual "Retry Sync" button in settings processes failed events
- [ ] After 5 consecutive errors, sync is auto-disabled (circuit breaker)
- [ ] Settings shows error message with error count

### Disconnect Flow
- [ ] "Disconnect Google Calendar" button removes the "Tandem" calendar from Google
- [ ] All CalendarEvent records reset to `NOT_SYNCED`, `googleEventId` cleared
- [ ] GoogleCalendarSync record is deleted
- [ ] Settings section returns to "Not connected" state

### Edge Cases
- [ ] Creating events when sync is not connected → events saved locally, `NOT_SYNCED` status
- [ ] User deletes the "Tandem" calendar directly in Google → next connect re-creates it
- [ ] Rapid create/update/delete → sync handles all operations without errors
