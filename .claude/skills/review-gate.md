# /review-gate

**Automated Code Review Gate: Completeness, Quality, Security, Best Practices, Bloat Detection**

## Purpose

Deep code review that goes beyond linting and typechecking. Analyzes the actual diff for five dimensions that static tools miss: incomplete implementations, security holes, pattern violations, and over-engineering. Designed to run as a skill, pre-commit hook, or CI gate.

## Usage

```
/review-gate                     # Review staged/uncommitted changes vs main
/review-gate --base main         # Explicit base branch
/review-gate --base HEAD~3       # Review last 3 commits
/review-gate --files "src/**"    # Restrict to specific paths
/review-gate --severity critical # Only report critical issues (CI mode)
/review-gate --format json       # Machine-readable output (CI mode)
/review-gate --fix               # Auto-fix what can be fixed
```

## Review Dimensions

```
┌─────────────────────────────────────────────────────┐
│  1. COMPLETENESS                                     │
│     Missing error handling, TODO/FIXME, stub code,   │
│     unfinished features, missing tests for new code  │
├─────────────────────────────────────────────────────┤
│  2. QUALITY                                          │
│     Type safety, proper abstractions, readability,   │
│     naming consistency, dead code, test coverage     │
├─────────────────────────────────────────────────────┤
│  3. SECURITY                                         │
│     Auth bypass, injection, secrets exposure,        │
│     unsafe deserialization, OWASP top 10             │
├─────────────────────────────────────────────────────┤
│  4. BEST PRACTICES                                   │
│     Project patterns, API consistency, imports,      │
│     exports, error propagation, naming conventions   │
├─────────────────────────────────────────────────────┤
│  5. BLOAT / OVER-ENGINEERING                         │
│     Premature abstractions, unused params, dead      │
│     code paths, unnecessary wrappers, feature flags  │
│     nobody asked for, config for one-time operations │
└─────────────────────────────────────────────────────┘
```

## Procedure

### Step 0: Parse Arguments

Determine base branch, file filter, output format, and severity threshold from arguments.

Defaults:
- `--base main` (diff against main)
- `--severity low` (report everything)
- `--format text` (human-readable)
- `--fix` off (read-only by default)

### Step 1: Gather Diff Context

```bash
# Get the base branch
BASE="${base:-main}"

# Get changed files
git diff "$BASE" --name-only

# Get full diff with context
git diff "$BASE" --unified=5

# Get diff stats
git diff "$BASE" --stat

# Check for uncommitted changes too
git status --porcelain
```

If no diff is found, check staged changes:
```bash
git diff --cached --unified=5
```

Store the list of changed files for targeted analysis.

### Step 2: Load Project Context

Before reviewing, understand the project's conventions:

1. Read `CLAUDE.md` for project-specific rules
2. Read existing patterns in sibling files (same directory as changed files)
3. Check if changed files have associated test files
4. Note the tech stack from imports (React/Next.js/tRPC/Temporal/etc.)

This context is CRITICAL — don't review in a vacuum.

### Step 3: Analyze Each Dimension

For each changed file, analyze across all five dimensions. Be specific — cite file:line for every finding.

#### 3a. Completeness Check

Look for:
- `TODO`, `FIXME`, `HACK`, `XXX` comments in new code
- Empty catch blocks or swallowed errors (`catch {}`, `catch { }`, `catch (_e) {}`)
- Functions that return hardcoded values or `null` as placeholder
- Missing loading/error/empty states in React components
- New exports not added to barrel index files
- New API endpoints missing from route registration
- New features without corresponding tests
- Interfaces/types defined but never used
- Props accepted but never rendered
- Database columns added but never queried

Scoring: Each finding is `critical` (blocks ship) or `warning` (should fix).

#### 3b. Quality Check

Look for:
- `any` type usage (in TypeScript) — always flag
- Non-null assertions (`!`) without guard — flag
- Magic numbers/strings without named constants
- Functions > 50 lines (suggest extraction)
- Deeply nested conditionals (> 3 levels)
- Duplicated logic across files (> 10 similar lines)
- Console.log/console.error left in production code
- Inconsistent naming (camelCase vs snake_case mixing)
- Missing TypeScript strict mode violations
- React: missing `key` props, unstable keys (index in dynamic lists)
- React: missing dependency arrays in hooks
- SQL: raw string interpolation instead of parameterized queries

