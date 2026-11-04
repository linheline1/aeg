#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/aeg-ddp"
DOMAINS=(
  app.linsgeekai.com.br
  ops.linsgeekai.com.br
  admin.linsgeekai.com.br
  customs.linsgeekai.com.br
)

AVAILABLE_DOMAINS=()
for domain in "${DOMAINS[@]}"; do
  if getent hosts "$domain" >/dev/null; then
    AVAILABLE_DOMAINS+=("$domain")
  else
    echo "跳过（DNS 尚未配置）：$domain"
  fi
done

if [[ ${#AVAILABLE_DOMAINS[@]} -eq 0 ]]; then
  echo "暂无可启用的子域名"
  exit 0
fi

for domain in "${AVAILABLE_DOMAINS[@]}"; do
  install -m 644 "$APP_ROOT/deploy/hostinger/nginx/$domain.conf" "/etc/nginx/sites-available/$domain.conf"
  ln -sfn "/etc/nginx/sites-available/$domain.conf" "/etc/nginx/sites-enabled/$domain.conf"
done

systemctl stop nginx
trap 'systemctl start nginx' EXIT
for domain in "${AVAILABLE_DOMAINS[@]}"; do
  if [[ ! -f "/etc/letsencrypt/live/$domain/fullchain.pem" ]]; then
    certbot certonly --standalone -d "$domain"
  fi
done

nginx -t
systemctl start nginx
trap - EXIT
printf '已启用 HTTPS：%s\n' "${AVAILABLE_DOMAINS[*]}"
