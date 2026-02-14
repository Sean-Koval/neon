#!/usr/bin/env bash
# =============================================================================
# post-commit-review.sh — PostToolUse hook for Bash commands
#
# Detects git commit/push commands and provides review gate feedback.
# This is a LIGHTWEIGHT check — it doesn't run the full review.
# It reminds the developer to run /review-gate before pushing.
#
# Input: JSON on stdin from Claude Code hook system
# Output: JSON with optional additionalContext
# =============================================================================

set -euo pipefail

# Read hook input
INPUT=$(cat)

# Extract the bash command that was executed
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")

# Only trigger on git push commands (not commits — those are fine)
if echo "$COMMAND" | grep -qE '^git push'; then
  # Check if there are unreviewed changes
  BRANCH=$(git branch --show-current 2>/dev/null || echo "")

  if [[ "$BRANCH" != "main" && "$BRANCH" != "master" ]]; then
    # Count commits ahead of main
    AHEAD=$(git rev-list --count "main..HEAD" 2>/dev/null || echo "0")

    if [[ "$AHEAD" -gt 0 ]]; then
      # Provide feedback to Claude
      cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Branch '$BRANCH' has $AHEAD commit(s) ahead of main. Consider running /review-gate before creating a PR to catch completeness, security, and quality issues."
  }
}
EOF
      exit 0
    fi
  fi
fi

# No action needed for other commands
exit 0
