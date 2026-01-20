#!/bin/bash
# Worktree Management Configuration for Neon
# Adapted from context-engineering

# Base directory for worktrees (sibling to main repo)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_NAME="$(basename "$REPO_ROOT")"
WORKTREE_BASE="$(dirname "$REPO_ROOT")"

# Naming convention: {repo}-task-{task-id}
# Example: neon-task-SCR-001

# Session registry file (tracks active worktrees)
SESSION_REGISTRY="$REPO_ROOT/.worktree-sessions.json"

# Project files
PROJECT_DIR="$REPO_ROOT/.project"
TASK_INDEX="$PROJECT_DIR/task-index.json"
STATE_FILE="$PROJECT_DIR/state.json"

get_worktree_path() {
    local task_id="$1"
    echo "${WORKTREE_BASE}/${REPO_NAME}-task-${task_id}"
}

get_branch_name() {
    local task_id="$1"
    echo "task/${task_id}"
}

get_task_file() {
    local task_id="$1"
    echo "${PROJECT_DIR}/tasks/${task_id}.json"
}

validate_task_id() {
    local task_id="$1"
    local task_file=$(get_task_file "$task_id")

    if [[ ! -f "$task_file" ]]; then
        echo "Error: Task file not found: $task_file"
        return 1
    fi
    return 0
}

get_task_status() {
    local task_id="$1"
    local task_file=$(get_task_file "$task_id")

    if [[ -f "$task_file" ]]; then
        jq -r '.status' "$task_file"
    else
        echo "unknown"
    fi
}

update_task_status() {
    local task_id="$1"
    local new_status="$2"
    local task_file=$(get_task_file "$task_id")

    if [[ -f "$task_file" ]]; then
        jq --arg status "$new_status" '.status = $status' "$task_file" > "${task_file}.tmp"
        mv "${task_file}.tmp" "$task_file"
    fi
}

check_dependencies() {
    local task_id="$1"
    local task_file=$(get_task_file "$task_id")

    if [[ ! -f "$task_file" ]]; then
        return 1
    fi

    local blocked_by=$(jq -r '.dependencies.blocked_by[]? // empty' "$task_file")

    for dep in $blocked_by; do
        local dep_status=$(get_task_status "$dep")
        if [[ "$dep_status" != "completed" ]]; then
            echo "Blocked by: $dep ($dep_status)"
            return 1
        fi
    done

    return 0
}
