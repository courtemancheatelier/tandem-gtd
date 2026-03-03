# Quick Capture Widget

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement

### The Need

GTD's first principle is **capture everything**. The friction between "I thought of something" and "it's in my trusted system" must be near zero. Tandem's current capture paths are:

1. **Web app inbox** -- navigate to `/inbox`, click "Add", type, submit. Three clicks minimum.
2. **MCP tool** -- `tandem_inbox_add` via Claude Desktop or Claude Code. Requires an active AI session.
3. **No mobile quick-capture** -- on a phone, opening the PWA, waiting for it to load, and navigating to inbox takes 5-10 seconds. Many thoughts are lost.

What's missing is the ability to capture from **outside the app** with minimal friction: a phone shortcut, a keyboard shortcut while the app is open, a browser extension, or the OS share sheet.

### What "Done" Looks Like

1. **Personal API tokens** -- users generate long-lived bearer tokens in settings for use with external tools and automations. Revocable, labeled, auditable.
2. **Capture API endpoint** -- `POST /api/capture` accepts a title and optional notes, authenticates via bearer token, creates an InboxItem. Minimal payload, fast response.
3. **iOS/Android Shortcuts integration** -- documented recipe for creating a phone shortcut that prompts for text and hits the capture API.
4. **PWA share target** -- the PWA manifest declares it as a share target. When you share a link or text from another app, it opens Tandem's capture page pre-filled.
5. **Global keyboard shortcut** -- when the PWA or browser tab is focused, `Ctrl+Shift+Space` (or `Cmd+Shift+Space`) opens a capture modal from any page.
6. **Browser extension concept** -- a simple Chrome/Firefox popup with a text field that hits the capture API. Can share selected text.

### Design Constraints

- The existing `ApiToken` model stores bcrypt-hashed tokens and is used for MCP auth. Personal capture tokens can reuse this model if the use case is compatible, or use a dedicated model if MCP tokens need different semantics (e.g., expiry, scoping).
- The capture API must not require a session cookie -- it uses bearer token auth for external integrations.
- The PWA manifest (`public/manifest.json`) already exists and can be extended with `share_target`.

---

## 2. Data Model

### 2.1 Reuse Existing ApiToken Model

The existing `ApiToken` model is well-suited for personal API tokens:

```prisma
model ApiToken {
  id        String   @id @default(cuid())
  name      String   // e.g. "iPhone Shortcut", "Browser Extension"
  token     String   @unique // Hashed token (bcrypt)
  prefix    String   // First 8 chars of plain token, for identification
  lastUsed  DateTime?
  expiresAt DateTime?
  createdAt DateTime @default(now())

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([userId])
}
```

This already supports:
- Named tokens (user gives each token a label like "iPhone Shortcut")
- Hashed storage (bcrypt, same as MCP tokens)
- Prefix display (first 8 chars for identification without exposing the full token)
- Last-used tracking
- Optional expiry
- Per-user ownership with cascade delete

No schema changes needed. The capture API authenticates using the same `ApiToken` lookup that the MCP HTTP transport uses.

### 2.2 InboxItem Source Tracking

As specified in the Email Capture spec, add `source` to `InboxItem` (if not already added):

```prisma
// In model InboxItem (if not already present from EMAIL_CAPTURE spec)
source String?  // "email", "api", "mcp", "manual", "share", "shortcut"
```

---

## 3. Capture API Endpoint

### 3.1 Route

`POST /api/capture` -- minimal, fast endpoint for creating inbox items.

