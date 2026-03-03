---
title: Public REST API
category: Features
tags: [api, rest, tokens, integration, automation]
sortOrder: 11
---

# Public REST API

Tandem exposes a REST API that external tools — scripts, iOS Shortcuts, Zapier, browser extensions, and more — can use to read and write your GTD data. Authentication uses **Bearer tokens**, the same personal API tokens used for MCP.

## Prerequisites

- An admin must enable **Public REST API** in Admin Settings > Features
- You need a personal API token (see below)

## Generating an API Token

1. Go to **Settings** in Tandem
2. Scroll to **API Tokens**
3. Click **Generate Token**
4. Give it a descriptive name (e.g. "iOS Shortcut", "Zapier", "CLI Script")
5. Select scopes — **read** for read-only access, **read + write** for full access
6. Optionally set an expiry (1–365 days)
7. Copy the token immediately — it starts with `tnm_` and **will not be shown again**

## Making Requests

Include your token in the `Authorization` header:

```
Authorization: Bearer tnm_your_token_here
```

### Example: List your tasks

```bash
curl -H "Authorization: Bearer tnm_abc123..." \
  https://your-tandem.example.com/api/tasks
```

### Example: Create an inbox item

```bash
curl -X POST \
  -H "Authorization: Bearer tnm_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"content": "Call dentist to schedule cleaning"}' \
  https://your-tandem.example.com/api/inbox
```

### Example: Complete a task

```bash
curl -X POST \
  -H "Authorization: Bearer tnm_abc123..." \
  https://your-tandem.example.com/api/tasks/TASK_ID/complete
```

### Example: Create a project from a template

```bash
curl -X POST \
  -H "Authorization: Bearer tnm_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {"destination": "Tokyo", "travel_dates": "Apr 10, 2026"},
    "projectTitle": "Trip to Tokyo"
  }' \
  https://your-tandem.example.com/api/project-templates/TEMPLATE_ID/instantiate
```

## Interactive API Reference

Tandem includes a full **interactive API reference** at [`/api-docs`](/api-docs). It lists every endpoint with request/response schemas, lets you try requests directly from the browser, and supports entering your Bearer token for authenticated calls.

## Available Endpoints

The API covers all core GTD resources — 85 endpoints across tasks, projects, templates, inbox, wiki, and more. Here are the most commonly used:

| Endpoint | Method | Description |
|---|---|---|
| `/api/tasks` | GET | List your tasks (filter by project, context, status) |
| `/api/tasks` | POST | Create a task |
| `/api/tasks` | PATCH | Update a task (supports optimistic concurrency) |
| `/api/tasks/available` | GET | "What should I do now?" next actions |
| `/api/tasks/{id}/complete` | POST | Mark a task complete (triggers cascade) |
| `/api/projects` | GET | List your projects |
| `/api/projects` | POST | Create a project |
| `/api/projects/create-with-tasks` | POST | Create a project with initial tasks |
| `/api/projects/{id}/save-as-template` | POST | Save a project as a reusable template |
| `/api/project-templates` | GET | List available project templates |
| `/api/project-templates` | POST | Create a template manually |
| `/api/project-templates/{id}` | GET | Get template details (tasks, sub-projects, variables) |
| `/api/project-templates/{id}` | DELETE | Delete a user template |
| `/api/project-templates/{id}/instantiate` | POST | Create a project from a template |
| `/api/inbox` | GET | List inbox items |
| `/api/inbox` | POST | Create an inbox item |
| `/api/waiting-for` | GET | List waiting-for items |
| `/api/contexts` | GET | List your contexts |
| `/api/areas` | GET | List areas of responsibility |
| `/api/goals` | GET | List your goals |
| `/api/search` | GET | Search across tasks, projects, inbox, wiki |
| `/api/wiki` | GET | List or search wiki articles |
| `/api/reviews/current` | GET | Get current weekly review |
| `/api/history/feed` | GET | Activity feed across all items |
| `/api/dashboard/stats` | GET | Dashboard statistics |
| `/api/export` | GET | Export all your data (JSON or CSV) |
| `/api/ai/context` | GET | AI-powered "what should I do now?" |
| `/api/ai/inbox/capture` | POST | AI-powered inbox capture |
| `/api/settings/features` | GET | Feature flags |

For the complete list with full request/response schemas, see the [interactive API reference](/api-docs).

All `POST`, `PATCH`, and `DELETE` requests should include `Content-Type: application/json` with a JSON body.

## Managing Tokens

### Listing tokens

```bash
curl -H "Authorization: Bearer tnm_abc123..." \
  https://your-tandem.example.com/api/settings/api-tokens
```

### Revoking a token

Revoking tokens is **session-only** for security — you must use the Settings page in the web UI. A compromised Bearer token cannot revoke other tokens.

Revoked tokens stop working immediately.

### Session-Only Routes

A few sensitive operations are restricted to browser sessions only (no Bearer token access):

- **Account deletion** — irreversible, must be done through the web UI
- **AI settings** — manages third-party API keys
- **Token creation** — prevents privilege escalation
- **Token revocation** — prevents denial-of-service

## Scopes

Tokens can be created with specific scopes:

| Scope | Allows |
|---|---|
| `read` | GET requests — viewing tasks, projects, inbox, etc. |
| `write` | POST, PATCH, DELETE — creating, updating, completing items |

A token with only the `read` scope cannot modify data — attempting a write operation returns `403 Forbidden`.

## Quick Capture Ideas

The API is great for building quick-capture workflows:

- **iOS Shortcuts** — Create a shortcut that POSTs to `/api/inbox` with a text prompt
- **Alfred / Raycast** — Type a hotkey, enter text, send to inbox
- **Browser bookmarklet** — Capture the current page title + URL to inbox
- **Zapier / Make** — Connect Gmail, Slack, or other tools to your Tandem inbox
- **Shell alias** — `alias inbox="curl -s -X POST -H 'Authorization: Bearer tnm_...' -H 'Content-Type: application/json' -d '{\"content\":\"$1\"}' https://tandem.example.com/api/inbox"`

## Error Responses

| Status | Meaning |
|---|---|
| `401 Unauthorized` | Missing or invalid token, or API access is disabled |
| `403 Forbidden` | Feature is disabled or you lack permission |
| `429 Too Many Requests` | Rate limit exceeded — check `Retry-After` header |
| `400 Bad Request` | Invalid request body (check the `error` field for details) |
| `404 Not Found` | Resource doesn't exist or doesn't belong to you |

All error responses return JSON: `{"error": "Description of the problem"}`

## Security Notes

- Tokens are **hashed with bcrypt** — Tandem never stores your plaintext token
- Always use **HTTPS** in production
- Create separate tokens for each integration so you can revoke them independently
- Set expiry dates on tokens you don't need permanently
- The API is **disabled by default** — an admin must explicitly enable it

## See Also

- [[project-templates|Project Templates]] — create projects from reusable templates via UI, API, or MCP
- [[quick-capture|Quick Capture — Capture From Anywhere]] — iOS Shortcuts, Android, CLI, PWA share target, and more
- [[mcp-setup-claude-ai|Setting Up MCP with Claude.ai]] — for AI tool integration via MCP protocol
- [[ai-configuration|AI Configuration]] — admin settings for AI and API features
