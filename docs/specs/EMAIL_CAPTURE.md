# Email-to-Inbox Capture

> **Status:** Draft
> **Last updated:** 2026-02-23

---

## 1. Problem Statement

### The Need

GTD's capture habit depends on zero-friction entry points. When something comes in via email -- a request from a colleague, a receipt to follow up on, a link to read later -- the user currently has to: open Tandem, navigate to the inbox, and manually type or paste the content. That's three context switches. Many things never make it.

Email forwarding is the lowest-friction capture method for email-heavy workflows. Forward an email to a special address, and it lands in your Tandem inbox as an unprocessed item, ready for the next clarify session.

### What "Done" Looks Like

1. **Each user has a unique inbox email address** -- displayed in settings, like `abc123@inbox.tandem.app` or `user+abc123@inbox.tandem.app`.
2. **Forwarding an email to that address** creates an `InboxItem` with the email subject as `content` and the email body as `notes`.
3. **Webhook endpoint** -- `/api/webhooks/email-inbound` receives parsed email data from the email provider.
4. **Security** -- webhook requests are verified via provider signature, rate-limited, and spam-filtered.
5. **User can regenerate their token** -- if the address leaks, they get a new one.
6. **Rich content handling** -- HTML bodies are converted to plain text or simple markdown. Attachments are referenced but not stored.

### What "Done" Does Not Look Like

- Full email client features (threads, replies, folders)
- Sending emails from Tandem
- Two-way email sync
- Attachment storage or processing

---

## 2. Email Provider Evaluation

### Options

| Provider | Mechanism | Pricing | Tandem Fit |
|----------|-----------|---------|------------|
| **Cloudflare Email Workers** | Email Routing + Workers script | Free (included with domain) | Tandem already uses Cloudflare. Zero marginal cost. Requires a Cloudflare-managed domain. |
| **SendGrid Inbound Parse** | MX record + webhook POST | Free tier: 100 emails/day | Well-documented, mature. Requires MX record setup. |
| **Mailgun Routes** | MX record + webhook POST | Flex: $0.80/1000 emails | Similar to SendGrid. Good docs. |
| **Postmark Inbound** | Dedicated inbound address + webhook | $0 for inbound | Clean API, good reliability. |

### Recommendation: Cloudflare Email Workers

Tandem deploys behind Cloudflare (referenced in `docs/specs/DEPLOYMENT_MONETIZATION.md` and `docs/specs/SSL_TLS_SPEC.md`). Cloudflare Email Routing is free and already available on the domain. A Cloudflare Worker can receive emails, extract the user token, and POST the parsed content to Tandem's webhook endpoint. No additional vendor, no per-message cost, no MX record changes beyond Cloudflare's own.

**Fallback:** If the deployment does not use Cloudflare, or the operator prefers a simpler setup, SendGrid Inbound Parse is the recommended alternative. The webhook handler is the same either way -- only the email routing and signature verification differ.

---

## 3. Data Model Changes

### 3.1 User Email Inbox Token

Add to the `User` model:

```prisma
// In model User
emailInboxToken    String?  @unique  // Random token for inbound email address
emailInboxEnabled  Boolean  @default(false)  // User must explicitly enable
```

The token is generated on demand (not on account creation) when the user first enables email capture in settings. Format: 12-character alphanumeric string (e.g., `k9f3m7x2p4q1`).

The user's inbound email address is derived: `{emailInboxToken}@inbox.tandem.app` (or whatever domain is configured).

### 3.2 InboxItem Source Tracking

Add optional source metadata to `InboxItem`:

```prisma
// In model InboxItem
source        String?   // "email", "api", "mcp", "manual", "share" — how the item was captured
sourceEmail   String?   // Original sender email (for email-captured items)
```

This allows the inbox processing UI to show "Forwarded from alice@example.com" and lets the user distinguish manual captures from email captures.

---

## 4. Email Processing Architecture

### 4.1 Flow Diagram

```
User forwards email to k9f3m7x2p4q1@inbox.tandem.app
    │
    ▼
Cloudflare Email Routing receives email
    │
    ▼
Cloudflare Worker extracts:
  - Recipient (to parse the token)
  - Subject, plain text body, from address
  - Attachment metadata (names, sizes)
    │
    ▼
Worker POSTs to https://tandem.example.com/api/webhooks/email-inbound
  Headers: X-Webhook-Secret: <shared secret>
  Body: { token, subject, body, from, attachments: [...] }
    │
    ▼
Tandem webhook handler:
  1. Verify webhook secret
  2. Look up user by emailInboxToken
  3. Rate limit (10 emails/hour per token)
  4. Create InboxItem
  5. Return 200
```

