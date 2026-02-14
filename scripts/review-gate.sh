#!/usr/bin/env bash
# =============================================================================
# scripts/review-gate.sh — Programmatic review gate runner
#
# Wraps the Claude Code CLI to perform automated code review.
# Use this from any CI/CD system, git hooks, or shell scripts.
#
# Usage:
#   ./scripts/review-gate.sh                          # Default: review vs main
#   ./scripts/review-gate.sh --ci                     # CI mode: JSON, strict
#   ./scripts/review-gate.sh --pre-commit             # Pre-commit: staged only
#   ./scripts/review-gate.sh --base HEAD~1            # Review last commit
#   ./scripts/review-gate.sh --severity critical      # Only block on critical
#   REVIEW_GATE_MODEL=opus ./scripts/review-gate.sh   # Use specific model
#
# Environment variables:
#   ANTHROPIC_API_KEY    — Required for CI (auto-available locally)
#   REVIEW_GATE_MODEL    — Model to use (default: claude-sonnet-4-5-20250929)
#   REVIEW_GATE_BUDGET   — Max spend in USD (default: 5.00)
#   REVIEW_GATE_TURNS    — Max agentic turns (default: 15)
#
# Exit codes:
#   0 — Passed
#   1 — Blocking findings
#   2 — Error (missing deps, git issues)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Config ────────────────────────────────────────────────────────────────────

MODEL="${REVIEW_GATE_MODEL:-claude-sonnet-4-5-20250929}"
BUDGET="${REVIEW_GATE_BUDGET:-5.00}"
MAX_TURNS="${REVIEW_GATE_TURNS:-15}"

# ── Args ──────────────────────────────────────────────────────────────────────

BASE="main"
SEVERITY="high"
FORMAT="text"
CI_MODE=false
PRE_COMMIT=false
FILES_FILTER=""
QUIET=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --base)        BASE="$2"; shift 2 ;;
    --severity)    SEVERITY="$2"; shift 2 ;;
    --format)      FORMAT="$2"; shift 2 ;;
    --ci)          CI_MODE=true; FORMAT="json"; QUIET=true; shift ;;
    --pre-commit)  PRE_COMMIT=true; BASE="HEAD"; shift ;;
    --files)       FILES_FILTER="$2"; shift 2 ;;
    --quiet|-q)    QUIET=true; shift ;;
    --help|-h)
      head -30 "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
    *)             echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

# ── Preflight ─────────────────────────────────────────────────────────────────

if ! command -v claude &>/dev/null; then
  echo "Error: 'claude' CLI not found." >&2
  echo "Install: https://docs.anthropic.com/en/docs/claude-code" >&2
  exit 2
fi

if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  echo "Error: Not in a git repository." >&2
  exit 2
fi

# Unset to allow nested invocation
unset CLAUDECODE 2>/dev/null || true

# ── Diff check ────────────────────────────────────────────────────────────────

