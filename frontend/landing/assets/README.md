# Картинки лендинга LBL Cloud

Положите сюда PNG (и задеплойте на сервер в `/home/site/frontend/cloud/assets/`).

| Файл | Где используется |
|------|------------------|
| `cloudscape-hero.png` | Фон неба в `.cloudscape::before` |
| `detail-wide-scene.png` | Секция «Удобство в каждой детали» |
| `testimonial-avatars.png` | Спрайт аватаров в отзывах (4 лица в одном ряду) |

URL на сайте: `https://cloud.lbl3d.info/cloud/assets/имя-файла.png`

Проверка после загрузки:

```bash
curl -sI https://cloud.lbl3d.info/cloud/assets/cloudscape-hero.png | head -3
# HTTP/2 200 и Content-Type: image/png
```
