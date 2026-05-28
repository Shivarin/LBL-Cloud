#!/usr/bin/env bash
# Nginx + Let's Encrypt для cloud.lbl3d.info (LBL Cloud)
#
#   export CERTBOT_EMAIL='livevasya@gmail.com'
#   bash /home/site/backend/deploy-cloud-nginx.sh
#
if command -v sed >/dev/null 2>&1 && [[ -f "$0" ]] && grep -q $'\r' "$0" 2>/dev/null; then
  sed -i 's/\r$//' "$0" 2>/dev/null || true
  exec /usr/bin/env bash "$0" "$@"
fi
set -eu

DOMAINS="${DOMAINS:-cloud.lbl3d.info}"
REPO_CONF="${REPO_CONF:-/home/site/backend/nginx-lbl3d-cloud.conf}"
SITE_FILE="${SITE_FILE:-/etc/nginx/sites-available/lbl3d-cloud}"
WEBROOT="${WEBROOT:-/home/site/frontend/cloud}"
ACME_ROOT="${ACME_ROOT:-/var/www/html}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"

run() { [[ "$(id -u)" -eq 0 ]] && "$@" || sudo "$@"; }

ensure_pkg() {
  if ! command -v nginx >/dev/null 2>&1; then
    run apt-get update
    run apt-get install -y nginx
  fi
}

write_http_bootstrap() {
  run mkdir -p "$ACME_ROOT" "$WEBROOT"
  run tee "$SITE_FILE" >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAINS};

    root ${WEBROOT};
    index index.html;

    location /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
        allow all;
    }

    include /home/site/backend/nginx-vendor-static.conf;

    location /api/ {
        client_max_body_size 1024M;
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
}

issue_cert() {
  local domain="$1"
  if [[ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]]; then
    echo "Сертификат уже есть: ${domain}"
    return 0
  fi
  if [[ -z "${CERTBOT_EMAIL}" ]]; then
    echo "Задайте CERTBOT_EMAIL" >&2
    exit 1
  fi
  if ! command -v certbot >/dev/null 2>&1; then
    run apt-get update
    run apt-get install -y certbot
  fi
  run certbot certonly --webroot -w "$ACME_ROOT" -d "$domain" \
    --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --expand
}

ensure_pkg

if [[ ! -d "$WEBROOT" ]]; then
  echo "Нет ${WEBROOT} — залейте frontend/pages/file на сервер." >&2
  exit 1
fi

need_cert=0
for d in $DOMAINS; do
  [[ -f "/etc/letsencrypt/live/${d}/fullchain.pem" ]] || need_cert=1
done

if [[ "$need_cert" -eq 1 ]]; then
  echo "==> Временный HTTP для ACME"
  write_http_bootstrap
  run ln -sf "$SITE_FILE" /etc/nginx/sites-enabled/lbl3d-cloud
  run nginx -t
  run systemctl reload nginx
  for d in $DOMAINS; do
    issue_cert "$d" || echo "WARN: cert failed for $d (проверьте DNS A-запись)" >&2
  done
fi

if [[ ! -f "$REPO_CONF" ]]; then
  echo "Нет $REPO_CONF" >&2
  exit 1
fi

issued=""
for d in $DOMAINS; do
  if [[ -f "/etc/letsencrypt/live/${d}/fullchain.pem" ]]; then
    issued="${issued} ${d}"
  fi
done
if [[ -z "$(echo "$issued" | xargs)" ]]; then
  echo "Нет сертификата — HTTPS не включён." >&2
  exit 1
fi

echo "==> Финальный nginx (HTTPS)"
run cp -a "$REPO_CONF" "$SITE_FILE"
run ln -sf "$SITE_FILE" /etc/nginx/sites-enabled/lbl3d-cloud
run nginx -t
run systemctl reload nginx

echo ""
echo "Готово: https://cloud.lbl3d.info/"
echo "Проверка: bash /home/site/backend/verify-cloud-deploy.sh"
echo "Шрифты: cd /home/site/backend && bash fix-cloud-vendor.sh"
echo "На lbl3d.info в server {}: include /home/site/backend/nginx-cloud-redirect.conf;"
echo ""
echo "Маршруты cloud:"
echo "  /app/  /pages/billing/  /pages/auth/  /pages/legal/  /cloud/assets/  /api/"
