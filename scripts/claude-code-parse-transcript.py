#!/usr/bin/env python3
"""
Parse a Claude Code session transcript JSONL and emit conversation turns
as Neon span records (JSON array) to stdout.

Usage:
  python3 claude-code-parse-transcript.py <jsonl_path> <trace_id> <root_span_id> <project_id> <session_id>

Each user→assistant exchange becomes a "generation" span with:
  - input: user message text
  - output: assistant message text (tool_use blocks summarized)
  - model: from assistant message
  - attributes: turn number, has_tool_use, tool_names used
"""

import json
import sys
import uuid
from datetime import datetime, timezone

MAX_FIELD = 5000  # Larger than tool spans since conversation context is the point

def extract_text(content):
    """Extract readable text from message content."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if block.get("type") == "text":
                parts.append(block["text"])
            elif block.get("type") == "tool_use":
                name = block.get("name", "?")
                inp = block.get("input", {})
                # Summarize tool call compactly
                if isinstance(inp, dict):
                    summary = ", ".join(f"{k}={str(v)[:80]}" for k, v in list(inp.items())[:3])
                else:
                    summary = str(inp)[:120]
                parts.append(f"[tool_use: {name}({summary})]")
            elif block.get("type") == "tool_result":
                content_val = block.get("content", "")
                if isinstance(content_val, list):
                    text = " ".join(b.get("text", "") for b in content_val if b.get("type") == "text")
                else:
                    text = str(content_val)
                parts.append(f"[tool_result: {text[:200]}]")
        return "\n".join(parts)
    return str(content)


def get_tool_names(content):
    """Extract tool names from assistant content blocks."""
    if not isinstance(content, list):
        return []
    return [b["name"] for b in content if b.get("type") == "tool_use"]


def main():
    if len(sys.argv) != 6:
        print("[]")
        return

    jsonl_path, trace_id, root_span_id, project_id, session_id = sys.argv[1:6]

    # Parse transcript
    messages = []
    try:
        with open(jsonl_path) as f:
            for line in f:
                obj = json.loads(line.strip())
                msg_type = obj.get("type")
                if msg_type in ("user", "assistant"):
                    messages.append(obj)
    except (FileNotFoundError, json.JSONDecodeError):
        print("[]")
        return

    if not messages:
        print("[]")
        return

    # Group into user→assistant conversation turns
    spans = []
    turn_num = 0
    i = 0
    while i < len(messages):
        msg = messages[i]

        if msg.get("type") == "user":
            user_msg = msg
            # Collect all assistant responses until next user message
            assistant_parts = []
            model = ""
            all_tool_names = []
            j = i + 1
            while j < len(messages) and messages[j].get("type") == "assistant":
                asst = messages[j]
                asst_msg = asst.get("message", {})
                content = asst_msg.get("content", [])
                assistant_parts.append(extract_text(content))
                all_tool_names.extend(get_tool_names(content))
                if not model:
                    model = asst_msg.get("model", "")
                j += 1

            turn_num += 1
            user_text = extract_text(user_msg.get("message", {}).get("content", ""))
            assistant_text = "\n---\n".join(assistant_parts) if assistant_parts else ""

            # Truncate
            user_text = user_text[:MAX_FIELD]
            assistant_text = assistant_text[:MAX_FIELD]

            span = {
                "project_id": project_id,
                "trace_id": trace_id,
                "span_id": str(uuid.uuid4()),
                "parent_span_id": root_span_id,
                "name": f"turn-{turn_num}",
                "kind": "internal",
                "span_type": "generation",
                "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
                "status": "ok",
                "model": model,
                "input": user_text,
                "output": assistant_text,
                "attributes": {
                    "claude_code.session_id": session_id,
                    "conversation.turn": str(turn_num),
                    "conversation.has_tool_use": str(bool(all_tool_names)).lower(),
                    "conversation.tool_names": ",".join(sorted(set(all_tool_names))),
                    "conversation.tool_count": str(len(all_tool_names)),
                },
            }
            spans.append(span)
            i = j
        else:
            i += 1

    json.dump(spans, sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    main()
