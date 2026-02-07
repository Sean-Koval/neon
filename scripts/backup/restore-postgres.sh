#!/usr/bin/env bash
# PostgreSQL Restore Script for Neon Platform
#
# Restores from a backup created by postgres-backup.sh.
# Supports restoring from local directory or GCS.
#
# Usage:
#   ./restore-postgres.sh <backup-name> [--source local|gcs] [--databases neon,temporal]
#   ./restore-postgres.sh pg_20250101_120000
#   ./restore-postgres.sh pg_20250101_120000 --source gcs --databases neon
#
# Environment:
#   PGHOST       - PostgreSQL host (default: localhost)
#   PGPORT       - Port (default: 5432)
#   PGUSER       - Username (default: neon)
#   PGPASSWORD   - Password (default: neon)
#   BACKUP_DIR   - Local backup directory (default: /var/backups/postgres)
#   GCS_BUCKET   - GCS bucket for remote backups

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-neon}"
export PGPASSWORD="${PGPASSWORD:-neon}"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgres}"
GCS_BUCKET="${GCS_BUCKET:-}"
SOURCE="local"
RESTORE_DBS=""
BACKUP_NAME=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
error() { log "ERROR: $*" >&2; }
die() { error "$@"; exit 1; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
if [[ $# -lt 1 ]]; then
  die "Usage: $0 <backup-name> [--source local|gcs] [--databases neon,temporal]"
fi

BACKUP_NAME="$1"
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --databases)
      RESTORE_DBS="$2"
      shift 2
      ;;
    --help|-h)
      head -17 "$0" | tail -13
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Determine databases to restore
# ---------------------------------------------------------------------------
if [[ -n "$RESTORE_DBS" ]]; then
  IFS=',' read -ra DATABASES <<< "$RESTORE_DBS"
else
  DATABASES=("neon" "temporal" "temporal_visibility")
fi

# ---------------------------------------------------------------------------
# Download from GCS if needed
# ---------------------------------------------------------------------------
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

if [[ "$SOURCE" == "gcs" ]]; then
  if [[ -z "$GCS_BUCKET" ]]; then
    die "GCS_BUCKET must be set when source=gcs"
  fi
  BACKUP_PATH="/tmp/pg_restore_$$"
  mkdir -p "$BACKUP_PATH"
  log "Downloading backup from gs://$GCS_BUCKET/postgres/$BACKUP_NAME/ ..."
  gsutil -m cp "gs://$GCS_BUCKET/postgres/$BACKUP_NAME/*" "$BACKUP_PATH/"
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
log "WARNING: This will restore the following databases (existing data will be replaced):"
for db in "${DATABASES[@]}"; do
  log "  - $db"
done
log ""
log "Target: ${PGHOST}:${PGPORT}"

if [[ -t 0 ]]; then
  read -rp "Continue? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    log "Aborted"
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# Restore databases
# ---------------------------------------------------------------------------
errors=0
for db in "${DATABASES[@]}"; do
  dump_file="$BACKUP_PATH/${db}.sql.gz"

  if [[ ! -f "$dump_file" ]]; then
    error "Dump file not found: $dump_file (skipping)"
    ((errors++))
    continue
  fi

  # Verify gzip integrity first
  if ! gzip -t "$dump_file" 2>/dev/null; then
    error "Corrupt gzip file: $dump_file (skipping)"
    ((errors++))
    continue
  fi

  log "Restoring $db ..."

  # Terminate existing connections
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db' AND pid <> pg_backend_pid();" \
    > /dev/null 2>&1 || true

  # Drop and recreate database
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c \
    "DROP DATABASE IF EXISTS \"$db\";" 2>/dev/null || true
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c \
    "CREATE DATABASE \"$db\" OWNER \"$PGUSER\";"

  # Restore
  gunzip -c "$dump_file" | psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$db" -q

  # Verify
  table_count=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$db" -t -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d '[:space:]')
  log "  Restored $db ($table_count tables)"
done

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
if [[ "$SOURCE" == "gcs" ]]; then
  rm -rf "$BACKUP_PATH"
  log "Cleaned up temp files"
fi

if [[ $errors -gt 0 ]]; then
  die "Restore completed with $errors error(s)"
fi

log "Restore complete from backup: $BACKUP_NAME"