```typescript
// src/app/api/capture/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createInboxItem } from "@/lib/services/inbox-service";
import { checkRateLimit } from "@/lib/api/rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const captureSchema = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(5000).optional(),
  source: z.string().max(50).optional(),  // Client can identify itself
});

export async function POST(req: NextRequest) {
  // 1. Authenticate via bearer token
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }
  const rawToken = authHeader.slice(7);
  const prefix = rawToken.slice(0, 8);

  // Find candidate tokens by prefix, then verify hash
  const candidates = await prisma.apiToken.findMany({
    where: { prefix },
    include: { user: { select: { id: true, isDisabled: true } } },
  });

  let authenticatedUserId: string | null = null;
  let matchedToken: typeof candidates[0] | null = null;

  for (const candidate of candidates) {
    if (candidate.expiresAt && candidate.expiresAt < new Date()) continue;
    if (candidate.user.isDisabled) continue;
    const valid = await bcrypt.compare(rawToken, candidate.token);
    if (valid) {
      authenticatedUserId = candidate.userId;
      matchedToken = candidate;
      break;
    }
  }

  if (!authenticatedUserId || !matchedToken) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // 2. Rate limit: 60 captures per minute per token
  const rateLimitResult = checkRateLimit(`capture:${matchedToken.id}`, 60, 60_000);
  if (rateLimitResult) return rateLimitResult;

  // 3. Parse body
  const body = await req.json();
  const parsed = captureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // 4. Create inbox item
  const item = await createInboxItem(
    authenticatedUserId,
    {
      content: parsed.data.title,
      notes: parsed.data.notes,
    },
    {
      actorType: "USER",
      actorId: authenticatedUserId,
      source: "API",
      message: parsed.data.source ? `Captured via ${parsed.data.source}` : undefined,
    }
  );

  // 5. Update lastUsed on token
  await prisma.apiToken.update({
    where: { id: matchedToken.id },
    data: { lastUsed: new Date() },
  });

  return NextResponse.json(
    { id: item.id, content: item.content, createdAt: item.createdAt },
    { status: 201 }
  );
}
```

### 3.2 CORS

The capture API needs CORS support for browser extensions:

```typescript
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
```

Note: `Access-Control-Allow-Origin: *` is safe because the endpoint requires a bearer token. The wildcard doesn't weaken auth.

---

## 4. Token Management UI

### 4.1 Settings Section

Add "API Tokens" to the settings page:

```
┌───────────────────────────────────────────────────────┐
│  API Tokens                                            │
│  Personal tokens for shortcuts, extensions, and        │
│  automations. These work with the capture API.         │
├───────────────────────────────────────────────────────┤
│                                                        │
│  ┌────────────────────────────────────────────────┐   │
│  │ 🏷 iPhone Shortcut         tdm_k9f3...  │   │
│  │   Created Feb 20  •  Last used 2 hours ago     │   │
│  │                                    [Revoke]    │   │
│  └────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────┐   │
│  │ 🏷 Browser Extension       tdm_m2x7...  │   │
│  │   Created Feb 18  •  Never used                │   │
│  │                                    [Revoke]    │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│  [+ Create New Token]                                  │
│                                                        │
│  ─── Capture API ─────────────────────────────────    │
│  Endpoint: POST https://tandem.example.com/api/capture │
│  Header:   Authorization: Bearer <your-token>          │
│  Body:     { "title": "Buy milk" }                     │
│                                                        │
└───────────────────────────────────────────────────────┘
```

When creating a new token:
1. User enters a label (e.g., "iPhone Shortcut")
2. Server generates a random token: `tdm_` + 32 random base64url characters
3. The plain token is shown **once** in a modal with a copy button and a warning that it won't be shown again
4. The bcrypt hash is stored in the database

### 4.2 Token Management API

Uses existing API routes if available, or adds:

**`GET /api/settings/api-tokens`** -- list user's tokens (returns prefix + name + dates, not the hash)

**`POST /api/settings/api-tokens`** -- create token, returns the plain token once

```typescript
import crypto from "crypto";
import bcrypt from "bcryptjs";

const raw = "tdm_" + crypto.randomBytes(24).toString("base64url");
const hash = await bcrypt.hash(raw, 10);
const prefix = raw.slice(0, 8);

const token = await prisma.apiToken.create({
  data: { name, token: hash, prefix, userId },
});

return { ...token, plainToken: raw }; // Only returned on creation
```

**`DELETE /api/settings/api-tokens/[id]`** -- revoke a token

