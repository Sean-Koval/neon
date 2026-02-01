# /pr-ready - Quality Gates + Code Review + PR

Run all quality checks, perform code review, and create a PR only if everything passes.

## Usage

```
/pr-ready                    # Auto-detect from current branch
/pr-ready <task-id>          # Specify task/issue ID for PR title
/pr-ready --skip-tests       # Skip test suite (not recommended)
```

## Execution

When this command is invoked, follow these steps in order:

### Step 1: Gather Context

```bash
# Get current branch and ensure we're not on main
branch=$(git branch --show-current)
if [[ "$branch" == "main" || "$branch" == "master" ]]; then
  echo "❌ Cannot create PR from main branch"
  exit 1
fi

# Check for uncommitted changes
git status --porcelain

# Get diff stats against main
git diff main --stat
```

If task-id not provided, try to detect:
- From `.task-session.json` if in worktree
- From branch name (e.g., `task/neon-6` → `neon-6`)
- From beads: `bd show` for current issue

### Step 2: Quality Gates

Run each check in sequence, stopping on failure:

**2a. Type Check**
```bash
echo "🔍 Type checking..."
bun run typecheck 2>&1
```

- If fails with errors in YOUR changed files: STOP, show errors
- If fails with pre-existing errors only: WARN and continue

**2b. Lint Check**
```bash
echo "🔍 Linting..."
bun run lint 2>&1
```

- If fails with errors in YOUR changed files: STOP, show errors  
- If fails with pre-existing errors only: WARN and continue

**2c. Tests**
```bash
echo "🧪 Running tests..."
bun run test 2>&1
```

- If fails: STOP, show failing tests

### Step 3: Code Review

Launch a code review agent to analyze the diff:

```bash
git diff main
```

Review for:
1. **Correctness** - Does the code do what it claims?
2. **Type safety** - Proper types, no `any` leaks
3. **Exports** - Are new functions exported from index files?
4. **API consistency** - Follows existing patterns
5. **Security** - No secrets, injection risks
6. **Completeness** - All acceptance criteria met

**Review output format:**
```
## Code Review: [branch-name]

### Issues Found

#### CRITICAL (must fix)
- Issue description

#### RECOMMENDED (should fix)
- Issue description

### What Looks Good
- Positive observations

### Verdict: ✅ APPROVED / ❌ NEEDS CHANGES
```

If CRITICAL issues found: STOP, show issues, do not create PR.

### Step 4: Commit Uncommitted Changes

If there are uncommitted changes:
```bash
git add -A
git commit -m "chore: final changes before PR"
```

### Step 5: Push and Create PR

```bash
# Push branch
git push -u origin $branch

# Create PR
gh pr create \
  --title "$task_id: $title" \
  --body "$(cat <<'EOF'
## Summary
<bullet points from commit messages>

## Quality Gates
- [x] Type check passed
- [x] Lint check passed
- [x] Tests passed
- [x] Code review approved

## Test Plan
- [ ] Verify changes work as expected

---
Closes: $task_id

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Step 6: Report Results

```
✅ PR Created Successfully!

Quality Gates:
  ✓ Type check    passed
  ✓ Lint          passed
  ✓ Tests         passed
  ✓ Code review   approved

PR: https://github.com/user/repo/pull/XXX

Next steps:
  - CI will run additional checks
  - Request review if needed
  - Merge when ready
```

## Error Handling

### Pre-existing errors

If errors exist but NOT in files you changed:
```
⚠️ Pre-existing errors detected (not blocking)

Your changes are clean. These existed before:
  - packages/temporal-client/src/index.ts (6 errors)

Proceeding with PR. Consider fixing these separately.
```

### Code review rejection

If code review finds critical issues:
```
❌ Code review found issues that need fixing

CRITICAL:
  1. Missing export in packages/sdk/src/index.ts
  2. Type error in new function

Fix these issues and run /pr-ready again.
```

## Integration

- Works with `beads` issues and `.project` tasks
- Updates beads issue status when PR is created
- Can be called from `wt finish` as the quality gate step
