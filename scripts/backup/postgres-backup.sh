#!/usr/bin/env bash
# PostgreSQL Backup Script for Neon Platform
#
# Logical backups via pg_dump with GCS or local storage.
# Databases: neon (metadata), temporal, temporal_visibility
#
# Usage:
#   ./postgres-backup.sh [--target local|gcs]
#   ./postgres-backup.sh --verify <backup-name>
#
# Environment:
#   PGHOST       - PostgreSQL host (default: localhost)
#   PGPORT       - Port (default: 5432)
#   PGUSER       - Username (default: neon)
#   PGPASSWORD   - Password (default: neon)
#   BACKUP_DIR   - Local backup directory (default: /var/backups/postgres)
#   GCS_BUCKET   - GCS bucket for remote backups
#   RETENTION_DAYS - Days to keep backups (default: 30)

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-neon}"
export PGPASSWORD="${PGPASSWORD:-neon}"

DATABASES=("neon" "temporal" "temporal_visibility")
BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgres}"
GCS_BUCKET="${GCS_BUCKET:-}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
TARGET="local"
VERIFY_BACKUP=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
error() { log "ERROR: $*" >&2; }
die() { error "$@"; exit 1; }

pg_health_check() {
  pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -q 2>/dev/null
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="$2"
      shift 2
      ;;
    --verify)
      VERIFY_BACKUP="$2"
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
# Verify mode
# ---------------------------------------------------------------------------
if [[ -n "$VERIFY_BACKUP" ]]; then
  log "Verifying backup: $VERIFY_BACKUP"
  backup_path="$BACKUP_DIR/$VERIFY_BACKUP"

  if [[ "$TARGET" == "gcs" && -n "$GCS_BUCKET" ]]; then
    log "Checking GCS backup at gs://$GCS_BUCKET/postgres/$VERIFY_BACKUP/"
    if ! gsutil ls "gs://$GCS_BUCKET/postgres/$VERIFY_BACKUP/" > /dev/null 2>&1; then
      die "Backup not found in GCS"
    fi
    backup_path="/tmp/pg_verify_$$"
    mkdir -p "$backup_path"
    gsutil -m cp "gs://$GCS_BUCKET/postgres/$VERIFY_BACKUP/*" "$backup_path/"
  fi

  if [[ ! -f "$backup_path/manifest.json" ]]; then
    die "No manifest.json found in backup"
  fi

  log "Manifest:"
  cat "$backup_path/manifest.json"

  errors=0
  for db in "${DATABASES[@]}"; do
    dump_file="$backup_path/${db}.sql.gz"
    if [[ ! -f "$dump_file" ]]; then
      error "Missing dump: $db"
      ((errors++))
    else
      # Verify gzip integrity
      if gzip -t "$dump_file" 2>/dev/null; then
        size=$(stat -c %s "$dump_file" 2>/dev/null || stat -f %z "$dump_file" 2>/dev/null)
        log "  OK: $db ($size bytes, gzip valid)"
      else
        error "Corrupt gzip: $dump_file"
        ((errors++))
      fi
    fi
  done

  # Clean up temp dir for GCS verify
  [[ "$TARGET" == "gcs" ]] && rm -rf "$backup_path"

  if [[ $errors -gt 0 ]]; then
    die "Verification failed: $errors error(s)"
  fi
  log "Verification passed"
  exit 0
fi

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
log "Starting PostgreSQL backup (target: $TARGET)"

if ! pg_health_check; then
  die "PostgreSQL is not responding at $PGHOST:$PGPORT"
fi

if [[ "$TARGET" == "gcs" && -z "$GCS_BUCKET" ]]; then
  die "GCS_BUCKET must be set when target=gcs"
fi

BACKUP_NAME="pg_${TIMESTAMP}"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
mkdir -p "$BACKUP_PATH"

# ---------------------------------------------------------------------------
# Dump each database
# ---------------------------------------------------------------------------
for db in "${DATABASES[@]}"; do
  outfile="$BACKUP_PATH/${db}.sql.gz"
  log "  Dumping $db ..."

  pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" \
    --format=plain --no-owner --no-acl \
    "$db" | gzip > "$outfile"

  compressed_size=$(stat -c %s "$outfile" 2>/dev/null || stat -f %z "$outfile" 2>/dev/null)
  log "    Compressed size: $compressed_size bytes"
done

# ---------------------------------------------------------------------------
# Write manifest
# ---------------------------------------------------------------------------
cat > "$BACKUP_PATH/manifest.json" <<EOF
{
  "backup_name": "$BACKUP_NAME",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "pg_host": "$PGHOST",
  "databases": [$(printf '"%s",' "${DATABASES[@]}" | sed 's/,$//')],
  "retention_days": $RETENTION_DAYS
}
EOF
log "Manifest written"

# ---------------------------------------------------------------------------
# Upload to GCS
# ---------------------------------------------------------------------------
if [[ "$TARGET" == "gcs" ]]; then
  gcs_path="gs://$GCS_BUCKET/postgres/$BACKUP_NAME/"
  log "Uploading to $gcs_path ..."
  gsutil -m cp -r "$BACKUP_PATH/*" "$gcs_path"
  log "Upload complete"

  rm -rf "$BACKUP_PATH"
  log "Local staging cleaned"
fi

# ---------------------------------------------------------------------------
# Retention cleanup
# ---------------------------------------------------------------------------
log "Applying retention policy: $RETENTION_DAYS days"

if [[ "$TARGET" == "gcs" && -n "$GCS_BUCKET" ]]; then
  cutoff=$(date -u -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -u -v-${RETENTION_DAYS}d +%Y%m%d)
  gsutil ls "gs://$GCS_BUCKET/postgres/" 2>/dev/null | while read -r prefix; do
    dir_name=$(basename "$prefix")
    dir_date=$(echo "$dir_name" | grep -oP '\d{8}' | head -1 || true)
    if [[ -n "$dir_date" && "$dir_date" < "$cutoff" ]]; then
      log "  Removing old backup: $dir_name"
      gsutil -m rm -r "$prefix" || true
    fi
  done
else
  find "$BACKUP_DIR" -maxdepth 1 -type d -name "pg_*" -mtime "+${RETENTION_DAYS}" -exec rm -rf {} \; 2>/dev/null || true
fi

log "Backup complete: $BACKUP_NAME"
