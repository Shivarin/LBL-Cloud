# Фрагмент: 2FA при входе (POST /api/login).
# Полный файл: site/backend/main.py

# ... проверка email и пароля ...

if user.two_factor_enabled:
    if not login_data.two_factor_code:
        code = generate_2fa_code()
        two_fa_codes[user.id] = {
            "code": code,
            "expires_at": datetime.utcnow() + timedelta(minutes=10),
        }
        send_2fa_code_email(user.email, code, brand=email_brand)
        return {
            "requires_2fa": True,
            "message": "Код подтверждения отправлен на вашу почту",
        }

    stored = two_fa_codes.get(user.id)
    if not stored or datetime.utcnow() > stored["expires_at"]:
        raise HTTPException(status_code=400, detail="Код истек. Войдите снова.")
    if stored["code"] != login_data.two_factor_code:
        raise HTTPException(status_code=401, detail="Неверный код подтверждения")
    del two_fa_codes[user.id]

# ... выдача JWT / cookie ...
