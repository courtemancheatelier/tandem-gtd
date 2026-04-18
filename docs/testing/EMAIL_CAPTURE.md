# Email-to-Inbox Capture — Test Plan

## Prerequisites

- `EMAIL_INBOX_DOMAIN` set in `.env` (e.g., `inbox.tandem.app`)
- `EMAIL_WEBHOOK_SECRET` set in `.env` (any random string)
- Migration applied: `npx prisma migrate deploy`
- Prisma client regenerated: `npx prisma generate`

---

## 1. Settings UI

### 1.1 Initial State
- [ ] Navigate to Settings > General tab
- [ ] Email Capture card appears between Linked Accounts and Onboarding
- [ ] Toggle is OFF by default
- [ ] If `EMAIL_INBOX_DOMAIN` is not set, yellow warning shows "requires EMAIL_INBOX_DOMAIN"

### 1.2 Enable
- [ ] Toggle ON — generates a personal inbox address
- [ ] Address displays in a code block (e.g., `k9f3m7x2p4q1@inbox.tandem.app`)
- [ ] Copy button copies address to clipboard
- [ ] Copy button shows green checkmark briefly after copying
- [ ] Description text explains how forwarding works

### 1.3 Disable
- [ ] Toggle OFF — address disappears
- [ ] Toggle back ON — same address reappears (token preserved)

### 1.4 Regenerate
- [ ] Click "Regenerate Address"
- [ ] New address appears (different token)
- [ ] Toast confirms "Address regenerated"
- [ ] Old address no longer works (test via webhook after)

---

## 2. Webhook Endpoint

Test with curl against `POST /api/webhooks/email-inbound`.

### 2.1 Authentication
- [ ] Request without `X-Webhook-Secret` header → 403
- [ ] Request with wrong secret → 403
- [ ] Request with correct secret → processes normally

### 2.2 Payload Validation
- [ ] Missing `token` → 400
- [ ] Token shorter than 8 chars → 400
- [ ] Valid payload with subject only → 200, inbox item created
- [ ] Valid payload with subject + body + from → 200, inbox item created with notes

### 2.3 Token Lookup
- [ ] Valid token with `emailInboxEnabled: true` → creates inbox item
- [ ] Valid token with `emailInboxEnabled: false` → silent 200, no item created
- [ ] Invalid/nonexistent token → silent 200, no item created (no info leak)
- [ ] Disabled user's token → silent 200, no item created

### 2.4 Rate Limiting
- [ ] Send 10 emails in quick succession → all succeed
- [ ] Send 11th email within the hour → 429 response
- [ ] After rate limit window resets → succeeds again

### 2.5 Content Handling
- [ ] Subject becomes inbox item `content` (capped at 500 chars)
- [ ] Body appears in `notes` prefixed with `---` separator
- [ ] `from` address appears in notes as `From: sender@example.com`
- [ ] No subject → content is "(No subject)"
- [ ] No body → notes contain only the From line
- [ ] Long body (>5000 chars) → truncated to 5000

### Sample curl
```bash
curl -X POST http://localhost:2000/api/webhooks/email-inbound \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: YOUR_SECRET_HERE" \
  -d '{
    "token": "YOUR_TOKEN_HERE",
    "subject": "Test email capture",
    "body": "This is a test email body forwarded to Tandem.",
    "from": "alice@example.com"
  }'
```

---

## 3. Inbox Display

### 3.1 Source Badge
- [ ] Email-captured items show "via email from sender@example.com" in blue text
- [ ] Manually captured items show no source badge
- [ ] API-captured items show no source badge (source tracking is email-only for now)

### 3.2 Item Content
- [ ] Subject appears as the inbox item title
- [ ] Expanding the item shows notes with From line and email body
- [ ] Item is editable (content and notes) like any other inbox item
- [ ] Item can be deleted normally
- [ ] Item can be processed via "Process Inbox" flow normally

### 3.3 Polling
- [ ] With inbox page open, send an email via webhook
- [ ] Item appears within 5 seconds (existing 5s polling interval)

---

## 4. Cloudflare Worker (end-to-end)

Only testable with Cloudflare Email Routing configured.

### 4.1 Setup
- [ ] `wrangler.toml` configured with correct name
- [ ] Secrets set: `wrangler secret put TANDEM_URL`, `wrangler secret put WEBHOOK_SECRET`
- [ ] Worker deployed: `cd cloudflare-worker && npx wrangler deploy`
- [ ] Cloudflare Email Routing catch-all points to this Worker

### 4.2 End-to-End
- [ ] Forward a real email to `{token}@{domain}`
- [ ] Item appears in Tandem inbox with correct subject, body, and sender
- [ ] Forward an email with HTML-only body → body is converted to readable text
- [ ] Forward an email with attachments → attachments are ignored, text content captured
- [ ] Send to invalid/short token → email silently rejected

---

## 5. Edge Cases

- [ ] Regenerate token, then send to old token → no item created
- [ ] Disable email capture, send to token → no item created
- [ ] Re-enable email capture → same token works again
- [ ] Very long email subject (>500 chars) → truncated, no error
- [ ] Email with no text or HTML body → item created with "(No subject)" or subject only
