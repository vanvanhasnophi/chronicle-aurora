#!/usr/bin/env bash
# Chronicle Aurora — Upstream Update
#
# Pull the latest Chronicle Aurora framework changes from upstream
# while keeping your local data/ and .chronicle/ untouched.
#
# Usage:
#   bash scripts/update-app.sh
#
# Strategy:
#   Backup data/ + .chronicle/ → merge upstream (theirs for all
#   conflicts) → restore both from backup. Any merge conflict in
#   protected dirs is harmless — the backup overwrites it all.
#
# The upstream remote is explicit: it must be named "upstream". A downstream
# repo's "origin" usually contains "chronicle-aurora" too (same repo name), so
# falling back to origin would silently compare the repo against itself.

set -euo pipefail

# ── Helpers ──────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

say()    { echo -e "${2:-}$1${NC}"; }
success(){ say "✓ $1" "$GREEN"; }
warn()   { say "⚠ $1" "$YELLOW"; }
err()    { say "✗ $1" "$RED"; }

# Directories to protect — always keep local, never take from upstream
PROTECTED_DIRS=("data" ".chronicle")

cleanup() {
  if [ -n "${BACKUP_DIR:-}" ] && [ -d "$BACKUP_DIR" ]; then
    rm -rf "$BACKUP_DIR"
  fi
}
trap cleanup EXIT

# ── Locate repo root ─────────────────────────────────────────

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  err "Not in a git repository. Run this from your Chronicle Aurora downstream repo."
  exit 1
}
cd "$REPO_ROOT"

# ── Pre-flight checks ────────────────────────────────────────

# Build pathspec for excluding protected dirs from uncommitted check
EXCLUDE_PATHS=()
for d in "${PROTECTED_DIRS[@]}"; do
  EXCLUDE_PATHS+=(":!$d")
done

# Uncommitted changes (excluding protected dirs — we handle those separately)
if ! git diff-index --quiet HEAD -- . "${EXCLUDE_PATHS[@]}" 2>/dev/null; then
  warn "You have uncommitted changes outside data/ and .chronicle/ — these may cause merge conflicts."
  read -rp "        Continue anyway? [y/N] " answer
  [[ "${answer,,}" =~ ^y ]] || exit 0
fi

# Upstream remote — only "upstream" is trusted (see header).
UPSTREAM_REMOTE=""
if git remote get-url upstream &>/dev/null; then
  UPSTREAM_REMOTE="upstream"
fi

if [ -z "$UPSTREAM_REMOTE" ]; then
  err "No \"upstream\" remote in this repository."
  say ""
  say "  A template-generated repo (and a fork) has origin pointing at your own copy,"
  say "  so origin is never used. Add the upstream remote once:"
  say ""
  say "    git remote add upstream https://github.com/vanvanhasnophi/chronicle-aurora.git"
  say ""
  say "  Then re-run: npm run update"
  exit 1
fi

UPSTREAM_URL=$(git remote get-url "$UPSTREAM_REMOTE")
say "→ Using upstream: $UPSTREAM_REMOTE ($UPSTREAM_URL)"

say ""
say "┌──────────────────────────────────────────┐" "$BOLD"
say "│  Chronicle Aurora — Upstream Update      │" "$BOLD"
say "└──────────────────────────────────────────┘" "$BOLD"
say ""

# Fetch first: the upstream/* refs below do not exist until this runs.
say "📡 Fetching $UPSTREAM_REMOTE…"
FETCH_ERR=$(git fetch "$UPSTREAM_REMOTE" 2>&1) || {
  echo -e "${RED}$(echo "$FETCH_ERR" | tail -10)${NC}"
  err "Fetch failed. Check your network and the remote URL: $UPSTREAM_URL"
  exit 1
}

# ── Ensure on main branch ────────────────────────────────────

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Detect upstream default branch (only meaningful after the fetch above).
UPSTREAM_BRANCH="$UPSTREAM_REMOTE/main"
if ! git rev-parse --verify "$UPSTREAM_BRANCH" &>/dev/null; then
  UPSTREAM_BRANCH="$UPSTREAM_REMOTE/master"
fi
if ! git rev-parse --verify "$UPSTREAM_BRANCH" &>/dev/null; then
  err "Upstream has neither a 'main' nor a 'master' branch: $UPSTREAM_URL"
  exit 1
fi
UPSTREAM_BRANCH_NAME=$(echo "$UPSTREAM_BRANCH" | cut -d/ -f2-)

