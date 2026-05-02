#!/usr/bin/env bash
# Claude Code Session Tracer
#
# Hook script that sends traces/spans to the Neon platform for observability
# of Claude Code sessions. Receives JSON on stdin from Claude Code hooks.
#
# Events handled: SessionStart, PreToolUse, PostToolUse, SubagentStart, Stop
# All curl calls are fire-and-forget (background) so they never block Claude Code.

set -euo pipefail

API_URL="${NEON_API_URL:-http://localhost:3000/api/spans}"
PROJECT_ID="${NEON_PROJECT_ID:-00000000-0000-0000-0000-000000000001}"
AGENT_ID="claude-code"
MAX_FIELD_LEN=1000
STATE_DIR="/tmp/neon-cc"

mkdir -p "$STATE_DIR"

# Read hook JSON from stdin
INPUT=$(cat)

# Debug logging (remove once stable)
echo "$(date +%H:%M:%S) $(echo "$INPUT" | jq -c '{event: .hook_event_name, session: .session_id, tool: .tool_name}')" >> "$STATE_DIR/debug.log" 2>/dev/null || true

HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

if [[ -z "$HOOK_EVENT" || -z "$SESSION_ID" ]]; then
  # Log what we got if either is empty
  echo "$(date +%H:%M:%S) SKIP: event=$HOOK_EVENT session=$SESSION_ID keys=$(echo "$INPUT" | jq -r 'keys | join(",")' 2>/dev/null)" >> "$STATE_DIR/debug.log" 2>/dev/null || true
  exit 0
fi

# Generate a UUID (portable)
gen_uuid() {
  if command -v uuidgen &>/dev/null; then
    uuidgen | tr '[:upper:]' '[:lower:]'
  else
    cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())'
  fi
}

# Current timestamp in ISO 8601 format for ClickHouse DateTime64(3)
now_ts() {
  date -u '+%Y-%m-%d %H:%M:%S.%3N'
}

# Current time in epoch milliseconds
now_ms() {
  date +%s%3N
}

