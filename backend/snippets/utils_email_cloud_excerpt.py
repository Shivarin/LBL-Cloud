# Фрагмент для листинга А.15 (пояснительная записка).
# Полный файл: site/backend/utils.py

def resolve_email_brand(request=None, app_context: Optional[str] = None) -> str:
    """Определить бренд письма: cloud.lbl3d.info → LBL Cloud, иначе LBL Studio."""
    if app_context and str(app_context).lower() in ("cloud", "lbl_cloud", "lbl-cloud", "file"):
        return "cloud"
    if request is not None:
        for hdr in (
            getattr(request, "headers", {}).get("origin") or "",
            getattr(request, "headers", {}).get("referer") or "",
        ):
            low = hdr.lower()
            if "cloud.lbl3d.info" in low or "file.lbl3d.info" in low:
                return "cloud"
    return "studio"


def send_2fa_code_email(email: str, code: str, brand: str = "studio") -> bool:
    """Отправка кода 2FA на email."""
    b = _email_brand_config(brand)
    subject = f"Код входа — {b['product_short']}"

    if brand == "cloud":
        intro = (
            "Мы получили запрос на вход в LBL Cloud ID. "
            "Используйте код ниже. Код действует 10 минут."
        )
        where_note = (
            f'Код подходит для входа на cloud.lbl3d.info ({b["login_url"]}). '
            "После входа откроется личное хранилище файлов."
        )
    else:
        intro = "Мы получили запрос на вход в LBL Studio."
        where_note = "Код подходит для входа на lbl3d.info."

    html_body = _build_2fa_html(code=code, intro=intro, where_note=where_note, brand=brand)
    return send_email(email, subject, html_body, brand=brand)
