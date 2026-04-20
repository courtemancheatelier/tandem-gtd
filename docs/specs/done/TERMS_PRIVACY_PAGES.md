# Terms of Service & Privacy Policy Pages

**Feature:** Add `/terms` and `/privacy` pages to the Tandem landing site
**Priority:** Required — OAuth providers (Google, Apple) mandate publicly accessible ToS and Privacy Policy URLs during app registration
**Complexity:** Low-medium (content + routing + OAuth console configuration)

---

## Why This Is Required

Google OAuth and Apple Sign-In both require verified URLs for Terms of Service and Privacy Policy during OAuth client registration. Without these:

- **Google Cloud Console** → OAuth consent screen configuration requires both URLs before you can move out of "Testing" mode to "In production"
- **Apple Developer Portal** → App registration requires a Privacy Policy URL; ToS is strongly recommended

These pages must be publicly accessible (no auth wall), crawlable, and reachable at stable URLs.

---

## Requirements

### Functional

1. **Two new public pages:**
   - `/terms` — Terms of Service
   - `/privacy` — Privacy Policy

2. **Publicly accessible** — no authentication required, outside the dashboard layout

3. **Consistent with landing site** — same visual style as whatever public-facing pages exist (login page aesthetic, or a future marketing/landing page)

4. **Footer links** — add links to both pages from the login page footer and any future landing page

5. **Last updated date** — each page displays a "Last updated: [date]" that's easy to maintain

6. **Printable / readable** — clean typography, no interactive widgets needed. These are legal documents; readability is paramount.

### Non-Functional

- Static content (no database, no API calls)
- Fast load — no client-side JS required for rendering
- SEO-friendly — server-rendered, proper meta tags, `<title>` set appropriately
- Mobile-responsive

---

## Content Strategy

### The Tandem Difference

Most ToS/Privacy docs are written by lawyers for lawyers. Tandem's philosophy is transparency and user data ownership. The documents should be:

- **Written in plain English** — no legalese walls of text where avoidable
- **Honest about the self-hosted model** — acknowledge that for self-hosted instances, the instance operator controls the data, not Courtemanche Atelier
- **Structured for two audiences:**
  1. **Managed hosting customers** (tandemgtd.com or custom subdomains) — Courtemanche Atelier operates the infrastructure, handles backups, manages data
  2. **Self-hosted users** — the operator is responsible for their own data; Courtemanche Atelier has zero access

### Terms of Service — Key Sections

```
1. Acceptance of Terms
2. Description of Service
   - What Tandem is (GTD productivity tool)
   - Self-hosted vs. managed hosting distinction
3. Accounts & Authentication
   - OAuth (Google, Apple) third-party auth
   - User responsibility for credentials
4. User Data & Ownership
   - Users own their data — period
   - No selling, no mining, no advertising
   - Managed hosting: data stored on infrastructure operated by Courtemanche Atelier
   - Self-hosted: operator controls all data; Courtemanche Atelier has no access
5. Acceptable Use
   - Don't use the service for illegal activity
   - Don't attempt to compromise other users' data on shared instances
6. Open Source License
   - Software licensed under AGPL-3.0
   - ToS governs the hosted service, not the software itself
7. Service Availability (Managed Hosting)
   - Best-effort uptime, no SLA guarantees (initially)
   - Backup and disaster recovery practices
   - Right to discontinue with reasonable notice + full data export
8. Limitation of Liability
   - Standard limitation clause
   - Open source = provided as-is for self-hosted
9. Changes to Terms
   - Notice of material changes via email or in-app notification
   - Continued use = acceptance
10. Contact Information
    - Email for legal/privacy inquiries
```

### Privacy Policy — Key Sections

