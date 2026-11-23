#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/release-lib.sh"
lock_operations
target="$(readlink -f "$previous")"
old="$(readlink -f "$current")"
commit="$(node -p 'require(process.argv[1]).api.commit' "$target/versions.json")"
old_commit="$(node -p 'require(process.argv[1]).api.commit' "$old/versions.json")"
test -s "$target/apps/api/dist/main.js"
recover() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    point_link "$old" "$current"
    activate "$old" && wait_for_api "$old_commit" && check_release "$old" "$old_commit" && pm2 save ||
      echo 'Could not verify the original release after rollback failure' >&2
  fi
  exit "$status"
}
trap recover EXIT
activate "$target"
wait_for_api "$commit"
point_link "$target" "$current"
check_release "$target" "$commit"
pm2 save
point_link "$old" "$previous"
trap - EXIT
echo "Rolled back to $commit"
