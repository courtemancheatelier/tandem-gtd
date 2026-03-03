# Tandem GTD — Release Workflow

## Overview

Tandem uses a **private-first mirror** strategy. All development happens in a private repo. The public repo only receives battle-tested releases after a dogfooding window on your own servers.

```
Private Repo (canonical)          Your Servers              Public Repo (mirror)
─────────────────────────        ──────────────            ────────────────────
push freely, any time             
         │                        
    tag alpha ──────────────────► deploy & dogfood
         │                        (4+ weeks)
    bug fixes ─────────────────► redeploy as needed
         │                        
    tag release ─────────────────────────────────────────► sync to public
                                                           update wiki/website
```

## What Lives Where

| Content | Private Repo | Public Repo |
|---------|:---:|:---:|
| Application source code | ✅ | ✅ (on release) |
| Prisma schema + migrations | ✅ | ✅ (on release) |
| Docker + Caddy deployment config | ✅ | ✅ (on release) |
| Release workflow scripts | ✅ | ❌ |
| Personal deployment scripts | ✅ | ❌ |
| `.env` files | ✅ (gitignored) | ❌ |
| systemd service config | ✅ | ❌ |
| Nginx/server-specific config | ✅ | ❌ |
| CI/CD pipeline (if added later) | ✅ | ❌ |
| Public README + Contributing guide | ✅ | ✅ |
| Wiki / website content | separate | separate or in public |

## Release Lifecycle

### 1. Develop Freely

Push to the private repo as often as you want. No rules, no ceremony. Commit messages can be rough. Branches optional — working on `main` is fine when you're the sole developer.

### 2. Tag an Alpha

When things feel solid enough to run for real:

```bash
./scripts/release-alpha.sh 1.2.0
```

This tags `v1.2.0-alpha` in the private repo and deploys to your server. You're now dogfooding.

### 3. Dogfood (4+ Weeks)

Use the app. Find bugs. Push fixes to private, redeploy as needed. There's no fixed timeline — some cycles might be two weeks for a small batch, others might be two months for a major feature. Trust your feel for when it's ready.

### 4. Tag the Release

When you're satisfied:

```bash
./scripts/release-public.sh 1.2.0
```

This tags `v1.2.0` in the private repo and syncs the codebase to the public repo. If nothing changed since the alpha, your servers are already running the correct version — no redeployment needed.

### 5. Update Public-Facing Docs

After the public sync, update the wiki, website, changelog, and any public documentation at your own pace. You've been running the feature for weeks, so you're writing docs from experience, not from theory.

---

## Scripts

All release scripts live in the private repo under `scripts/`. They never get synced to public.

### `scripts/release-alpha.sh`

Tags the current state as an alpha release and deploys to your server.

```bash
#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Tandem GTD — Alpha Release
# =============================================================================
# Tags the current commit as an alpha and deploys to your server.
#
# Usage:
#   ./scripts/release-alpha.sh <version>
#   ./scripts/release-alpha.sh 1.2.0
#
# This will:
#   1. Tag the current commit as v<version>-alpha
#   2. Push the tag to the private repo
#   3. Deploy to your server via deploy-local.sh
# =============================================================================

VERSION="${1:?Usage: release-alpha.sh <version> (e.g. 1.2.0)}"
TAG="v${VERSION}-alpha"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# Preflight checks
[ -d .git ] || error "Not a git repository"
git diff --quiet HEAD || error "Working directory has uncommitted changes. Commit or stash first."

# Check if tag already exists
if git tag -l "$TAG" | grep -q "$TAG"; then
  error "Tag $TAG already exists. Bump the version or delete the old tag."
fi

echo ""
echo "========================================"
echo "  Tandem GTD — Alpha Release"
echo "========================================"
echo ""
echo "  Version:  $TAG"
echo "  Commit:   $(git rev-parse --short HEAD)"
echo "  Message:  $(git log -1 --pretty=%s)"
echo ""
read -r -p "Tag and deploy this commit as $TAG? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# Tag
info "Creating tag $TAG..."
git tag -a "$TAG" -m "Alpha release $TAG"
git push origin "$TAG"
ok "Tag $TAG pushed to private remote"

# Deploy
info "Deploying to server..."
if [ -f "$SCRIPT_DIR/deploy-local.sh" ]; then
  "$SCRIPT_DIR/deploy-local.sh"
else
  warn "deploy-local.sh not found — skipping auto-deploy."
  warn "Deploy manually when ready."
fi

echo ""
echo "========================================"
echo -e "  ${GREEN}Alpha $TAG deployed!${NC}"
echo "========================================"
echo ""
echo "  Now dogfood it. Push fixes as needed."
echo "  When ready, run:"
echo "    ./scripts/release-public.sh $VERSION"
echo ""
```

