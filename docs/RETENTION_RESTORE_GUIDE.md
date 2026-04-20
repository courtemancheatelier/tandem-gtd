# Tandem GTD — Retention Export Decrypt & Restore Guide

When the data retention system purges a project, it first exports the full project tree to encrypted files on disk. This guide covers how to decrypt those exports and restore data if needed.

---

## Quick Reference

| Task | Command |
|------|---------|
| List retention exports | `ls /path/to/retention-exports/*.enc` |
| Decrypt a single file | `npx tsx src/scripts/retention-decrypt.ts /path/to/file.json.enc` |
| Decrypt all exports | `npx tsx src/scripts/retention-decrypt.ts /path/to/retention-exports/` |
| View retention logs | `psql -c "SELECT * FROM \"RetentionLog\" ORDER BY \"createdAt\" DESC LIMIT 20;"` |
| Restore a project from export | `npx tsx src/scripts/retention-restore.ts /path/to/file.json` |

---

## 1. How Retention Exports Work

When the retention system purges a project tree:

1. A **JSON export** is created containing the full project hierarchy — project metadata, all tasks, events, snapshots, and sub-projects
2. A **CSV export** is created with a flat task list for easy viewing in a spreadsheet
3. Both files are **encrypted with AES-256-GCM** using the same key as the rest of Tandem (`TANDEM_ENCRYPTION_KEY` or `NEXTAUTH_SECRET`)
4. The plaintext originals are **deleted immediately** — only `.enc` files remain on disk
5. After `retentionExportKeepDays` (default 90 days), the `.enc` files are cleaned up too

### File Naming

```
retention-{projectId}-{timestamp}.json.enc    # Encrypted JSON (full tree)
retention-{projectId}-{timestamp}.csv.enc     # Encrypted CSV (flat task list)
```

### Encryption Details

| Property | Value |
|----------|-------|
| Algorithm | AES-256-GCM |
| Key derivation | SHA-256 hash of `TANDEM_ENCRYPTION_KEY` or `NEXTAUTH_SECRET` |
| IV | 16 random bytes (prepended to file) |
| Auth tag | 16 bytes (follows IV) |
| File format | Binary: `[IV 16B][Tag 16B][Ciphertext]` |

---

## 2. Decrypting Exports

### Prerequisites

- Access to the server or a copy of the `.enc` files
- The same `TANDEM_ENCRYPTION_KEY` (or `NEXTAUTH_SECRET`) that was active when the export was created
- Node.js and the Tandem codebase

### Option A: Decrypt Script (Recommended)

From the Tandem project directory:

```bash
# Decrypt a single file
npx tsx src/scripts/retention-decrypt.ts /path/to/retention-abc123-1709312000000.json.enc

# Decrypt all .enc files in a directory
npx tsx src/scripts/retention-decrypt.ts /path/to/retention-exports/
```

This writes the decrypted file alongside the `.enc` file (e.g. `file.json.enc` → `file.json`).

### Option B: Node.js REPL

```bash
cd /opt/tandem  # or your Tandem install path
node -e "
const { decryptFile } = require('./src/lib/ai/crypto');
decryptFile('/path/to/retention-abc123-1709312000000.json.enc')
  .then(p => console.log('Decrypted to:', p))
  .catch(e => console.error(e));
"
```

### Option C: Programmatic (TypeScript)

```typescript
import { decryptFile } from "@/lib/ai/crypto";

const decryptedPath = await decryptFile("/path/to/file.json.enc");
// Writes: /path/to/file.json
```

---

## 3. Understanding the Export Format

### JSON Export Structure