### 4.2 Cloudflare Email Worker

```javascript
// cloudflare-worker/email-inbound.js
export default {
  async email(message, env) {
    const recipient = message.to;
    // Extract token from the local part: "k9f3m7x2p4q1@inbox.tandem.app"
    const token = recipient.split("@")[0];

    if (!token || token.length < 8) {
      // Reject obviously invalid addresses
      message.setReject("Invalid recipient");
      return;
    }

    // Read the email body
    const rawEmail = await new Response(message.raw).text();

    // Parse basic email fields
    // (For production, use a lightweight email parser like postal-mime)
    const subject = message.headers.get("subject") || "(No subject)";
    const from = message.from;

    // Extract plain text body (simplified — production should handle MIME parts)
    const body = extractPlainText(rawEmail);

    // Forward to Tandem webhook
    const response = await fetch(`${env.TANDEM_URL}/api/webhooks/email-inbound`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": env.WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        token,
        subject,
        body: body.slice(0, 10000),  // Cap body size
        from,
      }),
    });

    if (!response.ok) {
      // Log for debugging; Cloudflare will show this in Worker logs
      console.error(`Webhook failed: ${response.status}`);
    }
  },
};
```

### 4.3 Webhook Endpoint

```typescript
// src/app/api/webhooks/email-inbound/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/api/rate-limit";
import { createInboxItem } from "@/lib/services/inbox-service";

const WEBHOOK_SECRET = process.env.EMAIL_WEBHOOK_SECRET;

const emailInboundSchema = z.object({
  token: z.string().min(8).max(32),
  subject: z.string().max(500),
  body: z.string().max(10000).optional(),
  from: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  // 1. Verify webhook secret
  const secret = req.headers.get("x-webhook-secret");
  if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Parse and validate body
  const raw = await req.json();
  const parsed = emailInboundSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { token, subject, body, from } = parsed.data;

  // 3. Look up user by token
  const user = await prisma.user.findFirst({
    where: { emailInboxToken: token, emailInboxEnabled: true, isDisabled: false },
  });
  if (!user) {
    // Don't reveal whether the token exists
    return NextResponse.json({ ok: true });
  }

  // 4. Rate limit: 10 emails per hour per token
  const { allowed } = rateLimit(`email-inbound:${token}`, 10, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // 5. Create InboxItem
  const content = subject || "(No subject)";
  const notes = [
    from ? `From: ${from}` : null,
    body ? `\n---\n${body}` : null,
  ].filter(Boolean).join("\n");

  await createInboxItem(
    user.id,
    {
      content: content.slice(0, 500),
      notes: notes?.slice(0, 5000) || undefined,
    },
    {
      actorType: "SYSTEM",
      source: "API",
      message: `Email capture from ${from || "unknown sender"}`,
    }
  );

  return NextResponse.json({ ok: true });
}
```

---

## 5. User Settings UI

### 5.1 Email Capture Section

Add to the settings page under a new "Email Capture" card:

```
┌───────────────────────────────────────────────────────┐
│  Email Capture                          [Toggle: ON]   │
├───────────────────────────────────────────────────────┤
│                                                        │
│  Your personal inbox address:                          │
│  ┌─────────────────────────────────────────────┐      │
│  │  k9f3m7x2p4q1@inbox.tandem.app    [Copy]   │      │
│  └─────────────────────────────────────────────┘      │
│                                                        │
│  Forward any email to this address and it will appear  │
│  in your Tandem inbox as an unprocessed item.          │
│                                                        │
│  [Regenerate Address]                                  │
│  ⚠ Regenerating creates a new address. The old one     │
│    will stop working immediately.                      │
│                                                        │
└───────────────────────────────────────────────────────┘
```

### 5.2 Settings API

**`POST /api/settings/email-capture/enable`** -- generates token if not exists, sets `emailInboxEnabled = true`

```typescript
import crypto from "crypto";

// Generate a URL-safe random token
const token = crypto.randomBytes(9).toString("base64url"); // ~12 chars
```

**`POST /api/settings/email-capture/disable`** -- sets `emailInboxEnabled = false` (keeps token for re-enable)

**`POST /api/settings/email-capture/regenerate`** -- generates new token, replacing the old one

---

## 6. Implementation Phases

### Phase 1: Data Model + Webhook Endpoint + Settings UI

**Goal:** Emails forwarded to the webhook create inbox items. Settings page shows the address.