```
1. Introduction & Scope
   - Who we are (Courtemanche Atelier)
   - What this policy covers (managed hosting service)
   - Self-hosted disclaimer: this policy does not govern self-hosted instances
2. Information We Collect
   a. Account Information
      - Email address, display name
      - OAuth provider ID (Google/Apple) — we don't store OAuth tokens long-term beyond session needs
   b. Task & Productivity Data
      - Everything you put into Tandem (tasks, projects, notes, wiki, inbox items)
      - This is YOUR data — we need it only to provide the service
   c. Technical Data
      - Server logs (IP addresses, user agents) — retained [X] days
      - Error tracking (if any crash reporting is used)
   d. Payment Information (future)
      - Processed by third-party payment processor
      - We never store credit card numbers
3. How We Use Your Information
   - To provide and maintain the service
   - To authenticate you
   - To send service-critical communications (downtime notices, security alerts)
   - NOT for advertising, NOT for profiling, NOT for sale to third parties
4. AI Features & Data Processing
   - Embedded AI assistant uses Anthropic's API
   - Task data sent to Anthropic for AI features is governed by Anthropic's usage policies
   - Users can disable AI features entirely (per-user toggle)
   - AI privacy controls: granular toggles for what AI can access
   - MCP integration: data flows through user's own Claude account
5. Data Storage & Security
   - Where data is stored (OVHcloud infrastructure, specify regions)
   - Encryption at rest and in transit
   - Backup practices (without over-promising)
6. Data Retention & Deletion
   - Data retained while account is active
   - Account deletion = full data deletion within [X] days
   - Managed hosting: data export available before deletion
7. Third-Party Services
   - OAuth providers (Google, Apple) — what data they share with us
   - Anthropic (AI features) — link to their privacy policy
   - Infrastructure provider (OVHcloud)
   - Payment processor (future)
8. Your Rights
   - Access your data (export features)
   - Delete your data (account deletion)
   - Disable AI processing
   - For EU users: GDPR rights (access, rectification, erasure, portability)
9. Children's Privacy
   - Service not directed at children under 13 (COPPA)
10. Changes to This Policy
    - Notification of material changes
11. Contact
    - Email for privacy inquiries
```

---

## Technical Architecture

### File Structure

```
src/app/
├── (auth)/
│   └── login/page.tsx          # Existing — add footer links
├── (legal)/                    # New route group — no auth, minimal layout
│   ├── layout.tsx              # Shared legal page layout (header, footer, max-width container)
│   ├── terms/page.tsx          # Terms of Service
│   └── privacy/page.tsx        # Privacy Policy
```

### Route Group: `(legal)`

Use a Next.js route group `(legal)` to share a layout without adding a URL segment. This layout should:

- **Not** use the dashboard layout (no sidebar, no auth check)
- **Not** use the auth layout (no login card styling)
- Include a simple header with the Tandem logo/name linking to `/` or `/login`
- Include a footer with links between the two legal pages + a "Back to Tandem" link
- Use a centered, max-width (`max-w-3xl`) prose container
- Apply `prose` / `prose-invert` Tailwind typography for readable legal text

### Page Components

Both pages are **server components** — no `"use client"` needed. Pure static content.

```tsx
// src/app/(legal)/terms/page.tsx
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Tandem",
  description: "Terms of Service for the Tandem GTD productivity application.",
};

export default function TermsPage() {
  return (
    <article className="prose dark:prose-invert">
      <h1>Terms of Service</h1>
      <p className="text-muted-foreground text-sm">
        Last updated: [DATE]
      </p>
      {/* Content sections */}
    </article>
  );
}
```

```tsx
// src/app/(legal)/privacy/page.tsx
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Tandem",
  description: "Privacy Policy for the Tandem GTD productivity application.",
};

export default function PrivacyPage() {
  return (
    <article className="prose dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground text-sm">
        Last updated: [DATE]
      </p>
      {/* Content sections */}
    </article>
  );
}
```

### Shared Legal Layout

```tsx
// src/app/(legal)/layout.tsx
import Link from "next/link";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Simple header */}
      <header className="border-b">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <Link href="/login" className="text-lg font-semibold">
            Tandem
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-12">
        {children}
      </main>

      {/* Footer with cross-links */}
      <footer className="border-t">
        <div className="mx-auto max-w-3xl px-6 py-6 flex gap-6 text-sm text-muted-foreground">
          <Link href="/terms" className="hover:underline">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:underline">
            Privacy Policy
          </Link>
          <Link href="/login" className="hover:underline">
            Back to Tandem
          </Link>
        </div>
      </footer>
    </div>
  );
}
```

### Login Page Footer Update

Add links to the bottom of the existing login page (`src/app/(auth)/login/page.tsx`):

