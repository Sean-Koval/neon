#!/usr/bin/env bash
# =============================================================================
# Neon Quickstart Demo
#
# One-command setup to run a LangChain agent streaming traces to the
# Neon dashboard with full observability.
#
# Usage:
#   ./demo/demo.sh              # Start everything + run demo agent
#   ./demo/demo.sh --local      # Infra in Docker, frontend locally
#   ./demo/demo.sh --stop       # Stop all services
#   ./demo/demo.sh --status     # Check service status
#
# Prerequisites:
#   - Docker & Docker Compose
#   - At least one LLM API key (OPENAI_API_KEY or ANTHROPIC_API_KEY)
#
# Optional (for --local mode):
#   - Bun (bun.sh)
#   - Python 3.11+ with uv
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Default values
MODE="docker"         # docker | local
AGENT_MODEL="gemini-2.5-flash"
AGENT_QUERIES=6
SKIP_AGENT=false

# =============================================================================
# Helpers
# =============================================================================

log()    { echo -e "${BLUE}[neon]${NC} $*"; }
ok()     { echo -e "${GREEN}  ✓${NC} $*"; }
warn()   { echo -e "${YELLOW}  ⚠${NC} $*"; }
err()    { echo -e "${RED}  ✗${NC} $*"; }
header() { echo -e "\n${BOLD}${CYAN}$*${NC}\n"; }

check_command() {
    if command -v "$1" &>/dev/null; then
        ok "$1 found"
        return 0
    else
        err "$1 not found"
        return 1
    fi
}

wait_for_url() {
    local url="$1" name="$2" max_wait="${3:-60}"
    local elapsed=0

    while [ $elapsed -lt $max_wait ]; do
        if curl -sf "$url" >/dev/null 2>&1; then
            ok "$name is ready"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    err "$name not ready after ${max_wait}s"
    return 1
}

# =============================================================================
# Commands
# =============================================================================

cmd_stop() {
    header "Stopping Neon services..."
    cd "$PROJECT_ROOT"
    docker compose -f docker-compose.yml -f demo/docker-compose.demo.yml down 2>/dev/null || true
    docker compose down 2>/dev/null || true
    ok "All services stopped"
}

cmd_status() {
    header "Neon Service Status"
    cd "$PROJECT_ROOT"
    docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "No services running"

    echo ""
    echo -e "${BOLD}Endpoints:${NC}"
    echo "  Dashboard:    http://localhost:3000"
    echo "  Temporal UI:  http://localhost:8080"
    echo "  ClickHouse:   http://localhost:8123"
    echo "  OTel HTTP:    http://localhost:4318"
}

