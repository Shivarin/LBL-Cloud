# LBL Cloud — https://cloud.lbl3d.info/

| URL | Файлы на сервере |
|-----|------------------|
| `/` | `frontend/cloud/` (лендинг) |
| `/app/` | `frontend/pages/file/app/` |
| `/pages/billing/` | `frontend/cloud/pages/billing/` |
| `/pages/auth/` | `frontend/cloud/pages/auth/` (SSO → lbl3d.info) |
| `/pages/legal/` | `frontend/cloud/pages/legal/` |
| `/cloud/assets/` | `frontend/cloud/assets/` (фон, hero) |
| `/api/` | uvicorn :5000 |

Старый путь **lbl3d.info/pages/file/** → редирект (`nginx-cloud-redirect.conf`).

## Nginx (обязательно обновить)

```bash
cp /home/site/backend/nginx-lbl3d-cloud.conf /etc/nginx/sites-available/lbl3d-cloud
ln -sf /etc/nginx/sites-available/lbl3d-cloud /etc/nginx/sites-enabled/lbl3d-cloud
nginx -t && systemctl reload nginx
```

Первый раз + SSL:

```bash
export CERTBOT_EMAIL='you@example.com'
bash /home/site/backend/deploy-cloud-nginx.sh
```

Проверка:

```bash
bash /home/site/backend/verify-cloud-deploy.sh
```

В конфиге должны быть: `pages/billing`, `pages/auth`, `pages/legal`, `cloud/assets`, `include nginx-vendor-static.conf`, **без** `return 302` на lbl3d для `/pages/auth/`.

## Что есть

- Мой диск, корзина, избранное, недавние, настройки
- Превью фото/видео/PDF (`/api/drive/files/{id}/preview`)
- Тарифы и оплата (`/pages/billing/`, `/api/cloud/billing/*`)
- API: `/api/drive/*`

## Деплой интерфейса `/app/`

Новый дизайн (Drive-layout) лежит в репозитории здесь:

| Файл на сервере | Путь в git |
|-----------------|------------|
| `/home/site/frontend/pages/file/app/index.html` | `frontend/pages/file/app/index.html` |
| `/home/site/frontend/pages/file/css/lbl-drive.css` | … |
| `/home/site/frontend/pages/file/css/lbl-drive-gdrive.css` | **обязателен** |
| `/home/site/frontend/pages/file/js/lbl-drive.js` | … |

После `git pull` или копирования файлов:

```bash
bash /home/site/backend/deploy-cloud-app.sh
```

В браузере: **Ctrl+Shift+R** на `https://cloud.lbl3d.info/app/?demo=1`  
В исходном коде страницы должно быть: `<!-- LBL Cloud app UI v3` и `class="lbl-drive-app ld-ui-gdrive"`.

Локальная проверка (Windows/Linux):

```bash
python3 backend/dev-serve-cloud.py
# → http://127.0.0.1:8766/app/?demo=1
```

Если на проде по-прежнему блок «Настройки LBL Cloud / Внешний вид» — на сервере **старый** `index.html`, не из этого репозитория.

## Деплой API и БД

```bash
cd /home/site/backend

# схема БД (папки, корзина, избранное, billing)
python3 -c "from lbl_drive import ensure_drive_schema; ensure_drive_schema()"
python3 -c "from cloud_billing import ensure_cloud_billing_schema; ensure_cloud_billing_schema()"

# шрифты
bash fix-cloud-vendor.sh

# nginx
cp nginx-lbl3d-cloud.conf /etc/nginx/sites-available/lbl3d-cloud
nginx -t && systemctl reload nginx

# API
systemctl restart lblstudio   # или ваш unit / pkill uvicorn + nohup
```

Картинки (если 404): положить в `frontend/cloud/assets/` — `cloudscape-hero.png` и др.

Открыть: **https://cloud.lbl3d.info/app/**

## Переменные

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `LBL_DRIVE_MAX_MB` | 1024 | Макс. размер одного файла |
| `LBL_DRIVE_CHUNK_MB` | 8 | Размер порции при больших загрузках |
| `UPLOADS_BASE` | `/home/site/uploads` | Корень; файлы в `drive/{user_id}/` |
| `AUTH_COOKIE_DOMAIN` | `.lbl3d.info` | **Обязательно** для входа с lbl3d.info → cloud.lbl3d.info |
| `CORS_ORIGINS` | … | Должен включать `https://cloud.lbl3d.info` |

Вход (автономный URL): `https://cloud.lbl3d.info/pages/auth/login?return=https://cloud.lbl3d.info/app/` — страница на cloud, затем SSO на lbl3d.info и возврат с токеном в hash.

## Отличие от file.lbl3d.info

| | **LBL Cloud** `cloud.lbl3d.info` | **LBL Файлы** `file.lbl3d.info` |
|--|----------------------|----------------------------|
| Вход | Да | Нет |
| Папки | Да | Одна ссылка на загрузку |
| Срок | Пока есть аккаунт | TTL 7 дней |
| ClamAV | Нет (профиль) | Да |
