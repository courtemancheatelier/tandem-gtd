# MCP Server: Cross-Client AI Integration

## The Big Idea

Tandem's MCP server is the primary way users interact with their GTD system through AI. Because MCP is an open standard, the same server works with **any MCP-compatible client** — not just Claude. Users choose whichever AI they already pay for and prefer.

This is a significant advantage over the embedded assistant, which requires a separate Anthropic API key and adds ongoing cost. The MCP path has **zero additional cost to the user** — they're already paying for their Claude Pro, ChatGPT Plus, or whatever subscription they have. The AI provider handles the intelligence; Tandem just exposes the tools.

---

## Supported Clients

### Claude (Desktop, claude.ai, Claude Code)

The primary development target. Claude adopted MCP from day one (Anthropic created the protocol).

**Setup — stdio (local):**
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "tandem-gtd": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "TANDEM_USER_ID": "your-user-id"
      }
    }
  }
}
```

**Setup — HTTP (remote/deployed):**
Connect to `https://tandem.yourdomain.com/api/mcp/` with a personal access token. Works in claude.ai, Claude Desktop, and Claude Code.

### ChatGPT (Web, Desktop, Mobile)

OpenAI adopted MCP in March 2025. Full read/write MCP support shipped in October 2025 under "Developer Mode." As of late 2025, ChatGPT rebranded connectors to "Apps" and supports all paid plans (Plus, Pro, Business, Enterprise, Education).

**Setup:**
1. In ChatGPT, go to **Settings → Apps → Create** (or Settings → Connectors → Create on older versions)
2. Enter:
   - **Name:** Tandem GTD
   - **Description:** Manage your GTD system — capture to inbox, create tasks, check what to do next, run weekly reviews
   - **URL:** `https://tandem.yourdomain.com/api/mcp/`
3. Authenticate with your Tandem personal access token

**ChatGPT-specific notes:**
- Write operations (inbox capture, task creation, task completion) trigger a confirmation prompt — ChatGPT shows the JSON payload and asks the user to approve before executing. This is by design for safety.
- ChatGPT cannot connect to `localhost`. For local development, use a tunnel (ngrok, Cloudflare Tunnel). Deployed instances with a public URL work directly.
- ChatGPT also supports "MCP Apps" — embedded UI widgets inside the chat. This is a future opportunity (see Phase 3 in `TANDEM_AI_INTEGRATION.md`).

### Other MCP Clients

The MCP ecosystem is growing fast. Any client that speaks the protocol can connect to Tandem's server. Known compatible clients as of early 2026:

- **Cursor** — AI code editor with MCP support
- **Google Gemini** — adopted MCP via the Agentic AI Foundation
- **Microsoft Copilot** — MCP support through Semantic Kernel
- **VS Code** — first-class MCP client support
- **Zed** — MCP integration for editor-based workflows
- **Custom agents** — anything built on LangChain, LlamaIndex, OpenAI Agents SDK, or the MCP SDK directly

We don't test against all of these, but the protocol is the protocol. If it speaks MCP, it should work.

---

## Available Tools

Every MCP client gets access to the same tool set:

| Tool | Description | Read/Write |
|------|-------------|------------|
| `tandem_inbox_add` | Quick capture to inbox | Write |
| `tandem_inbox_list` | List unprocessed inbox items | Read |
| `tandem_task_create` | Create a task with context, energy, time estimate | Write |
| `tandem_task_complete` | Mark a task done by ID | Write |
| `tandem_task_list` | List tasks with filters (context, energy, project) | Read |
| `tandem_what_now` | Context-aware next action recommendations | Read |
| `tandem_project_list` | List projects by status | Read |
| `tandem_project_create` | Create a project with outcome statement | Write |
| `tandem_search` | Search across tasks, projects, inbox | Read |
| `tandem_waiting_for_list` | List delegated/waiting-for items | Read |
| `tandem_review_status` | Weekly review health check | Read |

**Planned additions** (see `specs/PM_FEATURES.md`):
- `tandem_sub_project_create` — Create sub-projects
- `tandem_auto_schedule` — AI-assisted project scheduling
- `tandem_critical_path` — Identify bottleneck tasks
- `tandem_add_dependency` — Link tasks with dependencies
- `tandem_project_tree` — Full hierarchy with rollup progress

---

## Embedded Assistant vs. MCP Server

The embedded assistant (in-app chat panel) and the MCP server serve different use cases. For most users, especially on managed/hosted instances, the MCP server is the better path.