---

## 5. iOS / Android Shortcuts Integration

### 5.1 iOS Shortcuts Recipe

Document a setup guide (in help docs) with these steps:

1. Open the Shortcuts app on iPhone
2. Create a new Shortcut
3. Add action: **Ask for Input** (type: Text, prompt: "What's on your mind?")
4. Add action: **Get Contents of URL**
   - URL: `https://tandem.example.com/api/capture`
   - Method: POST
   - Headers: `Authorization: Bearer tdm_your_token_here`
   - Request Body: JSON
     - `title`: the "Provided Input" from step 3
     - `source`: `"ios-shortcut"`
5. Add to Home Screen

The shortcut appears as an app icon. Tap, type, done. One-second capture.

### 5.2 Android Tasker / Automate Recipe

Similar pattern using Tasker's HTTP Request action or the Automate app:
- Input dialog -> HTTP POST to `/api/capture` -> notification on success/failure

### 5.3 Share Sheet

Both iOS Shortcuts and Android Automate/Tasker can register as share sheet targets. When the user selects "Share > Tandem Capture", the shared text becomes the `title` and any URL becomes part of `notes`.

---

## 6. PWA Share Target

### 6.1 Manifest Update

Add `share_target` to `public/manifest.json`:

```json
{
  "share_target": {
    "action": "/capture",
    "method": "GET",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

When the PWA is installed and another app shares to it, the browser opens `/capture?title=...&text=...&url=...`.

### 6.2 Capture Page

```typescript
// src/app/(dashboard)/capture/page.tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function CapturePage() {
  const params = useSearchParams();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    // Pre-fill from share target params
    const sharedTitle = params.get("title") || "";
    const sharedText = params.get("text") || "";
    const sharedUrl = params.get("url") || "";

    setTitle(sharedTitle || sharedText.slice(0, 200) || "");
    setNotes([sharedText, sharedUrl].filter(Boolean).join("\n"));
  }, [params]);

  async function handleSubmit() {
    await fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: title, notes: notes || undefined }),
    });
    router.push("/inbox");
  }

  return (
    <div className="mx-auto max-w-lg p-4">
      <h1 className="text-xl font-semibold mb-4">Quick Capture</h1>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What's on your mind?"
        className="w-full rounded-md border p-3 text-lg"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        rows={4}
        className="mt-3 w-full rounded-md border p-3"
      />
      <button
        onClick={handleSubmit}
        disabled={!title.trim()}
        className="mt-4 w-full rounded-md bg-primary p-3 text-primary-foreground font-medium"
      >
        Capture to Inbox
      </button>
    </div>
  );
}
```

---

## 7. Global Keyboard Shortcut

### 7.1 Capture Modal

A modal that can be triggered from any page in the app:

```typescript
// src/components/shared/CaptureModal.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function CaptureModal() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Global keyboard shortcut: Ctrl+Shift+Space (Cmd+Shift+Space on Mac)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "Space") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: title.trim(), notes: notes.trim() || undefined }),
      });
      setTitle("");
      setNotes("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }, [title, notes]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Capture</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What's on your mind?"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={3}
        />
        <Button onClick={handleSubmit} disabled={!title.trim() || saving}>
          {saving ? "Saving..." : "Capture"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Press Enter to save. Esc to cancel.
        </p>
      </DialogContent>
    </Dialog>
  );
}
```

Mount `<CaptureModal />` in the root dashboard layout so it's available on every page.

---

## 8. Browser Extension Concept

### 8.1 Architecture

A minimal Chrome/Firefox extension with:
- **Popup** -- a simple form (title + notes) that calls `POST /api/capture` with the stored bearer token
- **Context menu** -- right-click "Send to Tandem" on selected text
- **Options page** -- enter Tandem URL and API token

### 8.2 Key Files

```
tandem-capture-extension/
  manifest.json       -- Extension manifest (Manifest V3)
  popup.html          -- Popup UI
  popup.js            -- Popup logic
  background.js       -- Context menu handler
  options.html        -- Token + URL configuration
  options.js          -- Settings persistence
  icon-48.png
  icon-128.png
