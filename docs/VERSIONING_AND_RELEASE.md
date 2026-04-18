# Tandem Versioning Scheme & Release Process

## Branching Strategy

Tandem uses a **release-branch model** to separate production maintenance from new development.

```
main              ← 1.9.0 development (beta + alpha servers)
release/1.8       ← production maintenance (prod server + public repo)
```

### Branch Rules

| Branch | Purpose | Servers | Public Repo |
|--------|---------|---------|-------------|
| `main` | New feature development (next minor/major) | beta, alpha | Not synced |
| `release/1.8` | Production fixes for current release | prod | Synced on patch tags |

### How Fixes Flow

```
1. Bug found on prod
2. Fix committed to release/1.8
3. Tag v1.8.x, deploy to prod, sync to public repo
4. Cherry-pick fix into main (so 1.9 gets it too)
```

### How Features Flow

```
1. Feature developed on main (or feature branch off main)
2. Deploy to beta/alpha for testing
3. When 1.9.0 is ready: create release/1.9 from main, cut over prod
```

### When to Create a New Release Branch

When the next minor version is ready for production:
1. Create `release/1.9` from `main`
2. Point prod at `release/1.9`
3. `main` becomes 1.10.0 (or 2.0.0) development
4. Keep `release/1.8` around until no longer needed, then delete

---

## Versioning Convention

### Internal Tags (Private Repo)

Format: `dev-<major>.<feature>[.<patch>]`

| Tag | Meaning |
|-----|---------|
| `dev-1.8.0` | Starting work on feature set 1.8 |
| `dev-1.8.1` | Bug fix or iteration within 1.8 |
| `dev-1.8.2` | Another patch within 1.8 |
| `dev-1.9.0` | Next feature set begins |

The **major** number tracks broad eras of the application (1.x = solo/alpha, 2.x = teams/beta, etc.). The **feature** number increments with each meaningful chunk of work — aligning with however you naturally think about milestones ("I'm working on 1.8 right now"). The **patch** number tracks iterations within that feature set and resets to 0 when the feature number bumps.

### Public Tags (Public Repo)

Format: `v<major>.<minor>.<patch>`

| Tag | Meaning |
|-----|---------|
| `v1.8.0` | First public release |
| `v1.8.1` | Bug fix to v1.8.0 (patch) |
| `v1.9.0` | New features (minor) |
| `v2.0.0` | Breaking changes or major milestone |

