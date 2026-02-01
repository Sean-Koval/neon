# /pr-ready

**Engineering Ops Skill: Quality Gates + Code Review + PR Creation**

## Purpose

Run all quality gates, perform code review, and create a PR only if everything passes. This is the "I'm ready to ship" checkpoint that ensures code quality before pushing.

## Usage

```
/pr-ready                    # Auto-detect from worktree/branch
/pr-ready <task-id>          # Specify task ID
/pr-ready --skip-tests       # Skip test suite (not recommended)
/pr-ready --skip-review      # Skip code review (not recommended)
```

## Quality Gate Layers

```
┌────────────────────────────────────────┐
│  1. Fast Checks (fail fast)            │
│     - TypeScript compilation           │
│     - Lint errors                      │
└────────────────────────────────────────┘
              ↓ pass
┌────────────────────────────────────────┐
│  2. Test Suite                         │
│     - Unit tests                       │
│     - Integration tests (if present)   │
└────────────────────────────────────────┘
              ↓ pass
┌────────────────────────────────────────┐
│  3. Code Review (Claude)               │
│     - Correctness                      │
│     - Type safety                      │
│     - API consistency                  │
│     - Security issues                  │
│     - Missing exports                  │
└────────────────────────────────────────┘
              ↓ approved
┌────────────────────────────────────────┐
│  4. Push + Create PR                   │
│     - Push branch to origin            │
│     - Create PR with summary           │
│     - Link to issue/task               │
└────────────────────────────────────────┘
```

## Procedure

### Step 1: Identify Context

Determine task ID and branch:

```bash
# If in worktree, read task session
if [[ -f ".task-session.json" ]]; then
  task_id=$(jq -r '.task_id' .task-session.json)
fi

# Get current branch
branch=$(git branch --show-current)

# Get diff stats
git diff main --stat
```

### Step 2: Run Type Checking

```bash
echo "🔍 Running type checks..."
bun run typecheck
```

**On failure:**
```
❌ Type check failed

Errors:
  src/client.ts(17,8): error TS2307: Cannot find module...

Fix type errors and run /pr-ready again.
```

**On success:** Continue to next step.

### Step 3: Run Lint Checks

```bash
echo "🔍 Running lint checks..."
bun run lint
```

**On failure:**
```
❌ Lint check failed

Fix lint errors and run /pr-ready again.
Tip: Run 'bun run lint:fix' to auto-fix some issues.
```

**Note:** If lint errors are pre-existing (not in changed files), warn but continue:
```
⚠️ Pre-existing lint errors detected (not in your changes)
Continuing with PR...
```

### Step 4: Run Tests

```bash
echo "🧪 Running tests..."
bun run test
```

**On failure:**
```
❌ Tests failed

Failed tests:
  - src/__tests__/client.test.ts: Connection timeout

Fix failing tests and run /pr-ready again.
```

**On success:** Continue to next step.

### Step 5: Code Review

Perform automated code review on the diff:

```bash
# Get the diff for review
git diff main
```

**Review checklist:**
- [ ] Correctness and completeness
- [ ] Type safety (no `any` leaks, proper generics)
- [ ] API consistency (naming, patterns)
- [ ] Missing exports from index files
- [ ] Security issues (injection, secrets)
- [ ] Error handling
- [ ] Backward compatibility

**Output format:**
```
## Code Review Summary

### Issues Found

#### CRITICAL (blocking)
- Missing export in index.ts - users can't import new functions

#### MEDIUM (should fix)
- Attributes not passed through in helper function

#### LOW (optional)
- Consider adding JSDoc comments

### Verdict
❌ NOT READY - Fix critical issues before PR
   or
✅ APPROVED - Ready to create PR
```

**On critical issues:**
```
❌ Code review found blocking issues

Fix the issues above and run /pr-ready again.
```

**On approval:** Continue to push and PR.

### Step 6: Push Branch

```bash
echo "📤 Pushing to origin..."
git push -u origin $branch
```

### Step 7: Create Pull Request

```bash
gh pr create \
  --title "$task_id: $title" \
  --body "$(generate_pr_body)"
```

**PR body template:**
```markdown
## Summary
<1-3 bullet points describing changes>

## Changes
| File | Description |
|------|-------------|
| path/to/file.ts | What changed |

## Quality Gates
- [x] Type check passed
- [x] Lint check passed  
- [x] Tests passed
- [x] Code review approved

## Test Plan
- [ ] Manual testing steps...

---
Closes: $task_id

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### Step 8: Report Success

```
✅ PR Ready!

Quality Gates:
  ✓ Type check    passed
  ✓ Lint check    passed
  ✓ Tests         passed (42 tests)
  ✓ Code review   approved

PR Created: https://github.com/user/repo/pull/123

Next steps:
  - Review PR in GitHub
  - Request reviewers if needed
  - Merge when CI passes
```

## Error Recovery

### Pre-existing errors

If typecheck/lint errors exist in files you didn't modify:

```
⚠️ Pre-existing errors detected

These errors are NOT in your changes:
  - packages/sdk/src/client.ts (pre-existing)

Your changes are clean. Proceeding with PR.
Consider fixing pre-existing errors in a separate PR.
```

### Partial completion

If PR creation fails after push:

```
⚠️ Branch pushed but PR creation failed

Branch: task/neon-6 (pushed to origin)

Create PR manually:
  gh pr create --title "..." --body "..."
  
Or retry:
  /pr-ready --retry-pr
```

## Integration

- **Works with**: beads issues, .project tasks, or standalone branches
- **Invokes**: Code review agent internally
- **CI/CD**: PR triggers GitHub Actions for additional validation
- **Hooks**: Can be invoked from `wt finish` command

## Configuration

Optional `.claude/pr-ready.json`:

```json
{
  "skipTests": false,
  "skipReview": false,
  "testCommand": "bun run test",
  "lintCommand": "bun run lint",
  "typecheckCommand": "bun run typecheck",
  "requireAllChecksPass": true,
  "allowPreExistingErrors": true
}
```
