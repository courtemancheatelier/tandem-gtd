# Apple OAuth Setup Guide

> **Status:** Deferred until user demand warrants it
> **Cost:** $99/year Apple Developer Program membership
> **Time estimate:** 2–3 hours once you decide to proceed
> **Code status:** Already wired up — `AppleProvider`, login button, env vars all in place

---

## Prerequisites

- Active [Apple Developer Program](https://developer.apple.com/account) membership ($99/year)
- Access to Tandem's `.env` file
- The `.p8` private key file (downloaded once from Apple — keep it safe)

---

## Step-by-Step

### 1. Register an App ID

1. Go to **Certificates, Identifiers & Profiles → Identifiers → App IDs**
2. Register a new App ID (e.g. `com.tandemgtd.app`)
3. Enable **Sign In with Apple** as a capability
4. Save

### 2. Create a Services ID (this becomes `APPLE_ID`)

1. Go to **Identifiers → Services IDs**
2. Register a new Services ID (e.g. `com.tandemgtd.auth`)
3. Enable **Sign In with Apple**
4. Click **Configure** and set:
   - **Domain:** your production domain (e.g. `gtd.yourdomain.com`)
   - **Return URL:** `https://gtd.yourdomain.com/api/auth/callback/apple`
5. Save

### 3. Create a Private Key

1. Go to **Keys → Create a new key**
2. Name it (e.g. `Tandem Sign In`)
3. Enable **Sign In with Apple**
4. Download the `.p8` file — **you only get one download**
5. Note the **Key ID** displayed after creation
6. Store the `.p8` file securely (e.g. in your secrets manager or encrypted vault)

### 4. Gather Your IDs

You need three values from the Apple Developer portal:

| Value | Where to find it |
|-------|-----------------|
| **Team ID** | Top-right corner of the developer portal (10-char alphanumeric) |
| **Key ID** | Shown after creating the key in Step 3 |
| **Services ID** | The identifier from Step 2 (e.g. `com.tandemgtd.auth`) |

### 5. Generate the Client Secret (JWT)

Apple doesn't provide a static client secret. You sign a JWT with your `.p8` private key. The JWT expires in **max 6 months**, so you'll need to regenerate periodically.

**Option A — Use the next-auth helper:**

```bash
npx next-auth-apple-secret \
  --team-id YOUR_TEAM_ID \
  --key-id YOUR_KEY_ID \
  --private-key-path ./AuthKey_XXXX.p8 \
  --client-id com.tandemgtd.auth
```

**Option B — Node script with `jsonwebtoken`:**

```js
const jwt = require("jsonwebtoken");
const fs = require("fs");

const privateKey = fs.readFileSync("./AuthKey_XXXX.p8");

const token = jwt.sign({}, privateKey, {
  algorithm: "ES256",
  expiresIn: "180d",
  audience: "https://appleid.apple.com",
  issuer: "YOUR_TEAM_ID",
  subject: "com.tandemgtd.auth", // Services ID
  keyid: "YOUR_KEY_ID",
});

console.log(token);
```

**Option C — Automate at startup (future improvement):**

Instead of a static secret, generate the JWT dynamically in `auth.ts` on server startup. This eliminates the 6-month expiry problem entirely. Would require storing the `.p8` key contents in an env var.

### 6. Set Environment Variables

```env
APPLE_ID="com.tandemgtd.auth"
APPLE_SECRET="eyJhbGciOiJFUzI1NiIs..."
```

The existing code in `src/lib/auth.ts` conditionally enables the Apple provider when both vars are present — no code changes needed.

### 7. Domain Verification (Production Only)

Apple requires domain ownership verification:

1. Download the verification file from the Services ID configuration page
2. Host it at `https://yourdomain.com/.well-known/apple-developer-domain-association.txt`
3. Add a static route in Next.js:

```
public/.well-known/apple-developer-domain-association.txt
```

Or serve it via a Next.js route handler / Cloudflare rule.

---

## Gotchas & Notes

### Hide My Email

Apple's privacy relay gives some users a `@privaterelay.appleid.com` address. This means:

- A user who signed up with Google first and then tries Apple with a hidden email will get **separate accounts** (different email addresses, so auto-linking won't fire)
- This is Apple's intended behavior — nothing to fix
- Users who allow sharing their real email will auto-link normally via the existing `signIn()` callback

### JWT Expiry

The client secret JWT expires after max 6 months. Options:

- **Manual:** Set a calendar reminder to regenerate before expiry
- **Automated:** Generate dynamically at startup (Option C above) — recommended for production
- **Monitoring:** Add a check in the admin dashboard showing days until Apple secret expiry

### Local Development

- Apple requires HTTPS for the callback URL, making local testing harder
- Options: use a tunnel (ngrok/Cloudflare Tunnel) or defer all Apple testing to a staging environment
- Google OAuth is much easier for local dev — use that as the primary OAuth test path

---

## When to Pull the Trigger

Criteria for enabling Apple OAuth:

- [ ] Users are requesting it (or you're onboarding iOS-heavy users)
- [ ] You're willing to pay the $99/year developer fee
- [ ] Production domain is stable and verified
- [ ] You've decided between static JWT vs dynamic generation
