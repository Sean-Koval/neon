#!/usr/bin/env bash
# Scheduled backup loop for self-hosted Docker Compose deployments.
#
# Usage:
#   ./backup-loop.sh clickhouse
#   ./backup-loop.sh postgres
#   ./backup-loop.sh checkpoints
#
# Environment:
#   BACKUP_INTERVAL_SECONDS          - Interval between backup attempts
#   BACKUP_RUN_ON_STARTUP           - Run immediately on container startup
#   BACKUP_TARGET                   - local|gcs
#   BACKUP_ROOT                     - Root directory for persisted backups
#   CLICKHOUSE_FULL_BACKUP_DAY      - 0-6 (Sunday-Saturday) for weekly full backup
#   CLICKHOUSE_BACKUP_DIR           - Override ClickHouse backup directory
#   POSTGRES_BACKUP_DIR             - Override PostgreSQL backup directory
#   CHECKPOINT_BACKUP_DIR           - Override checkpoint backup directory

set -euo pipefail

MODE="${1:-}"

if [[ -z "$MODE" ]]; then
  echo "Usage: $0 <clickhouse|postgres>" >&2
  exit 1
fi

BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
BACKUP_RUN_ON_STARTUP="${BACKUP_RUN_ON_STARTUP:-true}"
BACKUP_TARGET="${BACKUP_TARGET:-local}"
BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
CLICKHOUSE_FULL_BACKUP_DAY="${CLICKHOUSE_FULL_BACKUP_DAY:-0}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
die() { log "ERROR: $*" >&2; exit 1; }

mkdir -p "$BACKUP_ROOT"

case "$MODE" in
  clickhouse)
    SCRIPT_PATH="/scripts/backup/clickhouse-backup.sh"
    STATE_FILE="${BACKUP_ROOT}/.clickhouse-last-run"
    BACKUP_SUBDIR="${CLICKHOUSE_BACKUP_DIR:-${BACKUP_ROOT}/clickhouse}"
    ;;
  postgres)
    SCRIPT_PATH="/scripts/backup/postgres-backup.sh"
    STATE_FILE="${BACKUP_ROOT}/.postgres-last-run"
    BACKUP_SUBDIR="${POSTGRES_BACKUP_DIR:-${BACKUP_ROOT}/postgres}"
    ;;
  checkpoints)
    SCRIPT_PATH="/scripts/backup/checkpoint-backup.sh"
    STATE_FILE="${BACKUP_ROOT}/.checkpoints-last-run"
    BACKUP_SUBDIR="${CHECKPOINT_BACKUP_DIR:-${BACKUP_ROOT}/checkpoints}"
    ;;
  *)
    die "Unknown mode: $MODE"
    ;;
esac

mkdir -p "$BACKUP_SUBDIR"

run_backup() {
  log "Starting scheduled ${MODE} backup"

  case "$MODE" in
    clickhouse)
      local backup_type="incremental"
      if [[ "$(date -u +%w)" == "$CLICKHOUSE_FULL_BACKUP_DAY" ]]; then
        backup_type="full"
      fi

      BACKUP_DIR="$BACKUP_SUBDIR" \
        "$SCRIPT_PATH" --type "$backup_type" --target "$BACKUP_TARGET"
      ;;
    postgres)
      BACKUP_DIR="$BACKUP_SUBDIR" \
        "$SCRIPT_PATH" --target "$BACKUP_TARGET"
      ;;
    checkpoints)
      BACKUP_DIR="$BACKUP_SUBDIR" \
        "$SCRIPT_PATH" --target "$BACKUP_TARGET"
      ;;
  esac

  date -u +%s > "$STATE_FILE"
  log "Finished scheduled ${MODE} backup"
}

read_last_run() {
  if [[ -f "$STATE_FILE" ]]; then
    cat "$STATE_FILE"
  else
    echo 0
  fi
}

if [[ "$BACKUP_RUN_ON_STARTUP" == "true" ]]; then
  run_backup
else
  log "Skipping immediate ${MODE} backup on startup"
fi

while true; do
  now="$(date -u +%s)"
  last_run="$(read_last_run)"
  elapsed=$((now - last_run))

  if (( elapsed >= BACKUP_INTERVAL_SECONDS )); then
    run_backup
    continue
  fi

  sleep_for=$((BACKUP_INTERVAL_SECONDS - elapsed))
  log "Next ${MODE} backup in ${sleep_for}s"
  sleep "$sleep_for"
done
