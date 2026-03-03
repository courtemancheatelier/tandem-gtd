# Tandem — Support & Ticketing System

## Overview

When Tandem moves to a paid service, users need a seamless way to report bugs, request features, and handle billing issues — without being dumped into a raw email inbox or needing to learn developer tools. The system follows one core principle:

**One door for the customer, many rooms on your side.**

Users interact with a single, familiar interface. Behind the scenes, submissions route to the appropriate tool for triage and tracking.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              User-Facing Layer                   │
│                                                  │
│  ┌──────────────┐    ┌────────────────────────┐  │
│  │ In-App Widget│    │ GitHub Issues (direct)  │  │
│  │ "Help &      │    │ For power users /       │  │
│  │  Feedback"   │    │ self-hosters who prefer │  │
│  └──────┬───────┘    │ filing issues directly  │  │
│         │            └───────────┬────────────┘  │
└─────────┼────────────────────────┼───────────────┘
          │                        │
          ▼                        ▼
┌─────────────────────────────────────────────────┐
│          Central Source of Truth                  │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │           GitHub Issues                     │ │
│  │  (with templates for bugs, features,        │ │
│  │   billing — auto-labeled by category)       │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │     Billing / Refund Channel (separate)     │ │
│  │  Crisp free tier or dedicated email          │ │
│  │  (linked to Stripe transactions)            │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## User-Facing Layer

### In-App Help & Feedback Widget

The primary entry point for most users. Built directly into Tandem so users never leave the app.

**Location:** Sidebar item or Settings page — "Help & Feedback" button.

**User Flow:**

1. User clicks "Help & Feedback"
2. Picks a category:
   - 🐛 **Something's broken** — bug report
   - 💡 **I have an idea** — feature request
   - 💳 **Billing & refunds** — payment issues
   - ❓ **General question** — catch-all
3. Fills out a simple form (description, optional screenshot)
4. Hits submit → gets a confirmation message
5. Receives email notification when there's a response

**Implementation:** A form component that POSTs to an internal API endpoint. That endpoint creates a GitHub issue (for bugs/features) or routes to the billing support channel (for payment issues). User's Tandem account info is automatically attached — no need for them to provide email, account ID, etc.

```
POST /api/support/ticket
{
  category: "bug" | "feature" | "billing" | "general",
  subject: string,
  description: string,
  screenshot?: base64 | null
}
```

**Behind the scenes:**
- `bug` / `feature` / `general` → Creates GitHub Issue via GitHub API with appropriate label
- `billing` → Routes to Crisp inbox or dedicated support email

### GitHub Issues (Direct Access)

For technical users and self-hosters who already live on GitHub.

- Public repo stays open for direct issue filing
- Issue templates pre-configured for bug reports and feature requests
- Contributors and power users can browse, comment, and upvote existing issues

### Public Docs / Wiki Page

A page on the Tandem website or docs site: **"How to Get Help"**

Covers:
- The in-app widget (recommended for most users)
- GitHub Issues (for technical users)
- Billing/refund policy and contact info
- Expected response times

---

## Backend Tooling

### Bug Reports & Feature Requests → GitHub Issues

**Why GitHub Issues:**
- Already where the codebase lives — zero context switching for development
- Free for public repos
- Labels, milestones, and project boards for triage
- Technical users can participate directly
- API is straightforward for the in-app widget integration

**Issue Templates:**

```yaml
# .github/ISSUE_TEMPLATE/bug_report.yml
name: Bug Report
labels: ["bug", "triage"]
body:
  - type: textarea
    id: description
    label: What happened?
    validations:
      required: true
  - type: textarea
    id: expected
    label: What did you expect to happen?
  - type: textarea
    id: reproduce
    label: Steps to reproduce
  - type: input
    id: version
    label: Tandem version
```

```yaml
# .github/ISSUE_TEMPLATE/feature_request.yml
name: Feature Request
labels: ["enhancement", "triage"]
body:
  - type: textarea
    id: problem
    label: What problem does this solve?
    validations:
      required: true
  - type: textarea
    id: solution
    label: What would the ideal solution look like?
```

