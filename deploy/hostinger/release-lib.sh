#!/usr/bin/env bash
# Shared Hostinger release operations. Caller holds the operations lock.
app_root=/opt/aeg-ddp
current=/opt/aeg-ddp-current
previous=/opt/aeg-ddp-previous
service=aeg-ddp-api
portals=(web-client web-ops web-admin web-customs)
origins=(https://app.aeglogistics.com.br https://ops.aeglogistics.com.br https://admin.aeglogistics.com.br https://customs.aeglogistics.com.br)
routes=(/workbench /orders / /)

lock_operations() {
  exec 9>"$app_root/.hostinger-operations.lock"
  flock -n 9 || { echo 'Another release or backup is running' >&2; exit 1; }
}

point_link() {
  local target=$1 link=$2
  ln -s "$target" "$link.next.$$"
  mv -Tf "$link.next.$$" "$link"
}

link_runtime() {
  local release=$1
  ln -sfn "$app_root/.env" "$release/.env"
  for folder in uploads data; do
    mkdir -p "$app_root/apps/api/$folder"
    ln -sT "$app_root/apps/api/$folder" "$release/apps/api/$folder"
  done
}

activate() {
  local release=$1
  test -s "$release/apps/api/dist/main.js" || return
  if pm2 describe "$service" >/dev/null 2>&1; then pm2 delete "$service" || return; fi
  AEG_RELEASE_DIR="$release" pm2 start "$app_root/deploy/hostinger/pm2.config.js" --only "$service"
}

check_api() {
  local url=$1 commit=$2
  curl -fsS --max-time 10 "$url/api/version" | node -e '
    const fs = require("node:fs");
    const version = JSON.parse(fs.readFileSync(0, "utf8"));
    if (version.entries?.api?.commit !== process.argv[1]) process.exit(1);
  ' "$commit"
}

wait_for_api() {
  local commit=$1
  for ((attempt=0; attempt<20; attempt++)); do
    if check_api http://127.0.0.1:5000 "$commit"; then return 0; fi
    sleep 2
  done
  return 1
}

check_release() {
  local release=$1 commit=$2 i asset
  for i in "${!portals[@]}"; do
    asset="$(node -e '
      const html = require("node:fs").readFileSync(process.argv[1], "utf8");
      const asset = html.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"/)?.[1];
      if (!asset) process.exit(1);
      process.stdout.write(asset);
    ' "$release/apps/${portals[i]}/dist/index.html")" || return
    curl -fsS --max-time 15 "${origins[i]}${routes[i]}" | grep -F "$asset" >/dev/null || return
    # The SPA fallback can return HTML with HTTP 200 for a missing asset.
    curl -fsS --max-time 20 "${origins[i]}$asset" | cmp -s "$release/apps/${portals[i]}/dist$asset" - || return
    check_api "${origins[i]}" "$commit" || return
  done
}