cmd_start_docker() {
    header "Starting Neon Platform (Full Docker)"

    cd "$PROJECT_ROOT"

    # Check for .env file
    if [ ! -f .env ]; then
        log "Creating .env from .env.example..."
        cp .env.example .env
        warn "Edit .env to add your API keys (OPENAI_API_KEY or ANTHROPIC_API_KEY)"
    fi

    # Check for LLM API key
    source .env 2>/dev/null || true
    if [ -z "${OPENAI_API_KEY:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
        warn "No LLM API key found in .env"
        echo "  The demo agent needs an API key to call an LLM."
        echo "  Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env"
        echo ""

        # Try to read from environment
        if [ -n "${OPENAI_API_KEY:-}" ]; then
            ok "Found OPENAI_API_KEY in environment"
        elif [ -n "${ANTHROPIC_API_KEY:-}" ]; then
            ok "Found ANTHROPIC_API_KEY in environment"
        fi
    fi

    # Start all services with demo overlay
    log "Starting infrastructure services..."
    docker compose -f docker-compose.yml -f demo/docker-compose.demo.yml up -d \
        clickhouse postgres temporal otel-collector redpanda

    # Wait for core services
    log "Waiting for services to be healthy..."
    wait_for_url "http://localhost:8123/ping" "ClickHouse" 30
    wait_for_url "http://localhost:13133" "OTel Collector" 30

    # Start web frontend with auth bypass
    log "Starting web frontend (with auth bypass)..."
    docker compose -f docker-compose.yml -f demo/docker-compose.demo.yml up -d web temporal-ui

    # Wait for web
    wait_for_url "http://localhost:3000" "Dashboard" 60

    ok "All services running!"
}

cmd_start_local() {
    header "Starting Neon Platform (Local Frontend)"

    cd "$PROJECT_ROOT"

    # Start infra only
    log "Starting infrastructure in Docker..."
    docker compose up -d clickhouse postgres temporal temporal-ui otel-collector redpanda

    log "Waiting for services to be healthy..."
    wait_for_url "http://localhost:8123/ping" "ClickHouse" 30
    wait_for_url "http://localhost:13133" "OTel Collector" 30

    # Set up local env
    if [ ! -f frontend/.env.local ]; then
        log "Creating frontend/.env.local..."
        cat > frontend/.env.local <<'ENVEOF'
AUTH_DEV_BYPASS=true
DEV_WORKSPACE_ID=00000000-0000-0000-0000-000000000001
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_DATABASE=neon
DATABASE_URL=postgresql://neon:neon@localhost:5432/neon
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=agent-workers
NEXT_PUBLIC_API_URL=http://localhost:3000
ENVEOF
        ok "Created frontend/.env.local"
    fi

    # Start frontend in background
    log "Starting Next.js frontend (bun dev)..."
    cd "$PROJECT_ROOT/frontend"
    bun dev &
    FRONTEND_PID=$!
    cd "$PROJECT_ROOT"

    wait_for_url "http://localhost:3000" "Frontend" 30

    ok "Frontend running (PID: $FRONTEND_PID)"
    echo "  Stop with: kill $FRONTEND_PID"
}

cmd_run_agent() {
    header "Running Demo Agent"

    cd "$PROJECT_ROOT/examples/langgraph-agent"

    # Install dependencies if needed
    if [ ! -d ".venv" ]; then
        log "Setting up Python virtual environment..."
        python3 -m venv .venv
        source .venv/bin/activate
        pip install -q -e "." 2>/dev/null || pip install -e "."
    else
        source .venv/bin/activate
    fi

    # Determine model from available keys
    if [ -n "${OPENAI_API_KEY:-}" ]; then
        AGENT_MODEL="${AGENT_MODEL:-gpt-4o-mini}"
        ok "Using OpenAI ($AGENT_MODEL)"
    elif [ -n "${ANTHROPIC_API_KEY:-}" ]; then
        AGENT_MODEL="claude-sonnet-4-5-20250929"
        ok "Using Anthropic ($AGENT_MODEL)"
    else
        warn "No API key found — agent may fail. Set OPENAI_API_KEY or ANTHROPIC_API_KEY."
    fi

    export NEON_API_URL="${NEON_API_URL:-http://localhost:3000}"
    export NEON_PROJECT_ID="${NEON_PROJECT_ID:-00000000-0000-0000-0000-000000000001}"

    log "Sending traces to $NEON_API_URL"
    log "Running $AGENT_QUERIES demo queries..."
    echo ""

    python run_demo.py --model "$AGENT_MODEL" --count "$AGENT_QUERIES" --delay 2

    deactivate 2>/dev/null || true
}

cmd_run() {
    header "╔══════════════════════════════════════╗"
    echo -e "${BOLD}${CYAN}║     Neon Agent Evaluation Platform    ║${NC}"
    echo -e "${BOLD}${CYAN}║          Quickstart Demo              ║${NC}"
    echo -e "${BOLD}${CYAN}╚══════════════════════════════════════╝${NC}"

    # Prerequisites
    header "Checking Prerequisites"
    check_command docker

    if docker compose version &>/dev/null; then
        ok "docker compose found"
    elif command -v docker-compose &>/dev/null; then
        ok "docker-compose found"
    else
        err "docker compose not found"
        exit 1
    fi

    check_command python3

    if [ "$MODE" = "local" ]; then
        check_command bun
    fi

    # Start platform
    if [ "$MODE" = "docker" ]; then
        cmd_start_docker
    else
        cmd_start_local
    fi

    # Run agent
    if [ "$SKIP_AGENT" = false ]; then
        cmd_run_agent
    fi

    # Summary
    header "Demo Complete!"
    echo -e "  ${BOLD}Dashboard:${NC}    http://localhost:3000"
    echo -e "  ${BOLD}Traces:${NC}       http://localhost:3000/traces"
    echo -e "  ${BOLD}Analytics:${NC}    http://localhost:3000/analytics"
    echo -e "  ${BOLD}Alerts:${NC}       http://localhost:3000/alerts"
    echo -e "  ${BOLD}Temporal UI:${NC}  http://localhost:8080"
    echo ""
    echo -e "  ${GREEN}Open http://localhost:3000/traces to see your agent traces!${NC}"
    echo ""
    echo "  Stop services:  ./demo/demo.sh --stop"
    echo "  Re-run agent:   cd examples/langgraph-agent && source .venv/bin/activate && python run_demo.py"
    echo ""
}

# =============================================================================
# CLI
# =============================================================================

usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --local        Run frontend locally (not in Docker)"
    echo "  --stop         Stop all services"
    echo "  --status       Show service status"
    echo "  --model NAME   LLM model to use (default: gpt-4o-mini)"
    echo "  --count N      Number of demo queries (default: 6)"
    echo "  --skip-agent   Start platform without running agent"
    echo "  -h, --help     Show this help"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --local)     MODE="local"; shift ;;
        --stop)      cmd_stop; exit 0 ;;
        --status)    cmd_status; exit 0 ;;
        --model)     AGENT_MODEL="$2"; shift 2 ;;
        --count)     AGENT_QUERIES="$2"; shift 2 ;;
        --skip-agent) SKIP_AGENT=true; shift ;;
        -h|--help)   usage; exit 0 ;;
        *)           err "Unknown option: $1"; usage; exit 1 ;;
    esac
done

cmd_run
