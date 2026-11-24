#!/usr/bin/env bash
set -euo pipefail
[[ $# == 1 ]] || { echo "Usage: $0 BACKUP_DIRECTORY" >&2; exit 2; }
backup="$(cd "$1" && pwd -P)"
# Always use a new database and a new temporary directory. Never write to the live tree.
export PGHOST=127.0.0.1
unset PGSERVICE PGSERVICEFILE PGHOSTADDR
work="$(mktemp -d)"
database="aeg_restore_$(date +%s)_${RANDOM}"
start=$SECONDS
umask 077
owned=false
cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$owned" == true ]]; then dropdb -- "$database" || status=1; fi
  rm -rf -- "$work"
  exit "$status"
}
trap cleanup EXIT
(cd "$backup" && sha256sum --strict --check SHA256SUMS)
createdb -- "$database"
owned=true
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$database" "$backup/database.dump"
tar -xzf "$backup/files.tar.gz" -C "$work"
psql -X -v ON_ERROR_STOP=1 --dbname="$database" -c 'SELECT count(*) AS restored_orders FROM quote_order'
psql -X -A -t -v ON_ERROR_STOP=1 --dbname="$database" -c "
  SELECT input_file_path FROM quote_order WHERE input_file_path LIKE 'apps/api/uploads/%'
  UNION SELECT file_path FROM client_image WHERE file_path LIKE 'apps/api/uploads/%'
  UNION SELECT file_path FROM order_file WHERE file_path LIKE 'apps/api/uploads/%'
" > "$work/references"
if [[ "$(psql -X -At -v ON_ERROR_STOP=1 --dbname="$database" -c "
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quote_order' AND column_name = 'document_requests')
")" == t ]]; then
  psql -X -At -v ON_ERROR_STOP=1 --dbname="$database" -c "
    SELECT DISTINCT v->>'file_path'
    FROM quote_order q CROSS JOIN LATERAL jsonb_array_elements(q.document_requests) d
    CROSS JOIN LATERAL jsonb_array_elements(d->'versions') v
    WHERE v->>'file_path' LIKE 'apps/api/uploads/%'
  " >> "$work/references"
fi
checked=0
while IFS= read -r reference; do
  relative="${reference#apps/api/}"
  [[ -n "$relative" && "/$relative/" != *'/../'* && -f "$work/$relative" ]] ||
    { echo 'An order references an attachment missing from the backup' >&2; exit 1; }
  checked=$((checked + 1))
done < "$work/references"
echo "Restore drill passed: $checked attachment references checked in $((SECONDS-start)) seconds."
