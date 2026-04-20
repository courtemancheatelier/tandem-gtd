---
title: Import & Export
category: Features
tags: [import, export, backup, csv, json, todoist, migration, data]
sortOrder: 8
---

# Import & Export

Tandem makes it easy to get your data in and out. Export your GTD system as a backup, import data from another tool, or migrate from a previous Tandem instance. Everything lives under **Settings**.

---

## Exporting Your Data

Go to **Settings** and find the **Export Your Data** card.

### Format Options

| Format | Best For | Supports |
|--------|----------|----------|
| **JSON** | Full backups, re-importing into Tandem | All data types |
| **CSV** | Spreadsheets, other tools | Tasks and projects only |

### Scope

Choose what to include in the export:

- **Everything** — tasks, projects, inbox items, contexts, areas, goals, horizon notes, wiki articles, waiting-for items, recurring templates, and weekly reviews
- Or pick a specific category (Tasks, Projects, Inbox, Contexts, Areas, Goals, Horizon Notes, Wiki Articles)

### Include Completed Items

Check this box to include completed tasks and projects in the export. Uncheck it to export only active items.

### How to Export

1. Choose a **format** (JSON or CSV)
2. Choose a **scope** (Everything or a specific category)
3. Toggle **Include completed items** as needed
4. Click **Download Export**

The file downloads immediately with a timestamped filename like `tandem-export-all-2026-02-26.json`.

---

## Importing Data

Go to **Settings > Import data instead** (link below the export button), or navigate directly to **Settings > Import Data**.

### Supported Formats

| Source | File Type | Notes |
|--------|-----------|-------|
| **Tandem JSON** | `.json` | Full restore from a Tandem export — all data types preserved |
| **Todoist CSV** | `.csv` | Automatic column detection for Todoist exports |
| **Generic CSV** | `.csv` | Manual column mapping for any CSV file |

### Import Workflow

The import follows a guided multi-step process:

#### 1. Upload

Select your file and click **Upload**. Tandem auto-detects the format.

- **Tandem JSON** files skip straight to preview
- **Todoist CSV** files are parsed automatically and go to preview
- **Generic CSV** files go to a column mapping step first

#### 2. Column Mapping (CSV only)

For generic CSV files, you'll map your columns to Tandem fields:

- **Title** (required) — the task name
- **Notes** — task description or details
- **Status** — mapped to Tandem statuses (NOT_STARTED, IN_PROGRESS, etc.)
- **Project** — tasks are grouped into projects by this field
- **Context** — assigned to a GTD context
- **Due Date** — parsed from common date formats
- **Priority/Energy** — mapped to energy levels (LOW, MEDIUM, HIGH)

#### 3. Preview

Before anything is written, you see a full breakdown of what will be imported:

- Counts by category (tasks, projects, contexts, areas, goals, etc.)
- **Duplicate detection** — items that already exist in your account are flagged
- You can choose to **skip** duplicates (default) or review them

#### 4. Confirm & Import

Click **Confirm Import** to start. Progress is shown in real time.

#### 5. Complete

After import, you see a summary with:

- Total items created
- Items skipped (duplicates)
- Any errors that occurred

---

## Tips

- **Backup before importing** — export your current data first, just in case
- **Duplicate detection** — Tandem checks by title/name, so renamed items won't be caught as duplicates
- **Contexts auto-created** — if a task references a context that doesn't exist yet, it's created automatically during import
- **Project relationships preserved** — sub-project parent/child hierarchy is maintained in Tandem JSON imports
- **Re-importing is safe** — duplicates are skipped by default, so importing the same file twice won't create duplicates
