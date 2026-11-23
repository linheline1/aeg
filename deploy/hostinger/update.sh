#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/release-lib.sh"
lock_operations
cd "$app_root"

allow_migrations=false
case "${1:-}" in
  '') ;;
  --allow-compatible-migrations) allow_migrations=true ;;
  *) echo "Usage: $0 [--allow-compatible-migrations]" >&2; exit 2 ;;
esac

old="$(readlink -f "$current")"
test -d "$old"
if [[ ! -s "$old/apps/api/dist/main.js" ]]; then
  # Capture the legacy API before building anything. Its dependencies stay in APP_ROOT.
  baseline="$(mktemp -d /opt/aeg-ddp-baseline-XXXXXX)"
  chmod 755 "$baseline"
  mkdir -p "$baseline/apps/api" "$baseline/packages"
  cp -a "$app_root/apps/api/dist" "$baseline/apps/api/"
  cp "$app_root/versions.json" "$baseline/versions.json"
  cp "$app_root/pnpm-workspace.yaml" "$baseline/"
  ln -s "$app_root/node_modules" "$baseline/node_modules"
  ln -s "$app_root/apps/api/node_modules" "$baseline/apps/api/node_modules"
  ln -s "$app_root/packages/shared-types" "$baseline/packages/shared-types"
  for app in "${portals[@]}"; do
    mkdir -p "$baseline/apps/$app"
    cp -a "$old/apps/$app/dist" "$baseline/apps/$app/"
  done
  link_runtime "$baseline"
  old="$baseline"
fi
old_commit="$(node -p 'require(process.argv[1]).api.commit' "$old/versions.json")"
check_api http://127.0.0.1:5000 "$old_commit"

commit="$(git rev-parse --short HEAD)"
release="$(mktemp -d "/opt/aeg-ddp-release-$commit-XXXXXX")"
git worktree add --detach "$release" HEAD
chmod 755 "$release"
link_runtime "$release"
for app in "${portals[@]}"; do
  for env_file in .env .env.local .env.production .env.production.local; do
    [[ ! -f "$app_root/apps/$app/$env_file" || -e "$release/apps/$app/$env_file" ]] ||
      ln -s "$app_root/apps/$app/$env_file" "$release/apps/$app/$env_file"
  done
done
cd "$release"
pnpm install --frozen-lockfile
pnpm build --force
node -e '
  const entries = require("./versions.json");
  for (const name of ["api", "client", "ops", "admin", "customs"])
    if (entries[name]?.commit !== process.argv[1]) process.exit(1);
' "$commit"

migration_status="$(cd apps/api && pnpm exec typeorm-ts-node-commonjs migration:show -d src/data-source.ts)"
if grep -Fq '[ ]' <<< "$migration_status"; then
  if [[ "$allow_migrations" != true ]]; then
    echo 'Pending migration. Verify compatibility with the previous API and take a paired backup. Then use --allow-compatible-migrations.' >&2
    exit 1
  fi
  (cd apps/api && pnpm run migration:run)
fi

rollback() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    echo "Release validation failed. Restoring $old_commit." >&2
    point_link "$old" "$current"
    if activate "$old" && wait_for_api "$old_commit" && check_release "$old" "$old_commit"; then
      pm2 save
    else
      echo 'Rollback verification failed. Check PM2, Nginx and database compatibility.' >&2
    fi
  fi
  exit "$status"
}
trap rollback EXIT
activate "$release"
wait_for_api "$commit"
point_link "$release" "$current"
check_release "$release" "$commit"
pm2 save
point_link "$old" "$previous"
trap - EXIT
echo "Published and verified $commit at $release"