**Schema changes:**
- Add `emailInboxToken` (nullable, unique) and `emailInboxEnabled` on `User`
- Add `source` and `sourceEmail` on `InboxItem`
- Migration: `npx prisma migrate dev --name add-email-capture`

**Environment variables:**
- `EMAIL_WEBHOOK_SECRET` -- shared secret between email worker and Tandem
- `EMAIL_INBOX_DOMAIN` -- domain for inbound addresses (e.g., `inbox.tandem.app`)

**New files:**
- `src/app/api/webhooks/email-inbound/route.ts` -- webhook handler
- `src/app/api/settings/email-capture/enable/route.ts`
- `src/app/api/settings/email-capture/disable/route.ts`
- `src/app/api/settings/email-capture/regenerate/route.ts`
- `src/components/settings/EmailCaptureSettings.tsx`
- `src/lib/validations/email-capture.ts`

**Modified files:**
- `prisma/schema.prisma`
- `src/app/(dashboard)/settings/page.tsx` -- add Email Capture section
- `.env.example` -- add EMAIL_WEBHOOK_SECRET, EMAIL_INBOX_DOMAIN

**Files touched:** ~10

### Phase 2: Cloudflare Email Worker

**Goal:** Actual email routing works end-to-end.

**New files:**
- `cloudflare-worker/email-inbound.js` (or `.ts`) -- Cloudflare Worker script
- `cloudflare-worker/wrangler.toml` -- Worker config

**Setup steps:**
1. Configure Cloudflare Email Routing on the domain
2. Create a catch-all route pointing to the Worker
3. Deploy the Worker with `TANDEM_URL` and `WEBHOOK_SECRET` secrets
4. Test with a forwarded email

**Files touched:** ~3

### Phase 3: Rich Content + Source Display

**Goal:** Better email body handling and inbox UI improvements.

**Code changes:**
- HTML-to-markdown conversion in the webhook (use `turndown` or `html-to-text`)
- Attachment metadata storage (names, sizes in `notes` field)
- Inbox item display shows source badge ("via Email from alice@...") when `source === "email"`
- Inbox item display renders `sourceEmail` as a clickable mailto link

**Modified files:**
- `src/app/api/webhooks/email-inbound/route.ts` -- add HTML conversion
- `src/components/inbox/InboxItem.tsx` (or equivalent) -- source badge
- `package.json` -- add `turndown` or `html-to-text` dependency

**Files touched:** ~4

### Phase 4: SendGrid Fallback + Documentation

**Goal:** Alternative for non-Cloudflare deployments.

**New files:**
- `docs/guides/email-capture-sendgrid.md` -- setup guide for SendGrid Inbound Parse
- `src/app/api/webhooks/email-inbound/sendgrid.ts` -- optional SendGrid signature verification

The webhook payload schema is the same regardless of provider. Only the signature verification and email routing configuration differ.

**Files touched:** ~3

---

## 7. Edge Cases

- **Token collision:** The 12-character base64url token has ~72 bits of entropy. Combined with the `@unique` constraint, collisions are astronomically unlikely. The generation function should retry once on unique constraint violation.
- **Bounced emails:** Invalid tokens result in a silent 200 response (no inbox item created). The Cloudflare Worker does not bounce -- it accepts and discards. This prevents probing valid tokens via bounce-back analysis.
- **Large emails:** Body is capped at 10,000 characters. Attachments are mentioned by name in the notes but not downloaded or stored.
- **Spam:** Rate limiting (10/hour/token) prevents floods. The webhook secret prevents external abuse. Spam that reaches the inbox is handled the same as any inbox item -- the user processes or deletes it.
- **HTML-only emails:** Some emails have no plain text part. Phase 3 adds `html-to-text` conversion. In Phase 1, the raw HTML is stored as-is in notes (ugly but functional).
- **Reply chains:** Forwarded emails often include long reply chains. The body cap at 10K characters naturally truncates. A future improvement could strip quoted content.

---

## 8. What This Spec Does Not Cover

- **Outbound email** -- Tandem does not send emails to users (that's handled by the Notifications spec if email digests are added).
- **Email thread tracking** -- this is one-shot capture, not email management.
- **Attachment storage** -- attachments are referenced by name/size but not uploaded to any storage. If needed later, S3-compatible storage can be integrated.
- **Custom domain routing** -- the spec assumes one domain (`inbox.tandem.app`). Multi-tenant or user-custom domains are out of scope.
- **DKIM/SPF configuration** -- Cloudflare handles inbound email DNS. No outbound DNS records needed.
```

---
