#!/usr/bin/env bash
# ClickHouse Backup Script for Neon Platform
#
# Supports full and incremental backups to local directory or GCS bucket.
# Tables: neon.traces, neon.spans, neon.scores, neon.prompts
#
# Usage:
#   ./clickhouse-backup.sh [--type full|incremental] [--target local|gcs]
#   ./clickhouse-backup.sh --verify <backup-name>
#
# Environment:
#   CLICKHOUSE_HOST       - ClickHouse host (default: localhost)
#   CLICKHOUSE_PORT       - HTTP port (default: 8123)
#   CLICKHOUSE_USER       - Username (default: default)
#   CLICKHOUSE_PASSWORD   - Password (default: empty)
#   CLICKHOUSE_DATABASE   - Database (default: neon)
#   BACKUP_DIR            - Local backup directory (default: /var/backups/clickhouse)
#   GCS_BUCKET            - GCS bucket for remote backups
#   RETENTION_DAYS        - Days to keep backups (default: 30)

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
RETENTION_DAYS="${RETENTION_DAYS:-30}"

TABLES=("traces" "spans" "scores" "prompts")
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
BACKUP_TYPE="full"
TARGET="local"
VERIFY_BACKUP=""

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

ch_health_check() {
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/ping")
  [[ "$status" == "200" ]]
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --type)
      BACKUP_TYPE="$2"
      shift 2
      ;;
    --target)
      TARGET="$2"
      shift 2
      ;;
    --verify)
      VERIFY_BACKUP="$2"
      shift 2
      ;;
    --help|-h)
      head -20 "$0" | tail -15
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Verify mode
# ---------------------------------------------------------------------------
if [[ -n "$VERIFY_BACKUP" ]]; then
  log "Verifying backup: $VERIFY_BACKUP"
  backup_path="$BACKUP_DIR/$VERIFY_BACKUP"

  if [[ "$TARGET" == "gcs" && -n "$GCS_BUCKET" ]]; then
    log "Checking GCS backup at gs://$GCS_BUCKET/clickhouse/$VERIFY_BACKUP/"
    if ! gsutil ls "gs://$GCS_BUCKET/clickhouse/$VERIFY_BACKUP/" > /dev/null 2>&1; then
      die "Backup not found in GCS"
    fi
    # Download manifest for verification
    gsutil cp "gs://$GCS_BUCKET/clickhouse/$VERIFY_BACKUP/manifest.json" /tmp/manifest_verify.json
    backup_path="/tmp"
  fi

  if [[ ! -f "$backup_path/manifest.json" && -f "/tmp/manifest_verify.json" ]]; then
    manifest="/tmp/manifest_verify.json"
  elif [[ -f "$backup_path/manifest.json" ]]; then
    manifest="$backup_path/manifest.json"
  else
    die "No manifest.json found in backup"
  fi

  log "Manifest contents:"
  cat "$manifest"

  # Verify each table dump exists
  errors=0
  for table in "${TABLES[@]}"; do
    expected_file="$backup_path/${CLICKHOUSE_DATABASE}.${table}.native.gz"
    if [[ "$TARGET" == "gcs" ]]; then
      if ! gsutil ls "gs://$GCS_BUCKET/clickhouse/$VERIFY_BACKUP/${CLICKHOUSE_DATABASE}.${table}.native.gz" > /dev/null 2>&1; then
        error "Missing table dump: $table"
        ((errors++))
      else
        log "  OK: $table"
      fi
    else
      if [[ ! -f "$expected_file" ]]; then
        error "Missing table dump: $expected_file"
        ((errors++))
      else
        size=$(stat -c %s "$expected_file" 2>/dev/null || stat -f %z "$expected_file" 2>/dev/null)
        log "  OK: $table ($size bytes)"
      fi
    fi
  done

  if [[ $errors -gt 0 ]]; then
    die "Verification failed: $errors missing table(s)"
  fi
  log "Verification passed"
  exit 0
fi

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
log "Starting ClickHouse $BACKUP_TYPE backup (target: $TARGET)"

if ! ch_health_check; then
  die "ClickHouse is not responding at $CLICKHOUSE_HOST:$CLICKHOUSE_PORT"
fi

if [[ "$TARGET" == "gcs" && -z "$GCS_BUCKET" ]]; then
  die "GCS_BUCKET must be set when target=gcs"
fi

if [[ "$TARGET" == "gcs" ]] && ! command -v gsutil &> /dev/null; then
  die "gsutil not found. Install Google Cloud SDK."
fi

BACKUP_NAME="${BACKUP_TYPE}_${TIMESTAMP}"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
mkdir -p "$BACKUP_PATH"

