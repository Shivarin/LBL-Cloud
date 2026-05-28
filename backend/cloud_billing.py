"""
LBL Cloud — тарифы и оплата подписки (ЮKassa).
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import User, engine, get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cloud/billing", tags=["cloud-billing"])

CLOUD_PLANS: Dict[str, Dict[str, Any]] = {
    "cloud_test": {
        "id": "cloud_test",
        "name": "Тест",
        "title": "Подписка 10 ₽",
        "price_rub": 10.0,
        "storage_mb": float(os.getenv("LBL_CLOUD_TEST_MB", "51200")),
        "period_days": 30,
        "badge": "Пробный",
    },
    "cloud_pro": {
        "id": "cloud_pro",
        "name": "Pro",
        "title": "LBL Cloud Pro",
        "price_rub": 299.0,
        "storage_mb": 204800.0,
        "period_days": 30,
        "badge": "Популярный",
    },
    "cloud_team": {
        "id": "cloud_team",
        "name": "Team",
        "title": "LBL Cloud Team",
        "price_rub": 799.0,
        "storage_mb": 2097152.0,
        "period_days": 30,
        "badge": "Команда",
    },
}

CLOUD_RETURN_URL = os.getenv(
    "LBL_CLOUD_BILLING_RETURN",
    "https://cloud.lbl3d.info/app/?billing=success",
)


def ensure_cloud_billing_schema() -> None:
    stmts = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS cloud_plan VARCHAR(32) DEFAULT 'free'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS cloud_paid_until TIMESTAMP",
        """
        CREATE TABLE IF NOT EXISTS cloud_subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            plan_id VARCHAR(32) NOT NULL,
            amount_rub NUMERIC(10,2) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            yookassa_payment_id VARCHAR(255),
            yookassa_status VARCHAR(50),
            period_start TIMESTAMP,
            period_end TIMESTAMP,
            created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'utc'),
            updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'utc')
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_cloud_subscriptions_user ON cloud_subscriptions (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_cloud_subscriptions_payment ON cloud_subscriptions (yookassa_payment_id)",
    ]
    with engine.begin() as conn:
        for sql in stmts:
            conn.execute(text(sql))


def _plan_public(plan_id: str) -> Dict[str, Any]:
    p = CLOUD_PLANS.get(plan_id)
    if not p:
        raise HTTPException(status_code=404, detail="Тариф не найден")
    return {
        "id": p["id"],
        "name": p["name"],
        "title": p["title"],
        "price_rub": p["price_rub"],
        "storage_gb": round(p["storage_mb"] / 1024, 1),
        "period_days": p["period_days"],
        "badge": p.get("badge"),
    }


def apply_cloud_plan(user: User, plan_id: str, db: Session) -> None:
    plan = CLOUD_PLANS.get(plan_id)
    if not plan:
        return
    now = datetime.utcnow()
    row = db.execute(
        text("SELECT cloud_paid_until FROM users WHERE id = :id"),
        {"id": user.id},
    ).fetchone()
    paid_until = row[0] if row else None
    if paid_until and paid_until > now:
        base = paid_until
    else:
        base = now
    new_until = base + timedelta(days=int(plan["period_days"]))
    new_limit = max(float(user.storage_limit_mb or 0), float(plan["storage_mb"]))
    db.execute(
        text(
            "UPDATE users SET cloud_plan = :plan, cloud_paid_until = :until, "
            "storage_limit_mb = :lim WHERE id = :id"
        ),
        {"plan": plan_id, "until": new_until, "lim": new_limit, "id": user.id},
    )
    user.storage_limit_mb = new_limit


def sync_pending_cloud_subscriptions(user_id: int, db: Session) -> int:
    """Если webhook не пришёл — активировать подписку по статусу в ЮKassa (как deposit/check-pending)."""
    from yookassa_client import get_payment

    rows = db.execute(
        text(
            "SELECT id, yookassa_payment_id FROM cloud_subscriptions "
            "WHERE user_id = :uid AND status = 'pending' AND yookassa_payment_id IS NOT NULL"
        ),
        {"uid": user_id},
    ).fetchall()
    activated = 0
    for row in rows:
        sub_id, pid = row[0], row[1]
        info = get_payment(pid)
        if not info or info.get("status") != "succeeded":
            continue
        meta = info.get("metadata") or {}
        meta.setdefault("product", "cloud_subscription")
        meta.setdefault("cloud_subscription_id", str(sub_id))
        if process_cloud_payment_webhook(pid, meta, db):
            activated += 1
    return activated


def _user_cloud_row(db: Session, user_id: int):
    try:
        return db.execute(
            text(
                "SELECT cloud_plan, cloud_paid_until, storage_limit_mb FROM users WHERE id = :id"
            ),
            {"id": user_id},
        ).fetchone()
    except Exception:
        return None


