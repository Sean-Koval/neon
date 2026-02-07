#!/usr/bin/env bash
# ClickHouse Restore Script for Neon Platform
#
# Restores from a backup created by clickhouse-backup.sh.
# Supports restoring from local directory or GCS.
#
# Usage:
#   ./restore-clickhouse.sh <backup-name> [--source local|gcs] [--tables traces,spans]
#   ./restore-clickhouse.sh full_20250101_120000
#   ./restore-clickhouse.sh full_20250101_120000 --source gcs --tables traces,scores
#
# Environment:
#   CLICKHOUSE_HOST       - ClickHouse host (default: localhost)
#   CLICKHOUSE_PORT       - HTTP port (default: 8123)
#   CLICKHOUSE_USER       - Username (default: default)
#   CLICKHOUSE_PASSWORD   - Password (default: empty)
#   CLICKHOUSE_DATABASE   - Database (default: neon)
#   BACKUP_DIR            - Local backup directory (default: /var/backups/clickhouse)
#   GCS_BUCKET            - GCS bucket for remote backups

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CLICKHOUSE_HOST="${CLICKHOUSE_HOST:-localhost}"
CLICKHOUSE_PORT="${CLICKHOUSE_PORT:-8123}"
CLICKHOUSE_USER="${CLICKHOUSE_USER:-default}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-}"
CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-neon}"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/clickhouse}"
GCS_BUCKET="${GCS_BUCKET:-}"
SOURCE="local"
RESTORE_TABLES=""
BACKUP_NAME=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
error() { log "ERROR: $*" >&2; }
die() { error "$@"; exit 1; }

ch_query() {
  local query="$1"
  local auth_args=()
  [[ -n "$CLICKHOUSE_USER" ]] && auth_args+=(--user "$CLICKHOUSE_USER")
  [[ -n "$CLICKHOUSE_PASSWORD" ]] && auth_args+=(--password "$CLICKHOUSE_PASSWORD")

  curl -sS "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/" \
    "${auth_args[@]}" \
    --data-binary "$query" 2>&1
}

ch_insert_native() {
  local table="$1"
  local auth_args=()
  [[ -n "$CLICKHOUSE_USER" ]] && auth_args+=(--user "$CLICKHOUSE_USER")
  [[ -n "$CLICKHOUSE_PASSWORD" ]] && auth_args+=(--password "$CLICKHOUSE_PASSWORD")

  curl -sS "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/?query=INSERT+INTO+${table}+FORMAT+Native" \
    "${auth_args[@]}" \
    --data-binary @- 2>&1
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
if [[ $# -lt 1 ]]; then
  die "Usage: $0 <backup-name> [--source local|gcs] [--tables traces,spans,scores]"
fi

BACKUP_NAME="$1"
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --tables)
      RESTORE_TABLES="$2"
      shift 2
      ;;
    --help|-h)
      head -18 "$0" | tail -14
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Determine tables to restore
# ---------------------------------------------------------------------------
if [[ -n "$RESTORE_TABLES" ]]; then
  IFS=',' read -ra TABLES <<< "$RESTORE_TABLES"
else
  TABLES=("traces" "spans" "scores" "prompts")
fi

# ---------------------------------------------------------------------------
# Download from GCS if needed
# ---------------------------------------------------------------------------
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

if [[ "$SOURCE" == "gcs" ]]; then
  if [[ -z "$GCS_BUCKET" ]]; then
    die "GCS_BUCKET must be set when source=gcs"
  fi
  BACKUP_PATH="/tmp/ch_restore_$$"
  mkdir -p "$BACKUP_PATH"
  log "Downloading backup from gs://$GCS_BUCKET/clickhouse/$BACKUP_NAME/ ..."
  gsutil -m cp "gs://$GCS_BUCKET/clickhouse/$BACKUP_NAME/*" "$BACKUP_PATH/"
  log "Download complete"
fi

# ---------------------------------------------------------------------------
# Validate backup
# ---------------------------------------------------------------------------
if [[ ! -d "$BACKUP_PATH" ]]; then
  die "Backup directory not found: $BACKUP_PATH"
fi

if [[ ! -f "$BACKUP_PATH/manifest.json" ]]; then
  die "No manifest.json found in $BACKUP_PATH"
fi

log "Restore manifest:"
cat "$BACKUP_PATH/manifest.json"
echo

# ---------------------------------------------------------------------------
# Confirmation
# ---------------------------------------------------------------------------
log "WARNING: This will INSERT data into the following tables:"
for table in "${TABLES[@]}"; do
  log "  - ${CLICKHOUSE_DATABASE}.${table}"
done
log ""
log "Target: ${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}"

if [[ -t 0 ]]; then
  read -rp "Continue? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    log "Aborted"
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# Restore tables
# ---------------------------------------------------------------------------
errors=0
for table in "${TABLES[@]}"; do
  fqn="${CLICKHOUSE_DATABASE}.${table}"
  dump_file="$BACKUP_PATH/${fqn}.native.gz"

  if [[ ! -f "$dump_file" ]]; then
    error "Dump file not found: $dump_file (skipping)"
    ((errors++))
    continue
  fi

  log "Restoring $fqn ..."
  before_count=$(ch_query "SELECT count() FROM ${fqn}" | tr -d '[:space:]')

  gunzip -c "$dump_file" | ch_insert_native "$fqn"

  after_count=$(ch_query "SELECT count() FROM ${fqn}" | tr -d '[:space:]')
  inserted=$((after_count - before_count))
  log "  Rows before: $before_count, after: $after_count (+$inserted)"
done

# ---------------------------------------------------------------------------
# Cleanup temp files
# ---------------------------------------------------------------------------
if [[ "$SOURCE" == "gcs" ]]; then
  rm -rf "$BACKUP_PATH"
  log "Cleaned up temp files"
fi

if [[ $errors -gt 0 ]]; then
  die "Restore completed with $errors error(s)"
fi

log "Restore complete from backup: $BACKUP_NAME"
