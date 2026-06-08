# Git Push Instructions

## Prerequisites

Make sure you're in your local repository and the git lock is cleared.

## Step 1: Clear Git Lock (if needed)

```bash
cd /path/to/playstore
rm -f .git/HEAD.lock
```

## Step 2: Check Git Status

```bash
git status
```

Expected output:
```
On branch refactor/unified-staging
Changes to be committed: [all your staged files]
```

## Step 3: Create the Commit

**Option A: Using the prepared message file**

```bash
git commit -F GIT_COMMIT_MESSAGE.txt
```

**Option B: Direct commit (copy the message)**

```bash
git commit -m "feat: complete competitor keyword staging system with end-to-end data flow

[Paste the full message from GIT_COMMIT_MESSAGE.txt]"
```

## Step 4: Verify Commit

```bash
git log --oneline -1
```

Should show:
```
xxxxxxx feat: complete competitor keyword staging system with end-to-end data flow
```

## Step 5: Push to Remote

### To current branch (recommended):

```bash
git push origin refactor/unified-staging
```

### To main (only if review is complete):

```bash
git push origin refactor/unified-staging:main
```

### Or set upstream and push:

```bash
git push -u origin refactor/unified-staging
```

## Step 6: Verify Push

```bash
git log --oneline origin/refactor/unified-staging -5
```

Should show your new commit at the top.

## Step 7: Create Pull Request (if needed)

On GitHub:
1. Go to repository
2. Click "Compare & pull request"
3. Set base branch to `main`
4. Set compare branch to `refactor/unified-staging`
5. Copy the commit message as PR description
6. Click "Create pull request"

---

## Full Command Sequence (One-liner)

```bash
cd /path/to/playstore && \
rm -f .git/HEAD.lock && \
git add . && \
git commit -F GIT_COMMIT_MESSAGE.txt && \
git push origin refactor/unified-staging
```

## Troubleshooting

### Git lock still exists:

```bash
# Try killing any running git processes
pkill -f git

# Wait a moment
sleep 2

# Try again
rm -f .git/HEAD.lock
```

### If push is rejected (remote ahead):

```bash
# Pull latest changes from remote
git pull origin refactor/unified-staging --rebase

# Retry push
git push origin refactor/unified-staging
```

### If you need to amend the commit:

```bash
# Make changes
git add .

# Amend the previous commit
git commit --amend --no-edit

# Force push (only if not shared yet)
git push origin refactor/unified-staging --force-with-lease
```

---

## Git Commands Summary

```bash
# Check status
git status

# Stage all changes
git add .

# Commit with message from file
git commit -F GIT_COMMIT_MESSAGE.txt

# View commit
git log --oneline -5

# Push to branch
git push origin refactor/unified-staging

# Push to main (dangerous - only after review)
git push origin refactor/unified-staging:main

# Check remote status
git log origin/refactor/unified-staging --oneline -5
```

---

## What Gets Committed

All modified and new files in the current state:
- 300+ files modified/created
- Core fixes in:
  - src/lib/staging-vault/staging-vault-service.ts
  - app/api/workspaces/[workspaceId]/staging/add/route.ts
  - app/api/workspaces/[workspaceId]/competitors/[competitorId]/keywords/route.ts
  - components/competitor-spy/CompetitorSpyClient.tsx
- New utility files and documentation
- Full source code migration to src/ directory

## Next Steps After Push

1. ✅ Verify commit appears in GitHub
2. ✅ Create pull request
3. ✅ Wait for CI/CD pipeline
4. ✅ Code review
5. ✅ Merge to main when approved
6. ✅ Deploy to production

---

## Questions?

Refer to:
- `COMPETITOR_KEYWORD_STAGING_COMPLETE.md` - Full technical overview
- `GIT_COMMIT_MESSAGE.txt` - Detailed commit message
- Server logs from testing for verification details