```json
{
  "version": 1,
  "exportedAt": "2026-03-01T12:00:00.000Z",
  "retentionExport": true,
  "project": {
    "id": "clx...",
    "title": "My Project",
    "description": "...",
    "status": "COMPLETED",
    "type": "SEQUENTIAL",
    "childType": "SEQUENTIAL",
    "outcome": "...",
    "completedAt": "2025-08-15T...",
    "createdAt": "2025-01-10T...",
    "updatedAt": "2025-08-15T..."
  },
  "tasks": [
    {
      "id": "clx...",
      "title": "Task name",
      "notes": "...",
      "status": "COMPLETED",
      "isNextAction": false,
      "estimatedMins": 30,
      "energyLevel": "MEDIUM",
      "dueDate": null,
      "scheduledDate": null,
      "completedAt": "2025-08-14T...",
      "sortOrder": 0,
      "contextName": "@Computer",
      "assignedToName": null,
      "createdAt": "2025-01-10T..."
    }
  ],
  "events": [
    {
      "id": "clx...",
      "eventType": "CREATED",
      "changes": {},
      "message": null,
      "source": "MANUAL",
      "actorType": "USER",
      "createdAt": "2025-01-10T..."
    }
  ],
  "snapshots": [],
  "subProjects": []
}
```

### CSV Export Columns

| Column | Description |
|--------|-------------|
| title | Task title |
| status | NOT_STARTED, IN_PROGRESS, COMPLETED, DROPPED |
| project | Parent project title |
| completedAt | ISO 8601 timestamp |
| estimatedMins | Estimated minutes |
| context | GTD context name (e.g. @Computer) |
| energyLevel | LOW, MEDIUM, HIGH |
| notes | Task notes (may contain newlines) |

---

## 4. Restoring Data

### Manual Restore via Admin Import

The simplest approach for restoring a few tasks:

1. Decrypt the CSV export
2. Open in a spreadsheet
3. Manually recreate the project and tasks in Tandem

### Programmatic Restore

For a full project tree restore from the JSON export, use the restore script:

```bash
# Decrypt first
npx tsx src/scripts/retention-decrypt.ts /path/to/file.json.enc

# Then restore
npx tsx src/scripts/retention-restore.ts /path/to/file.json
```

This recreates the project, all tasks, and sub-projects. Note:
- New IDs are generated (original IDs are stored in task notes for reference)
- Events and snapshots are **not** restored (they were historical records)
- The project is created in ACTIVE status regardless of its original status
- Context assignments are matched by name — contexts must exist in the target instance

### Database-Level Restore

If you need to restore the entire database (not just a single project), use the standard backup restore process instead:

```bash
sudo ./scripts/dr-restore.sh latest
```

See `docs/BACKUP_GUIDE.md` for full database restore procedures.

---

## 5. Troubleshooting

### "Decryption failed" Error

The encryption key has changed since the export was created. The `.enc` files can only be decrypted with the same `TANDEM_ENCRYPTION_KEY` (or `NEXTAUTH_SECRET`) that was set when the export was made.

**Prevention:** Always include your encryption key in your disaster recovery documentation or password manager alongside `BACKUP_PASSPHRASE`.

### Export Files Missing

Check `retentionExportKeepDays` in admin settings. If the export was created more than that many days ago, it was automatically cleaned up. The only recovery option is a full database restore from backup.

### Finding Which Project Was Purged

Query the retention log:

```sql
SELECT action, "projectId", "projectTitle", "taskCount", "exportPath", "createdAt"
FROM "RetentionLog"
WHERE action = 'PURGED'
ORDER BY "createdAt" DESC;
```

The `exportPath` column shows where the encrypted export was written.

---

## 6. Key Management

The retention export encryption key is the same as the rest of Tandem:

| Environment Variable | Purpose |
|---------------------|---------|
| `TANDEM_ENCRYPTION_KEY` | Primary encryption key (preferred) |
| `NEXTAUTH_SECRET` | Fallback if `TANDEM_ENCRYPTION_KEY` is not set |

**Store this key securely.** If lost, encrypted retention exports cannot be recovered. Recommended storage:
- Password manager (1Password, Bitwarden, etc.)
- Physical safe (printed or on USB)
- NOT in the same location as the exports

This is separate from `BACKUP_PASSPHRASE` used for GPG-encrypted SQL backups.