### `scripts/release-public.sh`

Tags the final release and syncs to the public repo.

```bash
#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Tandem GTD — Public Release
# =============================================================================
# Tags the final release and syncs the codebase to the public repo.
#
# Usage:
#   ./scripts/release-public.sh <version>
#   ./scripts/release-public.sh 1.2.0
#
# This will:
#   1. Tag the current commit as v<version>
#   2. Push the tag to the private repo
#   3. Sync the codebase to the public repo (excluding private-only files)
#   4. Push the release tag to the public repo
#
# Prerequisites:
#   - Git remote named "public" pointing to the public repo
#     git remote add public git@github.com:courtemancheatelier/tandem-gtd.git
# =============================================================================

VERSION="${1:?Usage: release-public.sh <version> (e.g. 1.2.0)}"
TAG="v${VERSION}"
ALPHA_TAG="v${VERSION}-alpha"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ─── Preflight ────────────────────────────────────────────────────────────────

[ -d .git ] || error "Not a git repository"
git diff --quiet HEAD || error "Working directory has uncommitted changes."

# Verify public remote exists
git remote get-url public &>/dev/null || \
  error "No 'public' remote found. Add it with:\n  git remote add public git@github.com:courtemancheatelier/tandem-gtd.git"

# Check if release tag already exists
if git tag -l "$TAG" | grep -q "$TAG"; then
  error "Tag $TAG already exists."
fi

# Show what's changed since alpha (if alpha exists)
echo ""
echo "========================================"
echo "  Tandem GTD — Public Release"
echo "========================================"
echo ""
echo "  Version:    $TAG"
echo "  Commit:     $(git rev-parse --short HEAD)"
echo ""

if git tag -l "$ALPHA_TAG" | grep -q "$ALPHA_TAG"; then
  CHANGES=$(git log "$ALPHA_TAG"..HEAD --oneline 2>/dev/null | wc -l | tr -d ' ')
  if [ "$CHANGES" -eq 0 ]; then
    echo -e "  ${GREEN}No changes since $ALPHA_TAG${NC}"
    echo "  Servers are already running this version."
  else
    echo "  Changes since $ALPHA_TAG:"
    git log "$ALPHA_TAG"..HEAD --oneline | head -20
    [ "$CHANGES" -gt 20 ] && echo "  ... and $((CHANGES - 20)) more"
  fi
else
  warn "No alpha tag $ALPHA_TAG found — releasing from current HEAD"
fi

echo ""
read -r -p "Release as $TAG and sync to public repo? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ─── Tag in private repo ─────────────────────────────────────────────────────

info "Creating tag $TAG..."
git tag -a "$TAG" -m "Release $TAG"
git push origin "$TAG"
ok "Tag $TAG pushed to private remote"

# ─── Sync to public repo ─────────────────────────────────────────────────────
# 
# Strategy: push main branch and release tags to public remote.
# Files excluded from public are handled by .gitignore in the private repo
# plus a .public-exclude file (see below).
#
# Private-only files that exist in the repo (not gitignored) are filtered
# out during the push using git filter-branch or a clean worktree export.
# ─────────────────────────────────────────────────────────────────────────────

info "Syncing to public repo..."

# Create a temporary clean export
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Export the current tagged commit
git archive "$TAG" | tar -x -C "$TEMP_DIR"

# Remove private-only files/directories
EXCLUDE_FILE="$PROJECT_DIR/.public-exclude"
if [ -f "$EXCLUDE_FILE" ]; then
  while IFS= read -r pattern || [ -n "$pattern" ]; do
    # Skip comments and empty lines
    [[ "$pattern" =~ ^#.*$ ]] && continue
    [[ -z "$pattern" ]] && continue
    # Remove matching files from the export
    cd "$TEMP_DIR" && rm -rf $pattern 2>/dev/null || true
    cd "$PROJECT_DIR"
  done < "$EXCLUDE_FILE"
  ok "Excluded private-only files"
else
  warn "No .public-exclude file found — syncing everything"
fi

# Push to public repo using a temporary branch in the temp dir
cd "$TEMP_DIR"
git init -q
git checkout -b main
git add -A
git commit -q -m "Release $TAG"
git tag -a "$TAG" -m "Release $TAG"
git remote add public "$(cd "$PROJECT_DIR" && git remote get-url public)"
git push public main --force
git push public "$TAG"
cd "$PROJECT_DIR"

ok "Public repo synced to $TAG"

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "========================================"
echo -e "  ${GREEN}Release $TAG published!${NC}"
echo "========================================"
echo ""
echo "  Private repo:  tagged $TAG ✓"
echo "  Public repo:   synced + tagged $TAG ✓"
echo ""
echo "  Next steps:"
echo "    - Update the public wiki / changelog"
echo "    - Update the website if needed"
echo "    - Create a GitHub Release with notes"
echo ""
```

