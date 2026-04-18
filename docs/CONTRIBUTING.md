# Contributing to Tandem

Thanks for your interest in contributing to Tandem! This guide explains what kinds of contributions we're looking for, how to submit them, and the standards we follow.

Tandem is opinionated by design — it implements David Allen's Getting Things Done methodology faithfully. These guidelines exist to protect the project's GTD integrity, protect contributors from wasted effort, and keep legal clarity under AGPL-3.0.

---

## What's Welcome

### Always Welcome (No Prior Discussion Needed)

- **Bug fixes** — with reproduction steps and tests where applicable
- **Documentation improvements** — typos, clarifications, better examples
- **Accessibility improvements** — ARIA labels, keyboard navigation, screen reader compatibility
- **Performance improvements** — with benchmarks showing the improvement
- **Test coverage** — additional tests for existing functionality
- **Translation / i18n** — when the i18n framework is in place
- **Security fixes** — see [SECURITY.md](../SECURITY.md) for responsible disclosure

### Discuss First (Open an Issue Before Coding)

- **New features** — even small ones. The maintainer needs to evaluate fit with GTD methodology and architectural direction.
- **UI/UX changes** — Tandem has specific design conventions. Mockups or screenshots in the issue help.
- **Database schema changes** — Tandem prioritizes backward compatibility and data model stability. Schema changes require careful review.
- **Dependency additions** — new npm packages must be justified. Tandem keeps a lean dependency tree.
- **Refactors** — large-scale restructuring needs alignment on approach before starting.

### Likely Won't Be Accepted

Being transparent here prevents wasted effort:

- **Features that contradict GTD methodology.** If David Allen's framework doesn't include it, Tandem probably shouldn't either. Examples: priority levels on tasks (GTD uses context/energy/time instead), Kanban boards, Pomodoro timers, habit trackers.
- **Proprietary integrations.** No features that require accounts on third-party services to function. Optional integrations are fine; required ones are not.
- **Telemetry or analytics.** Tandem has zero telemetry. This is non-negotiable.
- **Advertising or monetization hooks.** No affiliate links, sponsored features, or premium tiers.
- **Features that break self-hosting simplicity.** If it requires a separate service, external API key, or complex infrastructure beyond PostgreSQL + Next.js, it's probably out of scope for core.

### Fork-Friendly Territory

Some ideas are great but don't belong in core Tandem. You're encouraged to build these in forks:

- Integrations with specific ecosystems (Notion, Obsidian, Slack, etc.)
- Alternative UI frameworks or design systems
- Gamification features
- Workflow automation beyond GTD methodology
- Industry-specific adaptations

Forking is healthy and expected under AGPL. Great fork features can always be proposed for upstream inclusion later.

---

## Technical Standards

### Code

- **TypeScript** — all new code must be TypeScript. No `any` types without justification in a comment.
- **Formatting** — Prettier and ESLint configurations are the source of truth. Run `npm run lint` before submitting.
- **Component patterns** — React components use shadcn/ui conventions. Follow existing patterns in `src/components/`.
- **Database changes** — must include a Prisma migration, must not break existing data, and must include rollback consideration.
- **API changes** — must maintain backward compatibility or clearly document the breaking change and migration path.

### Testing

- Bug fix PRs should include a test that reproduces the bug and verifies the fix.
- Feature PRs should include tests covering the happy path and key edge cases.
- Test framework: Jest for unit tests, Playwright for E2E (when in place).

### Commits

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add energy filter to weekly review summary
fix: prevent cascade from promoting completed tasks
docs: clarify self-hosting requirements
refactor: extract notification scheduling logic
test: add coverage for bulk task update
chore: update dependencies
```

All commits must include a `Signed-off-by:` line (DCO requirement):

```bash
git commit -s -m "feat: add energy filter to weekly review summary"
```

Keep commits atomic — one logical change per commit.

#### Forgot to sign off?

Amend your most recent commit:

```bash
git commit --amend -s --no-edit
```

For multiple commits, use an interactive rebase:

```bash
git rebase --signoff HEAD~N
```

(Replace `N` with the number of commits to fix.)

---

## Pull Request Process

1. **Fork** the repo and create a branch from `main` (`feat/your-feature`, `fix/your-bug`).
2. **Make your changes** following the standards above.
3. **Run checks locally:**
   ```bash
   npm run lint
   npm run test
   ```
4. **Open a PR** against `main` with a clear description:
   - **What** — what does this change do?
   - **Why** — what problem does it solve?
   - **How** — brief overview of the approach.
   - **Screenshots** — for any UI changes.
   - **Issue link** — reference the related issue (`Closes #123`).
5. **DCO check must pass** — all commits must be signed off.
6. **Wait for review.** The maintainer will review within a reasonable timeframe, but this is a solo-maintained project — patience is appreciated. If a PR sits without review for more than two weeks, a polite ping is welcome.

Reviews may request changes. This isn't personal — it's about maintaining consistency and quality. PRs that don't follow the guidelines may be closed with an explanation and an invitation to resubmit.

---

## The "Inspired By" Pattern

In some cases, the maintainer may choose to implement a feature independently rather than merge a contributed PR — even if the PR is well-written. This is done to keep the codebase single-author for licensing simplicity and to ensure deep understanding of every line in core.

When this happens:

- The PR will be closed with a transparent explanation.
- The contributor will be credited in release notes for the idea and design direction.
- The contributor's fork remains fully functional under AGPL — their implementation isn't lost.

This is not a rejection of the contribution's quality. It's a structural decision about long-term project flexibility.

---

## Governance

### Current: BDFL

Tandem is maintained by Jason Courtemanche (Courtemanche Atelier). All architectural decisions, merge authority, and roadmap direction rest with the maintainer.

### Future

As the project grows, governance may evolve — trusted contributors, area maintainers, and eventually a steering committee are all possible. Any governance changes will be documented transparently here.

The commitment: Tandem will never become a vehicle for a single entity to extract value from community contributions. The DCO + AGPL combination enforces this structurally.

---

## Developer Certificate of Origin (DCO)

Tandem uses a [DCO](../DCO) instead of a CLA. This means:

- You keep your copyright. The DCO does not assign ownership to anyone.
- You grant a license under the same AGPL-3.0 terms Tandem uses (inbound = outbound).
- No special rights are granted to the maintainer beyond what every user gets.

All you need to do is add `--signoff` (or `-s`) to your git commits.

---

## What AGPL-3.0 Means for Contributors

- **Your contributions stay open.** Anything merged into Tandem is distributed under AGPL-3.0. Anyone who uses Tandem — including over a network — can see the source code, including your contributions.
- **You keep your copyright.** The DCO does not assign your copyright to anyone. You remain the author of your contributions.
- **Forks must stay open too.** If someone forks Tandem and modifies it, they must make their modified source available to their users under AGPL-3.0. They don't have to send changes back to this repo — but their users get the source.
- **No one can close this.** Because every contributor retains copyright under AGPL-3.0, no single entity can relicense Tandem as proprietary software. This is by design.

---

## Questions?

Open a [discussion](https://github.com/courtemancheatelier/tandem-gtd/discussions) or reach out in an issue. We're happy to help you find the right way to contribute.
