#!/bin/bash
# Git Worktree Manager for Neon Task Implementation
# Usage: wt <command> [args...]
#
# Commands:
#   list                    List all worktrees with status
#   create <task-id>        Create a new worktree for task
#   status <task-id>        Show worktree status
#   sync <task-id>          Sync with main branch
#   finish <task-id>        Finish task (commit, push, create PR)
#   remove <task-id>        Remove worktree
#   help                    Show this help
#
# Examples:
#   wt create SCR-001       # Create worktree for scorer task
#   wt list                 # List all worktrees
#   wt finish SCR-001       # Create PR for completed task
#   wt remove SCR-001       # Remove worktree after merge

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

show_help() {
    cat <<'EOF'
Git Worktree Manager for Neon Tasks

USAGE:
    wt <command> [arguments...]

COMMANDS:
    list                    List all worktrees with task status
    create <task-id>        Create worktree for a task
    status <task-id>        Show detailed worktree status
    sync <task-id>          Sync worktree with main
    finish <task-id>        Complete task and create PR
    remove <task-id>        Remove worktree
    ready                   Show tasks ready for work
    help                    Show this help

EXAMPLES:
    # Start working on a scorer task
    wt create SCR-001
    cd ../neon-task-SCR-001
    claude

    # Check status of all worktrees
    wt list

    # Sync with latest main
    wt sync SCR-001

    # Finish and create PR
    wt finish SCR-001

    # Clean up after merge
    wt remove SCR-001

TASK ID FORMAT:
    {PREFIX}-{NNN}

    Prefixes:
      FND - Foundation
      SCR - Scorers
      RUN - Runner/CLI
      API - API/Auth
      FRN - Frontend
      CCD - CI/CD
EOF
}