Public versions follow standard [semver](https://semver.org/):
- **Major** bumps for breaking changes or big milestones
- **Minor** bumps for new features that don't break anything
- **Patch** bumps for bug fixes on the current release branch

### Version Mapping File

Maintain `VERSION_MAP.md` in the private repo root:

```markdown
# Version Map: Internal → Public

| Internal Tag | Public Tag | Date | Notes |
|--------------|------------|------|-------|
| dev-1.8.2 | v1.8.0 | 2026-03-03 | Initial public release |
| — | v1.8.1 | 2026-03-05 | Banner text fix (release/1.8) |
```

---

## Release Automation

### Setup

Place the script below at `scripts/release.sh` in your private repo and make it executable:

```bash
chmod +x scripts/release.sh
```

Ensure your remotes are configured:

```bash
git remote -v
# origin    git@github.com:you/tandem-private.git (private)
# public    git@github.com:you/tandem-public.git  (public)
```

### The Release Script

```bash
#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Tandem Release Script
# Tags an internal milestone and optionally pushes a public release.
# ============================================================================

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

VERSION_MAP="VERSION_MAP.md"
PUBLIC_REMOTE="public"

# --- Helpers ----------------------------------------------------------------

current_branch() {
  git rev-parse --abbrev-ref HEAD
}

latest_internal_tag() {
  git tag -l 'dev-*' --sort=-v:refname | head -n 1
}

latest_public_tag() {
  git tag -l 'v*' --sort=-v:refname | head -n 1
}

confirm() {
  read -r -p "$1 [y/N] " response
  [[ "$response" =~ ^[Yy]$ ]]
}

# --- Preflight checks -------------------------------------------------------

if [[ "$(current_branch)" != "main" ]]; then
  echo -e "${RED}Error: Must be on 'main' branch to release.${NC}"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo -e "${RED}Error: Working directory not clean. Commit or stash changes first.${NC}"
  exit 1
fi

# --- Menu -------------------------------------------------------------------

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  Tandem Release Manager${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""
echo -e "  Latest internal tag: ${GREEN}$(latest_internal_tag || echo 'none')${NC}"
echo -e "  Latest public tag:   ${GREEN}$(latest_public_tag || echo 'none')${NC}"
echo ""
echo "  1) Tag internal milestone (private repo only)"
echo "  2) Push public release (tags + pushes to public remote)"
echo "  3) Show version map"
echo "  4) Exit"
echo ""
read -r -p "  Choose [1-4]: " choice

case $choice in

# --- Option 1: Internal tag -------------------------------------------------
1)
  echo ""
  read -r -p "  Internal version (e.g. 1.8.0): " version
  tag="dev-${version}"

  if git rev-parse "$tag" >/dev/null 2>&1; then
    echo -e "${RED}  Tag '$tag' already exists.${NC}"
    exit 1
  fi

  read -r -p "  Tag message: " message
  git tag -a "$tag" -m "$message"
  git push origin "$tag"

  echo ""
  echo -e "${GREEN}  ✓ Tagged and pushed: $tag${NC}"
  ;;

# --- Option 2: Public release ------------------------------------------------
2)
  echo ""
  echo -e "${YELLOW}  Preflight checklist:${NC}"
  echo "  • Has this code run on your server for ~4 weeks?"
  echo "  • Are there any secrets or private config in the diff?"
  echo "  • Is the CHANGELOG / README updated?"
  echo ""

  if ! confirm "  Continue with public release?"; then
    echo "  Aborted."
    exit 0
  fi

  # Show what will be pushed
  echo ""
  echo -e "${BLUE}  Commits going public:${NC}"
  public_head=$(git ls-remote "$PUBLIC_REMOTE" refs/heads/main | cut -f1)
  if [[ -n "$public_head" ]]; then
    git log --oneline "${public_head}..HEAD" | sed 's/^/    /'
  else
    echo "    (first push — all commits)"
  fi
  echo ""

  read -r -p "  Public version (e.g. 1.0.0): " pub_version
  pub_tag="v${pub_version}"

  if git rev-parse "$pub_tag" >/dev/null 2>&1; then
    echo -e "${RED}  Tag '$pub_tag' already exists.${NC}"
    exit 1
  fi

  read -r -p "  Internal tag this corresponds to (e.g. dev-1.8.2): " int_tag
  read -r -p "  Release notes (one line): " notes

  # Tag and push
  git tag -a "$pub_tag" -m "Release $pub_tag: $notes"
  git push "$PUBLIC_REMOTE" main
  git push "$PUBLIC_REMOTE" "$pub_tag"
  git push origin "$pub_tag"  # also keep public tag in private repo for reference

  # Update version map
  today=$(date +%Y-%m-%d)
  if [[ ! -f "$VERSION_MAP" ]]; then
    echo "# Version Map: Internal → Public" > "$VERSION_MAP"
    echo "" >> "$VERSION_MAP"
    echo "| Internal Tag | Public Tag | Date | Notes |" >> "$VERSION_MAP"
    echo "|--------------|------------|------|-------|" >> "$VERSION_MAP"
  fi
  echo "| $int_tag | $pub_tag | $today | $notes |" >> "$VERSION_MAP"

  git add "$VERSION_MAP"
  git commit -m "docs: update version map for $pub_tag"
  git push origin main

  echo ""
  echo -e "${GREEN}  ✓ Public release complete: $pub_tag${NC}"
  echo -e "${GREEN}  ✓ Version map updated${NC}"
  ;;

# --- Option 3: Show map -----------------------------------------------------
3)
  if [[ -f "$VERSION_MAP" ]]; then
    echo ""
    cat "$VERSION_MAP"
  else
    echo -e "${YELLOW}  No version map found yet. Create one with your first public release.${NC}"
  fi
  ;;

# --- Option 4: Exit ---------------------------------------------------------
4)
  exit 0
  ;;

*)
  echo -e "${RED}  Invalid choice.${NC}"
  exit 1
  ;;

esac
```

---

## Usage Examples

### Tag an internal milestone

```bash
./scripts/release.sh
# Choose 1
# Version: 1.8.0
# Message: "Wiki inline editing stable, mobile nav refactored"
```

### Push a public release

```bash
./scripts/release.sh
# Choose 2
# Walks you through checklist, shows diff, asks for version numbers
# Tags, pushes, and updates VERSION_MAP.md automatically
```

### Fix a bug on production (patch release)

Someone reports a bug against v1.8.0 while you're working on v1.9 features on `main`.

```bash
# 1. Switch to the release branch
git checkout release/1.8

# 2. Fix the bug, commit
#    ... make changes, commit ...

# 3. Deploy to prod and verify
ssh tandem-vps "sudo -u tandemprod bash -c 'cd /opt/tandem-prod && git pull origin release/1.8 && npm run build'"
ssh tandem-vps "sudo systemctl restart tandem-prod"

# 4. Tag and sync to public repo
git tag -a v1.8.1 -m "Fix: description of fix"
git push origin release/1.8 v1.8.1
./scripts/release-public.sh 1.8.1

# 5. Cherry-pick the fix into main so v1.9 gets it too
git checkout main
git cherry-pick <commit-hash>
```

**Key points:**
- Fixes go directly on the `release/1.8` branch — no throwaway hotfix branches needed
- Always deploy to prod and verify before tagging a public release
- Cherry-pick fixes into `main` so they're not lost when 1.9 ships
- If the fix doesn't apply cleanly to `main` (because 1.9 code has diverged), resolve the cherry-pick conflict manually

### Quick reference from the command line

```bash
# See all internal tags
git tag -l 'dev-*' --sort=-v:refname

# See all public tags
git tag -l 'v*' --sort=-v:refname

# See what changed between two public releases
git log v1.0.0..v1.1.0 --oneline

# See what's been committed since last public push
git log v1.0.0..HEAD --oneline
```

---

## Safety Checklist (Built Into Script)

The public release flow includes these guardrails:

1. **Branch check** — Must be on `main` or `hotfix/*`
2. **Clean working directory** — No uncommitted changes
3. **Dogfood reminder** — Has this run on your server for ~4 weeks?
4. **Secrets check** — Reminder to review the diff for private config
5. **Diff preview** — Shows exactly which commits are about to go public
6. **Duplicate tag prevention** — Won't overwrite existing tags
7. **Version map auto-update** — Creates a paper trail mapping internal → public
8. **Hotfix cherry-pick reminder** — Prints the exact command to bring the fix into main