#### 3c. Security Check

Look for (OWASP-aligned):
- **Injection**: SQL/NoSQL injection via string interpolation, command injection via unsanitized input to `exec`/`spawn`, XSS via `dangerouslySetInnerHTML` or unescaped user input
- **Auth**: Missing auth checks on new endpoints, `publicProcedure` where `protectedProcedure` expected, client-side auth decisions (localStorage for workspace/user ID)
- **Secrets**: API keys, tokens, passwords in source code, `.env` files in diff
- **Data exposure**: Logging sensitive data, returning full objects instead of selected fields, exposing internal IDs
- **Dependencies**: New packages with known vulnerabilities, unpinned versions
- **SSRF**: User-controlled URLs passed to fetch/axios without validation
- **Path traversal**: User input in file paths without sanitization

Rate: `critical` for exploitable issues, `warning` for defense-in-depth gaps.

#### 3d. Best Practices Check

Compare against project conventions (loaded in Step 2):
- **Auth pattern**: Does this project use `withAuth`/`protectedProcedure`? New endpoints should too.
- **Error handling**: Does the project throw typed errors? New code should match.
- **Import order**: Does Biome/ESLint enforce import ordering? Check compliance.
- **File organization**: Components in `components/`, hooks in `hooks/`, etc.
- **API patterns**: tRPC router structure, input validation with zod, consistent response shapes
- **Naming**: Route naming conventions, component naming, variable naming
- **State management**: Does the project use specific patterns (tRPC hooks, React Query)?
- **Styling**: Tailwind class ordering, design token usage vs hardcoded colors

#### 3e. Bloat / Over-Engineering Check

Look for:
- **Premature abstraction**: Utility functions used exactly once, generic wrappers around specific operations, config objects for things that should be inline
- **Unnecessary indirection**: Wrapper components that just pass props through, services that just call one function, types that alias primitives (`type ID = string`)
- **Dead code**: Exported functions with zero references, unreachable code paths, commented-out code blocks
- **Feature creep**: Changes that go beyond the stated goal (check commit messages/PR description), extra configurability nobody asked for
- **Dependency bloat**: New packages for trivial operations (e.g., `is-odd`, `left-pad` equivalents), packages that duplicate existing capabilities
- **Over-typing**: Excessive generics, union types with 10+ members, intersection types that could be simplified
- **Gold plating**: Animations/transitions nobody requested, error messages that are paragraphs, logging at every step

### Step 4: Score and Classify

Assign severity to each finding:

| Severity | Meaning | CI Behavior |
|----------|---------|-------------|
| `critical` | Must fix before merge. Security holes, auth bypass, data loss risk, broken functionality | **Blocks CI** |
| `high` | Should fix. Incomplete features, missing tests, significant quality issues | **Blocks CI** (with `--severity high`) |
| `medium` | Recommended fix. Pattern violations, minor quality issues, style inconsistencies | Warning only |
| `low` | Nice to have. Suggestions, minor bloat, documentation gaps | Info only |

### Step 5: Generate Report

#### Text Format (default, for humans):

```
## Review Gate: <branch-name>

### Summary
Files reviewed: 12 | Findings: 3 critical, 5 high, 8 medium, 2 low

### CRITICAL

#### [SECURITY] Auth bypass in agent upsert endpoint
📁 frontend/server/trpc/routers/agents.ts:321
workspaceId comes from client input (localStorage) instead of ctx.projectId.
An attacker can modify any workspace's agents by spoofing the workspaceId.
**Fix**: Use `ctx.projectId` from server-side auth context.

#### [COMPLETENESS] Missing error state in cost breakdown
📁 frontend/components/agents/cost-breakdown.tsx:42
Component fetches data but has no error handling. If the query fails,
the component renders nothing with no user feedback.
**Fix**: Add `if (query.isError) return <ErrorState />` block.

### HIGH

#### [BLOAT] Duplicated formatRelativeTime across 5 files
📁 frontend/components/agents/agent-context-row.tsx:26
📁 frontend/components/agents/version-history-table.tsx:34
📁 frontend/components/agents/deployment-card.tsx:31
📁 frontend/components/agents/agent-activity-feed.tsx:18
📁 frontend/app/agents/[id]/page.tsx:56
Same function copy-pasted in 5 files. Extract to shared utility.
**Fix**: Create `frontend/lib/format.ts` and import from there.

### MEDIUM
...

### LOW
...

### Verdict
❌ BLOCKED — 3 critical issues must be resolved
   or
⚠️ WARNINGS — 5 high-severity issues recommended
   or
✅ PASSED — No blocking issues found
```

