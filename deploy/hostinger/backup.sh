#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/release-lib.sh"
[[ $# == 2 && "$1" =~ ^[a-zA-Z_][a-zA-Z_0-9]*$ ]] || {
  echo "Usage: $0 DATABASE BACKUP_DIRECTORY (maintenance window)" >&2; exit 2;
}
lock_operations
umask 077
install -d -m 700 "$2"
backup="$(mktemp -d "$2/aeg-backup-UTC-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
test -d "$app_root/apps/api/uploads"
pm2 describe "$service" >/dev/null
resume() {
  local status=$?
  trap - EXIT
  pm2 restart "$service" || status=1
  exit "$status"
}
trap resume EXIT
pm2 stop "$service"
pg_dump --format=custom --dbname="$1" --file="$backup/database.dump"
folders=(uploads)
[[ ! -d "$app_root/apps/api/data" ]] || folders+=(data)
tar --dereference -czf "$backup/files.tar.gz" -C "$app_root/apps/api" "${folders[@]}"
(
  cd "$backup"
  sha256sum database.dump files.tar.gz > SHA256SUMS
)
echo "Backup ready: $backup"