# ---------------------------------------------------------------------------
# Full backup
# ---------------------------------------------------------------------------
do_full_backup() {
  log "Running full backup to $BACKUP_PATH"

  for table in "${TABLES[@]}"; do
    local fqn="${CLICKHOUSE_DATABASE}.${table}"
    local outfile="$BACKUP_PATH/${fqn}.native.gz"

    log "  Backing up $fqn ..."
    row_count=$(ch_query "SELECT count() FROM ${fqn}" | tr -d '[:space:]')
    log "    Row count: $row_count"

    ch_query "SELECT * FROM ${fqn} FORMAT Native" | gzip > "$outfile"

    compressed_size=$(stat -c %s "$outfile" 2>/dev/null || stat -f %z "$outfile" 2>/dev/null)
    log "    Compressed size: $compressed_size bytes"
  done
}

# ---------------------------------------------------------------------------
# Incremental backup (backs up only recent partitions)
# ---------------------------------------------------------------------------
do_incremental_backup() {
  log "Running incremental backup to $BACKUP_PATH"

  # Find the most recent full backup for reference
  local last_full
  last_full=$(ls -1d "$BACKUP_DIR"/full_* 2>/dev/null | sort -r | head -1 || true)

  if [[ -z "$last_full" ]]; then
    log "No previous full backup found - performing full backup instead"
    BACKUP_TYPE="full"
    do_full_backup
    return
  fi

  local last_date
  last_date=$(basename "$last_full" | sed 's/full_//' | cut -d_ -f1)
  local since_date="${last_date:0:4}-${last_date:4:2}-${last_date:6:2}"
  log "  Incremental since: $since_date (from $last_full)"

  for table in "${TABLES[@]}"; do
    local fqn="${CLICKHOUSE_DATABASE}.${table}"
    local outfile="$BACKUP_PATH/${fqn}.native.gz"

    # Use the _date materialized column for efficient partition pruning
    local date_col="_date"
    if [[ "$table" == "prompts" ]]; then
      date_col="toDate(created_at)"
    fi

    log "  Backing up $fqn (since $since_date) ..."
    row_count=$(ch_query "SELECT count() FROM ${fqn} WHERE ${date_col} >= '${since_date}'" | tr -d '[:space:]')
    log "    Row count: $row_count"

    ch_query "SELECT * FROM ${fqn} WHERE ${date_col} >= '${since_date}' FORMAT Native" | gzip > "$outfile"

    compressed_size=$(stat -c %s "$outfile" 2>/dev/null || stat -f %z "$outfile" 2>/dev/null)
    log "    Compressed size: $compressed_size bytes"
  done
}

# ---------------------------------------------------------------------------
# Execute backup
# ---------------------------------------------------------------------------
case "$BACKUP_TYPE" in
  full)        do_full_backup ;;
  incremental) do_incremental_backup ;;
  *)           die "Unknown backup type: $BACKUP_TYPE (use full or incremental)" ;;
esac

# ---------------------------------------------------------------------------
# Write manifest
# ---------------------------------------------------------------------------
cat > "$BACKUP_PATH/manifest.json" <<EOF
{
  "backup_name": "$BACKUP_NAME",
  "backup_type": "$BACKUP_TYPE",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "clickhouse_host": "$CLICKHOUSE_HOST",
  "database": "$CLICKHOUSE_DATABASE",
  "tables": [$(printf '"%s",' "${TABLES[@]}" | sed 's/,$//')],
  "retention_days": $RETENTION_DAYS
}
EOF
log "Manifest written"

# ---------------------------------------------------------------------------
# Upload to GCS (if target=gcs)
# ---------------------------------------------------------------------------
if [[ "$TARGET" == "gcs" ]]; then
  gcs_path="gs://$GCS_BUCKET/clickhouse/$BACKUP_NAME/"
  log "Uploading to $gcs_path ..."
  gsutil -m cp -r "$BACKUP_PATH/*" "$gcs_path"
  log "Upload complete"

  # Clean up local staging
  rm -rf "$BACKUP_PATH"
  log "Local staging cleaned"
fi

# ---------------------------------------------------------------------------
# Retention cleanup
# ---------------------------------------------------------------------------
log "Applying retention policy: $RETENTION_DAYS days"

if [[ "$TARGET" == "gcs" && -n "$GCS_BUCKET" ]]; then
  # GCS lifecycle handles retention via Terraform, but prune old prefixes
  cutoff=$(date -u -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -u -v-${RETENTION_DAYS}d +%Y%m%d)
  gsutil ls "gs://$GCS_BUCKET/clickhouse/" 2>/dev/null | while read -r prefix; do
    dir_name=$(basename "$prefix")
    dir_date=$(echo "$dir_name" | grep -oP '\d{8}' | head -1 || true)
    if [[ -n "$dir_date" && "$dir_date" < "$cutoff" ]]; then
      log "  Removing old backup: $dir_name"
      gsutil -m rm -r "$prefix" || true
    fi
  done
else
  # Local cleanup
  find "$BACKUP_DIR" -maxdepth 1 -type d -name "*_*" -mtime "+${RETENTION_DAYS}" -exec rm -rf {} \; 2>/dev/null || true
fi

log "Backup complete: $BACKUP_NAME"
