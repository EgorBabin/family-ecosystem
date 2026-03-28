#!/bin/sh
set -eu

DB_PATH="${DB_PATH:-/data/db.sqlite3}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_SHORT_DAYS="${BACKUP_RETENTION_SHORT_DAYS:-30}"
BACKUP_RETENTION_LONG_DAYS="${BACKUP_RETENTION_LONG_DAYS:-60}"
BACKUP_SIZE_THRESHOLD_MB="${BACKUP_SIZE_THRESHOLD_MB:-100}"

is_uint() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

if [ ! -f "$DB_PATH" ]; then
  echo "[backup] Database file not found: $DB_PATH"
  exit 1
fi

if ! is_uint "$BACKUP_RETENTION_SHORT_DAYS" || ! is_uint "$BACKUP_RETENTION_LONG_DAYS" || ! is_uint "$BACKUP_SIZE_THRESHOLD_MB"; then
  echo "[backup] Retention and size threshold values must be positive integers."
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
raw_backup="${BACKUP_DIR}/db-${timestamp}.sqlite3"
archive="${raw_backup}.gz"

mkdir -p "$BACKUP_DIR"

# SQLite online backup keeps dump consistent while the app is writing.
sqlite3 "$DB_PATH" ".backup '$raw_backup'"
gzip -9 "$raw_backup"

size_bytes="$(wc -c <"$archive" | tr -d ' ')"
threshold_bytes=$((BACKUP_SIZE_THRESHOLD_MB * 1024 * 1024))

if [ "$size_bytes" -le "$threshold_bytes" ]; then
  retention_days="$BACKUP_RETENTION_LONG_DAYS"
else
  retention_days="$BACKUP_RETENTION_SHORT_DAYS"
fi

archive_name="$(basename "$archive")"
if [ "$retention_days" -eq 0 ]; then
  deleted_count="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db-*.sqlite3.gz' ! -name "$archive_name" -print -delete | wc -l | tr -d ' ')"
else
  deleted_count="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db-*.sqlite3.gz' -mtime +"$retention_days" -print -delete | wc -l | tr -d ' ')"
fi

echo "[backup] Created $(basename "$archive") (${size_bytes} bytes), retention=${retention_days} days, removed=${deleted_count}"
