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

echo "=== 2. 构建（api + 三端前端 + packages）==="
pnpm build
BASE_PATH=/admin/ pnpm --filter @aeg/web-admin build
BASE_PATH=/ops/ pnpm --filter @aeg/web-ops build

echo "=== 3. 数据库迁移（幂等）==="
cd "$APP_ROOT/apps/api"
pnpm run migration:run
cd "$APP_ROOT"

echo "=== 4. 重启 API ==="
pm2 restart aeg-ddp-api || pm2 start pm2.config.js
pm2 save

echo "=== ✅ 部署完成 ==="
echo "  · API：127.0.0.1:5000（PM2 守护，postgres 模式）"
echo "  · 三端静态文件已由 Nginx 托管，无需重启 Nginx"
