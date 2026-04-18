---
title: AI Setup Guide
category: Features
tags: [mcp, ai, claude, setup, api-key]
sortOrder: 10
---

# AI Setup Guide

Tandem has two AI features that are set up independently. You can use either one, or both.

| Feature | What it does | Auth method | Needs API key? |
|---------|-------------|-------------|----------------|
| **MCP (Claude.ai / Claude Desktop)** | Manage your GTD system from Claude's chat interface | OAuth (automatic) | No |
| **In-App AI Chat** | AI chat panel inside Tandem | Anthropic API key | Yes |

---

## Option A: MCP — Connect Claude.ai to Tandem

MCP (Model Context Protocol) lets Claude.ai access your tasks, projects, and inbox directly. No API key is needed — authentication is handled via OAuth.

### Step 1: Enable MCP Server (Admin)

Go to **Admin Settings** and ensure:

- **Master AI Toggle** is ON
- **MCP Server** is ON
- **Allow users to connect MCP clients** is ON

See [[ai-configuration|AI Configuration]] for details on each setting.

### Step 2: Configure Cloudflare (if applicable)

If your server is behind Cloudflare with "Block AI bots" enabled, Claude.ai's backend requests will be blocked with a 403.

Create a WAF custom rule:

- **Field:** User Agent
- **Operator:** contains
- **Value:** `Claude-User`
- **AND**
- **Field:** URI Path
- **Operator:** equals
- **Value:** `/api/mcp`
- **Action:** Skip all managed rules

### Step 3: Connect from Claude.ai

1. In Claude.ai, go to **Settings > Integrations > Add MCP Server**
2. Enter your server URL: `https://your-tandem.example.com/api/mcp`
3. Claude.ai will redirect you to Tandem's OAuth consent page
4. Click **Allow** to authorize the connection
5. You should see Tandem's tools available in Claude.ai

That's it — no API key or token needed. OAuth handles everything.

### Available MCP Tools

Once connected, Claude can:

- **View and manage tasks** — create, complete, update tasks
- **Manage projects** — list projects, add tasks to projects
- **Process inbox** — read and process inbox items
- **Check waiting-for items** — see what you're waiting on
- **Run "What Should I Do Now?"** — get prioritized next actions based on context and energy
- **Search and manage wiki articles** — create, read, update, search your personal knowledge base
- **Team management** — list teams, manage members, assign tasks (for team projects)

### Updating After a Tandem Upgrade

When Tandem is updated with new or changed MCP tools, Claude.ai won't pick up the changes automatically. You'll need to **disconnect and reconnect** the integration in Claude.ai for it to see the updated tools.

### MCP Troubleshooting

**"McpAuthorizationError: Your account was authorized but the integration rejected the credentials"**
This usually means Cloudflare is blocking Claude.ai's backend requests. Check Step 2 above.

**OAuth consent page doesn't load**
Make sure your server has a valid SSL certificate and is accessible from the public internet. Self-signed certificates will not work with Claude.ai.

**Tools don't appear after connecting**
Try disconnecting and reconnecting the integration. Check that the MCP server is enabled in Admin Settings.

---

## Option B: In-App AI Chat

The in-app AI chat panel gives you a Claude-powered assistant directly inside Tandem. This requires an Anthropic API key because the chat runs through Tandem's server.

### Step 1: Enable In-App AI Chat (Admin)

Go to **Admin Settings** and ensure:

- **Master AI Toggle** is ON
- **In-App AI Chat** is ON

### Step 2: Configure API Key Access (Admin)

Choose one of these approaches:

- **Server key** — Enter an Anthropic API key in Admin Settings and enable "Share Server Key" so all users share it
- **User keys** — Enable "Allow User Own Keys" so each user enters their own key

### Step 3: Enter Your API Key (User)

If the admin enabled user keys:

1. Go to **Settings** in Tandem
2. Find the **AI** section
3. Enter your Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com))
4. Save

If the admin configured a shared server key, skip this step — it's already set up for you.

### Using In-App AI Chat

Click the AI button (bottom-right corner) to open the chat panel. The assistant is GTD-aware and can help you:

- Process inbox items
- Break down projects into tasks
- Suggest next actions
- Answer questions about your system

---

## Using Both Together

MCP and in-app AI chat are completely independent. You can enable both:

- **MCP** for managing your GTD system from Claude.ai's interface (no API key needed)
- **In-App AI Chat** for quick AI help while you're already in Tandem (API key required)

The admin must enable both features separately in Admin Settings. See [[ai-configuration|AI Configuration]] for the full settings hierarchy.
