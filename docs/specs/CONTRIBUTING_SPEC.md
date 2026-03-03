# Tandem Contributor Guidelines — Specification

**Document type:** Implementation spec for `CONTRIBUTING.md`, `DCO`, and related files
**Target location:** `docs/CONTRIBUTING.md` (linked from repo root), `DCO` (repo root)
**Last updated:** 2026-02-28

---

## 1. Purpose

Establish clear, transparent contribution guidelines for Tandem before the project goes public. These guidelines serve three goals:

1. **Protect the project's GTD integrity** — Tandem is opinionated by design. Contributions must align with David Allen's methodology and the cascade engine architecture.
2. **Protect contributors** — People should know *before* investing effort whether their contribution is likely to be accepted.
3. **Protect legal clarity** — Under AGPL-3.0, copyright ownership of contributions matters. A lightweight mechanism (DCO) ensures provenance without creating barriers.

---

## 2. Decision: DCO over CLA

**Choice: Developer Certificate of Origin (DCO), not a Contributor License Agreement (CLA).**

### Rationale

- **Lower barrier to entry.** Tandem is a community-focused project targeting self-hosters, volunteer organizations, and small teams. A CLA — even a simple one — adds friction and signals corporate gatekeeping. A DCO requires only a `--signoff` flag on commits.
- **Inbound = Outbound.** Contributors license their work under the same AGPL-3.0 terms Tandem uses. No special rights are granted to the maintainer beyond what every user gets. This is philosophically aligned with Tandem's transparency values.
- **No relicensing intent.** Tandem has no plans to dual-license or sell commercial licenses. The AGPL is the permanent license. A CLA's main advantage (enabling future relicensing) is therefore unnecessary.
- **Trust signal.** Using a DCO instead of a CLA tells contributors: "We won't take your work and change the deal." This matches the federated, community-owned vision.

### Trade-off acknowledged

Without a CLA, if a license change were ever needed (e.g., upgrading from AGPL-3.0 to a hypothetical AGPL-4.0), every contributor's consent would be required. This is an acceptable constraint given Tandem's values and scale.

### Implementation

