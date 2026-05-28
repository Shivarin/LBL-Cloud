#!/usr/bin/env bash
# Выкладка /app/ на cloud.lbl3d.info (HTML + CSS + JS)
# Запуск на сервере из корня репозитория: bash backend/deploy-cloud-app.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_HTML="$ROOT/frontend/pages/file/app/index.html"
APP_CSS="$ROOT/frontend/pages/file/css"
APP_JS="$ROOT/frontend/pages/file/js"

echo "LBL Cloud /app/ deploy check"
echo "  ROOT=$ROOT"

for f in "$APP_HTML" "$APP_CSS/lbl-drive-gdrive.css" "$APP_CSS/lbl-drive-polish.css" "$APP_CSS/lbl-drive-profile.css" "$APP_CSS/lbl-drive-uploads.css" "$APP_CSS/lbl-drive-layout.css" "$APP_JS/lbl-drive.js" "$APP_JS/lbl-drive-upload.js"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: missing $f"
    exit 1
  fi
done

if ! grep -q 'profileSecurityCard' "$APP_HTML"; then
  echo "ERROR: index.html missing account security (profileSecurityCard). Abort."
  exit 1
fi

if ! grep -q 'ld-account-card' "$APP_HTML"; then
  echo "ERROR: index.html missing ld-account-card (2FA/password UI). Abort."
  exit 1
fi

if ! grep -q 'ld-ui-gdrive' "$APP_HTML"; then
  echo "ERROR: index.html is not the new Drive UI (no ld-ui-gdrive). Abort."
  exit 1
fi

if ! grep -q 'lbl-drive-gdrive.css' "$APP_HTML"; then
  echo "ERROR: index.html does not link lbl-drive-gdrive.css. Abort."
  exit 1
fi

echo "OK: new UI files present locally."
echo ""
echo "If this machine IS the server, files are already in place."
echo "Reload nginx (optional): sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "Verify in browser (hard refresh Ctrl+Shift+R):"
echo "  https://cloud.lbl3d.info/app/?demo=1"
echo "View source must contain: <!-- LBL Cloud app UI v7"
echo ""
echo "Quick remote check:"
if command -v curl >/dev/null 2>&1; then
  code=$(curl -sI -o /dev/null -w "%{http_code}" "https://cloud.lbl3d.info/app/css/lbl-drive-gdrive.css" || true)
  echo "  GET /app/css/lbl-drive-gdrive.css → HTTP $code (expect 200)"
  if curl -s "https://cloud.lbl3d.info/app/" 2>/dev/null | grep -q 'ld-ui-gdrive'; then
    echo "  GET /app/ HTML → contains ld-ui-gdrive (new UI live)"
  else
    echo "  GET /app/ HTML → OLD version still served — sync repo to /home/site and retry"
  fi
fi
