---
title: AI Configuration
category: Admin
tags: [admin, ai, configuration, settings]
sortOrder: 0
adminOnly: true
---

# AI Configuration

Tandem's AI features are controlled through a hierarchy of settings. This guide explains each toggle and how they interact.

## Settings Hierarchy

AI features follow a three-level hierarchy:

1. **Server-level** — Admin controls that apply globally
2. **User-level** — Per-user overrides (when allowed by admin)
3. **Item-level** — Per-task/project AI visibility controls

A feature must be enabled at **all levels** to be active. If the server admin disables AI globally, no user-level setting can override that.

## Server Settings

Access these from **Admin > AI Configuration**.

### Master AI Toggle

Controls whether AI features are available at all. When OFF:
- No AI chat in the app
- No MCP connections
- API keys are ignored
- All AI-related UI is hidden

### MCP Server

Controls the MCP (Model Context Protocol) server endpoint:
- When ON, Tandem exposes `/api/mcp` for external AI clients
- When OFF, the endpoint returns 403
- Users can connect Claude.ai, Claude Desktop, ChatGPT, etc.

### In-App AI Chat

Controls the built-in AI chat panel:
- When ON, users see an AI chat panel in the app
- When OFF, the chat panel is hidden for all users

### Allow User Own Keys

When enabled, users can enter their own Anthropic API key in Settings. Their key takes priority over the server key for their requests.

### Share Server Key

When enabled, non-admin users can use the server's API key for AI features. This is useful for small teams where the admin wants to provide AI access without requiring individual API keys.

### Default Daily Limit

The number of AI messages each user can send per day. Individual limits can be set per-user to override this default.

### Default AI Model

The Claude model used for AI features. Options:
- `claude-sonnet-4-20250514` (default) — fast, capable
- `claude-opus-4-20250514` — most capable, slower

## User-Level Settings

Each user can configure these in **Settings** (when allowed by admin):

- **AI Enabled** — Opt out of all AI features
- **In-App AI Chat** — Toggle the chat panel
- **MCP Enabled** — Allow/block MCP client connections

## Item-Level Privacy

Users can set AI visibility on individual items:

- **Visible** (default) — AI can read and reference this item
- **Hidden** — AI cannot see this item in any context
- **Read Only** — AI can see it for context but cannot modify it

This applies to tasks, projects, and inbox items.

## Recommended Setup

### Solo user with own API key
1. Enable Master AI Toggle
2. Enable MCP Server
3. Enter your Anthropic API key in user Settings
4. Enable "Allow User Own Keys"

### Small team with shared key
1. Enable Master AI Toggle
2. Enter server API key in Admin Settings
3. Enable "Share Server Key"
4. Set a reasonable daily limit (e.g., 100 messages/day)
5. Enable MCP Server if users want Claude.ai integration
