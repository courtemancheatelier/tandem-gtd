---
title: Smart Capture — Natural Language Tasks
category: Features
tags: [capture, natural-language, parsing, quick-capture, inbox]
sortOrder: 5
---

# Smart Capture — Natural Language Tasks

Tandem's Quick Capture modal (**Cmd+I** / **Ctrl+I**) understands natural language. Instead of filling in fields one at a time, type everything in a single line and Tandem will extract the details automatically.

---

## How It Works

1. Press **Cmd+I** (Mac) or **Ctrl+I** (Windows/Linux) to open Quick Capture
2. Type your task naturally, for example: `Call dentist tomorrow @Phone ~15min !high`
3. Press **Enter**
4. If Tandem detects any structured fields (date, context, duration, etc.), a **preview card** appears showing what was parsed
5. Review and adjust any fields, then click **Create Task**

If no structured fields are detected, the input is saved as an inbox item — the same behavior as before.

---

## Supported Markers

### Dates

Tandem recognizes natural date expressions anywhere in your input:

| Example | Parsed as |
|---------|-----------|
| `tomorrow` | Tomorrow's date |
| `next Tuesday` | Next Tuesday |
| `Friday at 3pm` | This Friday at 15:00 |
| `March 15` | March 15 of the current/next year |
| `in 3 days` | 3 days from now |
| `end of week` | End of the current week |

Dates are set as **due dates** by default. If your input contains words like "defer", "start", or "scheduled", the date becomes a **scheduled date** (tickler) instead.

Example: `defer clean garage until next Saturday` → sets a scheduled date, not a due date.

### @Context

Use `@` followed by a context name to assign a context:

| Example | Matches |
|---------|---------|
| `@Phone` | @Phone context |
| `@comp` | @Computer (partial match) |
| `@home` | @Home (case-insensitive) |

The `@` marker is matched against your existing contexts. Partial matches work — `@comp` will match `@Computer`. If the context doesn't exist, the preview card will show a warning so you can select a different one.

### ~Duration

Use `~` followed by a time to set an estimated duration:

| Example | Parsed as |
|---------|-----------|
| `~15min` | 15 minutes |
| `~30m` | 30 minutes |
| `~1h` | 1 hour (60 min) |
| `~1.5hrs` | 1.5 hours (90 min) |
| `~2 hours` | 2 hours (120 min) |

### !Energy

Use `!` followed by an energy level:

| Example | Parsed as |
|---------|-----------|
| `!high` or `!h` | HIGH energy |
| `!medium` or `!m` | MEDIUM energy |
| `!low` or `!l` | LOW energy |

### #Project

Use `#` followed by a project name to assign to a project:

| Example | Matches |
|---------|---------|
| `#kitchen` | "Kitchen Renovation" project |
| `#report` | "Q1 Report" project |

The `#` marker matches against your active project titles. The match is case-insensitive and checks if the project title contains the word you typed.

---

## Full Examples

| Input | Title | Due | Context | Time | Energy |
|-------|-------|-----|---------|------|--------|
| `Call dentist tomorrow @Phone ~15min !high` | Call dentist | Tomorrow | @Phone | 15 min | HIGH |
| `Write quarterly report next Friday ~2h !h` | Write quarterly report | Next Friday | — | 2 hours | HIGH |
| `Buy groceries @Errands ~30m !l` | Buy groceries | — | @Errands | 30 min | LOW |
| `Review PR #report !medium` | Review PR | — | — | — | MEDIUM |
| `Plan vacation in 2 weeks` | Plan vacation | 2 weeks from now | — | — | — |

---

## The Preview Card

When Tandem detects structured fields, a preview card appears with:

- **Editable title** — the cleaned task name with markers removed
- **Due date** — date picker, pre-filled if a date was detected
- **Context** — dropdown of your existing contexts
- **Time estimate** — select from preset durations
- **Energy level** — Low / Medium / High
- **Project** — dropdown of your active projects

You can adjust any field before creating the task. Press **Enter** on the title to create, or click **Back** to return to the text input.

---

## Tips

- **Order doesn't matter** — `@Phone call dentist tomorrow` works just as well as `call dentist tomorrow @Phone`
- **Markers are removed from the title** — the task title will be clean text without `@`, `~`, `!`, or `#` markers
- **Plain text still works** — if you type `buy milk` with no markers, it saves as an inbox item for later processing
- **Use "Save as task (manual)"** link if you want to skip parsing and create a basic task with just a title and context, like before
