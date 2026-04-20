---
title: Registration & Growth Management
category: Admin
tags: [admin, registration, invites, growth, tiers, domains, whitelist]
sortOrder: 1
adminOnly: true
---

# Registration & Growth Management

Tandem supports four registration modes to let you control growth from private alpha through public launch. This guide covers the registration modes, user tiers, invite codes, domain whitelisting, and growth analytics.

---

## Registration Modes

Configure the registration mode from **Admin Settings > Registration & Waitlist**. Click one of the four cards to switch modes.

### Closed

No new users can sign up. Existing users can still sign in normally. Use this when you need to freeze registrations temporarily.

### Waitlist

New OAuth signups are added to a waitlist. You review and approve them individually from the waitlist table. Approved users get an account created automatically. This is the default mode.

### Invite Only

New signups require a valid invite code. Existing users generate codes from their Settings page and share them. This is ideal for controlled organic growth — each user can invite a fixed number of people.

When this mode is selected, you can configure **Max invite codes per user** to control how many codes each person can generate.

### Open

Anyone with a valid OAuth account can sign up immediately. Invite codes are optional but still work for referral attribution.

---

## User Tiers

Every user has a tier that reflects how they joined:

| Tier | Color | Meaning |
|------|-------|---------|
| **Alpha** | Purple | Original testers. All users who existed before this feature was enabled. |
| **Beta** | Blue | Invited users. Default tier for invite code signups. |
| **General** | Gray | Users who signed up during open registration. |
| **Waitlist** | Yellow | Users still on the waitlist (not yet promoted). |

### Viewing and Editing Tiers

- The **User Management** table shows each user's tier as a colored badge
- Click **Edit** on any user to change their tier from the dropdown
- Tiers are informational and can be used for future feature gating

### Tier Assignment

- **Waitlist promote** → sets tier to Alpha
- **Invite code signup** → sets tier to the code's tier (default: Beta)
- **Domain whitelist signup** → sets tier to the domain's configured tier
- **Open registration** → sets tier to General
- **Admin-created users** → default tier (can be changed in Edit)

---

## Invite Codes

### How They Work

1. Users go to **Settings > Your Invite Codes**
2. They click **Generate Code** to create a `TND-XXXX` code
3. They share the code or a pre-filled login link with someone
4. The recipient enters the code on the login page and signs up via OAuth
5. The code is consumed and the new user is linked as an invitee

### Admin Controls

- **Max codes per user**: Set from the Registration card when in Invite Only mode. Controls how many codes each user can generate.
- **Bulk grant codes**: From the Growth Stats card, you can grant additional codes to all users of a specific tier at once.

### Code Properties

- Format: `TND-XXXX` (4 uppercase alphanumeric characters, no ambiguous I/O/0/1)
- Single-use: each code can only be used once
- Optional expiry: codes can have an expiry date (not currently exposed in UI, available via API)
- Tier: each code carries a tier that the new user inherits (default: Beta)

---

## Domain Whitelist

The domain whitelist lets users with specific email domains bypass invite/waitlist requirements.

### Managing Domains

From **Admin Settings > Domain Whitelist**:

1. Enter the domain (e.g. `company.com`)
2. Select the tier new users from this domain should receive
3. Optionally add a note (e.g. "Partner organization")
4. Click **Add**

To remove a domain, click the trash icon next to it.

### How It Works

- In **Waitlist** mode: whitelisted domains skip the waitlist and get instant accounts
- In **Invite Only** mode: whitelisted domains don't need an invite code
- In **Closed** mode: domain whitelist does **not** override — no one can register
- In **Open** mode: whitelisted domains get their configured tier instead of General

---

## Growth Stats

The **Growth Stats** card on the admin settings page provides an overview of your server's growth:

### Tier Breakdown

Shows how many users are in each tier (Alpha, Beta, General) with colored badges.

### Invite Code Usage

- **Generated**: Total codes created across all users
- **Used**: Codes that have been consumed by signups
- **Available**: Codes still waiting to be used

### Top Referrers

Lists the users who have invited the most people, sorted by invite count.

### Bulk Grant Codes

Generate additional invite codes for all users of a specific tier:

1. Select a tier (Alpha or Beta)
2. Enter how many codes per user (1-10)
3. Click **Grant Codes**

This is useful when you want to do a wave of growth — e.g., give each Alpha user 3 new codes to distribute.

---

## Referral Tracking

When a user signs up with an invite code:

- Their profile records **who invited them** (Invited By column in User Management)
- The inviter's code shows **Used by [name]** in their Settings
- The Growth Stats card tracks top referrers

This creates a referral chain that lets you understand how your user base is growing organically.

---

## Recommended Growth Strategy

1. **Alpha phase**: Start in Waitlist mode. Manually approve early testers. They get Alpha tier.
2. **Controlled growth**: Switch to Invite Only. Grant codes to Alpha users. New users join as Beta.
3. **Wider beta**: Bulk-grant more codes to both Alpha and Beta users. Add partner domains to the whitelist.
4. **Public launch**: Switch to Open. Anyone can join as General. Invite codes remain for attribution.
