# Границы репозитория

Этот GitHub-репозиторий — **публичное портфолио и исходники продукта LBL Cloud**, а не полный монорепозиторий LBL Studio.

## Включено

- Frontend: лендинг, `/app/`, auth, billing, legal  
- Backend-модули: `lbl_drive.py`, `cloud_billing.py`  
- nginx, скрипты деплоя, фрагменты auth/почты в `backend/snippets/`  
- Документация: API, ТЗ, пояснительная записка  

## Не включено (намеренно)

- `main.py` целиком, операторка, форум, боты  
- `.env`, ключи ЮKassa, SMTP, JWT  
- `database.py`, полный `utils.py`  
- `vendor/` (шрифты ставятся на сервере)  

На продакшене Cloud работает через общий FastAPI-инстанс; модули из этого репо подключаются через `register_lbl_drive_routes` и `register_cloud_billing_routes`.

## Синхронизация с монорепо

Из корня `site`:

```powershell
powershell -File LBL-Cloud\sync-from-site.ps1
```

Файл `docs/API-CLOUD.md` и портфолио-доки в `docs/` при синхронизации не затираются.