show_ready() {
    echo "=== Ready Tasks ==="
    echo ""

    if [[ ! -d "$PROJECT_DIR/tasks" ]]; then
        echo "No tasks found. Run /task-breakdown first."
        exit 0
    fi

    for task_file in "$PROJECT_DIR/tasks"/*.json; do
        if [[ -f "$task_file" ]]; then
            local task_id=$(basename "$task_file" .json)
            local status=$(jq -r '.status' "$task_file")
            local title=$(jq -r '.title' "$task_file")

            if [[ "$status" == "pending" || "$status" == "ready" ]]; then
                if check_dependencies "$task_id" 2>/dev/null; then
                    echo "  $task_id: $title"
                fi
            fi
        fi
    done
}

list_worktrees() {
    echo "=== Active Worktrees ==="
    echo ""

    cd "$REPO_ROOT"

    while IFS= read -r line; do
        if [[ "$line" =~ ^worktree ]]; then
            local path="${line#worktree }"

            if [[ "$path" == *"-task-"* ]]; then
                # Extract task ID from path
                local task_id=$(echo "$path" | sed 's/.*-task-//')
                local branch=$(git -C "$path" branch --show-current 2>/dev/null || echo "unknown")
                local ahead=$(git -C "$path" rev-list --count origin/main..HEAD 2>/dev/null || echo "?")
                local status=$(get_task_status "$task_id")

                echo "  $task_id"
                echo "    Path:   $path"
                echo "    Branch: $branch"
                echo "    Status: $status"
                echo "    Ahead:  $ahead commits"
                echo ""
            fi
        fi
    done < <(git worktree list --porcelain)
}

create_worktree() {
    local task_id="$1"

    if [[ -z "$task_id" ]]; then
        echo "Error: Task ID required"
        echo "Usage: wt create <task-id>"
        exit 1
    fi

    # Validate task exists
    if ! validate_task_id "$task_id"; then
        exit 1
    fi

    # Check dependencies
    if ! check_dependencies "$task_id"; then
        echo ""
        echo "Cannot start task with pending dependencies."
        echo "Complete the blocking tasks first."
        exit 1
    fi

    local worktree_path=$(get_worktree_path "$task_id")
    local branch_name=$(get_branch_name "$task_id")
    local task_file=$(get_task_file "$task_id")

    # Check if worktree already exists
    if [[ -d "$worktree_path" ]]; then
        echo "Worktree already exists: $worktree_path"
        echo ""
        echo "To resume work:"
        echo "  cd $worktree_path"
        exit 0
    fi

    # Create worktree
    cd "$REPO_ROOT"

    if git show-ref --verify --quiet "refs/heads/$branch_name"; then
        echo "Branch '$branch_name' exists. Checking out..."
        git worktree add "$worktree_path" "$branch_name"
    else
        echo "Creating branch '$branch_name' from main..."
        git worktree add -b "$branch_name" "$worktree_path" main
    fi

    # Update task status
    local now=$(date -Iseconds)
    jq --arg status "in_progress" \
       --arg started "$now" \
       --arg branch "$branch_name" \
       --arg path "$worktree_path" \
       '.status = $status | .started_at = $started | .worktree = {branch: $branch, path: $path, created_at: $started}' \
       "$task_file" > "${task_file}.tmp"
    mv "${task_file}.tmp" "$task_file"

    # Create task session file in worktree
    local title=$(jq -r '.title' "$task_file")
    local description=$(jq -r '.description // ""' "$task_file")
    jq '{
        task_id: .id,
        title: .title,
        started_at: .started_at,
        scope: .scope,
        acceptance_criteria: .acceptance_criteria,
        context: .context
    }' "$task_file" > "$worktree_path/.task-session.json"

    echo ""
    echo "=== Worktree Created ==="
    echo "Task:   $task_id - $title"
    echo "Path:   $worktree_path"
    echo "Branch: $branch_name"
    echo ""
    echo "To start working:"
    echo "  cd $worktree_path"
    echo "  claude"
    echo ""
    echo "When finished:"
    echo "  wt finish $task_id"
}

finish_worktree() {
    local task_id="$1"

    if [[ -z "$task_id" ]]; then
        echo "Error: Task ID required"
        exit 1
    fi

    local worktree_path=$(get_worktree_path "$task_id")
    local branch_name=$(get_branch_name "$task_id")
    local task_file=$(get_task_file "$task_id")

    if [[ ! -d "$worktree_path" ]]; then
        echo "Error: Worktree not found: $worktree_path"
        exit 1
    fi

    cd "$worktree_path"

    local title=$(jq -r '.title' "$task_file")

    # Check for uncommitted changes
    if [[ -n $(git status --porcelain) ]]; then
        echo "Uncommitted changes detected. Committing..."
        git add .
        git commit -m "$task_id: $title"
    fi

    # Push branch
    echo "Pushing to origin..."
    git push -u origin "$branch_name"

    # Create PR
    echo "Creating pull request..."
    local pr_url=$(gh pr create \
        --title "$task_id: $title" \
        --body "Task: $task_id

## Summary
$title

## Acceptance Criteria
$(jq -r '.acceptance_criteria[]? | "- [ ] \(.)"' "$task_file")

---
Generated by /task-complete" \
        --json url -q '.url' 2>/dev/null || echo "")

    if [[ -n "$pr_url" ]]; then
        local pr_number=$(echo "$pr_url" | grep -oE '[0-9]+$')

        # Update task file
        local now=$(date -Iseconds)
        jq --arg status "completed" \
           --arg completed "$now" \
           --arg pr_num "$pr_number" \
           --arg pr_url "$pr_url" \
           '.status = $status | .completed_at = $completed | .pr = {number: ($pr_num | tonumber), url: $pr_url, status: "open"}' \
           "$task_file" > "${task_file}.tmp"
        mv "${task_file}.tmp" "$task_file"

        echo ""
        echo "=== Task Completed ==="
        echo "PR: $pr_url"
    else
        echo "Warning: Could not create PR (gh cli issue?)"
        update_task_status "$task_id" "completed"
    fi
}

remove_worktree() {
    local task_id="$1"
    local force=""

    if [[ "$2" == "-f" || "$2" == "--force" ]]; then
        force="--force"
    fi

    if [[ -z "$task_id" ]]; then
        echo "Error: Task ID required"
        exit 1
    fi

    local worktree_path=$(get_worktree_path "$task_id")
    local branch_name=$(get_branch_name "$task_id")

    if [[ ! -d "$worktree_path" ]]; then
        echo "Worktree not found: $worktree_path"
        exit 1
    fi

    cd "$REPO_ROOT"

    echo "Removing worktree: $worktree_path"
    git worktree remove $force "$worktree_path"

    echo "Deleting branch: $branch_name"
    git branch -d "$branch_name" 2>/dev/null || git branch -D "$branch_name" 2>/dev/null || true

    echo "Done."
}

sync_worktree() {
    local task_id="$1"

    if [[ -z "$task_id" ]]; then
        echo "Error: Task ID required"
        exit 1
    fi

    local worktree_path=$(get_worktree_path "$task_id")

    if [[ ! -d "$worktree_path" ]]; then
        echo "Error: Worktree not found: $worktree_path"
        exit 1
    fi

    cd "$worktree_path"

    echo "Fetching latest from origin..."
    git fetch origin main

    echo "Rebasing onto main..."
    git rebase origin/main

    echo "Done."
}

status_worktree() {
    local task_id="$1"

    if [[ -z "$task_id" ]]; then
        echo "Error: Task ID required"
        exit 1
    fi

    local worktree_path=$(get_worktree_path "$task_id")
    local task_file=$(get_task_file "$task_id")

    if [[ -f "$task_file" ]]; then
        echo "=== Task: $task_id ==="
        jq -r '"Title: \(.title)\nStatus: \(.status)\nPhase: \(.phase_id)"' "$task_file"
        echo ""
    fi

    if [[ -d "$worktree_path" ]]; then
        echo "=== Worktree ==="
        echo "Path: $worktree_path"
        cd "$worktree_path"
        echo "Branch: $(git branch --show-current)"
        echo "Commits ahead: $(git rev-list --count origin/main..HEAD 2>/dev/null || echo '?')"
        echo ""
        echo "=== Git Status ==="
        git status --short
    else
        echo "No worktree found for this task."
    fi
}

# Main command dispatcher
COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
    list|ls)
        list_worktrees
        ;;
    create|new)
        create_worktree "$@"
        ;;
    status|st)
        status_worktree "$@"
        ;;
    sync)
        sync_worktree "$@"
        ;;
    finish|done)
        finish_worktree "$@"
        ;;
    remove|rm)
        remove_worktree "$@"
        ;;
    ready)
        show_ready
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: $COMMAND"
        echo "Run 'wt help' for usage."
        exit 1
        ;;
esac