| | MCP Server | Embedded Assistant |
|---|---|---|
| **Additional cost** | None — uses your existing AI subscription | Anthropic API key required (~$5-15/mo) |
| **AI model** | Whatever your client provides (Opus on Claude Pro, GPT-4o on ChatGPT Plus, etc.) | Sonnet (configurable) |
| **Where it runs** | In your preferred AI client | Inside Tandem's UI |
| **Multi-client** | Claude, ChatGPT, Gemini, Cursor, etc. | Claude only |
| **GTD coaching** | Depends on user prompting or MCP Prompts | Built-in system prompt with GTD methodology |
| **Guided workflows** | Via MCP Prompts (pre-built conversation starters) | Structured UI (inbox processing wizard, review coach) |
| **Best for** | Power users who live in their AI client | Users who want GTD guidance without leaving the app |

### Managed Service Defaults

For hosted/managed deployments:
- **MCP server: ON** — zero cost to operator, high value to users
- **Embedded assistant: OFF** — requires API key configuration and adds cost. Users on managed instances can enable it themselves if they provide their own Anthropic API key in Settings.

### Self-Hosted Defaults

For self-hosted/local deployments:
- **MCP server: ON** — connect from Claude Desktop, claude.ai, ChatGPT, whatever
- **Embedded assistant: OFF by default** — enable in admin settings if you want it. Set `ANTHROPIC_API_KEY` in `.env` and toggle on in Settings → Admin → AI Integration.

The embedded assistant isn't going away — it'll get better over time as model costs drop and capabilities improve. But the MCP server is the primary AI integration surface and where most development effort goes.

---

## Transport Modes

The MCP server supports two transport modes for different deployment scenarios:

### stdio (Local Development / Claude Desktop)

The server runs as a child process. Claude Desktop (or Claude Code) launches it directly.

```
Claude Desktop → spawns → tandem-gtd MCP server → reads → PostgreSQL
```

- No network exposure needed
- Configured in `claude_desktop_config.json`
- Single-user only (uses `TANDEM_USER_ID` env var)
- Current implementation (`src/mcp/server.ts`)

### Streamable HTTP (Deployed / Multi-Client)

The server runs as a Next.js API route at `/api/mcp/`. Any MCP client on the internet can connect.

```
claude.ai / ChatGPT / etc. → HTTPS → /api/mcp/ → reads/writes → PostgreSQL
```

- Requires public HTTPS endpoint (or tunnel for dev)
- Authenticated via personal access tokens (bearer token)
- Supports SSE for streaming responses
- Works with all MCP-compatible clients
- Planned for Phase 1 (see `TANDEM_AI_INTEGRATION.md`)

---

## Authentication

### Current (stdio)

Single-user via `TANDEM_USER_ID` environment variable. No token exchange needed — the server process runs with the user's identity baked in.

### Planned (HTTP transport)

Personal access tokens, generated in Tandem's Settings → API Tokens page:

```
Authorization: Bearer tnm_xxxxxxxxxxxxxxxxxxxx
```

Each token is scoped to a single user. The MCP endpoint validates the token, resolves the user, and executes tool calls on their behalf.

**Future (Phase 4):** OAuth 2.1 for multi-user deployments where users connect their own AI clients without sharing tokens through an admin.

---

## Privacy Model

The MCP server doesn't send your data to any AI provider on its own. It only responds when an AI client makes a tool call. The privacy flow:

1. **You type in Claude/ChatGPT:** "What should I work on next?"
2. **The AI decides to call** `tandem_what_now` with your context and energy level
3. **The MCP server queries your database** and returns structured results
4. **The AI formats the response** and shows it to you

Your GTD data only leaves your server when you explicitly interact with it through an AI client. The AI provider's standard data policies apply to the conversation (not to your database).

No telemetry. No analytics. No data sharing. The MCP server is a dumb pipe between your AI client and your database.

---

## Configuration Reference

```env
# .env

# MCP Server (applies to both stdio and HTTP transport)
TANDEM_MCP_ENABLED=true          # Master toggle (default: true)
TANDEM_USER_ID=your-user-id      # Required for stdio transport

# Database (required)
DATABASE_URL=postgresql://user:password@localhost:5432/tandem

# HTTP transport auth (when deployed)
# Tokens are generated in-app, not set in .env
```

Admin settings (Settings → Admin → Server):
- **Enable MCP Server** — master toggle for the `/api/mcp/` endpoint
- **API Token management** — create/revoke personal access tokens

---

## What Users Should Know

When introducing MCP to end users (docs, onboarding, help text):

> **Connect your AI to Tandem.** Tandem works with Claude, ChatGPT, and other AI assistants through the MCP protocol. Your AI can capture to your inbox, find your next action, check project status, and help with weekly reviews — all through natural conversation.
>
> No extra subscription needed. If you already use Claude or ChatGPT, just connect it to your Tandem instance and start talking to your GTD system.

Keep it simple. Users don't need to know what MCP stands for or how the protocol works. They need to know: "connect your AI, talk to your tasks."
