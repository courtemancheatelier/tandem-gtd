# Operator Support Link

> Let instance operators add a donation/support URL (Buy Me a Coffee, Ko-fi, etc.) so their community can help cover server costs — no payment processing needed in Tandem.

**Status:** Open
**Depends on:** ServerSettings singleton (`prisma/schema.prisma:321-340`), admin settings API (`src/app/api/admin/settings/route.ts`), admin settings UI (`src/app/(dashboard)/settings/admin/page.tsx`)

---

## 1. Overview

Tandem is open source and self-hostable. Many operators will run instances for their friends, communities, or small groups — not as a business, but as a shared tool. The cost of running a server ($5-20/mo) falls entirely on the operator.

This feature lets operators add a link to their donation page (Buy Me a Coffee, Ko-fi, Open Collective, Patreon, Venmo, or any URL) so users can voluntarily chip in. All payment handling happens on the external platform — Tandem just stores and displays the URL.

### Design Principles

- **Zero payment complexity** — no Stripe, no billing code, no PCI compliance. The operator's external page handles everything.
- **Platform-agnostic** — any URL works. Not locked to a specific donation platform.
- **Voluntary, not gated** — the link is visible but never blocks functionality. The server works the same whether users donate or not.
- **Operator-controlled** — only the admin sets it. If blank, nothing shows.

---

## 2. Schema Changes

Add one field to `ServerSettings` (`prisma/schema.prisma:321-340`):

```prisma
model ServerSettings {
  // ... existing fields ...

  // ── Operator Support ──────────────────────────────────────────────
  supportUrl         String?     // External donation/support page URL (Buy Me a Coffee, Ko-fi, etc.)
}
```

Migration: `npx prisma migrate dev --name add-support-url`

---

## 3. Admin Settings UI

Add a "Community Support" section to the admin settings page (`src/app/(dashboard)/settings/admin/page.tsx`):

### Fields

| Field | Type | Label | Placeholder |
|-------|------|-------|-------------|
| `supportUrl` | URL input | Support Link | `https://buymeacoffee.com/yourname` |

### Behavior

- Standard URL validation (must start with `https://`)
- Empty = feature disabled, no link shown anywhere
- Save via existing `PATCH /api/admin/settings` endpoint

---

## 4. User-Facing Display

When `supportUrl` is set, show a "Support this server" link in these locations:

### 4.1 Help Page Footer

Below the help article list / category cards, a subtle card:

```
☕ Support this server
This Tandem instance is community-supported.
[Support this server →]  (opens supportUrl in new tab)
```

### 4.2 Sidebar Footer (Optional)

Small text link at the bottom of the desktop sidebar, below the user menu:

```
☕ Support this server
```

Opens `supportUrl` in a new tab.

### Behavior

- Both locations only render when `supportUrl` is non-empty
- Links open in a new tab (`target="_blank" rel="noopener noreferrer"`)
- No tracking, no analytics on clicks
- Fetch `supportUrl` via the existing public branding API or a lightweight endpoint

---

## 5. API Changes

### 5.1 Admin Settings Endpoint

`PATCH /api/admin/settings` — add `supportUrl` to the accepted fields and Zod schema. Same pattern as existing settings fields.

### 5.2 Public Access

The `supportUrl` needs to be readable by authenticated (non-admin) users. Options:

- **Option A:** Include it in the existing session/settings data that the layout already fetches
- **Option B:** Add it to the public branding endpoint (`GET /api/public/branding`) if that exists from the Info Website spec

Choose whichever is already in place at implementation time.

---

## 6. Implementation Steps

1. Add `supportUrl` field to `ServerSettings` in Prisma schema
2. Run migration
3. Add field to admin settings Zod validation schema
4. Add "Community Support" section to admin settings UI
5. Expose `supportUrl` to authenticated users (session data or branding API)
6. Add support link to help page footer
7. Add support link to sidebar footer
8. Test: empty URL = nothing shows, valid URL = links appear and open in new tab

---

## 7. Edge Cases

| Scenario | Behavior |
|----------|----------|
| No URL set | Nothing renders — no empty card, no broken link |
| Invalid URL | Admin form validates before save — must be valid `https://` URL |
| URL goes dead | Not our problem — the link still works, the external page is the operator's responsibility |
| Multiple admins | Last save wins (same as all other settings) |

---

## 8. Out of Scope

- Payment processing inside Tandem
- Tracking who donated or how much
- Gating features behind donations
- Displaying donation goals or progress bars
- Platform-specific integrations (BMC widgets, Ko-fi overlays)
