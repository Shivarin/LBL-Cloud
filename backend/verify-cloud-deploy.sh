#!/usr/bin/env bash
# Проверка деплоя cloud.lbl3d.info (лендинг, /app/, nginx, шрифты, billing)
set -eu
ROOT="${ROOT:-/home/site}"
fail=0

check_file() {
  if [[ -f "$1" ]]; then
    echo "  ok $1"
  else
    echo "  MISSING $1" >&2
    fail=1
  fi
}

echo "==> Файлы"
for f in \
  "$ROOT/frontend/cloud/index.html" \
  "$ROOT/frontend/cloud/landing.css" \
  "$ROOT/frontend/cloud/pages/billing/index.html" \
  "$ROOT/frontend/cloud/pages/billing/billing.js" \
  "$ROOT/frontend/cloud/pages/auth/login.html" \
  "$ROOT/frontend/cloud/pages/legal/privacy.html" \
  "$ROOT/frontend/pages/file/app/index.html" \
  "$ROOT/frontend/pages/file/js/lbl-drive.js" \
  "$ROOT/frontend/vendor/fonts/fonts.css" \
  "$ROOT/frontend/vendor/fonts/roboto-latin-400-normal.woff2"
do
  check_file "$f"
done

if [[ -f "$ROOT/frontend/vendor/fonts/roboto-latin-400-normal.woff2" ]]; then
  sig="$(head -c 4 "$ROOT/frontend/vendor/fonts/roboto-latin-400-normal.woff2" | od -An -tx1 | tr -d ' \n')"
  if [[ "$sig" == "774f4632" ]]; then
    echo "  ok woff2 signature"
  else
    echo "  BAD woff2 (не wOFF2, возможно HTML) — bash fix-cloud-vendor.sh" >&2
    fail=1
  fi
fi

grep -q 'LBL Cloud' "$ROOT/frontend/cloud/index.html" && echo "  ok лендинг" || { echo "  BAD index.html" >&2; fail=1; }

echo "==> Nginx конфиг в репозитории"
CONF="$ROOT/backend/nginx-lbl3d-cloud.conf"
if [[ -f "$CONF" ]]; then
  for needle in \
    'pages/billing' \
    'pages/auth' \
    'pages/legal' \
    'cloud/assets' \
    'nginx-vendor-static' \
    'proxy_request_buffering off'
  do
    grep -q "$needle" "$CONF" && echo "  ok conf: $needle" || {
      echo "  BAD conf: нет $needle" >&2
      fail=1
    }
  done
fi

if [[ -f /etc/nginx/sites-enabled/lbl3d-cloud ]]; then
  echo "==> Nginx на сервере"
  grep -q 'frontend/cloud' /etc/nginx/sites-enabled/lbl3d-cloud && echo "  ok root → cloud" || {
    echo "  WARN root не frontend/cloud" >&2
    fail=1
  }
  grep -q 'pages/billing' /etc/nginx/sites-enabled/lbl3d-cloud && echo "  ok billing location" || {
    echo "  WARN нет pages/billing — обновите nginx: cp backend/nginx-lbl3d-cloud.conf" >&2
    fail=1
  }
  grep -q 'pages/auth' /etc/nginx/sites-enabled/lbl3d-cloud && echo "  ok auth на cloud" || {
    echo "  WARN auth редирект на lbl3d — обновите nginx" >&2
    fail=1
  }
  grep -q 'nginx-vendor-static' /etc/nginx/sites-enabled/lbl3d-cloud && echo "  ok vendor include" || {
    echo "  WARN нет vendor include — bash fix-cloud-vendor.sh" >&2
    fail=1
  }
  if command -v nginx >/dev/null 2>&1; then
    nginx -t 2>/dev/null && echo "  ok nginx -t" || {
      echo "  BAD nginx -t" >&2
      fail=1
    }
  fi
else
  echo "  WARN /etc/nginx/sites-enabled/lbl3d-cloud нет (ещё не установлен)" >&2
fi

echo "==> HTTP проверки (если curl и DNS)"
if command -v curl >/dev/null 2>&1; then
  for url in \
    "https://cloud.lbl3d.info/" \
    "https://cloud.lbl3d.info/app/" \
    "https://cloud.lbl3d.info/pages/billing/" \
    "https://cloud.lbl3d.info/pages/auth/login" \
    "https://cloud.lbl3d.info/vendor/fonts/roboto-latin-400-normal.woff2"
  do
    code="$(curl -sI -o /dev/null -w '%{http_code}' --max-time 12 "$url" 2>/dev/null || echo 000)"
    ctype="$(curl -sI --max-time 12 "$url" 2>/dev/null | grep -i '^content-type:' | head -1 || true)"
    if [[ "$code" == "200" || "$code" == "302" ]]; then
      echo "  ok $code $url"
      if [[ "$url" == *woff2* && "$ctype" != *font* && "$ctype" != *octet* ]]; then
        echo "  BAD woff2 content-type: $ctype" >&2
        fail=1
      fi
    else
      echo "  WARN $code $url" >&2
    fi
  done
fi

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "Исправление:" >&2
  echo "  cp /home/site/backend/nginx-lbl3d-cloud.conf /etc/nginx/sites-available/lbl3d-cloud" >&2
  echo "  nginx -t && systemctl reload nginx" >&2
  echo "  bash /home/site/backend/fix-cloud-vendor.sh" >&2
fi
exit "$fail"
