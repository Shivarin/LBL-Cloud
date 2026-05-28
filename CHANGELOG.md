# Changelog

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).

## [1.0.0] — 2026-05

### Добавлено

- Лендинг LBL Cloud с тарифами и CTA
- Веб-приложение «Мой диск» (`/app/`)
- API `/api/drive/*`: папки, browse, upload, корзина, превью
- API `/api/cloud/billing/*`: тарифы, checkout, sync-pending
- 2FA при входе и в профиле
- Страницы входа, регистрации, биллинга, legal
- Деплой-скрипты и nginx-конфиг для `cloud.lbl3d.info`

### Исправлено

- Модальное окно 2FA: видимое поле OTP
- Видимость блока «Безопасность и вход» в аккаунте
- Валидность HTML на лендинге и в приложении

### Документация

- Пояснительная записка, API-справочник, портфолио README

[1.0.0]: https://github.com/Shivarin/LBL-Cloud/releases/tag/v1.0.0
