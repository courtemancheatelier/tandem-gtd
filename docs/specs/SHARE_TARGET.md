# Spec: Web Share Target — Smart URL Capture

**Status:** Draft  
**Scope:** v1.x  
**File:** `docs/specs/SHARE_TARGET.md`

---

## Problem

When a user shares a URL to Tandem from Chrome's share sheet (or any OS-level share dialog), the current behavior pastes the raw URL into the inbox item's `content` field as the task name. The result is inbox items like:

> `https://somecompany.com/product/widget-pro-5000?ref=instagram`

This is not a useful task name. The URL should go to the external link field (per the existing external link model), and the page title or OG metadata should populate the task name so it's actually readable.

---

## Goal

When a URL is shared to Tandem:

1. The URL lands in the **external link field**, not the task name.
2. The **page title** (fetched server-side from `og:title`, `<title>`, or a reasonable fallback) pre-fills the task name.
3. The user lands in a pre-filled inbox capture UI, can edit the name, then save.
4. If metadata fetch fails, the URL becomes the task name (current behavior as graceful fallback).

---

## How PWA Share Target Works

The [Web Share Target API](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target) lets a PWA register as a share destination. Two pieces are required:

1. **`manifest.json`** — declares `share_target` so the OS shows Tandem in the share sheet.
2. **A handler route** — receives the incoming share data (GET or POST) and renders the capture UI.

Chrome on Android and desktop supports this. Safari on iOS supports it for installed PWAs as of iOS 17+.

---

## Implementation Plan

### 1. Update `public/manifest.json`

Add a `share_target` entry. Use GET (not POST) so the data arrives as URL query params — simpler to handle in Next.js App Router without service worker POST interception:

```json
"share_target": {
  "action": "/share",
  "method": "GET",
  "enctype": "application/x-www-form-urlencoded",
  "params": {
    "title": "title",
    "text": "text",
    "url": "url"
  }
}
```

When the user shares from Chrome, the OS opens:
```
https://your-instance.com/share?title=Some+Page+Title&url=https%3A%2F%2Fexample.com&text=
```

All three params (`title`, `text`, `url`) are optional — the browser passes what it has. Chrome typically sends `title` (tab title) and `url`.

---

### 2. Create `src/app/(dashboard)/share/page.tsx`

This page receives the incoming share, fetches enhanced metadata if needed, and renders a pre-filled capture UI.

**Route:** `GET /share?title=...&url=...&text=...`

**Behavior:**

```
On load:
  1. Parse ?url, ?title, ?text from query params
  2. If url is present:
     a. POST to /api/share/metadata with { url }
     b. Resolve best task name: og:title > <title> > ?title param > url (fallback)
     c. Render ShareCaptureModal pre-filled with { taskName, url }
  3. If no url but text contains a URL (regex detect):
     a. Extract the URL from text, treat like above
  4. If no url at all:
     a. Use title or text as task name, no URL field pre-fill
     b. Render normal inbox capture
```

The page should be a thin wrapper that passes resolved data into a `ShareCaptureModal` component (see §4).

**Auth:** Protected by the existing session check — if not logged in, redirect to `/login?callbackUrl=/share?...`.

---

### 3. Create `src/app/api/share/metadata/route.ts`

Server-side metadata fetch. This runs on the server so there are no CORS issues fetching third-party pages.

**Request:** `POST /api/share/metadata`
```json
{ "url": "https://example.com/some-page" }
```

**Response:**
```json
{
  "title": "Some Page Title",
  "description": "Optional og:description if present",
  "siteName": "Example Site",
  "favicon": "https://example.com/favicon.ico"
}
```

**Resolution priority for `title`:**
1. `<meta property="og:title" content="...">`
2. `<meta name="twitter:title" content="...">`
3. `<title>` tag
4. `null` (caller falls back to `?title` param or URL)

**Implementation notes:**
- Use `fetch()` with a reasonable timeout (5s). On timeout or non-200, return `{ title: null }`.
- Parse with a lightweight HTML parser or simple regex — no need for a full DOM. The `<head>` section is usually sufficient; truncate the response body at ~50KB to avoid downloading entire pages.
- Set a descriptive `User-Agent` header: `Tandem GTD Share Fetcher/1.0`.
- Do **not** follow redirects to URLs on different domains (security: avoid SSRF-adjacent abuse on self-hosted instances). Follow same-domain redirects only, or just follow all and let the network stack handle it — keep it simple for v1.
- Auth required (existing session).

