---
title: Invite Codes — Share Tandem With Friends
category: Features
tags: [invites, invite codes, referral, growth, sharing]
sortOrder: 7
---

# Invite Codes — Share Tandem With Friends

When your Tandem server is running in **Invite Only** mode, existing users can generate invite codes to bring in new people. Each code is single-use and grants the recipient immediate access.

---

## How Invite Codes Work

1. You generate a code from **Settings > Your Invite Codes**
2. Share the code (or share link) with someone
3. They enter the code on the login page and sign up via OAuth
4. Their account is created with a referral link back to you

Each code follows the format **TND-XXXX** (four characters, letters and numbers). Codes are single-use — once someone signs up with it, it's consumed.

---

## Generating Codes

1. Go to **Settings** (gear icon in the sidebar)
2. Find the **Your Invite Codes** section
3. Click **Generate Code**

Your server admin controls how many codes each user can create. The section shows how many you have remaining.

---

## Sharing a Code

For each available code, you have two sharing options:

- **Copy code** — Copies just the code (e.g. `TND-A3KR`) to your clipboard. The recipient can paste it into the invite code field on the login page.
- **Copy share link** — Copies a full URL like `https://your-tandem.example.com/login?code=TND-A3KR`. When the recipient opens this link, the code is pre-filled automatically.

The share link is usually the easiest way — one click and they're ready to sign up.

---

## Code Status

Each of your codes shows one of three statuses:

| Status | Meaning |
|--------|---------|
| **Available** | Ready to be used. You can share it. |
| **Used by [Name]** | Someone signed up with this code. Shows who. |
| **Expired** | The code passed its expiry date (if one was set). |

---

## User Tiers

When someone signs up with your invite code, they're assigned a **tier** that reflects how they joined:

- **Alpha** — Original testers and early users
- **Beta** — Invited users (the default for invite codes)
- **General** — Users who joined during open registration

Tiers are visible to admins and may be used for feature gating in the future. Your own tier is set by how you joined.

---

## Registration Modes

Your admin controls which registration mode the server uses:

| Mode | What Happens for New Users |
|------|---------------------------|
| **Closed** | No one can sign up. Existing users can still sign in. |
| **Waitlist** | New signups join a waitlist for admin approval. |
| **Invite Only** | A valid invite code is required to sign up. |
| **Open** | Anyone can sign up immediately. Invite codes are optional (for referral tracking). |

In **Open** mode, invite codes still work — they just provide attribution rather than being required.

---

## Domain Whitelist

Server admins can whitelist specific email domains (e.g. `company.com`). Users with whitelisted email domains can sign up without an invite code, even in Invite Only or Waitlist mode. This is useful for organizations that want to let their team join freely.

---

## FAQ

**Q: Can I get more invite codes?**
A: Your admin sets the limit. Ask them to increase it or to bulk-grant additional codes.

**Q: What if my friend's code doesn't work?**
A: The code may have already been used or expired. Generate a new one and try again.

**Q: Do invite codes expire?**
A: By default, codes don't expire. Admins can set expiry dates on specific codes if needed.

**Q: Can I see who I've invited?**
A: The invite codes section shows which codes have been used and by whom.
