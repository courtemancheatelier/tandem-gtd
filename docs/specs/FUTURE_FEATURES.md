# Tandem — Future Features & Ideas

**Date:** February 23, 2026
**Status:** Living document — ideas for future consideration

---

## Overview

This document captures feature ideas, improvements, and enhancements that have been identified during development but are not yet scheduled. Items here range from small UX improvements to major new capabilities.

---

## 1. Team Invite Flow

**Priority:** Medium
**Relates to:** TEAMS.md, TEAMS_HIERARCHICAL.md

### Problem
Currently, adding a team member by email fails with "No account found" if the user hasn't created an account yet. There's no way to invite someone who isn't already on the platform.

### Proposed Solutions

#### 1.1 Automated Invite Email
- When adding a non-existent email to a team, send a signup/invite email instead of failing
- Store a pending invite record (`TeamInvite` model) with the team, role, and inviter
- On signup, check for pending invites and auto-add the user to the team(s) with the intended role
- Invites should expire after a configurable period (e.g., 7 days)

#### 1.2 Sub-team Member Picker
- For hierarchical/tiered teams, populate a dropdown of parent team members when adding members to sub-teams
- This avoids needing to type emails for users already in the organization
- For top-level teams on a public service, keep the email input to prevent user enumeration
- The picker should only show members of the immediate parent team (not the full user base)

### Security Considerations
- Email input for top-level teams prevents user enumeration attacks
- Invite emails should use signed tokens, not expose internal IDs
- Rate-limit invite sends to prevent abuse

---

## 2. Google OAuth — Cross-Account Protection & Secure Flows

**Priority:** Medium
**Relates to:** Google Cloud Console, OAuth configuration

### Problem
The Google Cloud project is not configured for Cross-Account Protection (RISC) or secure OAuth flows, which may leave the app vulnerable to impersonation.

### What to investigate
- **Cross-Account Protection (RISC):** Receive security event tokens from Google when user accounts are compromised, disabled, or deleted. Allows Tandem to respond (e.g., revoke sessions, notify admins).
  - Reference: https://developers.google.com/identity/protocols/risc
- **Secure OAuth flows:** Ensure the app uses PKCE and other recommended patterns to prevent authorization code interception.
  - Reference: https://support.google.com/cloud/answer/15548748

---

## 3. (Template for new entries)

**Priority:** Low | Medium | High
**Relates to:** relevant spec docs

### Problem
Description of the gap or opportunity.

### Proposed Solution
How it could be implemented.

---
