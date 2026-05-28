# Фрагмент для листинга А.13 (пояснительная записка).
# Полный файл: site/backend/main.py (общий FastAPI-приложение LBL).

@app.post("/api/2fa/enable")
async def enable_2fa(
    http_request: Request,
    body: Enable2FARequest = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Включение 2FA: отправка кода на email (бренд Cloud при запросе с cloud.lbl3d.info)."""
    email_brand = resolve_email_brand(http_request)
    if not current_user.two_factor_enabled:
        code = generate_2fa_code()
        two_fa_codes[current_user.id] = {
            "code": code,
            "expires_at": datetime.utcnow() + timedelta(minutes=10),
            "action": "enable",
        }
        send_2fa_code_email(current_user.email, code, brand=email_brand)
        return {
            "message": "Код подтверждения отправлен на вашу почту",
            "requires_code": True,
        }
    return {"message": "2FA уже включена"}


@app.put("/api/change-password")
async def change_password(
    body: ChangePasswordRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Смена пароля авторизованного пользователя."""
    old_password = body.get_old_password()
    if not old_password:
        raise HTTPException(status_code=400, detail="Требуется текущий пароль")

    password_valid = verify_password(old_password, current_user.hashed_password)
    if not password_valid and current_user.old_password:
        password_valid = verify_password(old_password, current_user.old_password)
    if not password_valid:
        raise HTTPException(status_code=401, detail="Неверный текущий пароль")

    current_user.hashed_password = get_password_hash(body.new_password)
    current_user.old_password = None
    current_user.password_changed_at = datetime.utcnow()
    db.commit()

    send_password_changed_notification_email(
        current_user.email,
        brand=resolve_email_brand(http_request),
    )
    return {"message": "Пароль успешно изменен. Уведомление отправлено на вашу почту."}
