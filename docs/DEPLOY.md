# Деплой LBL Cloud (кратко)

Полный репозиторий: `/home/site` на сервере. Эта папка — **копия файлов Cloud** для документации.

## Куда копировать на сервере

| Локально (LBL-Cloud) | На сервере |
|----------------------|------------|
| `frontend/landing/*` | `/home/site/frontend/cloud/` |
| `frontend/app/index.html` | `/home/site/frontend/pages/file/app/index.html` |
| `frontend/app/css/*` | `/home/site/frontend/pages/file/css/` |
| `frontend/app/js/*` | `/home/site/frontend/pages/file/js/` |
| `frontend/auth/*` | `/home/site/frontend/cloud/pages/auth/` |
| `frontend/billing/*` | `/home/site/frontend/cloud/pages/billing/` |
| `frontend/legal/*` | `/home/site/frontend/cloud/pages/legal/` |
| `frontend/shared/js/api.js` | `/home/site/frontend/js/core/api.js` |
| `backend/lbl_drive.py` | `/home/site/backend/lbl_drive.py` |
| `backend/cloud_billing.py` | `/home/site/backend/cloud_billing.py` |
| `backend/nginx-lbl3d-cloud.conf` | `/etc/nginx/sites-available/lbl3d-cloud` |

## Команды

```bash
bash /home/site/backend/deploy-cloud-app.sh
bash /home/site/backend/verify-cloud-deploy.sh
bash /home/site/backend/start-api.sh
bash /home/site/backend/fix-cloud-vendor.sh
```

Проверка: https://cloud.lbl3d.info/app/
