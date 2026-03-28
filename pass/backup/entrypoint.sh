#!/bin/sh
set -eu

BACKUP_SCHEDULE="${BACKUP_SCHEDULE:-0 3 * * *}"
DB_PATH="${DB_PATH:-/data/db.sqlite3}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_SHORT_DAYS="${BACKUP_RETENTION_SHORT_DAYS:-30}"
BACKUP_RETENTION_LONG_DAYS="${BACKUP_RETENTION_LONG_DAYS:-60}"
BACKUP_SIZE_THRESHOLD_MB="${BACKUP_SIZE_THRESHOLD_MB:-100}"
CRON_DIR="/tmp/crontabs"

mkdir -p "$CRON_DIR" "$BACKUP_DIR"

cat > "${CRON_DIR}/root" <<EOF
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
${BACKUP_SCHEDULE} DB_PATH='${DB_PATH}' BACKUP_DIR='${BACKUP_DIR}' BACKUP_RETENTION_SHORT_DAYS='${BACKUP_RETENTION_SHORT_DAYS}' BACKUP_RETENTION_LONG_DAYS='${BACKUP_RETENTION_LONG_DAYS}' BACKUP_SIZE_THRESHOLD_MB='${BACKUP_SIZE_THRESHOLD_MB}' /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1
EOF

echo "[backup] Timezone: ${TZ:-UTC}"
echo "[backup] Schedule: ${BACKUP_SCHEDULE}"
echo "[backup] Retention: long=${BACKUP_RETENTION_LONG_DAYS} days, short=${BACKUP_RETENTION_SHORT_DAYS} days"
echo "[backup] Threshold: ${BACKUP_SIZE_THRESHOLD_MB} MB"

exec crond -f -l 8 -c "$CRON_DIR"