**Labeling convention:**
- `bug` — something's broken
- `enhancement` — feature request
- `triage` — needs initial review (auto-applied, removed after review)
- `billing` — payment/refund related
- `from-app` — submitted via in-app widget (vs. direct GitHub)
- Priority: `p0-critical`, `p1-high`, `p2-medium`, `p3-low`

### Billing & Refunds → Dedicated Channel

Billing issues need a different workflow — they involve personal/financial info that shouldn't be in a public GitHub repo, and they usually require back-and-forth conversation.

**Option A: Crisp (free tier)**
- Shared inbox with conversation threading
- User sees it as chat/email; you see it as a ticket queue
- Canned responses for common billing questions
- Free for 2 operators

**Option B: Dedicated email with simple tracking**
- `billing@tandem.app` or similar
- Routed through a basic helpdesk or even a private GitHub repo with issues

**Refund workflow:**
1. User submits billing issue (via in-app widget or direct email)
2. Ticket created in billing channel with user's account info attached
3. Locate the Stripe transaction (link Tandem userId → Stripe customerId)
4. Process refund in Stripe dashboard
5. Update ticket with resolution
6. User receives confirmation email

**Refund policy** — published on the website and linked from:
- The in-app billing help form
- Purchase confirmation emails
- Account settings / subscription page

---

## Payment Integration (Stripe)

Stripe is the payment processor. Relevant to ticketing because:

- Every paying user has a `stripeCustomerId` linked to their Tandem account
- Refund requests reference a specific Stripe transaction
- Stripe's built-in dispute workflow handles chargebacks automatically
- Stripe receipts include a support link (point to your Help & Feedback page)

```
Tandem User Account
  └── stripeCustomerId
        └── Subscriptions / Payments
              └── Linked in billing tickets for quick lookup
```

---

## Feature Voting / Public Roadmap (Future)

Once there's enough user volume to justify it:

- **Canny** or **GitHub Discussions** for feature voting — lets common requests surface organically instead of 10 people filing the same idea
- **Public roadmap page** — simple "planned / in progress / shipped" board so users can see what's coming without asking

This is a "nice to have" — don't build it until the volume of feature requests justifies the overhead.

---

## Implementation Phases

### Phase 1 — Pre-Launch (Minimum Viable Support)

- [ ] Publish refund policy on website
- [ ] Set up GitHub Issue templates (bug report, feature request)
- [ ] Create `billing@` email or Crisp free tier account
- [ ] Add "How to Get Help" page to docs/website
- [ ] Stripe customer ID linked to Tandem user accounts

### Phase 2 — Launch

- [ ] Build in-app Help & Feedback widget
- [ ] API endpoint `POST /api/support/ticket` with GitHub API integration
- [ ] Auto-attach user context (account ID, app version, browser) to tickets
- [ ] Billing category routes to dedicated channel (not GitHub)
- [ ] Confirmation + follow-up email notifications

### Phase 3 — Scale

- [ ] Feature voting (Canny or GitHub Discussions)
- [ ] Public roadmap page
- [ ] Canned responses for common issues
- [ ] SLA tracking (response time goals)
- [ ] Knowledge base / FAQ for self-service

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Bug/feature tracking | GitHub Issues | Already where code lives, free, API for automation |
| Billing support | Crisp or dedicated email | Keeps financial info out of public repos |
| Payment processor | Stripe | Industry standard, built-in refund/dispute handling |
| User entry point | In-app widget | Meet users where they are — no new accounts needed |
| Feature voting | Deferred | Build when volume justifies it |
| Custom ticketing system | **No** | Use solved problems, keep energy on the product |

---

## Anti-Patterns to Avoid

- **Building a custom ticketing system into Tandem.** It's tempting, but it's a massive distraction. Use existing tools.
- **Relying on a shared email inbox.** Without categorization and status tracking, things get lost. Even a simple tool like Crisp is better than raw email.
- **Putting billing issues in public GitHub.** Financial details and account info don't belong in public repos.
- **No published refund policy.** Ambiguity creates friction. A clear, simple policy makes most billing conversations short.
