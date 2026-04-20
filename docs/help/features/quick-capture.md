---
title: Quick Capture — Capture From Anywhere
category: Features
tags: [capture, api, shortcuts, ios, android, pwa, share, cli, inbox]
sortOrder: 6
---

# Quick Capture — Capture From Anywhere

GTD's first rule: **capture everything**. The gap between "I thought of something" and "it's in my trusted system" should be near zero. Tandem gives you multiple ways to capture — from inside the app, from your phone, from a terminal, or from any app's share sheet.

---

## Capture Methods at a Glance

| Method | Where | How |
|--------|-------|-----|
| **Quick Capture modal** | Tandem web app | **Cmd+I** / **Ctrl+I** from any page |
| **Inbox page** | Tandem web app | Navigate to Inbox, click Add |
| **API capture** | Anywhere with HTTP | `POST /api/inbox` with Bearer token |
| **iOS Shortcut** | iPhone / iPad | Tap home screen icon, type, done |
| **Android HTTP Shortcut** | Android phone | Tap home screen widget |
| **PWA share target** | Phone (installed PWA) | Share from any app to Tandem |
| **CLI alias** | Terminal | `inbox "Buy milk"` |
| **MCP tool** | Claude Desktop / Claude Code | `tandem_inbox_add` |

---

## In-App Capture

### Quick Capture Modal (Cmd+I)

Press **Cmd+I** (Mac) or **Ctrl+I** (Windows/Linux) from any page in Tandem. A modal appears where you can type naturally — dates, @contexts, ~durations, and !energy levels are auto-detected.

See [[smart-capture|Smart Capture — Natural Language Tasks]] for full details on the parsing syntax.

### Inbox Page

Navigate to **Inbox** and click the **Add** button. This is the traditional GTD capture path.

---

## API Capture

Tandem's REST API lets external tools create inbox items. You need a **personal API token** — generate one in Settings > API Tokens.

### Basic Example

```bash
curl -X POST \
  -H "Authorization: Bearer tnm_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"content": "Call dentist to schedule cleaning"}' \
  https://your-tandem.example.com/api/inbox
```

### With Notes and Source Label

```bash
curl -X POST \
  -H "Authorization: Bearer tnm_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Read this article",
    "notes": "https://example.com/interesting-article",
    "sourceLabel": "curl-test"
  }' \
  https://your-tandem.example.com/api/inbox
```

The `sourceLabel` field is optional (max 50 characters). It records how the item was captured — for example, `"ios-shortcut"`, `"cli"`, or `"zapier"`. This shows up in the item's event history as "Captured via ios-shortcut".

### Response

```json
{
  "id": "clx...",
  "content": "Call dentist to schedule cleaning",
  "notes": null,
  "status": "UNPROCESSED",
  "createdAt": "2026-02-25T14:30:00.000Z",
  "userId": "..."
}
```

See [[public-rest-api|Public REST API]] for full API documentation, including token generation and error codes.

---

## iOS Shortcuts

Create a one-tap capture shortcut for your iPhone or iPad home screen.

### Setup Steps

1. Open the **Shortcuts** app on your iPhone
2. Tap **+** to create a new shortcut
3. Add action: **Ask for Input**
   - Input type: **Text**
   - Prompt: `What's on your mind?`
4. Add action: **Get Contents of URL**
   - URL: `https://your-tandem.example.com/api/inbox`
   - Method: **POST**
   - Headers:
     - `Authorization`: `Bearer tnm_your_token_here`
     - `Content-Type`: `application/json`
   - Request Body: **JSON**
     - `content`: select **Provided Input** from step 3
     - `sourceLabel`: `ios-shortcut`
5. (Optional) Add action: **Show Notification** → "Captured!"
6. Tap the shortcut name at the top → **Add to Home Screen**

Now you have a home screen icon. Tap it, type your thought, and it lands in your Tandem inbox instantly.

### Tips

- Add the shortcut to your **Action Button** (iPhone 15 Pro+) for even faster capture
- Use Siri: say "Hey Siri, run [shortcut name]" for hands-free capture
- Share sheet: in the shortcut settings, enable **Show in Share Sheet** to capture selected text or URLs from other apps

---

## Android HTTP Shortcuts

Use the free [HTTP Shortcuts](https://http-shortcuts.rmy.ch/) app (or Tasker) to create a capture widget.

### Setup Steps

1. Install **HTTP Shortcuts** from the Play Store
2. Create a new shortcut:
   - **Method:** POST
   - **URL:** `https://your-tandem.example.com/api/inbox`
   - **Headers:**
     - `Authorization`: `Bearer tnm_your_token_here`
     - `Content-Type`: `application/json`
   - **Body (JSON):**
     ```json
     {
       "content": "{$prompt:What's on your mind?}",
       "sourceLabel": "android-shortcut"
     }
     ```
3. Place the shortcut as a home screen widget

---

## PWA Share Target

When Tandem is installed as a Progressive Web App on your phone, it registers as a **share target**. This means you can share text, URLs, or content from any app directly into Tandem.

### How to Use

1. **Install the PWA**: Open Tandem in your mobile browser → tap "Add to Home Screen" (or "Install App" on Android Chrome)
2. In any app, tap **Share** and select **Tandem GTD**
3. Tandem opens the Quick Capture page with the shared content pre-filled
4. Review, optionally add notes, and tap **Capture to Inbox**

### What Gets Captured

- **Shared title** → becomes the inbox item content
- **Shared text** → goes into notes (or content if no title)
- **Shared URL** → appended to notes

---

## CLI Alias

Add a shell alias for instant terminal capture:

### Bash / Zsh

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
inbox() {
  curl -s -X POST \
    -H "Authorization: Bearer tnm_your_token_here" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"$*\", \"sourceLabel\": \"cli\"}" \
    https://your-tandem.example.com/api/inbox \
  | jq -r '"Captured: " + .content'
}
```

Usage:

```bash
inbox Buy milk on the way home
# → Captured: Buy milk on the way home
```

### Fish Shell

```fish
function inbox
  curl -s -X POST \
    -H "Authorization: Bearer tnm_your_token_here" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"$argv\", \"sourceLabel\": \"cli\"}" \
    https://your-tandem.example.com/api/inbox \
  | jq -r '"Captured: " + .content'
end
```

---

## Browser Extension (DIY)

Tandem doesn't ship a browser extension, but the API makes it easy to build one. A minimal Chrome extension needs:

1. A **popup** with a text input that POSTs to `/api/inbox`
2. A **context menu** entry ("Send to Tandem") that captures selected text
3. An **options page** to store your Tandem URL and API token

The API supports CORS for Bearer-authenticated requests, so browser extensions can call it directly.

---

## Alfred / Raycast

### Raycast Script Command

Create a script command that prompts for text and POSTs to the inbox API. Raycast supports bash, Python, and Node.js scripts — use the same `curl` pattern as the CLI alias above.

### Alfred Workflow

Create a workflow with a **Keyword** input → **Run Script** action using the `curl` command from the CLI alias section.

---

## See Also

- [[smart-capture|Smart Capture — Natural Language Tasks]] — in-app natural language parsing
- [[public-rest-api|Public REST API]] — full API documentation and token management
- [[mcp-setup-claude-ai|Setting Up MCP with Claude.ai]] — AI-powered capture via MCP