if [ "$CURRENT_BRANCH" != "$UPSTREAM_BRANCH_NAME" ]; then
  say "→ Switching from $CURRENT_BRANCH to $UPSTREAM_BRANCH_NAME…"
  CHECKOUT_ERR=$(git checkout "$UPSTREAM_BRANCH_NAME" 2>&1) || {
    echo -e "${RED}$(echo "$CHECKOUT_ERR" | tail -10)${NC}"
    err "Cannot switch to $UPSTREAM_BRANCH_NAME. Stash or commit your changes first."
    exit 1
  }
fi

UPSTREAM_COMMITS=$(git rev-list --count "HEAD..$UPSTREAM_BRANCH" 2>/dev/null || echo 0)

if [ "$UPSTREAM_COMMITS" -eq 0 ]; then
  success "Already up to date (no new upstream commits)."
  exit 0
fi

# ── Backup protected dirs ────────────────────────────────────

say ""
say "📦 Backing up local directories…"

BACKUP_DIR=$(mktemp -d)
for d in "${PROTECTED_DIRS[@]}"; do
  if [ -d "$d" ]; then
    cp -r "$d" "$BACKUP_DIR/"
    success "$d/ backed up"
  else
    warn "$d/ not found — nothing to back up"
  fi
done

# Guard: verify backup integrity before proceeding
for d in "${PROTECTED_DIRS[@]}"; do
  if [ -d "$d" ] && [ ! -d "$BACKUP_DIR/$d" ]; then
    err "Backup verification failed: $d/ was not copied to $BACKUP_DIR/$d"
    exit 1
  fi
done

# ── Merge ────────────────────────────────────────────────────
# Strategy: -X theirs handles content conflicts. Any remaining
# conflicts (modify/delete, etc.) are all in data/ or .chronicle/ —
# we resolve them by taking the upstream version, because both
# directories will be restored from backup immediately after.

say ""
say "🔀 Merging $UPSTREAM_BRANCH → $UPSTREAM_BRANCH_NAME ($UPSTREAM_COMMITS commit(s))"

PRE_MERGE_REF=$(git rev-parse HEAD)

git merge "$UPSTREAM_BRANCH" --no-edit --allow-unrelated-histories -X theirs 2>&1 && MERGE_OK=true || MERGE_OK=false

if ! $MERGE_OK; then
  warn "Merge had conflicts — auto-resolving (data/ & .chronicle/ will be restored from backup)…"

  # Resolve EVERY remaining conflict by taking upstream version.
  # This covers modify/delete, rename/delete — anything -X theirs can't handle.
  git ls-files -u | cut -f2 | sort -u | while IFS= read -r f; do
    git checkout --theirs -- "$f" 2>/dev/null && git add "$f" || git rm -f "$f" 2>/dev/null || true
  done

  GIT_EDITOR=true git merge --continue 2>&1 || git commit --no-edit 2>&1 || {
    echo -e "${RED}$(git status --short | head -20)${NC}"
    err "Could not complete merge. Aborting."
    git merge --abort
    exit 1
  }
fi
success "Merge complete"

# ── Restore protected dirs ───────────────────────────────────

say ""
say "🛡  Restoring from backup…"

for d in "${PROTECTED_DIRS[@]}"; do
  # Remove whatever the merge put there (should be nothing, but belt-and-suspenders)
  git rm -rf --cached --quiet "$d"/ 2>/dev/null || true
  rm -rf "$d"/

  # Restore from backup
  if [ -d "$BACKUP_DIR/$d" ]; then
    cp -r "$BACKUP_DIR/$d" "$d"
    # Directories ignored by upstream (e.g. `.chronicle/` since 3.1.0) must not be
    # staged — `git add` would fail with "paths are ignored" and abort the update.
    if git check-ignore -q "$d" 2>/dev/null; then
      success "$d/ restored (untracked, as upstream intends)"
    else
      git add "$d"/
      success "$d/ restored"
    fi
  fi
done

# Amend the merge commit so protected dirs are correct in history
git commit --amend --no-edit 2>&1 || {
  warn "Could not amend merge commit — changes are staged, commit them manually."
}

# ── Report ───────────────────────────────────────────────────

say ""
say "┌──────────────────────────────────────────┐" "$GREEN"
say "│  ✅  Update complete!                     │" "$GREEN"
say "└──────────────────────────────────────────┘" "$GREEN"
say ""
say "  Framework updated to upstream."
say "  data/ and .chronicle/ = your local version (backup → restore)."
say ""
say "  Review the changes:"
say "    git log ${PRE_MERGE_REF}..HEAD --oneline -- . ':!data' ':!.chronicle'"
