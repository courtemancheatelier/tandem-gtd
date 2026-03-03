# GitHub Async Spec Review — Command Reference

A step-by-step command guide for collaborating on a spec doc (or any document) with your brother through GitHub pull requests.

---

## Initial Setup (One Time)

```bash
# Clone the shared repo (if you haven't already)
git clone https://github.com/your-username/your-repo.git
cd your-repo

# Make sure you're up to date
git checkout main
git pull origin main
```

---

## Step 1 — Create a Branch

```bash
git checkout -b spec/feature-name
```

Use a descriptive branch name like `spec/user-auth-flow` or `spec/tandem-project-hierarchy`.

---

## Step 2 — Write the Spec & Mark Open Questions

Create or edit your spec file:

```bash
# Create the spec doc
touch docs/feature-name-spec.md
```

Inside the doc, mark open questions clearly so they're easy to spot:

```markdown
## Overview
This feature will allow users to...

## Data Model

> ❓ **MATT**: Should we normalize this into two tables
> or keep it denormalized for read speed?

## API Design
- `POST /api/projects` — creates a new project
- `GET /api/projects/:id` — returns project details

> ❓ **MATT**: Do we need a bulk endpoint here
> or is single-resource enough for now?
```

---

## Step 3 — Commit & Push

```bash
git add .
git commit -m "Draft spec for feature-name — has open questions for Matt"
git push origin spec/feature-name
```

---

## Step 4 — Open a Pull Request

You can do this from the command line with the GitHub CLI, or on github.com.

**Option A — GitHub CLI (`gh`):**

```bash
# Install gh if needed: https://cli.github.com
gh pr create \
  --title "REVIEW: Feature Name Spec — needs your input" \
  --body "## Summary
Draft spec for feature-name.

## Open Questions
- [ ] Data model: normalized vs denormalized?
- [ ] API: need a bulk endpoint?

@brother-username please take a look when you get a chance." \
  --reviewer brother-username
```

**Option B — GitHub website:**

1. Go to your repo on github.com
2. You'll see a banner: "spec/feature-name had recent pushes — Compare & pull request"
3. Click it, fill in the title and description, assign your brother as reviewer
4. Click "Create pull request"

---

## Step 5 — Brother Reviews & Responds

Your brother's workflow (for his reference):

```bash
# Pull down your branch to review locally (optional — he can review on GitHub too)
git fetch origin
git checkout spec/feature-name

# After answering questions / making edits:
git add .
git commit -m "Answered open questions, proposed JWT approach"
git push origin spec/feature-name
```

On GitHub, he can also:

- Click "Files changed" to see the spec
- Leave inline comments on specific lines
- Click "Review changes" → choose "Approve" or "Request changes"
- Re-request your review so you get notified

---

## Step 6 — You Review His Changes

```bash
# Pull his updates locally
git checkout spec/feature-name
git pull origin spec/feature-name

# See what he changed
git log --oneline main..spec/feature-name   # list of commits
git diff main..spec/feature-name             # full diff
```

Or just go to the PR on GitHub and click "Files changed" — his new commits will be highlighted.

---

## Step 7 — Approve & Merge (or Send Back)

**If it looks good:**

```bash
# Merge via CLI
gh pr merge --squash

# Or on GitHub: click "Merge pull request" → "Confirm merge"
```

**If you have follow-ups:**

```bash
# Make more changes on the same branch
git add .
git commit -m "Follow-up: clarified rate limiting approach"
git push origin spec/feature-name
```

Then re-request his review on GitHub (or just leave a comment tagging him).

---

## Step 8 — Clean Up After Merge

```bash
# Switch back to main and pull the merged changes
git checkout main
git pull origin main

# Delete the branch locally
git branch -d spec/feature-name

# Delete the branch on GitHub
git push origin --delete spec/feature-name
```

---

## Quick Reference — The Full Cycle

| Step | Who | Command / Action |
|------|-----|-----------------|
| Branch | You | `git checkout -b spec/feature-name` |
| Write | You | Edit the spec, mark ❓ questions |
| Push | You | `git push origin spec/feature-name` |
| Open PR | You | `gh pr create --reviewer brother-username` |
| Review | Brother | Comments + commits on the same branch |
| Check | You | `git pull` + review diff or check GitHub |
| Merge | You | `gh pr merge --squash` |
| Clean up | Both | `git branch -d spec/feature-name` |

---

## Tips

- **Keep the PR focused.** One spec per PR makes review easy.
- **Use the PR description checklist** to track which questions are answered.
- **GitHub notifications are your "hey go look at this"** — no need to text each other.
- **Squash merge** keeps your main branch history clean (one commit per spec instead of 12 back-and-forth commits).
- **You can always check PR status** with: `gh pr status` or `gh pr view`.
