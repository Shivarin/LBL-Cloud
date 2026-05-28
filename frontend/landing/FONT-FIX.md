# Шрифты на cloud.lbl3d.info — «download failed»

## Почему в консоли `status=2147746065`

Chrome не смог **скачать или распознать** файл шрифта. Чаще всего:

1. **В кэше лежит HTML** (раньше nginx отдавал `index.html` вместо `.woff2` с заголовком `Cache-Control: immutable` — браузер месяцами помнит «битый» шрифт).
2. **Нет файла на диске** — в git только `fonts.css`, `.woff2` качает `setup-vendor.sh`.
3. **Неверный nginx** — `location /` перехватывает `/vendor/` раньше `include nginx-vendor-static.conf`, или `fix-site-vendor.sh` добавил `try_files` в `alias` (ломает отдачу).

Код `2147746065` — это не код HTTP, а внутренняя ошибка загрузки (часто 404/HTML/битый woff2).

## Исправление на сервере

```bash
cd /home/site/backend
sed -i 's/\r$//' *.sh nginx-vendor-static.conf
bash fix-cloud-vendor.sh
bash fix-cloud-nginx-500.sh
```

## После деплоя в браузере

1. **Жёсткое обновление:** Ctrl+Shift+R на https://cloud.lbl3d.info/app/
2. Или DevTools → Application → Clear site data для `cloud.lbl3d.info`
3. Убедитесь: `fonts.css?v=5`, а в CSS **без** `?v=` на `.woff2` (только на ссылке stylesheets)

## Проверка (должно быть wOFF2 = `77 4f 46 32`)

```bash
curl -sI https://cloud.lbl3d.info/vendor/fonts/roboto-latin-400-normal.woff2
# HTTP/2 200
# content-type: font/woff2
# НЕ должно быть: cache-control: immutable (старый конфиг)

curl -s https://cloud.lbl3d.info/vendor/fonts/roboto-latin-400-normal.woff2 | head -c 4 | od -An -tx1
# 77 4f 46 32

curl -s https://cloud.lbl3d.info/vendor/fonts/fonts.css?v=5 | head -3
# @font-face ... roboto-latin-400-normal.woff2" (без ?v= в URL файла)
```

## Порядок в nginx (cloud.lbl3d.info)

В `server {}` **до** `location /`:

```nginx
include /home/site/backend/nginx-vendor-static.conf;
```

Не дублируйте второй `location ^~ /vendor/` с `alias` + `try_files`.

## Перезапуск API

Шрифты не зависят от uvicorn. Если не грузятся файлы в диске — `bash start-api.sh`.