```

### 8.3 Context Menu Flow

```javascript
// background.js
chrome.contextMenus.create({
  id: "tandem-capture",
  title: "Send to Tandem Inbox",
  contexts: ["selection"],
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  const { tandemUrl, apiToken } = await chrome.storage.local.get(["tandemUrl", "apiToken"]);
  if (!tandemUrl || !apiToken) return;

  await fetch(`${tandemUrl}/api/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      title: info.selectionText.slice(0, 500),
      notes: `Source: ${info.pageUrl}`,
      source: "browser-extension",
    }),
  });
});
```

The extension is documented but not shipped as part of the core Tandem repo. It can live in a separate `tandem-capture-extension/` directory or repo.

---

## 9. Implementation Phases

### Phase 1: Capture API + Token Management UI

**Goal:** External tools can create inbox items via bearer token.

**Schema changes:**
- None if `ApiToken` already exists (it does)
- Add `source` to `InboxItem` if not already present from Email Capture spec

**New files:**
- `src/app/api/capture/route.ts` -- capture endpoint
- `src/components/settings/ApiTokenSettings.tsx` -- token management UI
- `src/lib/validations/capture.ts` -- Zod schema
- `src/app/api/settings/api-tokens/route.ts` -- GET/POST tokens
- `src/app/api/settings/api-tokens/[id]/route.ts` -- DELETE token

**Modified files:**
- `src/app/(dashboard)/settings/page.tsx` -- add API Tokens section

**Files touched:** ~7

### Phase 2: PWA Share Target + Capture Page

**Goal:** Share content from other apps directly into Tandem.

**New files:**
- `src/app/(dashboard)/capture/page.tsx` -- capture page with share target pre-fill

**Modified files:**
- `public/manifest.json` -- add `share_target`

**Files touched:** ~2

### Phase 3: Global Keyboard Shortcut + Capture Modal

**Goal:** Capture from anywhere within the app with one keystroke.

**New files:**
- `src/components/shared/CaptureModal.tsx`

**Modified files:**
- `src/app/(dashboard)/layout.tsx` -- mount CaptureModal

**Files touched:** ~2

### Phase 4: Documentation + Extension Concept

**Goal:** Help docs for iOS/Android shortcuts, extension source code.

**New files:**
- `docs/help/features/quick-capture.md` -- help article with shortcut recipes
- `extensions/chrome/` -- browser extension source (optional, separate from main app)

**Files touched:** ~3

---

## 10. Edge Cases

- **Token in URL** -- the capture API uses `Authorization` header, not query params, to avoid tokens appearing in server logs or browser history.
- **Offline capture** -- the PWA share target and capture page work through the service worker's network-first strategy. If offline, the request fails. A future enhancement could queue captures in IndexedDB and sync when online.
- **Empty title** -- the schema requires `title.min(1)`. If the share target provides only a URL and no title, the URL is used as the title.
- **Very long shared text** -- the `title` field caps at 500 chars and `notes` at 5000 chars. Content beyond that is silently truncated.
- **Token revocation** -- deleting a token immediately invalidates it. The bcrypt hash is removed from the database; subsequent requests with that token find no matching candidate.
- **Concurrent captures** -- the inbox item creation uses Prisma transactions (via `createInboxItem`), so concurrent captures from multiple devices are safe.

---

## 11. What This Spec Does Not Cover

- **Full REST API** -- this spec covers only the capture endpoint. A broader API for reading/updating tasks, projects, etc. via bearer token is a separate concern (the MCP tools already serve that role for AI clients).
- **Webhook delivery** -- no outgoing webhooks when items are captured. Could be added for Zapier/IFTTT integration later.
- **Voice capture** -- speech-to-text capture via the phone's voice input works naturally (the iOS Shortcut's "Ask for Input" supports dictation). No special Tandem code needed.
```

---