### `.public-exclude`

Controls which files are stripped from the public repo during sync. Lives in the root of the private repo.

```
# =============================================================================
# Files to EXCLUDE from the public repo during release sync
# =============================================================================
# One pattern per line. Supports glob patterns.
# These files exist in the private repo but should never appear in public.
# =============================================================================

# Release workflow (private-only)
scripts/release-alpha.sh
scripts/release-public.sh
.public-exclude

# Personal deployment
scripts/deploy-local.sh
scripts/setup-local.sh

# Server-specific config
tandem.service
nginx-tandem.conf

# Private notes / drafts
docs/PRIVATE_NOTES.md
docs/RELEASE_WORKFLOW.md
```

---

## One-Time Setup

### 1. Create the public repo

Create an empty repo on GitHub (e.g., `courtemancheatelier/tandem-gtd`). Don't initialize it with a README — the first sync will push everything.

### 2. Add the public remote to your private repo

```bash
cd /path/to/tandem          # your private repo
git remote add public git@github.com:courtemancheatelier/tandem-gtd.git
```

Verify with `git remote -v` — you should see both `origin` (private) and `public`.

### 3. Create the `.public-exclude` file

Copy the template above into your repo root and adjust as needed.

### 4. Make the scripts executable

```bash
chmod +x scripts/release-alpha.sh
chmod +x scripts/release-public.sh
```

---

## Community PR Workflow

When someone submits a PR to the public repo:

1. Review the PR on GitHub (public repo)
2. If it looks good, pull it into your private repo:
   ```bash
   git fetch public
   git cherry-pick <commit-hash>
   ```
3. It enters your normal cycle — gets deployed as part of the next alpha
4. Goes through your dogfooding window
5. Ships to public in the next release

Nobody expects instant merges on a personal open source GTD app. A response like "Thanks, this will be in the next release cycle" is perfectly fine.

---

## Server Redeployment Logic

The key efficiency: **if nothing changed between alpha and final release, your servers are already on the correct version.** No redeployment needed.

```
Alpha tag ──► deploy to server ──► dogfood 4+ weeks
                                         │
                              ┌──────────┴──────────┐
                              │                     │
                        changes made           no changes
                              │                     │
                        fix + redeploy       servers already correct
                              │                     │
                              └──────────┬──────────┘
                                         │
                                  tag final release
                                         │
                                  sync to public repo
                                         │
                              update wiki / website / changelog
```

## Quick Reference

| Task | Command |
|------|---------|
| Tag alpha + deploy | `./scripts/release-alpha.sh 1.2.0` |
| Redeploy after fixes | `./scripts/deploy-local.sh` |
| Tag release + sync public | `./scripts/release-public.sh 1.2.0` |
| Check what changed since alpha | `git log v1.2.0-alpha..HEAD --oneline` |
| View all release tags | `git tag -l 'v*'` |
| Check current deployed version | `git describe --tags` |
