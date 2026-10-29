#!/usr/bin/env bash
# =====================================================================
# AEG DDP — Hostinger VPS (Ubuntu 24.04 LTS) 一键安装脚本
# 用途：全新 VPS 上首次部署
# 注意：仅适用 Hostinger KVM 2 VPS，不适用于共享主机！
# 安全：
#   - PostgreSQL 仅监听 127.0.0.1
#   - Node.js API 仅监听 127.0.0.1:5000
#   - 三端静态文件由 Nginx 反向代理
#   - 上传文件目录不暴露在 Nginx 根路径
# =====================================================================

set -euo pipefail

echo "=== 1. 系统更新 ==="
apt-get update -y && apt-get upgrade -y

echo "=== 2. 基础工具 ==="
apt-get install -y ca-certificates curl gnupg git build-essential unzip postgresql postgresql-contrib nginx certbot python3-certbot-nginx

echo "=== 3. Node.js 20 (NVM) ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pnpm@9 pm2
node -v && pnpm -v && pm2 -v

echo "=== 4. PostgreSQL 配置 ==="
sudo -u postgres psql -c "CREATE USER ddp WITH PASSWORD 'CHANGE_ME' CREATEDB;" || true
sudo -u postgres psql -c "CREATE DATABASE ddpserver OWNER ddp;" || true
# 仅监听 127.0.0.1
sed -i 's/^#listen_addresses.*/listen_addresses = '\''127.0.0.1'\''/' /etc/postgresql/*/main/postgresql.conf
systemctl restart postgresql
systemctl enable postgresql

echo "=== 5. 创建应用目录 ==="
APP_ROOT="/opt/aeg-ddp"
UPLOAD_ROOT="/var/data/ddp/uploads"
mkdir -p "$APP_ROOT"
mkdir -p "$UPLOAD_ROOT/templates"
chown -R www-data:www-data "$UPLOAD_ROOT"

echo "=== 6. Nginx site 模板 ==="
# 将 deploy/hostinger/nginx/*.conf 复制到 /etc/nginx/sites-available/
# 将 deploy/hostinger/pm2.config.js 复制到 /opt/aeg-ddp/
echo "→ 请手动复制 deploy/hostinger/nginx/*.conf 到 /etc/nginx/sites-available/"
echo "→ 然后执行：ln -s /etc/nginx/sites-available/*.conf /etc/nginx/sites-enabled/"
echo "→ 再执行：nginx -t && systemctl reload nginx"

echo "=== 7. 反向代理后端仅 localhost ==="
# api 不监听公网端口（Node 代码中已绑定 127.0.0.1:5000）
# 三端前端静态文件由 Nginx 直接托管

echo "=== 8. PM2 开机自启 ==="
pm2 save
pm2 startup systemd -u root --hp /root

echo "=== ✅ 安装完成 ==="
echo "  · PostgreSQL：127.0.0.1:5432，user=ddp, db=ddpserver, pass=CHANGE_ME"
echo "  · Node API：127.0.0.1:5000（PM2 守护）"
echo "  · 三端静态：由 Nginx + Let's Encrypt 托管"
echo "  · 上传文件：$UPLOAD_ROOT（不暴露）"
echo "后续步骤："
echo "  1. 上传项目代码到 $APP_ROOT，执行 pnpm install && pnpm run build"
echo "  2. 修改 .env：APP_MODULE_MODE=postgres、DB_PASS、JWT_SECRET（强随机）、DB_HOST=127.0.0.1"
echo "  3. 初始化数据库：cd apps/api && pnpm run migration:run"
echo "     （可选）先导入旧 mock 数据：pnpm run import:dev-json"
echo "     再执行 pnpm run seed（已有数据会自动跳过；顺序请勿颠倒，避免账号/客户重复）"
echo "     注：pm2.config.js 已配置 APP_MODULE_MODE=postgres，API 启动时也会自动执行 migrations"
echo "  4. 复制 deploy/hostinger/pm2.config.js 到 $APP_ROOT 并 pm2 start pm2.config.js"
echo "  5. 在 Nginx 启用三子域名 server block，certbot 申请证书"
echo "  6. PM2 save && systemctl enable nginx postgresql pm2-root"
