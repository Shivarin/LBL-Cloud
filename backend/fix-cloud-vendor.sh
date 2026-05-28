#!/usr/bin/env bash
# cloud.lbl3d.info + lbl3d.info: шрифты /vendor/
if [ -f "$0" ] && grep -q $'\r' "$0" 2>/dev/null; then
  sed -i 's/\r$//' /home/site/backend/*.sh "$0" 2>/dev/null || true
  exec /usr/bin/env bash "$0" "$@"
fi
set -eu

ROOT="${ROOT:-/home/site}"
BACKEND="${ROOT}/backend"
VENDOR="${ROOT}/frontend/vendor"
CLOUD_NGX="${BACKEND}/nginx-lbl3d-cloud.conf"
SITE_FILE="/etc/nginx/sites-available/lbl3d-cloud"
DOMAIN="cloud.lbl3d.info"

run() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

echo "==> 0/5 CRLF в backend/*.sh"
for f in "${BACKEND}"/*.sh; do
  [ -f "$f" ] && sed -i 's/\r$//' "$f" 2>/dev/null || true
done

echo "==> 1/5 Скачать vendor (Roboto, Montserrat, Font Awesome)"
bash "${BACKEND}/setup-vendor.sh"

echo ""
echo "==> 2/5 Проверка woff2 на диске"
REQUIRED="roboto-cyrillic-300-normal.woff2 roboto-cyrillic-400-normal.woff2 roboto-cyrillic-500-normal.woff2 roboto-cyrillic-700-normal.woff2
roboto-latin-300-normal.woff2 roboto-latin-400-normal.woff2 roboto-latin-500-normal.woff2 roboto-latin-700-normal.woff2
montserrat-cyrillic-400-normal.woff2 montserrat-cyrillic-500-normal.woff2 montserrat-cyrillic-600-normal.woff2
montserrat-cyrillic-700-normal.woff2 montserrat-cyrillic-800-normal.woff2
montserrat-latin-400-normal.woff2 montserrat-latin-500-normal.woff2 montserrat-latin-600-normal.woff2
montserrat-latin-700-normal.woff2 montserrat-latin-800-normal.woff2"

fail=0
for name in $REQUIRED; do
  p="${VENDOR}/fonts/${name}"
  if [ ! -f "$p" ]; then
    echo "  MISSING ${name}" >&2
    fail=1
    continue
  fi
  sig="$(head -c 4 "$p" 2>/dev/null | od -An -tx1 2>/dev/null | tr -d ' \n' || true)"
  if [ "$sig" = "774f4632" ]; then
    echo "  ok ${name}"
  else
    echo "  BAD ${name} (sig=${sig:-empty})" >&2
    fail=1
  fi
done

if [ ! -f "${VENDOR}/fonts/fonts.css" ]; then
  echo "  MISSING fonts.css" >&2
  fail=1
fi
if [ "$fail" -ne 0 ]; then
  echo "Повторите: bash ${BACKEND}/setup-vendor.sh" >&2
  exit 1
fi

echo ""
echo "==> 3/5 Nginx vendor + cloud"
if [ -f "$CLOUD_NGX" ] && [ -f "$SITE_FILE" ]; then
  run cp -a "$CLOUD_NGX" "$SITE_FILE"
  run ln -sf "$SITE_FILE" /etc/nginx/sites-enabled/lbl3d-cloud 2>/dev/null || true
  run nginx -t
  run systemctl reload nginx
fi

echo ""
echo "==> 4/5 Nginx lbl3d.info"
if [ -f "${BACKEND}/fix-site-vendor.sh" ]; then
  bash "${BACKEND}/fix-site-vendor.sh" || true
fi

echo ""
echo "==> 5/5 HTTP https://${DOMAIN}/vendor/fonts/"
http_fail=0
for name in roboto-latin-400-normal.woff2 montserrat-latin-700-normal.woff2; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "https://${DOMAIN}/vendor/fonts/${name}" 2>/dev/null || echo '?')"
  sig="$(curl -sS "https://${DOMAIN}/vendor/fonts/${name}" 2>/dev/null | head -c 4 | od -An -tx1 2>/dev/null | tr -d ' \n' || true)"
  echo "  ${name}: HTTP ${code} sig=${sig}"
  if [ "$code" != "200" ] || [ "$sig" != "774f4632" ]; then
    http_fail=1
  fi
done
if [ "$http_fail" -ne 0 ]; then
  exit 1
fi
echo "Готово. Ctrl+Shift+R в браузере."
