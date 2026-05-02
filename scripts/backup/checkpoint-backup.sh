#!/usr/bin/env bash
# Checkpoint Body Backup Script for Neon Platform
#
# Archives durable checkpoint bodies used by replay and restore flows.
#
# Usage:
#   ./checkpoint-backup.sh [--target local|gcs]
#   ./checkpoint-backup.sh --verify <backup-name> [--target local|gcs]
#
# Environment:
#   CHECKPOINT_SOURCE_DIR - Directory containing durable checkpoint bodies
#                          (default: /var/lib/neon/checkpoints)
#   BACKUP_DIR            - Local backup directory (default: /var/backups/checkpoints)
#   GCS_BUCKET            - GCS bucket for remote backups
#   RETENTION_DAYS        - Days to keep backups (default: 30)

set -euo pipefail

CHECKPOINT_SOURCE_DIR="${CHECKPOINT_SOURCE_DIR:-/var/lib/neon/checkpoints}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/checkpoints}"
GCS_BUCKET="${GCS_BUCKET:-}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
TARGET="local"
VERIFY_BACKUP=""

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
error() { log "ERROR: $*" >&2; }
die() { error "$@"; exit 1; }

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

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
      head -18 "$0" | tail -14
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

if [[ "$TARGET" == "gcs" && -z "$GCS_BUCKET" ]]; then
  die "GCS_BUCKET must be set when target=gcs"
fi

if [[ "$TARGET" == "gcs" ]] && ! command -v gsutil >/dev/null 2>&1; then
  die "gsutil not found. Install Google Cloud SDK."
fi

if [[ -n "$VERIFY_BACKUP" ]]; then
  log "Verifying checkpoint backup: $VERIFY_BACKUP"
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  if [[ "$TARGET" == "gcs" ]]; then
    gsutil -m cp "gs://$GCS_BUCKET/checkpoints/$VERIFY_BACKUP/manifest.json" "$tmpdir/"
    gsutil -m cp "gs://$GCS_BUCKET/checkpoints/$VERIFY_BACKUP/checkpoints.tar.gz" "$tmpdir/"
    gsutil -m cp "gs://$GCS_BUCKET/checkpoints/$VERIFY_BACKUP/checksums.txt" "$tmpdir/"
  else
    cp "$BACKUP_DIR/$VERIFY_BACKUP/manifest.json" "$tmpdir/"
    cp "$BACKUP_DIR/$VERIFY_BACKUP/checkpoints.tar.gz" "$tmpdir/"
    cp "$BACKUP_DIR/$VERIFY_BACKUP/checksums.txt" "$tmpdir/"
  fi

  for required in manifest.json checkpoints.tar.gz checksums.txt; do
    [[ -f "$tmpdir/$required" ]] || die "Missing $required in backup"
  done

  log "Manifest:"
  cat "$tmpdir/manifest.json"

  archive_hash="$(sha256_file "$tmpdir/checkpoints.tar.gz")"
  expected_hash="$(awk '$2 == "checkpoints.tar.gz" { print $1 }' "$tmpdir/checksums.txt")"
  [[ -n "$expected_hash" ]] || die "No archive checksum found"
  [[ "$archive_hash" == "$expected_hash" ]] || die "Archive checksum mismatch"

  tar -xzf "$tmpdir/checkpoints.tar.gz" -C "$tmpdir"
  [[ -d "$tmpdir/payload" ]] || die "Archive missing payload directory"

  (
    cd "$tmpdir/payload"
    if [[ -s "../checksums.txt" ]]; then
      grep -v ' checkpoints.tar.gz$' ../checksums.txt > ../payload-checksums.txt || true
      if [[ -s "../payload-checksums.txt" ]]; then
        sha256sum -c ../payload-checksums.txt >/dev/null
      fi
    fi
  )

  log "Verification passed"
  exit 0
fi

log "Starting checkpoint backup (target: $TARGET)"
[[ -d "$CHECKPOINT_SOURCE_DIR" ]] || die "Checkpoint source directory not found: $CHECKPOINT_SOURCE_DIR"

BACKUP_NAME="checkpoints_${TIMESTAMP}"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
PAYLOAD_DIR="$TMPDIR/payload"
mkdir -p "$PAYLOAD_DIR" "$BACKUP_PATH"

if find "$CHECKPOINT_SOURCE_DIR" -mindepth 1 -print -quit | grep -q .; then
  cp -R "$CHECKPOINT_SOURCE_DIR"/. "$PAYLOAD_DIR"/
fi

CHECKSUMS_FILE="$TMPDIR/checksums.txt"
(
  cd "$PAYLOAD_DIR"
  find . -type f | sort | while read -r file; do
    rel="${file#./}"
    hash="$(sha256_file "$rel")"
    printf "%s  %s\n" "$hash" "$rel"
  done > "$CHECKSUMS_FILE"
)

ARCHIVE_PATH="$BACKUP_PATH/checkpoints.tar.gz"
tar -czf "$ARCHIVE_PATH" -C "$TMPDIR" payload
archive_size=$(stat -c %s "$ARCHIVE_PATH" 2>/dev/null || stat -f %z "$ARCHIVE_PATH" 2>/dev/null)
archive_hash="$(sha256_file "$ARCHIVE_PATH")"
printf "%s  %s\n" "$archive_hash" "checkpoints.tar.gz" >> "$CHECKSUMS_FILE"
cp "$CHECKSUMS_FILE" "$BACKUP_PATH/checksums.txt"

file_count=$(find "$PAYLOAD_DIR" -type f | wc -l | tr -d '[:space:]')

cat > "$BACKUP_PATH/manifest.json" <<EOF
{
  "backup_name": "$BACKUP_NAME",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "checkpoint_source_dir": "$CHECKPOINT_SOURCE_DIR",
  "archive_name": "checkpoints.tar.gz",
  "archive_sha256": "$archive_hash",
  "archive_size_bytes": $archive_size,
  "file_count": $file_count,
  "retention_days": $RETENTION_DAYS
}
EOF

if [[ "$TARGET" == "gcs" ]]; then
  gcs_path="gs://$GCS_BUCKET/checkpoints/$BACKUP_NAME/"
  log "Uploading to $gcs_path ..."
  gsutil -m cp "$BACKUP_PATH/manifest.json" "$BACKUP_PATH/checksums.txt" "$BACKUP_PATH/checkpoints.tar.gz" "$gcs_path"
  rm -rf "$BACKUP_PATH"
  log "Local staging cleaned"
fi

log "Applying retention policy: $RETENTION_DAYS days"
if [[ "$TARGET" == "gcs" ]]; then
  cutoff=$(date -u -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -u -v-${RETENTION_DAYS}d +%Y%m%d)
  gsutil ls "gs://$GCS_BUCKET/checkpoints/" 2>/dev/null | while read -r prefix; do
    dir_name=$(basename "$prefix")
    dir_date=$(echo "$dir_name" | grep -oE '[0-9]{8}' | head -1 || true)
    if [[ -n "$dir_date" && "$dir_date" < "$cutoff" ]]; then
      log "  Removing old backup: $dir_name"
      gsutil -m rm -r "$prefix" || true
    fi
  done
else
  find "$BACKUP_DIR" -maxdepth 1 -type d -name "checkpoints_*" -mtime "+${RETENTION_DAYS}" -exec rm -rf {} \; 2>/dev/null || true
fi

log "Backup complete: $BACKUP_NAME"
