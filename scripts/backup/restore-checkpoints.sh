#!/usr/bin/env bash
# Checkpoint Body Restore Script for Neon Platform
#
# Restores a checkpoint body backup created by checkpoint-backup.sh.
#
# Usage:
#   ./restore-checkpoints.sh <backup-name> [--source local|gcs] [--destination /path]

set -euo pipefail

BACKUP_NAME="${1:-}"
SOURCE="local"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/checkpoints}"
GCS_BUCKET="${GCS_BUCKET:-}"
DESTINATION_DIR="${DESTINATION_DIR:-${CHECKPOINT_SOURCE_DIR:-/var/lib/neon/checkpoints}}"

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

if [[ -z "$BACKUP_NAME" ]]; then
  die "Usage: $0 <backup-name> [--source local|gcs] [--destination /path]"
fi

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --destination)
      DESTINATION_DIR="$2"
      shift 2
      ;;
    --help|-h)
      head -8 "$0" | tail -5
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

if [[ "$SOURCE" == "gcs" && -z "$GCS_BUCKET" ]]; then
  die "GCS_BUCKET must be set when source=gcs"
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

if [[ "$SOURCE" == "gcs" ]]; then
  gsutil -m cp "gs://$GCS_BUCKET/checkpoints/$BACKUP_NAME/manifest.json" "$tmpdir/"
  gsutil -m cp "gs://$GCS_BUCKET/checkpoints/$BACKUP_NAME/checkpoints.tar.gz" "$tmpdir/"
  gsutil -m cp "gs://$GCS_BUCKET/checkpoints/$BACKUP_NAME/checksums.txt" "$tmpdir/"
else
  cp "$BACKUP_DIR/$BACKUP_NAME/manifest.json" "$tmpdir/"
  cp "$BACKUP_DIR/$BACKUP_NAME/checkpoints.tar.gz" "$tmpdir/"
  cp "$BACKUP_DIR/$BACKUP_NAME/checksums.txt" "$tmpdir/"
fi

for required in manifest.json checkpoints.tar.gz checksums.txt; do
  [[ -f "$tmpdir/$required" ]] || die "Missing $required in backup"
done

archive_hash="$(sha256_file "$tmpdir/checkpoints.tar.gz")"
expected_hash="$(awk '$2 == "checkpoints.tar.gz" { print $1 }' "$tmpdir/checksums.txt")"
[[ -n "$expected_hash" ]] || die "No archive checksum found"
[[ "$archive_hash" == "$expected_hash" ]] || die "Archive checksum mismatch"

tar -xzf "$tmpdir/checkpoints.tar.gz" -C "$tmpdir"
[[ -d "$tmpdir/payload" ]] || die "Archive missing payload directory"

(
  cd "$tmpdir/payload"
  grep -v ' checkpoints.tar.gz$' ../checksums.txt > ../payload-checksums.txt || true
  if [[ -s "../payload-checksums.txt" ]]; then
    sha256sum -c ../payload-checksums.txt >/dev/null
  fi
)

log "WARNING: This will replace checkpoint bodies in $DESTINATION_DIR"
if [[ -t 0 ]]; then
  read -rp "Continue? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    log "Aborted"
    exit 0
  fi
fi

mkdir -p "$DESTINATION_DIR"
find "$DESTINATION_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
if find "$tmpdir/payload" -mindepth 1 -print -quit | grep -q .; then
  cp -R "$tmpdir/payload"/. "$DESTINATION_DIR"/
fi

log "Restore complete: $BACKUP_NAME"
