#!/usr/bin/env bash
# =============================================================================
# review-gate.sh — Claude Code hook for automated code review
#
# Usage:
#   As a Claude Code hook (receives JSON stdin from hook system):
#     Configured in .claude/settings.json under hooks.PreToolUse or hooks.Stop
#
#   As a standalone script:
#     .claude/hooks/review-gate.sh [--base <ref>] [--severity <level>] [--format <fmt>]
#
#   In CI/CD:
#     .claude/hooks/review-gate.sh --ci
#
# Exit codes:
#   0 — Review passed (no critical/high findings)
#   1 — Review found blocking issues
#   2 — Review could not complete (error)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Defaults
BASE="main"
SEVERITY="high"
FORMAT="text"
CI_MODE=false
MAX_TURNS=15
FIX_MODE=false
FILES_FILTER=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --base)     BASE="$2"; shift 2 ;;
    --severity) SEVERITY="$2"; shift 2 ;;
    --format)   FORMAT="$2"; shift 2 ;;
    --ci)       CI_MODE=true; FORMAT="json"; shift ;;
    --fix)      FIX_MODE=true; shift ;;
    --files)    FILES_FILTER="$2"; shift 2 ;;
    --max-turns) MAX_TURNS="$2"; shift 2 ;;
    *)          echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

# Check if claude CLI is available
if ! command -v claude &>/dev/null; then
  echo "Error: 'claude' CLI not found. Install Claude Code first." >&2
  exit 2
fi

# Check if we're in a git repo
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  echo "Error: Not in a git repository." >&2
  exit 2
fi

# Check if there's a diff to review
DIFF_STAT=$(git diff "$BASE" --stat 2>/dev/null || echo "")
STAGED_STAT=$(git diff --cached --stat 2>/dev/null || echo "")

if [[ -z "$DIFF_STAT" && -z "$STAGED_STAT" ]]; then
  echo "No changes to review (no diff against $BASE, no staged changes)."
  exit 0
fi

# Build the review prompt
PROMPT="/review-gate --base $BASE --severity $SEVERITY --format $FORMAT"

if [[ -n "$FILES_FILTER" ]]; then
  PROMPT="$PROMPT --files '$FILES_FILTER'"
fi

if [[ "$FIX_MODE" == true ]]; then
  PROMPT="$PROMPT --fix"
fi

# Build claude CLI arguments
CLAUDE_ARGS=(
  -p "$PROMPT"
  --max-turns "$MAX_TURNS"
)

if [[ "$FORMAT" == "json" ]]; then
  CLAUDE_ARGS+=(--output-format json)
fi

if [[ "$CI_MODE" == true ]]; then
  CLAUDE_ARGS+=(--dangerously-skip-permissions)
fi

# Run the review
echo "Running review gate (base: $BASE, severity: $SEVERITY)..."
echo "Files changed: $(git diff "$BASE" --name-only 2>/dev/null | wc -l | tr -d ' ')"
echo ""

REVIEW_OUTPUT=$(claude "${CLAUDE_ARGS[@]}" 2>&1) || true

if [[ "$FORMAT" == "json" ]]; then
  # Parse JSON output for CI
  echo "$REVIEW_OUTPUT"

  # Check verdict from JSON
  VERDICT=$(echo "$REVIEW_OUTPUT" | jq -r '.result // .response // empty' 2>/dev/null | jq -r '.verdict // "unknown"' 2>/dev/null || echo "unknown")

  if [[ "$VERDICT" == "blocked" ]]; then
    exit 1
  elif [[ "$VERDICT" == "error" ]]; then
    exit 2
  fi
  exit 0
else
  # Human-readable output
  echo "$REVIEW_OUTPUT"

  # Check for blocking indicators in text output
  if echo "$REVIEW_OUTPUT" | grep -qi "BLOCKED\|❌.*BLOCK"; then
    exit 1
  fi
  exit 0
fi
