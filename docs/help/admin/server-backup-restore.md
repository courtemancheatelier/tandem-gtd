---
title: Server Backup & Restore
category: Admin
tags: [admin, backup, restore, export, import, migration, server, users]
sortOrder: 3
adminOnly: true
---

# Server Backup & Restore

As an admin, you can export and import the entire server — all users and all their data — in a single JSON file. This is how you migrate to a new Tandem instance, create full server backups, or restore from a backup.

Both features are at the bottom of **Settings > Admin Settings**.

---

## Server Backup (Export)

The **Server Backup** card lets you download a complete snapshot of the server.

### What's Included

- **All users** — email, name, admin status
- **All user data** — tasks, projects, inbox items, contexts, areas, goals, horizon notes, wiki articles, waiting-for items, recurring templates, weekly reviews
- **Server settings** — registration mode, branding, AI configuration

### How to Export

1. Go to **Settings > Admin Settings**
2. Scroll to **Server Backup**
3. Click **Download Server Export**

The file downloads as `tandem-server-export-YYYY-MM-DD.json`.

### What's NOT Included

- **Passwords** — user passwords are never included in exports (for security)
- **OAuth accounts** — linked Google/Apple accounts are not exported
- **Sessions** — active login sessions are not exported
- **Invite codes** — invite code history is not exported

---

## Server Restore (Import)

The **Server Restore** card lets you upload a server export file to recreate users and their data.

### How It Works

1. Go to **Settings > Admin Settings**
2. Scroll to **Server Restore**
3. Select a server export JSON file
4. Click **Import**

For each user in the export file:

- **If the email already exists** on this server — the user is **skipped** (no data is overwritten)
- **If the email is new** — the user is **created** with a random temporary password, and all their data is imported

### Temporary Passwords

New users are created with a random 16-character temporary password. After import, a results table shows:

| Column | Description |
|--------|-------------|
| **Status** | Created, Skipped, or Error |
| **Email** | The user's email address |
| **Items** | Number of items imported (for created users) |
| **Temp Password** | Click to copy (only shown for new users) |

**Important:** Temporary passwords are shown once and cannot be retrieved later. Copy them immediately and distribute them securely to each user. Users should change their password on first login.

### What Gets Imported

For each new user, the full import processor runs — the same one used for individual Tandem JSON imports. This means:

- All data types are restored (tasks, projects, contexts, areas, goals, horizon notes, wiki articles, waiting-for items, recurring templates, weekly reviews)
- Project hierarchy (parent/child relationships) is preserved
- Duplicate detection runs per-user (though on a fresh server, nothing will be flagged)

### What Does NOT Get Imported

- **Server settings** — registration mode, branding, and other server configuration are not overwritten (too risky to auto-apply)
- **Existing user data** — if a user's email already exists, their account is completely skipped
- **Team memberships** — teams are not recreated (team structure can be rebuilt manually)

---

## Migration Workflow

To move from one Tandem server to another:

1. **On the old server:** Go to Admin Settings > Server Backup > Download Server Export
2. **On the new server:** Set up a fresh Tandem instance
3. **On the new server:** Log in as admin, go to Admin Settings > Server Restore > Upload the export file
4. **Distribute passwords:** Copy the temporary passwords from the results table and send them securely to each user
5. **Users log in:** Each user logs in with their email and temporary password, then changes their password in Settings

### Re-running an Import

If you need to import the same file again (for example, if some users had errors), it's safe to re-run — users that were already created will be skipped.

---

## Tips

- **Export regularly** — server exports make excellent backups alongside your database backups
- **Test on a fresh instance** — if migrating, consider testing the import on a throwaway instance first
- **Password distribution** — consider using a secure channel (encrypted messaging, in-person) to share temporary passwords
- **OAuth users** — users who originally signed in via Google or Apple will need to either use their temporary password or re-link their OAuth account on the new server