**Suggested implementation pattern:**
```typescript
const response = await fetch(url, {
  headers: { 'User-Agent': 'Tandem GTD Share Fetcher/1.0' },
  signal: AbortSignal.timeout(5000),
});
const html = await response.text(); // first ~50KB is fine
// parse og:title, twitter:title, <title> with regex or HTMLRewriter
```

---

### 4. Create `src/components/share/ShareCaptureModal.tsx`

A specialized variant of `InboxCaptureModal` for share target captures. **Do not modify `InboxCaptureModal`** — keep the existing keyboard shortcut flow clean.

**Props:**
```typescript
interface ShareCaptureProps {
  initialTitle: string;     // pre-filled task name (editable)
  initialUrl?: string;      // pre-filled URL for external link field
  isLoading?: boolean;      // true while metadata fetch is in-flight
}
```

**UI:**
- Task name field: pre-filled, user can edit before saving.
- URL field: pre-filled and visible (not hidden). Show the domain name as a hint below the field.
- "Source" badge: small pill showing the domain (e.g. `somecompany.com`) so the user knows where this came from.
- Loading state: while metadata is fetching, show a spinner in the task name field and disable the Save button. If the page component fetches server-side (RSC), this may not be needed.
- Save destination: "Add to Inbox" (default) or "Save as Task" toggle — same as `InboxCaptureModal`.
- On save: creates an `InboxItem` with `content = taskName` and, once the external link field is wired per `EXTERNAL_LINK_SPEC.md`, stores the URL in `externalLink`.
- After save: redirect to `/inbox` (not back to the share page).

**Open question — external link field availability:**  
If `EXTERNAL_LINK_SPEC.md` is not yet implemented when this ships, store the URL in the `notes` field as a fallback with a clear comment in the code marking it for migration. Do not block this feature on external links being done first.

---

### 5. Update service worker (`public/sw.js`)

The current service worker skips non-GET requests. Since we're using GET for share target (see §1), **no service worker changes are required**.

If a future version switches to POST, the service worker would need to intercept the share POST and redirect to the handler page. Stay on GET for now.

---

## Data Flow Diagram

```
User taps "Share" in Chrome
         │
         ▼
OS share sheet shows "Tandem" icon
         │
         ▼
Chrome opens: /share?url=https://...&title=Product+Page
         │
         ▼
/share page (Next.js RSC)
  ├─ Authenticated? No → redirect to /login
  └─ Yes:
       ├─ Extract ?url, ?title
       ├─ Fetch /api/share/metadata { url }  ← server-side, no CORS issues
       │    └─ Returns { title: "Better Product Name" }
       └─ Render ShareCaptureModal
            taskName: "Better Product Name"   (from og:title)
            url:      "https://..."           (to external link field)
         │
         ▼
User edits name if needed → clicks "Add to Inbox"
         │
         ▼
POST /api/inbox  { content: "Better Product Name", externalLink: { url, label: "somecompany.com" } }
         │
         ▼
Redirect → /inbox
```

---

## Title Resolution Logic (Reference)

```typescript
function resolveBestTitle(
  ogTitle: string | null,
  twitterTitle: string | null,
  htmlTitle: string | null,
  queryParamTitle: string | null,
  url: string
): string {
  return (
    ogTitle?.trim() ||
    twitterTitle?.trim() ||
    htmlTitle?.trim() ||
    queryParamTitle?.trim() ||
    url
  );
}
```

Strip boilerplate suffixes like ` | Company Name` or ` - Site Name` from `<title>` tags only (not OG titles, which are usually already clean). A simple split on ` | ` and ` - ` keeping the first segment is sufficient.

---

## Files Affected

| File | Change |
|------|--------|
| `public/manifest.json` | Add `share_target` entry |
| `src/app/(dashboard)/share/page.tsx` | New — share handler page |
| `src/app/api/share/metadata/route.ts` | New — server-side metadata fetch |
| `src/components/share/ShareCaptureModal.tsx` | New — pre-filled capture UI |
| `public/sw.js` | No change (GET method requires none) |
| `src/components/inbox/InboxCaptureModal.tsx` | No change |

---

## Out of Scope (v1)

- Image/file sharing (only URLs for v1)
- OG image preview in the capture modal
- Sharing to a specific project directly (always goes to inbox)
- Deduplication (same URL shared twice creates two inbox items — fine for now)
- iOS Safari support validation (will work if the PWA is installed; not blocking)