if [[ "$PRE_COMMIT" == true ]]; then
  DIFF_CMD="git diff --cached"
  CHANGED=$($DIFF_CMD --name-only 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$CHANGED" == "0" ]]; then
    [[ "$QUIET" != true ]] && echo "No staged changes to review."
    exit 0
  fi
  [[ "$QUIET" != true ]] && echo "Reviewing $CHANGED staged file(s)..."
else
  DIFF_CMD="git diff $BASE"
  CHANGED=$($DIFF_CMD --name-only 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$CHANGED" == "0" ]]; then
    [[ "$QUIET" != true ]] && echo "No changes vs $BASE."
    exit 0
  fi
  [[ "$QUIET" != true ]] && echo "Reviewing $CHANGED file(s) vs $BASE..."
fi

# ── Gather diff context ──────────────────────────────────────────────────────

DIFF_STAT=$($DIFF_CMD --stat 2>/dev/null)
CHANGED_FILES=$($DIFF_CMD --name-only 2>/dev/null)

# Filter files if requested
if [[ -n "$FILES_FILTER" ]]; then
  CHANGED_FILES=$(echo "$CHANGED_FILES" | grep -E "$FILES_FILTER" || echo "")
  if [[ -z "$CHANGED_FILES" ]]; then
    [[ "$QUIET" != true ]] && echo "No files match filter: $FILES_FILTER"
    exit 0
  fi
fi

# ── Build the review prompt ──────────────────────────────────────────────────

REVIEW_PROMPT=$(cat <<PROMPT_EOF
You are a senior staff engineer performing an automated code review gate.

Review the git diff of this branch against '$BASE'. Analyze EVERY changed file across these 5 dimensions:

1. **COMPLETENESS**: TODO/FIXME comments, empty catch blocks, missing error/loading/empty states in React components, missing tests for new code, interfaces defined but unused, props accepted but never rendered.

2. **QUALITY**: \`any\` types, non-null assertions without guards, magic numbers, functions >50 lines, duplicated logic across files (>10 similar lines), console.log in production code, missing hook dependency arrays, unstable React keys.

3. **SECURITY**: Auth bypass (localStorage for workspace/user IDs instead of server-side auth), SQL/NoSQL injection via string interpolation, XSS via dangerouslySetInnerHTML, secrets/API keys in source, missing input validation on API endpoints, SSRF from user-controlled URLs.

4. **BEST PRACTICES**: Pattern consistency with existing codebase (check CLAUDE.md), naming conventions, proper error propagation, missing barrel exports, API consistency.

5. **BLOAT / OVER-ENGINEERING**: Premature abstractions (utility functions used once), unnecessary wrapper components, dead code, feature creep beyond stated goal, duplicated type definitions across files.

## Instructions

1. Run \`git diff $BASE --stat\` and \`git diff $BASE --name-only\` to see what changed
2. Read each changed file to understand the full context
3. For each finding, cite the exact file:line
4. Classify each finding: critical, high, medium, or low
5. Output your review in this exact format:

\`\`\`
## Review Gate: $(git branch --show-current 2>/dev/null || echo "unknown")

### Summary
Files reviewed: N | Findings: X critical, X high, X medium, X low

### CRITICAL
#### [DIMENSION] Title
file.tsx:NN — Description. **Fix**: How to fix it.

### HIGH
...

### MEDIUM
...

### LOW
...

### Verdict
BLOCKED — N critical/high issues must be resolved
  or
PASSED — No blocking issues found (with optional warnings)
\`\`\`

Severity threshold: Only mark as BLOCKED if there are findings at severity '$SEVERITY' or above.

IMPORTANT: Actually read the files. Do not guess or hallucinate issues. Every finding must reference a real line in the diff.
PROMPT_EOF
)

# ── Build CLI args ────────────────────────────────────────────────────────────

CLAUDE_ARGS=(
  -p "$REVIEW_PROMPT"
  --model "$MODEL"
  --max-turns "$MAX_TURNS"
  --max-budget-usd "$BUDGET"
  --allowedTools "Read" "Glob" "Grep" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)"
)

if [[ "$FORMAT" == "json" ]]; then
  CLAUDE_ARGS+=(--output-format json)
fi

if [[ "$CI_MODE" == true ]]; then
  CLAUDE_ARGS+=(--dangerously-skip-permissions)
fi

# ── Run ───────────────────────────────────────────────────────────────────────

[[ "$QUIET" != true ]] && echo "Running review-gate (model: $MODEL, budget: \$$BUDGET)..."
[[ "$QUIET" != true ]] && echo ""

OUTPUT=$(claude "${CLAUDE_ARGS[@]}" 2>&1) || true

echo "$OUTPUT"

# ── Parse result ──────────────────────────────────────────────────────────────

if [[ "$FORMAT" == "json" ]]; then
  VERDICT=$(echo "$OUTPUT" | jq -r '.verdict // empty' 2>/dev/null || echo "")
  if [[ -z "$VERDICT" ]]; then
    VERDICT=$(echo "$OUTPUT" | jq -r '.result.verdict // .response.verdict // empty' 2>/dev/null || echo "")
  fi
  case "$VERDICT" in
    blocked|failed) exit 1 ;;
    error)          exit 2 ;;
    *)              exit 0 ;;
  esac
else
  if echo "$OUTPUT" | grep -qiE "^###? Verdict" && echo "$OUTPUT" | grep -qiE "BLOCKED"; then
    exit 1
  fi
  exit 0
fi