def process_cloud_payment_webhook(
    payment_id: str,
    metadata: Dict[str, Any],
    db: Session,
) -> bool:
    """Активация подписки после payment.succeeded."""
    if metadata.get("product") != "cloud_subscription":
        return False
    sub_id = metadata.get("cloud_subscription_id")
    if not sub_id:
        return False
    try:
        sub_id_int = int(sub_id)
    except (TypeError, ValueError):
        return False

    row = db.execute(
        text(
            "SELECT id, user_id, plan_id, status FROM cloud_subscriptions "
            "WHERE id = :id AND yookassa_payment_id = :pid"
        ),
        {"id": sub_id_int, "pid": payment_id},
    ).fetchone()
    if not row or row[3] == "active":
        return False

    user = db.query(User).filter(User.id == row[1]).first()
    if not user:
        return False

    plan_id = row[2]
    plan = CLOUD_PLANS.get(plan_id)
    if not plan:
        return False

    now = datetime.utcnow()
    period_end = now + timedelta(days=int(plan["period_days"]))

    db.execute(
        text(
            "UPDATE cloud_subscriptions SET status = 'active', yookassa_status = 'succeeded', "
            "period_start = :ps, period_end = :pe, updated_at = :ua WHERE id = :id"
        ),
        {"ps": now, "pe": period_end, "ua": now, "id": sub_id_int},
    )
    apply_cloud_plan(user, plan_id, db)
    db.commit()
    logger.info("LBL Cloud: активирован тариф %s для user %s", plan_id, user.id)
    return True


class CheckoutBody(BaseModel):
    plan_id: str = Field(..., min_length=3, max_length=32)


def register_cloud_billing_routes(app) -> None:
    from main import get_current_user

    ensure_cloud_billing_schema()

    @router.get("/plans")
    async def billing_plans():
        free_mb = float(os.getenv("LBL_CLOUD_FREE_MB", "5120"))
        plans = [_plan_public(pid) for pid in ("cloud_test", "cloud_pro", "cloud_team")]
        return {
            "product": "LBL Cloud",
            "free_storage_gb": round(free_mb / 1024, 1),
            "plans": plans,
        }

    @router.get("/status")
    async def billing_status(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        row = _user_cloud_row(db, current_user.id)
        plan = (row[0] if row else None) or "free"
        paid_until = row[1] if row else None
        storage_mb = float(row[2] if row and row[2] is not None else current_user.storage_limit_mb or 0)
        active = bool(
            plan and plan != "free"
            and paid_until
            and paid_until > datetime.utcnow()
        )
        pub = _plan_public(plan) if plan in CLOUD_PLANS and active else None
        return {
            "plan_id": plan if active else "free",
            "plan_name": pub["name"] if pub else "Бесплатный",
            "active": active,
            "paid_until": paid_until.isoformat() if paid_until else None,
            "storage_limit_mb": storage_mb,
            "storage_gb": round(storage_mb / 1024, 2),
        }

    @router.post("/sync-pending")
    async def billing_sync_pending(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        """После возврата с ЮKassa: активировать подписку, если webhook не сработал."""
        n = sync_pending_cloud_subscriptions(current_user.id, db)
        row = _user_cloud_row(db, current_user.id)
        plan = (row[0] if row else None) or "free"
        paid_until = row[1] if row else None
        storage_mb = float(row[2] if row and row[2] is not None else 0)
        active = bool(
            plan and plan != "free"
            and paid_until
            and paid_until > datetime.utcnow()
        )
        pub = _plan_public(plan) if plan in CLOUD_PLANS and active else None
        return {
            "activated": n,
            "plan_id": plan if active else "free",
            "plan_name": pub["name"] if pub else "Бесплатный",
            "active": active,
            "paid_until": paid_until.isoformat() if paid_until else None,
            "storage_limit_mb": storage_mb,
            "storage_gb": round(storage_mb / 1024, 2),
        }

    @router.post("/checkout")
    async def billing_checkout(
        body: CheckoutBody,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        plan_id = body.plan_id.strip()
        if plan_id not in CLOUD_PLANS:
            raise HTTPException(status_code=400, detail="Неизвестный тариф")

        plan = CLOUD_PLANS[plan_id]
        from yookassa_client import create_payment

        result = db.execute(
            text(
                "INSERT INTO cloud_subscriptions (user_id, plan_id, amount_rub, status) "
                "VALUES (:uid, :pid, :amt, 'pending') RETURNING id"
            ),
            {"uid": current_user.id, "pid": plan_id, "amt": plan["price_rub"]},
        )
        sub_id = result.scalar()
        db.commit()

        return_url = os.getenv(
            "LBL_CLOUD_BILLING_RETURN",
            "https://cloud.lbl3d.info/app/?billing=success",
        )
        metadata = {
            "product": "cloud_subscription",
            "plan_id": plan_id,
            "user_id": str(current_user.id),
            "cloud_subscription_id": str(sub_id),
        }
        yk = create_payment(
            amount_rub=float(plan["price_rub"]),
            return_url=return_url,
            description=f"LBL Cloud — {plan['title']}",
            metadata=metadata,
        )
        if not yk or not yk.get("confirmation_url"):
            raise HTTPException(status_code=502, detail="Не удалось создать платёж")

        db.execute(
            text(
                "UPDATE cloud_subscriptions SET yookassa_payment_id = :yp, "
                "yookassa_status = :ys, updated_at = :ua WHERE id = :id"
            ),
            {
                "yp": yk.get("payment_id"),
                "ys": yk.get("status"),
                "ua": datetime.utcnow(),
                "id": sub_id,
            },
        )
        db.commit()

        return {
            "cloud_subscription_id": sub_id,
            "plan_id": plan_id,
            "amount_rub": plan["price_rub"],
            "confirmation_url": yk["confirmation_url"],
            "payment_id": yk.get("payment_id"),
        }

    app.include_router(router)
    logger.info("LBL Cloud billing routes mounted at /api/cloud/billing")
