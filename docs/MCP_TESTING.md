# MCP Client Testing Guide

Step-by-step instructions for testing Tandem's MCP server with different AI clients.

---

## Prerequisites

1. **MCP enabled**: Admin Settings → ensure MCP is turned on
2. **API access enabled**: Admin Settings → ensure API access is enabled for users
3. **API token**: Settings → API Tokens → Create Token (read+write scopes). Copy the token — you'll only see it once.

---

## Gemini CLI (Remote HTTP)

### Setup

1. Install Gemini CLI:
   ```bash
   npm install -g @google/gemini-cli
   ```

2. Run `gemini` once to complete first-time setup (Google API key prompt)

3. Add Tandem to `~/.gemini/settings.json`:
   ```json
   {
     "mcpServers": {
       "tandem": {
         "httpUrl": "http://localhost:2000/api/mcp",
         "headers": {
           "Authorization": "Bearer YOUR_TOKEN_HERE"
         }
       }
     }
   }
   ```

   For beta: replace `http://localhost:2000` with `https://beta.tandemgtd.com`

### Test

```bash
gemini
```

```
/mcp                              # Should list tandem tools
Add "test from gemini" to my inbox  # Should call tandem_inbox_add
What should I do now?              # Should call tandem_what_now
Show my projects                   # Should call tandem_project_list
```

---

## Gemini CLI (Local stdio)

For running against a local database without going through HTTP.

### Setup

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "tandem": {
      "command": "npx",
      "args": ["tsx", "/path/to/tandem/src/mcp/server.ts"],
      "env": {
        "DATABASE_URL": "postgresql://tandem_admin:YOUR_PASSWORD@localhost:5432/tandem_dev?schema=public",
        "TANDEM_USER_ID": "your-user-id"
      }
    }
  }
}
```

### Test

Same commands as above. Faster since there's no network hop.

---

## Claude.ai (Remote HTTP)

### Setup

1. Go to [claude.ai](https://claude.ai) → Settings → Integrations → Add MCP Server
2. Server URL: `https://beta.tandemgtd.com/api/mcp`
3. Auth: Bearer Token → paste your API token

### Test

Start a conversation and try:
- "What's in my Tandem inbox?"
- "Add 'Review quarterly goals' to my inbox"
- "What should I work on next?"

---

## Claude Desktop (Local stdio)

### Setup

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tandem": {
      "command": "npx",
      "args": ["tsx", "/path/to/tandem/src/mcp/server.ts"],
      "env": {
        "DATABASE_URL": "postgresql://tandem_admin:YOUR_PASSWORD@localhost:5432/tandem_dev?schema=public",
        "TANDEM_USER_ID": "your-user-id"
      }
    }
  }
}
```

### Test

Same as Claude.ai — the tools are identical regardless of transport.

---

## Claude Code (Local stdio)

Already configured if you have `.claude/settings.json` or project-level MCP config. Uses the same stdio setup as Claude Desktop.

---

## curl (Raw JSON-RPC)

For debugging the HTTP endpoint directly.

### List tools

```bash
curl -X POST http://localhost:2000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

### Call a tool

```bash
curl -X POST http://localhost:2000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "tandem_inbox_add",
      "arguments": { "title": "Test from curl" }
    },
    "id": 2
  }'
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| 401 Unauthorized | Token is invalid or expired. Generate a new one in Settings → API Tokens |
| 403 MCP is disabled | Admin needs to enable MCP in Admin Settings |
| 403 MCP access disabled for account | Admin needs to enable MCP access for your user |
| Gemini CLI doesn't show tools | Run `/mcp` to verify connection. Check `~/.gemini/settings.json` syntax |
| CORS error (browser clients) | Add the origin to `MCP_ALLOWED_ORIGINS` env var. Dev mode allows all origins |
| Connection refused | Make sure the dev server is running (`npm run dev`) or beta is up |

---

## Test Matrix

| Client | Transport | Local Dev | Beta Server |
|--------|-----------|-----------|-------------|
| Gemini CLI (HTTP) | Streamable HTTP | [ ] | [ ] |
| Gemini CLI (stdio) | stdio | [ ] | N/A |
| Claude.ai | Streamable HTTP | N/A | [ ] |
| Claude Desktop | stdio | [ ] | N/A |
| Claude Code | stdio | [ ] | N/A |
| curl | HTTP | [ ] | [ ] |