#### JSON Format (for CI/scripts):

```json
{
  "branch": "feat/agent-detail",
  "base": "main",
  "timestamp": "2026-02-13T21:00:00Z",
  "summary": {
    "files_reviewed": 12,
    "critical": 3,
    "high": 5,
    "medium": 8,
    "low": 2
  },
  "verdict": "blocked",
  "findings": [
    {
      "id": "SEC-001",
      "severity": "critical",
      "dimension": "security",
      "title": "Auth bypass in agent upsert endpoint",
      "file": "frontend/server/trpc/routers/agents.ts",
      "line": 321,
      "description": "workspaceId from client input instead of ctx.projectId",
      "fix": "Use ctx.projectId from server-side auth context",
      "auto_fixable": false
    }
  ],
  "exit_code": 1
}
```

### Step 6: Auto-Fix (if --fix flag)

If `--fix` is passed, attempt to fix issues that are safe to auto-fix:
- Remove unused imports
- Extract duplicated utilities to shared files
- Add missing `key` props with stable identifiers
- Replace `any` with inferred types where obvious
- Add missing `aria-label` attributes
- Remove console.log statements

After fixing, re-run the review to verify fixes didn't introduce new issues.
Report which fixes were applied and which require manual intervention.

### Step 7: Exit Code

For CI/hook integration:
- **Exit 0**: All clear, or only low/medium findings
- **Exit 1**: Critical or high findings present (when `--severity high` or `--severity critical`)
- **Exit 2**: Review could not complete (missing dependencies, git errors)

## CI Integration

### As a Pre-Commit Hook

The review gate can be triggered automatically before each commit via Claude Code hooks.
See `.claude/hooks/review-gate.sh` for the hook script.

Hook configuration in `.claude/settings.json`:
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/review-gate.sh"
          }
        ]
      }
    ]
  }
}
```

### As a GitHub Actions Step

```yaml
- name: Claude Review Gate
  run: |
    claude -p \
      --output-format json \
      --max-turns 15 \
      --dangerously-skip-permissions \
      "/review-gate --base origin/main --format json --severity high" \
    | jq -e '.exit_code == 0'
```

### Programmatic Invocation (Shell)

```bash
# Quick review of staged changes
claude -p "/review-gate --base HEAD" --max-turns 10

# CI-mode: JSON output, fail on high+ severity
claude -p "/review-gate --format json --severity high" \
  --output-format json \
  --dangerously-skip-permissions \
  --max-turns 15

# Review specific files only
claude -p "/review-gate --files 'frontend/components/agents/**'" \
  --max-turns 10

# Review and auto-fix
claude -p "/review-gate --fix" --max-turns 20
```

## Configuration

Optional `.claude/review-gate.json` for project-specific tuning:

```json
{
  "severity_threshold": "high",
  "dimensions": ["completeness", "quality", "security", "best-practices", "bloat"],
  "ignore_patterns": ["**/*.test.ts", "**/*.spec.ts", "**/__mocks__/**"],
  "security_rules": {
    "require_auth": true,
    "block_public_procedures": true,
    "block_localStorage_auth": true
  },
  "bloat_rules": {
    "max_function_lines": 50,
    "max_file_lines": 400,
    "max_nesting_depth": 3,
    "flag_single_use_abstractions": true
  },
  "auto_fix": false
}
```
