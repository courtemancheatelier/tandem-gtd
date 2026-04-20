# Data Retention & Purge — Testing Guide

## Prerequisites

- Local dev server running (`npm run dev` on port 2000)
- Database accessible via `psql` (for backdating timestamps)
- Admin account logged in

---

## 1. Enable Retention (Short Periods for Testing)

Go to **Settings > Admin** (`/settings/admin`), open the **Data Retention** collapsible section:

- Toggle **Enable Retention** on
- Set **Retention Period** to `1` day
- Set **Grace Period** to `1` day
- Set **Export Path** to `/tmp/tandem-retention-exports` (optional, enables JSON/CSV export before delete)
- Leave **Include Standalone Tasks** on

## 2. Create and Complete a Test Project

1. Create a project (e.g. "Retention Test Project")
2. Add a task, complete it
3. Complete the project
4. Backdate `completedAt` so it's eligible immediately:

```sql
UPDATE "Project" SET "completedAt" = NOW() - INTERVAL '2 days' WHERE title = 'Retention Test Project';
```

## 3. Dry Run from Admin UI

Go to **Settings > Admin** — the **Retention Status** card should show:

- "1 eligible" (your completed project)
- Click **Dry Run** — toast shows what would happen without making changes

## 4. Schedule + Purge

1. Click **Run Purge** — the project gets `purgeScheduledAt` set, a notification is created, and a `SCHEDULED` retention log entry appears
2. Since grace period is 1 day, backdate `purgeScheduledAt` to simulate the grace period passing:

```sql
UPDATE "Project" SET "purgeScheduledAt" = NOW() - INTERVAL '1 day' WHERE title = 'Retention Test Project';
```

3. Click **Run Purge** again — this time the project is exported (if export path is set) and deleted from the database
4. Check `/tmp/tandem-retention-exports/` for the encrypted files (`.json.enc` and `.csv.enc`)

## 5. Test Reactivation Guard

1. Complete another project, backdate `completedAt` by 2 days
2. Run Purge to schedule it (sets `purgeScheduledAt`)
3. Go to the project detail page — a red banner should appear: "Scheduled for deletion on [date]"
4. Click **Reactivate** — project moves back to ACTIVE, `purgeScheduledAt` is cleared, a `CANCELLED` retention log entry is written
5. Verify: the banner disappears, the project is back in the active projects list

## 6. Test Exempt Toggle

1. Schedule a project for purge (as in step 4)
2. On the project detail page, click **Exempt** in the banner
3. Verify: `retentionExempt` is set to true, `purgeScheduledAt` is cleared
4. Run Purge again — this project should no longer appear as eligible

## 7. Test Standalone Task Purge

1. Create a standalone task (not in any project), complete it
2. Backdate `completedAt`:

```sql
UPDATE "Task" SET "completedAt" = NOW() - INTERVAL '2 days' WHERE title = 'Your Standalone Task' AND "projectId" IS NULL;
```

3. Run Purge — the toast should report standalone tasks purged
4. Verify the task is gone from the database

## 8. Test Notifications

After a project is scheduled for purge (step 4.1):

- Click the notification bell — should see "Project scheduled for deletion" with a Trash2 icon
- Clicking the notification should navigate to the project detail page

## 9. CLI Script

```bash
cd /Users/jasoncourtemanche/Claude-JMC/Tandem

# Preview what would happen
npx tsx src/scripts/retention-purge.ts --dry-run

# Actually run
npx tsx src/scripts/retention-purge.ts --execute

# With options
npx tsx src/scripts/retention-purge.ts --execute --batch-size=5
npx tsx src/scripts/retention-purge.ts --execute --project-id=<id>
```

## 10. Cron Endpoint

Test the cron endpoint directly (requires `CRON_SECRET` env var):

```bash
curl -X POST http://localhost:2000/api/cron/retention \
  -H "Authorization: Bearer $CRON_SECRET"
```

## 11. Export Encryption

Retention exports are encrypted at rest using AES-256-GCM (same key as `TANDEM_ENCRYPTION_KEY` / `NEXTAUTH_SECRET`). Plaintext is never left on disk — it's written, encrypted, then the original is deleted.

Export files end in `.enc` (e.g. `retention-abc123-1709312000000.json.enc`).

To decrypt an export manually (Node.js):

```typescript
import { decryptFile } from "@/lib/ai/crypto";
await decryptFile("/tmp/tandem-retention-exports/retention-abc123-1709312000000.json.enc");
// Writes decrypted file to: retention-abc123-1709312000000.json
```

## 12. Export Cleanup

If export path is set and `retentionExportKeepDays` is configured, old encrypted export files are automatically cleaned up during purge runs. To test:

1. Set **Keep Exports** to `1` day
2. Run a purge that creates exports
3. Touch the export file dates to be old: `touch -t 202501010000 /tmp/tandem-retention-exports/retention-*.enc`
4. Run purge again — old exports should be removed

## Verification Checklist

- [ ] Retention settings save and load correctly in admin UI
- [ ] Eligible projects appear in Retention Status card
- [ ] Dry Run shows correct counts without making changes
- [ ] Run Purge schedules eligible projects (sets `purgeScheduledAt`, creates notification + log)
- [ ] Run Purge deletes projects past grace period (exports first if path set)
- [ ] Exported files are encrypted (.enc) and no plaintext files remain on disk
- [ ] Reactivating a scheduled project clears `purgeScheduledAt`
- [ ] Exempting a project clears `purgeScheduledAt` and excludes from future runs
- [ ] Standalone completed tasks are purged when enabled
- [ ] RETENTION_WARNING notification renders with Trash2 icon
- [ ] Project detail page shows red purge banner with Reactivate/Exempt buttons
- [ ] CLI script works with --dry-run and --execute
- [ ] `npm run build` passes