- Include the full DCO 1.1 text in a `DCO` file at the repo root.
- Require `Signed-off-by:` lines on all commits via GitHub Actions (use the [DCO GitHub App](https://github.com/apps/dco) or equivalent).
- Document how to sign off in the contributing guide (including how to retroactively sign off if forgotten).

---

## 3. Contribution Categories

Not all contributions are equal in scope or risk. The guidelines should clearly define categories so contributors know what to expect.

### 3.1 Always Welcome (No Prior Discussion Needed)

- **Bug fixes** — with reproduction steps and tests where applicable
- **Documentation improvements** — typos, clarifications, better examples
- **Accessibility improvements** — ARIA labels, keyboard navigation, screen reader compatibility
- **Performance improvements** — with benchmarks showing the improvement
- **Test coverage** — additional tests for existing functionality
- **Translation / i18n** — when the i18n framework is in place
- **Security fixes** — see separate security policy (responsible disclosure)

### 3.2 Discuss First (Open an Issue Before Coding)

- **New features** — even small ones. The maintainer needs to evaluate fit with GTD methodology and architectural direction.
- **UI/UX changes** — Tandem has specific design conventions. Mockups or screenshots in the issue help.
- **Database schema changes** — Tandem prioritizes backward compatibility and data model stability. Schema changes require careful review.
- **Dependency additions** — new npm packages must be justified. Tandem keeps a lean dependency tree.
- **Refactors** — large-scale restructuring needs alignment on approach before starting.

### 3.3 Likely Won't Be Accepted

Being transparent about what falls outside Tandem's scope prevents wasted effort and hurt feelings.

- **Features that contradict GTD methodology.** Tandem is opinionated. If David Allen's framework doesn't include it, Tandem probably shouldn't either. Examples: priority levels on tasks (GTD uses context/energy/time instead), Kanban boards, Pomodoro timers, habit trackers.
- **Proprietary integrations.** No features that require accounts on third-party services to function. Optional integrations (e.g., CalDAV sync) are fine; required ones are not.
- **Telemetry or analytics.** Tandem has zero telemetry. This is non-negotiable.
- **Advertising or monetization hooks.** No affiliate links, sponsored features, or premium tiers.
- **Features that break self-hosting simplicity.** If it requires a separate service, external API key, or complex infrastructure beyond PostgreSQL + Next.js, it's probably out of scope for core.

### 3.4 Fork-Friendly Territory

Some ideas are great but don't belong in core Tandem. Contributors should feel empowered to build these in forks:

- Integrations with specific ecosystems (Notion, Obsidian, Slack, etc.)
- Alternative UI frameworks or design systems
- Gamification features
- Workflow automation beyond GTD methodology
- Industry-specific adaptations

The contributing guide should explicitly bless forking as healthy and expected under AGPL, and note that great fork features can be proposed for upstream inclusion later.

---

## 4. Technical Requirements for Contributions

### 4.1 Code Standards

- **TypeScript** — all new code must be TypeScript. No `any` types without justification in a comment.
- **Formatting** — Prettier and ESLint configurations are the source of truth. Run `npm run lint` before submitting.
- **Component patterns** — React components use shadcn/ui conventions. New components should follow existing patterns in `src/components/`.
- **Database changes** — must include a Prisma migration. Must not break existing data. Must include rollback consideration.
- **API changes** — must maintain backward compatibility or clearly document the breaking change and migration path.

### 4.2 Testing

- Bug fix PRs should include a test that reproduces the bug and verifies the fix.
- Feature PRs should include tests covering the happy path and key edge cases.
- Test framework: Jest for unit tests, Playwright for E2E (when in place).

### 4.3 Commit Conventions

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- All commits must include `Signed-off-by:` line (DCO requirement).
- Example: `git commit -s -m "feat: add energy filter to weekly review summary"`
- Keep commits atomic — one logical change per commit.

### 4.4 Pull Request Process

1. Fork the repo and create a branch from `main` (`feat/your-feature`, `fix/your-bug`).
2. Make your changes following the standards above.
3. Run `npm run lint` and `npm run test` locally.
4. Open a PR against `main` with a clear description:
   - **What** — what does this change do?
   - **Why** — what problem does it solve or what value does it add?
   - **How** — brief overview of the approach.
   - **Screenshots** — for any UI changes.
   - **Issue link** — reference the related issue (`Closes #123`).
5. The DCO check must pass (all commits signed off).
6. Wait for review. The maintainer will review within a reasonable timeframe, but this is a solo-maintained project — patience is appreciated.

### 4.5 Review Expectations

- The maintainer (Jason) has final say on all merges. This is a BDFL (Benevolent Dictator for Life) governance model, appropriate for a project at this stage.
- Reviews may request changes. This isn't personal — it's about maintaining consistency and quality.
- If a PR sits without review for more than two weeks, a polite ping in the PR is welcome.
- PRs that don't follow the guidelines may be closed with an explanation and an invitation to resubmit.

### 4.6 The "Inspired By" Pattern

In some cases, the maintainer may choose to implement a feature independently rather than merge a contributed PR — even if the PR is well-written. This is done to keep the codebase single-author for licensing simplicity and to ensure deep understanding of every line in core. When this happens:

- The PR will be closed with a transparent explanation.
- The contributor will be credited in release notes for the idea and design direction.
- The contributor's fork remains fully functional under AGPL — their implementation isn't lost.

This is not a rejection of the contribution's quality. It's a structural decision about long-term project flexibility.

---

## 5. Governance Model

### 5.1 Current: BDFL

Tandem is maintained by Jason Courtemanche (Courtemanche Atelier). All architectural decisions, merge authority, and roadmap direction rest with the maintainer. This is appropriate for the project's current stage and scale.

### 5.2 Future: Community Evolution

As the project grows, governance may evolve. Possible stages:

- **Trusted contributors** — regular contributors may earn commit access to specific areas.
- **Area maintainers** — specific subsystems (e.g., wiki, MCP integration) may get dedicated maintainers.
- **Steering committee** — if the project reaches significant community scale, a governance structure may be formalized.

Any governance changes will be documented transparently in this file. The commitment is that Tandem will never become a vehicle for a single entity to extract value from community contributions — the DCO + AGPL combination enforces this structurally.

---

## 6. AGPL-3.0 Obligations — Plain Language Summary

The contributing guide should include a plain-language section explaining what AGPL means for contributors, since not everyone reads licenses for fun:

- **Your contributions stay open.** Anything merged into Tandem is distributed under AGPL-3.0. This means anyone who uses Tandem (including over a network) can see the source code, including your contributions.
- **You keep your copyright.** The DCO does not assign your copyright to anyone. You remain the author of your contributions. You're granting a license, not transferring ownership.
- **Forks must stay open too.** If someone forks Tandem and modifies it, they must make their modified source available to their users under AGPL-3.0. They do *not* have to send changes back to this repo — but their users get the source.
- **No one can close this.** Because every contributor retains copyright under AGPL-3.0 (not a CLA), no single entity can relicense Tandem as proprietary software. This is by design.

---

## 7. Security Policy

A separate `SECURITY.md` should be created with:

- **Responsible disclosure process** — email vulnerabilities to `security@tandemgtd.com`. This is the primary and only required channel. (GitHub Private Security Advisories may be enabled later as a secondary channel.)
- **Response time commitment** — best effort. Tandem is solo-maintained, so no firm SLAs are promised. The maintainer will respond as quickly as reasonably possible, with critical vulnerabilities prioritized above all other work.
- **No public disclosure until patched** — standard responsible disclosure timeline (90 days).
- **Credit** — security reporters will be credited (with their permission) in release notes.

---

## 8. Code of Conduct

Adopt the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) as `CODE_OF_CONDUCT.md`. It's the most widely used code of conduct in open source and covers:

- Expected behavior
- Unacceptable behavior
- Enforcement responsibilities
- Scope
- Reporting mechanisms

Enforcement contact: `conduct@tandemgtd.com`

---

## 9. Files to Create

This spec should result in the following files being added to the repository:

| File | Location | Purpose |
|------|----------|---------|
| `CONTRIBUTING.md` | `docs/CONTRIBUTING.md` | Full contributor guide (primary document) |
| `DCO` | Repo root | Developer Certificate of Origin 1.1 full text |
| `CODE_OF_CONDUCT.md` | Repo root | Contributor Covenant v2.1 |
| `SECURITY.md` | Repo root | Security vulnerability reporting policy |
| `.github/ISSUE_TEMPLATE/bug_report.md` | `.github/` | Structured bug report template |
| `.github/ISSUE_TEMPLATE/feature_request.md` | `.github/` | Feature proposal template (emphasizes "discuss first") |
| `.github/PULL_REQUEST_TEMPLATE.md` | `.github/` | PR template with checklist (DCO, tests, lint, description) |

Additionally:

- Update `README.md` contributing section to link to `docs/CONTRIBUTING.md` with a brief summary.
- Add GitHub Actions workflow for DCO verification (or enable the DCO GitHub App).

---

## 10. GitHub Issue Templates

### 10.1 Bug Report Template

```markdown
---
name: Bug Report
about: Report a bug to help improve Tandem
labels: bug
---

## Describe the Bug

A clear, concise description of what's happening.

## Steps to Reproduce

1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior

What you expected to happen instead.

## Screenshots

If applicable, add screenshots to help explain the problem.

## Environment

- Browser: [e.g. Firefox 125]
- Device: [e.g. desktop, iPhone 15]
- Tandem version/commit: [e.g. v1.0.2 or commit hash]
- Deployment: [e.g. Docker local, VPS with Cloudflare tunnel]

## Additional Context

Any other context about the problem.
```

### 10.2 Feature Request Template

```markdown
---
name: Feature Request
about: Propose a new feature for Tandem
labels: enhancement, needs-discussion
---

## Is This Feature Part of GTD Methodology?

Please describe how this feature relates to David Allen's Getting Things Done framework. If it doesn't directly map to GTD, explain why it belongs in Tandem's core rather than a fork or plugin.

## Problem Statement

What problem does this solve? What's the current limitation?

## Proposed Solution

Describe how you'd like this to work. Include mockups or sketches if it involves UI.

## Alternatives Considered

What other approaches did you consider? Why is this one better?

## Scope

- [ ] This is a small, contained change
- [ ] This involves database schema changes
- [ ] This involves new dependencies
- [ ] This involves UI/UX changes
- [ ] This is a large feature requiring multiple PRs

## Additional Context

Any other context, screenshots, or references.
```

---

## 11. Pull Request Template

```markdown
## What

Brief description of what this PR does.

## Why

What problem does this solve? Link to related issue: Closes #___

## How

Overview of the technical approach.

## Screenshots

(For UI changes — before/after if applicable)

## Checklist

- [ ] I have read the [Contributing Guide](docs/CONTRIBUTING.md)
- [ ] All commits are signed off (`git commit -s`) per the DCO
- [ ] I have run `npm run lint` with no errors
- [ ] I have run `npm run test` with no failures
- [ ] I have added tests for new functionality
- [ ] I have updated documentation if needed
- [ ] Database migrations are backward-compatible (if applicable)

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Refactor (no functional changes)
- [ ] Performance improvement
```

---

## 12. Implementation Notes

### DCO GitHub App Setup

- Install the [DCO GitHub App](https://github.com/apps/dco) on the `tandem-gtd` organization/repo.
- The app automatically checks all commits in a PR for `Signed-off-by:` lines.
- If any commit is missing the sign-off, the check fails and the app comments with instructions for fixing it.
- This is zero-maintenance once installed — no GitHub Actions workflow needed.

### README Update

Replace the current Contributing section in `README.md` with:

```markdown
## Contributing

Tandem welcomes contributions! Before diving in, please read our [Contributing Guide](docs/CONTRIBUTING.md) — it covers what kinds of contributions we're looking for, how to submit them, and the technical standards we follow.

**Quick version:**
- Bug fixes, docs, accessibility, and tests are always welcome
- New features → open an issue first to discuss
- All commits must be signed off per the [Developer Certificate of Origin](DCO)
- See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for the full guide
```

---

## 13. Resolved Decisions

All open questions have been resolved:

1. **Security contact email** — `security@tandemgtd.com`. GitHub Private Security Advisories may be enabled later as a secondary channel.
2. **Response time commitments** — Best effort, no firm SLAs. Solo-maintained project; critical vulnerabilities prioritized above all other work.
3. **Contributor Covenant enforcement contact** — `conduct@tandemgtd.com` (dedicated project email).
4. **Issue labels** — Start with: `bug`, `enhancement`, `needs-discussion`, `good-first-issue`, `help-wanted`. Expand organically as needed.
5. **Branch strategy** — `main` only on the public repo. The private repo serves as the integration/stabilization layer (changes are dogfooded ~4 weeks before syncing to public). Contributors target `main` with PRs. Short-lived `hotfix/` branches used as needed for urgent public fixes.