# Truncate a string to MAX_FIELD_LEN
truncate() {
  local s="$1"
  if [[ ${#s} -gt $MAX_FIELD_LEN ]]; then
    echo "${s:0:$MAX_FIELD_LEN}..."
  else
    echo "$s"
  fi
}

# Send span(s) to the API (fire-and-forget)
send_span() {
  local payload="$1"
  curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "x-project-id: $PROJECT_ID" \
    -d "$payload" \
    >/dev/null 2>&1 &
}

TRACE_FILE="$STATE_DIR/trace-$SESSION_ID"
ROOT_SPAN_ID_FILE="$STATE_DIR/root-$SESSION_ID"

# Lazy initialization: if SessionStart was missed (e.g. hooks added mid-session),
# create the trace on first tool use
ensure_trace() {
  if [[ ! -f "$TRACE_FILE" ]]; then
    local TRACE_ID ROOT_SPAN_ID TIMESTAMP
    TRACE_ID=$(gen_uuid)
    ROOT_SPAN_ID=$(gen_uuid)
    echo "$TRACE_ID" > "$TRACE_FILE"
    echo "$ROOT_SPAN_ID" > "$ROOT_SPAN_ID_FILE"
    TIMESTAMP=$(now_ts)
    send_span "$(jq -n \
      --arg project_id "$PROJECT_ID" \
      --arg trace_id "$TRACE_ID" \
      --arg span_id "$ROOT_SPAN_ID" \
      --arg name "claude-code-session" \
      --arg timestamp "$TIMESTAMP" \
      --arg session_id "$SESSION_ID" \
      --arg agent_id "$AGENT_ID" \
      '{
        project_id: $project_id,
        trace_id: $trace_id,
        span_id: $span_id,
        parent_span_id: null,
        name: $name,
        kind: "server",
        span_type: "span",
        timestamp: $timestamp,
        status: "unset",
        attributes: {
          "claude_code.session_id": $session_id,
          "agent.id": $agent_id,
          "session.type": "claude-code"
        }
      }')"
  fi
}

case "$HOOK_EVENT" in
  SessionStart)
    # Generate trace_id and root span_id, persist for later events
    TRACE_ID=$(gen_uuid)
    ROOT_SPAN_ID=$(gen_uuid)
    echo "$TRACE_ID" > "$TRACE_FILE"
    echo "$ROOT_SPAN_ID" > "$ROOT_SPAN_ID_FILE"

    TIMESTAMP=$(now_ts)

    # Send root span (session span)
    send_span "$(jq -n \
      --arg project_id "$PROJECT_ID" \
      --arg trace_id "$TRACE_ID" \
      --arg span_id "$ROOT_SPAN_ID" \
      --arg name "claude-code-session" \
      --arg timestamp "$TIMESTAMP" \
      --arg session_id "$SESSION_ID" \
      --arg agent_id "$AGENT_ID" \
      '{
        project_id: $project_id,
        trace_id: $trace_id,
        span_id: $span_id,
        parent_span_id: null,
        name: $name,
        kind: "server",
        span_type: "span",
        timestamp: $timestamp,
        status: "unset",
        attributes: {
          "claude_code.session_id": $session_id,
          "agent.id": $agent_id,
          "session.type": "claude-code"
        }
      }')"
    ;;

  PreToolUse)
    TOOL_USE_ID=$(echo "$INPUT" | jq -r '.tool_use_id // empty')
    if [[ -n "$TOOL_USE_ID" ]]; then
      # Store start timestamp for duration calculation
      now_ms > "$STATE_DIR/pre-$TOOL_USE_ID"
    fi
    ;;

  PostToolUse)
    TOOL_USE_ID=$(echo "$INPUT" | jq -r '.tool_use_id // empty')
    TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')

    # Ensure trace exists (lazy init if SessionStart was missed)
    ensure_trace
    TRACE_ID=$(cat "$TRACE_FILE")
    ROOT_SPAN_ID=$(cat "$ROOT_SPAN_ID_FILE" 2>/dev/null || echo "")

    # Calculate duration from PreToolUse
    DURATION_MS=0
    END_MS=$(now_ms)
    PRE_FILE="$STATE_DIR/pre-$TOOL_USE_ID"
    if [[ -f "$PRE_FILE" ]]; then
      START_MS=$(cat "$PRE_FILE")
      DURATION_MS=$(( END_MS - START_MS ))
      rm -f "$PRE_FILE"
    fi

    SPAN_ID=$(gen_uuid)
    TIMESTAMP=$(now_ts)

    # Extract and truncate tool input/output
    TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // empty' | head -c $MAX_FIELD_LEN)
    TOOL_OUTPUT=$(echo "$INPUT" | jq -r '.tool_response // .tool_output // empty' | head -c $MAX_FIELD_LEN)

    send_span "$(jq -n \
      --arg project_id "$PROJECT_ID" \
      --arg trace_id "$TRACE_ID" \
      --arg span_id "$SPAN_ID" \
      --arg parent_span_id "$ROOT_SPAN_ID" \
      --arg name "$TOOL_NAME" \
      --arg timestamp "$TIMESTAMP" \
      --argjson duration_ms "$DURATION_MS" \
      --arg tool_name "$TOOL_NAME" \
      --arg tool_input "$TOOL_INPUT" \
      --arg tool_output "$TOOL_OUTPUT" \
      --arg session_id "$SESSION_ID" \
      '{
        project_id: $project_id,
        trace_id: $trace_id,
        span_id: $span_id,
        parent_span_id: $parent_span_id,
        name: $name,
        kind: "client",
        span_type: "tool",
        timestamp: $timestamp,
        duration_ms: $duration_ms,
        status: "ok",
        tool_name: $tool_name,
        tool_input: $tool_input,
        tool_output: $tool_output,
        attributes: {
          "tool.name": $tool_name,
          "claude_code.session_id": $session_id
        }
      }')"
    ;;

  SubagentStart)
    ensure_trace
    TRACE_ID=$(cat "$TRACE_FILE")
    ROOT_SPAN_ID=$(cat "$ROOT_SPAN_ID_FILE" 2>/dev/null || echo "")

    SUBAGENT_TYPE=$(echo "$INPUT" | jq -r '.subagent_type // .agent_type // "subagent"')
    SUBAGENT_ID=$(echo "$INPUT" | jq -r '.subagent_id // empty')
    SPAN_ID=$(gen_uuid)
    TIMESTAMP=$(now_ts)

    # Persist subagent span_id for SubagentStop
    if [[ -n "$SUBAGENT_ID" ]]; then
      echo "$SPAN_ID" > "$STATE_DIR/subagent-$SUBAGENT_ID"
      echo "$(now_ms)" > "$STATE_DIR/subagent-start-$SUBAGENT_ID"
    fi

    send_span "$(jq -n \
      --arg project_id "$PROJECT_ID" \
      --arg trace_id "$TRACE_ID" \
      --arg span_id "$SPAN_ID" \
      --arg parent_span_id "$ROOT_SPAN_ID" \
      --arg name "subagent:$SUBAGENT_TYPE" \
      --arg timestamp "$TIMESTAMP" \
      --arg session_id "$SESSION_ID" \
      --arg subagent_type "$SUBAGENT_TYPE" \
      '{
        project_id: $project_id,
        trace_id: $trace_id,
        span_id: $span_id,
        parent_span_id: $parent_span_id,
        name: $name,
        kind: "client",
        span_type: "span",
        timestamp: $timestamp,
        status: "unset",
        attributes: {
          "subagent.type": $subagent_type,
          "claude_code.session_id": $session_id
        }
      }')"
    ;;

  Stop)
    if [[ ! -f "$TRACE_FILE" ]]; then
      exit 0
    fi
    TRACE_ID=$(cat "$TRACE_FILE")
    ROOT_SPAN_ID=$(cat "$ROOT_SPAN_ID_FILE" 2>/dev/null || echo "")

    TIMESTAMP=$(now_ts)
    STOP_REASON=$(echo "$INPUT" | jq -r '.stop_reason // "completed"')

    # Send a finalizing span to mark session end
    SPAN_ID=$(gen_uuid)
    send_span "$(jq -n \
      --arg project_id "$PROJECT_ID" \
      --arg trace_id "$TRACE_ID" \
      --arg span_id "$SPAN_ID" \
      --arg parent_span_id "$ROOT_SPAN_ID" \
      --arg name "session-end" \
      --arg timestamp "$TIMESTAMP" \
      --arg session_id "$SESSION_ID" \
      --arg stop_reason "$STOP_REASON" \
      '{
        project_id: $project_id,
        trace_id: $trace_id,
        span_id: $span_id,
        parent_span_id: $parent_span_id,
        name: $name,
        kind: "internal",
        span_type: "event",
        timestamp: $timestamp,
        duration_ms: 0,
        status: "ok",
        attributes: {
          "claude_code.session_id": $session_id,
          "session.stop_reason": $stop_reason
        }
      }')"

    # Parse conversation transcript and send as generation spans
    # Transcript JSONL lives at ~/.claude/projects/<project-slug>/<session_id>.jsonl
    if [[ "${NEON_TRACE_CONVERSATIONS:-true}" == "true" ]]; then
      SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
      # Search for the transcript file matching this session_id
      TRANSCRIPT=""
      for dir in "$HOME"/.claude/projects/*/; do
        if [[ -f "${dir}${SESSION_ID}.jsonl" ]]; then
          TRANSCRIPT="${dir}${SESSION_ID}.jsonl"
          break
        fi
      done

      if [[ -n "$TRANSCRIPT" ]]; then
        # Parse transcript and send conversation spans (background, fire-and-forget)
        (
          CONV_SPANS=$(python3 "$SCRIPT_DIR/claude-code-parse-transcript.py" \
            "$TRANSCRIPT" "$TRACE_ID" "$ROOT_SPAN_ID" "$PROJECT_ID" "$SESSION_ID" 2>/dev/null)
          if [[ -n "$CONV_SPANS" && "$CONV_SPANS" != "[]" ]]; then
            curl -s -X POST "$API_URL" \
              -H "Content-Type: application/json" \
              -H "x-project-id: $PROJECT_ID" \
              -d "$CONV_SPANS" \
              >/dev/null 2>&1
          fi
        ) &
      fi
    fi

    # Clean up state files
    rm -f "$TRACE_FILE" "$ROOT_SPAN_ID_FILE"
    rm -f "$STATE_DIR"/pre-* "$STATE_DIR"/subagent-*"$SESSION_ID"* 2>/dev/null || true
    ;;
esac

exit 0
