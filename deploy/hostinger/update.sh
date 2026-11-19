#!/usr/bin/env bash
# =====================================================================
# AEG DDP — 增量部署（在 VPS 上执行）
# 用法：新代码同步到 /opt/aeg-ddp 后，执行 bash deploy/hostinger/update.sh
# 前提：setup.sh 首次安装已完成、.env 已配置（APP_MODULE_MODE=postgres、
#       DB_PASS、JWT_SECRET 等，应用启动时经 dotenv 读取）
# =====================================================================
set -euo pipefail

APP_ROOT="/opt/aeg-ddp"
cd "$APP_ROOT"

echo "=== 1. 安装依赖 ==="
pnpm install --frozen-lockfile

echo "=== 2. 构建（api + 四端前端 + packages，子域名根路径）==="
pnpm build

echo "=== 3. 数据库迁移（幂等）==="
cd "$APP_ROOT/apps/api"
pnpm run migration:run
cd "$APP_ROOT"

echo "=== 4. 重启 API ==="
pm2 restart aeg-ddp-api || pm2 start pm2.config.js
pm2 save

echo "=== 5. 发布四端静态页面 ==="
# Nginx 从 /opt/aeg-ddp-current 读取前端文件，不能只构建在 APP_ROOT。
# 先准备完整发布目录，再一次性切换符号链接，避免四端出现不同版本。
release_dir="$(mktemp -d "/opt/aeg-ddp-release-$(git rev-parse --short HEAD)-XXXXXX")"
chmod 755 "$release_dir"
for app in web-client web-ops web-admin web-customs; do
  mkdir -p "$release_dir/apps/$app"
  cp -a "$APP_ROOT/apps/$app/dist" "$release_dir/apps/$app/"
done
next_link="/opt/aeg-ddp-current.next.$$"
ln -s "$release_dir" "$next_link"
mv -Tf "$next_link" /opt/aeg-ddp-current
echo "  · Nginx 静态页面：$release_dir"

echo "=== ✅ 部署完成 ==="
echo "  · API：127.0.0.1:5000（PM2 守护，postgres 模式）"
echo "  · 四端静态文件已切换到最新发布目录，无需重启 Nginx"