```tsx
{/* Below the Card component */}
<div className="mt-4 flex justify-center gap-4 text-xs text-muted-foreground">
  <Link href="/terms" className="hover:underline">Terms of Service</Link>
  <span>·</span>
  <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
</div>
```

---

## Tailwind Typography Plugin

The `@tailwindcss/typography` plugin is needed for the `prose` classes. If not already installed:

```bash
npm install @tailwindcss/typography
```

Add to `tailwind.config.ts`:

```ts
plugins: [
  require("@tailwindcss/typography"),
  // ... existing plugins
],
```

If already present (check first), skip this step.

---

## OAuth Console Configuration

After deploying the pages, update the OAuth provider configurations:

### Google Cloud Console

1. Go to **APIs & Services → OAuth consent screen**
2. Under **App information**, set:
   - **Application home page:** `https://tandemgtd.com` (or your domain)
   - **Application privacy policy link:** `https://tandemgtd.com/privacy`
   - **Application terms of service link:** `https://tandemgtd.com/terms`
3. Save and submit for verification (required to move from "Testing" to "In production" — testing mode limits to 100 users)

### Apple Developer Portal

1. Go to **Certificates, Identifiers & Profiles → Services IDs**
2. Select your Sign in with Apple service ID
3. Under **Website URLs**, set:
   - **Privacy Policy URL:** `https://tandemgtd.com/privacy`
4. Save

---

## Self-Hosted Instance Considerations

Self-hosters running their own Tandem instance with their own OAuth credentials will need their own ToS/Privacy pages pointing to their own domain. Options:

1. **Default content ships with Tandem** — the pages exist in the codebase with template content that operators should customize
2. **Environment variable toggle** — `INSTANCE_OPERATOR_NAME` and `INSTANCE_OPERATOR_EMAIL` env vars that get injected into the legal page templates
3. **Clear comments in the source** — mark sections that operators must review and customize for their deployment

Recommended env vars for legal page customization:

```env
# Legal / operator identity
OPERATOR_NAME="Courtemanche Atelier"
OPERATOR_EMAIL="privacy@tandemgtd.com"
OPERATOR_WEBSITE="https://tandemgtd.com"
OPERATOR_JURISDICTION="Massachusetts, United States"
```

These get read by the legal page components and injected into the content, so self-hosters just fill in their `.env` and get correct legal pages without editing source code.

---

## Implementation Checklist

1. [ ] Install `@tailwindcss/typography` if not present
2. [ ] Create `src/app/(legal)/layout.tsx` — shared legal page layout
3. [ ] Create `src/app/(legal)/terms/page.tsx` — Terms of Service content
4. [ ] Create `src/app/(legal)/privacy/page.tsx` — Privacy Policy content
5. [ ] Add env vars for operator identity (`OPERATOR_NAME`, `OPERATOR_EMAIL`, etc.)
6. [ ] Update `.env.example` with new legal env vars
7. [ ] Add footer links to login page
8. [ ] Write actual legal content (see content outlines above)
9. [ ] Test pages render correctly in light/dark mode
10. [ ] Test pages are accessible without authentication
11. [ ] Test mobile responsiveness
12. [ ] Verify meta tags and page titles
13. [ ] Update Google OAuth consent screen with URLs
14. [ ] Update Apple Developer Portal with privacy policy URL
15. [ ] Add links to any future landing page / marketing site

---

## Content Drafting Notes

The actual legal text should be drafted separately (or with legal review). Key principles:

- **Don't copy-paste another app's ToS** — Tandem's model is fundamentally different (open source, self-hosted, data ownership)
- **Be specific about the AI features** — users should know exactly what data flows to Anthropic and when
- **Acknowledge the AGPL** — the ToS governs the *service*, the AGPL governs the *software*; make this distinction clear
- **Keep it short** — aim for each document to be readable in under 10 minutes
- **Consider getting legal review** — especially before moving Google OAuth to production mode, a lawyer reviewing the ToS is worth the cost

---

## Future Considerations

- **Cookie banner** — if analytics or non-essential cookies are ever added, a consent mechanism will be needed (especially for EU users)
- **DPA (Data Processing Agreement)** — for managed hosting customers in regulated industries, a DPA template may be needed down the road
- **Changelog for legal docs** — consider a simple version history so users can see what changed between updates
- **Internationalization** — if Tandem gains non-English users, translated legal pages may become necessary
