"""
LBL Drive — личное облако (/pages/file/).
Папки, быстрая потоковая и порционная загрузка, интеграция с UserFile.
"""

from __future__ import annotations

import json
import logging
import os
import re
import secrets
import shutil
import time
from datetime import datetime, timedelta
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, text
from sqlalchemy.orm import Session

from database import User, UserDriveFolder, UserFile, engine, get_db

logger = logging.getLogger(__name__)

DRIVE_MAX_MB = float(os.getenv("LBL_DRIVE_MAX_MB", os.getenv("MAX_UPLOAD_SIZE_MB", "1024")))
DRIVE_MAX_BYTES = int(DRIVE_MAX_MB * 1024 * 1024)
DRIVE_CHUNK_BYTES = int(os.getenv("LBL_DRIVE_CHUNK_MB", "16")) * 1024 * 1024
DRIVE_PARALLEL_CHUNKS = max(2, min(8, int(os.getenv("LBL_DRIVE_PARALLEL_CHUNKS", "6"))))
DRIVE_PARALLEL_THRESHOLD_MB = float(os.getenv("LBL_DRIVE_PARALLEL_THRESHOLD_MB", "4"))
DRIVE_STORAGE = os.path.join(os.getenv("UPLOADS_BASE", "/home/site/uploads"), "drive")
DRIVE_SESSIONS = os.path.join(os.getenv("UPLOADS_BASE", "/home/site/uploads"), "drive_sessions")
# Бесплатный старт LBL Cloud (5 ГБ)
LBL_CLOUD_FREE_MB = float(os.getenv("LBL_CLOUD_FREE_MB", "5120"))
FOLDER_NAME_RE = re.compile(r'^[^/\\<>:"|?*\x00-\x1f]{1,120}$')
DRIVE_JWT_SECRET = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
DRIVE_JWT_ALG = "HS256"
PREVIEW_EXT_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
}
_security = HTTPBearer(auto_error=False)


def cloud_storage_limit_mb(user: User) -> float:
    """Минимум 5 ГБ для облака (можно больше по уровню аккаунта)."""
    base = float(user.storage_limit_mb or 0)
    return max(base, LBL_CLOUD_FREE_MB)

router = APIRouter(prefix="/api/drive", tags=["drive"])


def ensure_drive_schema() -> None:
    """Добавляет таблицу папок и folder_id без отдельной миграции Alembic."""
    stmts = [
        """
        CREATE TABLE IF NOT EXISTS user_drive_folders (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            parent_id INTEGER REFERENCES user_drive_folders(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'utc'),
            updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'utc'),
            CONSTRAINT uq_user_drive_folder_name UNIQUE (user_id, parent_id, name)
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_user_drive_folders_user_id ON user_drive_folders (user_id)",
        "ALTER TABLE user_files ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES user_drive_folders(id) ON DELETE SET NULL",
        "CREATE INDEX IF NOT EXISTS ix_user_files_folder_id ON user_files (folder_id)",
        "ALTER TABLE user_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
        "ALTER TABLE user_files ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE",
        "ALTER TABLE user_drive_folders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
        "ALTER TABLE user_drive_folders ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE",
        """
        CREATE TABLE IF NOT EXISTS user_drive_recent (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            file_id INTEGER REFERENCES user_files(id) ON DELETE CASCADE,
            folder_id INTEGER REFERENCES user_drive_folders(id) ON DELETE CASCADE,
            action VARCHAR(32) DEFAULT 'open',
            accessed_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'utc')
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_user_drive_recent_user ON user_drive_recent (user_id, accessed_at DESC)",
    ]
    with engine.begin() as conn:
        for sql in stmts:
            conn.execute(text(sql))


def _user_drive_root(user_id: int) -> str:
    path = os.path.join(DRIVE_STORAGE, str(user_id))
    os.makedirs(path, exist_ok=True)
    return path


def _storage_used_mb(db: Session, user_id: int) -> float:
    return float(
        db.query(func.sum(UserFile.file_size_mb))
        .filter(UserFile.user_id == user_id, text("user_files.deleted_at IS NULL"))
        .scalar()
        or 0.0
    )


def _auth_token(request: Request, credentials: Optional[HTTPAuthorizationCredentials]) -> Optional[str]:
    if credentials and getattr(credentials, "credentials", None):
        return credentials.credentials
    return request.cookies.get(os.getenv("AUTH_COOKIE_NAME", "access_token"))


def _user_from_token(token: str, db: Session) -> Optional[User]:
    try:
        payload = jwt.decode(token, DRIVE_JWT_SECRET, algorithms=[DRIVE_JWT_ALG])
        uid = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        return None
    return db.query(User).filter(User.id == uid).first()


def _record_recent(
    db: Session,
    user_id: int,
    *,
    file_id: Optional[int] = None,
    folder_id: Optional[int] = None,
    action: str = "open",
) -> None:
    if file_id is None and folder_id is None:
        return
    db.execute(
        text(
            "INSERT INTO user_drive_recent (user_id, file_id, folder_id, action, accessed_at) "
            "VALUES (:uid, :fid, :fold, :act, :at)"
        ),
        {
            "uid": user_id,
            "fid": file_id,
            "fold": folder_id,
            "act": action[:32],
            "at": datetime.utcnow(),
        },
    )


def _folder_tree_ids(db: Session, user_id: int, root_id: int) -> List[int]:
    ids = [root_id]
    queue = [root_id]
    while queue:
        fid = queue.pop(0)
        children = (
            db.query(UserDriveFolder.id)
            .filter(UserDriveFolder.user_id == user_id, UserDriveFolder.parent_id == fid)
            .all()
        )
        for (cid,) in children:
            ids.append(cid)
            queue.append(cid)
    return ids


def _soft_delete_folder_tree(db: Session, user_id: int, folder_id: int) -> None:
    now = datetime.utcnow()
    ids = _folder_tree_ids(db, user_id, folder_id)
    for fid in ids:
        db.execute(
            text(
                "UPDATE user_files SET deleted_at = :n WHERE user_id = :u AND folder_id = :fid "
                "AND deleted_at IS NULL"
            ),
            {"n": now, "u": user_id, "fid": fid},
        )
    for fid in ids:
        db.execute(
            text(
                "UPDATE user_drive_folders SET deleted_at = :n WHERE user_id = :u AND id = :fid"
            ),
            {"n": now, "u": user_id, "fid": fid},
        )


def _file_dict(f: UserFile) -> dict:
    return {
        "id": f.id,
        "original_filename": f.original_filename,
        "file_size_mb": f.file_size_mb,
        "file_type": f.file_type,
        "folder_id": f.folder_id,
        "uploaded_at": f.uploaded_at.isoformat() if f.uploaded_at else None,
        "is_favorite": bool(getattr(f, "is_favorite", False)),
    }


def _folder_dict(f: UserDriveFolder, file_count: int = 0) -> dict:
    return {
        "id": f.id,
        "name": f.name,
        "parent_id": f.parent_id,
        "created_at": f.created_at.isoformat() if f.created_at else None,
        "updated_at": f.updated_at.isoformat() if f.updated_at else None,
        "is_favorite": bool(getattr(f, "is_favorite", False)),
        "count": file_count,
    }


def _preview_media_type(filename: str, stored: Optional[str]) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    return PREVIEW_EXT_MIME.get(ext) or stored or "application/octet-stream"


def _folder_or_404(db: Session, user_id: int, folder_id: Optional[int]) -> Optional[UserDriveFolder]:
    if folder_id is None:
        return None
    row = (
        db.query(UserDriveFolder)
        .filter(
            UserDriveFolder.id == folder_id,
            UserDriveFolder.user_id == user_id,
            text("user_drive_folders.deleted_at IS NULL"),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Папка не найдена")
    return row


def _breadcrumbs(db: Session, folder: Optional[UserDriveFolder]) -> List[dict]:
    crumbs = [{"id": None, "name": "Мой диск"}]
    if not folder:
        return crumbs
    chain: List[UserDriveFolder] = []
    cur: Optional[UserDriveFolder] = folder
    while cur:
        chain.append(cur)
        if cur.parent_id is None:
            break
        cur = db.query(UserDriveFolder).filter(UserDriveFolder.id == cur.parent_id).first()
    for f in reversed(chain):
        crumbs.append({"id": f.id, "name": f.name})
    return crumbs


def _safe_folder_name(name: str) -> str:
    n = (name or "").strip()
    if not n or n in (".", "..") or "/" in n or "\\" in n:
        raise HTTPException(status_code=400, detail="Недопустимое имя папки")
    if not FOLDER_NAME_RE.match(n):
        raise HTTPException(status_code=400, detail="Недопустимые символы в имени папки")
    return n


async def _stream_upload_to_disk(upload: UploadFile, dest: str, max_bytes: int) -> int:
    written = 0
    try:
        with open(dest, "wb") as out:
            while True:
                chunk = await upload.read(DRIVE_CHUNK_BYTES)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Файл больше {DRIVE_MAX_MB:.0f} МБ",
                    )
                out.write(chunk)
    except HTTPException:
        if os.path.isfile(dest):
            os.remove(dest)
        raise
    except OSError as exc:
        if os.path.isfile(dest):
            os.remove(dest)
        logger.exception("drive stream write: %s", exc)
        raise HTTPException(status_code=500, detail="Не удалось сохранить файл")
    return written


class FolderCreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    parent_id: Optional[int] = None


class FolderRenameBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


class FolderPatchBody(BaseModel):
    name: Optional[str] = None
    is_favorite: Optional[bool] = None


class FileMoveBody(BaseModel):
    folder_id: Optional[int] = None
    original_filename: Optional[str] = None
    is_favorite: Optional[bool] = None


class UploadInitBody(BaseModel):
    filename: str
    size_bytes: int = Field(..., gt=0)
    folder_id: Optional[int] = None
    content_type: Optional[str] = None


def register_lbl_drive_routes(app) -> None:
    from main import get_current_user, validate_upload

    if os.getenv("LBL_FAST_STARTUP", "").lower() not in ("1", "true", "yes"):
        ensure_drive_schema()

    @router.get("/config")
    async def drive_config(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        used = _storage_used_mb(db, current_user.id)
        limit = cloud_storage_limit_mb(current_user)
        plan = "free"
        paid_until = None
        try:
            crow = db.execute(
                text(
                    "SELECT cloud_plan, cloud_paid_until, storage_limit_mb FROM users WHERE id = :id"
                ),
                {"id": current_user.id},
            ).fetchone()
            if crow:
                plan = crow[0] or "free"
                paid_until = crow[1]
                if crow[2] is not None:
                    limit = max(float(crow[2]), LBL_CLOUD_FREE_MB)
        except Exception:
            plan = "free"
            paid_until = None
            limit = cloud_storage_limit_mb(current_user)
        return {
            "storage_used_mb": used,
            "storage_limit_mb": limit,
            "cloud_free_gb": LBL_CLOUD_FREE_MB / 1024,
            "max_file_mb": DRIVE_MAX_MB,
            "chunk_mb": DRIVE_CHUNK_BYTES // (1024 * 1024),
            "chunk_threshold_mb": DRIVE_MAX_MB,
            "parallel_chunk_threshold_mb": DRIVE_PARALLEL_THRESHOLD_MB,
            "simple_upload_max_mb": float(os.getenv("LBL_DRIVE_SIMPLE_UPLOAD_MB", "64")),
            "parallel_uploads": DRIVE_PARALLEL_CHUNKS,
            "parallel_files": 3,
            "product": "LBL Cloud",
            "cloud_plan": plan,
            "cloud_paid_until": paid_until.isoformat() if paid_until else None,
            "billing_url": "/pages/billing/",
        }

    @router.get("/browse")
    async def drive_browse(
        folder_id: Optional[int] = None,
        q: Optional[str] = None,
        section: str = Query("drive", pattern="^(drive|recent|favorites|trash|shared)$"),
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        used = _storage_used_mb(db, current_user.id)
        limit = cloud_storage_limit_mb(current_user)
        base_resp = {
            "section": section,
            "storage_used_mb": used,
            "storage_limit_mb": limit,
        }

        if section == "recent":
            rows = db.execute(
                text(
                    """
                    SELECT r.file_id, r.folder_id, r.accessed_at
                    FROM user_drive_recent r
                    WHERE r.user_id = :uid
                    ORDER BY r.accessed_at DESC
                    LIMIT 80
                    """
                ),
                {"uid": current_user.id},
            ).fetchall()
            seen = set()
            deduped = []
            for row in rows:
                key = ("f", row[0]) if row[0] else ("d", row[1])
                if key in seen:
                    continue
                seen.add(key)
                deduped.append(row)
            rows = deduped[:50]
            files = []
            folders = []
            for file_id, fold_id, accessed in rows:
                if file_id:
                    uf = (
                        db.query(UserFile)
                        .filter(
                            UserFile.id == file_id,
                            UserFile.user_id == current_user.id,
                            text("user_files.deleted_at IS NULL"),
                        )
                        .first()
                    )
                    if uf:
                        d = _file_dict(uf)
                        d["uploaded_at"] = accessed.isoformat() if accessed else d.get("uploaded_at")
                        files.append(d)
                elif fold_id:
                    fo = (
                        db.query(UserDriveFolder)
                        .filter(
                            UserDriveFolder.id == fold_id,
                            UserDriveFolder.user_id == current_user.id,
                            text("user_drive_folders.deleted_at IS NULL"),
                        )
                        .first()
                    )
                    if fo:
                        fd = _folder_dict(fo)
                        fd["updated_at"] = accessed.isoformat() if accessed else fd.get("updated_at")
                        folders.append(fd)
            return {
                **base_resp,
                "folder_id": None,
                "breadcrumbs": [{"id": None, "name": "Недавние"}],
                "folders": folders,
                "files": files,
            }

        if section == "favorites":
            folders = (
                db.query(UserDriveFolder)
                .filter(
                    UserDriveFolder.user_id == current_user.id,
                    text("user_drive_folders.deleted_at IS NULL"),
                    text("user_drive_folders.is_favorite = TRUE"),
                )
                .order_by(UserDriveFolder.name)
                .limit(200)
                .all()
            )
            files = (
                db.query(UserFile)
                .filter(
                    UserFile.user_id == current_user.id,
                    text("user_files.deleted_at IS NULL"),
                    text("user_files.is_favorite = TRUE"),
                )
                .order_by(UserFile.uploaded_at.desc())
                .limit(500)
                .all()
            )
            return {
                **base_resp,
                "folder_id": None,
                "breadcrumbs": [{"id": None, "name": "Избранное"}],
                "folders": [_folder_dict(f) for f in folders],
                "files": [_file_dict(f) for f in files],
            }

        if section == "trash":
            folders = (
                db.query(UserDriveFolder)
                .filter(
                    UserDriveFolder.user_id == current_user.id,
                    text("user_drive_folders.deleted_at IS NOT NULL"),
                )
                .order_by(UserDriveFolder.updated_at.desc())
                .limit(200)
                .all()
            )
            files = (
                db.query(UserFile)
                .filter(
                    UserFile.user_id == current_user.id,
                    text("user_files.deleted_at IS NOT NULL"),
                )
                .order_by(UserFile.uploaded_at.desc())
                .limit(500)
                .all()
            )
            return {
                **base_resp,
                "folder_id": None,
                "breadcrumbs": [{"id": None, "name": "Корзина"}],
                "folders": [_folder_dict(f) for f in folders],
                "files": [_file_dict(f) for f in files],
            }

        if section == "shared":
            return {
                **base_resp,
                "folder_id": None,
                "breadcrumbs": [{"id": None, "name": "Поделились"}],
                "folders": [],
                "files": [],
            }

        folder = _folder_or_404(db, current_user.id, folder_id) if folder_id is not None else None
        if folder_id is not None:
            _record_recent(db, current_user.id, folder_id=folder_id)
            db.commit()

        fq = db.query(UserDriveFolder).filter(
            UserDriveFolder.user_id == current_user.id,
            text("user_drive_folders.deleted_at IS NULL"),
        )
        if q and q.strip() and folder_id is None:
            like = f"%{q.strip()}%"
            file_q = db.query(UserFile).filter(
                UserFile.user_id == current_user.id,
                text("user_files.deleted_at IS NULL"),
                UserFile.original_filename.ilike(like),
            )
            files = file_q.order_by(UserFile.uploaded_at.desc()).limit(500).all()
            return {
                **base_resp,
                "folder_id": None,
                "breadcrumbs": [{"id": None, "name": "Мой диск"}, {"id": None, "name": f"Поиск: {q.strip()}"}],
                "folders": [],
                "files": [_file_dict(f) for f in files],
            }

        if folder_id is None:
            fq = fq.filter(UserDriveFolder.parent_id.is_(None))
        else:
            fq = fq.filter(UserDriveFolder.parent_id == folder_id)
        folders = fq.order_by(UserDriveFolder.name).all()

        file_q = db.query(UserFile).filter(
            UserFile.user_id == current_user.id,
            text("user_files.deleted_at IS NULL"),
        )
        if folder_id is None:
            file_q = file_q.filter(UserFile.folder_id.is_(None))
        else:
            file_q = file_q.filter(UserFile.folder_id == folder_id)
        if q and q.strip():
            like = f"%{q.strip()}%"
            file_q = file_q.filter(UserFile.original_filename.ilike(like))
        files = file_q.order_by(UserFile.uploaded_at.desc()).limit(500).all()

        return {
            **base_resp,
            "folder_id": folder_id,
            "breadcrumbs": _breadcrumbs(db, folder),
            "folders": [_folder_dict(f) for f in folders],
            "files": [_file_dict(f) for f in files],
        }

    @router.post("/folders")
    async def drive_create_folder(
        body: FolderCreateBody,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        name = _safe_folder_name(body.name)
        if body.parent_id is not None:
            _folder_or_404(db, current_user.id, body.parent_id)
        exists = (
            db.query(UserDriveFolder)
            .filter(
                UserDriveFolder.user_id == current_user.id,
                UserDriveFolder.parent_id == body.parent_id,
                UserDriveFolder.name == name,
            )
            .first()
        )
        if exists:
            raise HTTPException(status_code=409, detail="Папка с таким именем уже есть")
        row = UserDriveFolder(user_id=current_user.id, parent_id=body.parent_id, name=name)
        db.add(row)
        db.commit()
        db.refresh(row)
        return {"id": row.id, "name": row.name, "parent_id": row.parent_id}

    @router.patch("/folders/{folder_id}")
    async def drive_patch_folder(
        folder_id: int,
        body: FolderPatchBody,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        row = _folder_or_404(db, current_user.id, folder_id)
        if body.is_favorite is not None:
            db.execute(
                text("UPDATE user_drive_folders SET is_favorite = :f WHERE id = :id AND user_id = :u"),
                {"f": body.is_favorite, "id": folder_id, "u": current_user.id},
            )
        if body.name:
            name = _safe_folder_name(body.name)
            dup = (
                db.query(UserDriveFolder)
                .filter(
                    UserDriveFolder.user_id == current_user.id,
                    UserDriveFolder.parent_id == row.parent_id,
                    UserDriveFolder.name == name,
                    UserDriveFolder.id != folder_id,
                )
                .first()
            )
            if dup:
                raise HTTPException(status_code=409, detail="Папка с таким именем уже есть")
            row.name = name
        db.commit()
        return {"id": row.id, "name": row.name, "is_favorite": body.is_favorite}

    @router.delete("/folders/{folder_id}")
    async def drive_delete_folder(
        folder_id: int,
        permanent: bool = Query(False),
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if permanent:
            row = (
                db.query(UserDriveFolder)
                .filter(
                    UserDriveFolder.id == folder_id,
                    UserDriveFolder.user_id == current_user.id,
                    text("user_drive_folders.deleted_at IS NOT NULL"),
                )
                .first()
            )
            if not row:
                raise HTTPException(status_code=404, detail="Папка не найдена в корзине")
            ids = _folder_tree_ids(db, current_user.id, folder_id)
            for fid in ids:
                for uf in db.query(UserFile).filter(UserFile.folder_id == fid).all():
                    if os.path.isfile(uf.file_path):
                        try:
                            os.remove(uf.file_path)
                        except OSError:
                            pass
                    db.delete(uf)
            for fid in ids:
                fo = db.query(UserDriveFolder).filter(UserDriveFolder.id == fid).first()
                if fo:
                    db.delete(fo)
            db.commit()
            return {"ok": True, "message": "Удалено навсегда"}

        row = _folder_or_404(db, current_user.id, folder_id)
        _soft_delete_folder_tree(db, current_user.id, folder_id)
        db.commit()
        return {"ok": True, "message": "Папка перемещена в корзину"}

    @router.post("/upload")
    async def drive_upload_simple(
        file: UploadFile = File(...),
        folder_id: Optional[int] = Form(None),
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if folder_id is not None:
            _folder_or_404(db, current_user.id, folder_id)
        safe_name = validate_upload(file)
        used = _storage_used_mb(db, current_user.id)
        tmp_dest = os.path.join(_user_drive_root(current_user.id), f".tmp_{secrets.token_hex(8)}")
        size_bytes = await _stream_upload_to_disk(file, tmp_dest, DRIVE_MAX_BYTES)
        size_mb = size_bytes / (1024 * 1024)
        limit = cloud_storage_limit_mb(current_user)
        if used + size_mb > limit:
            os.remove(tmp_dest)
            raise HTTPException(
                status_code=400,
                detail=f"Недостаточно места. Лимит {limit:.0f} МБ",
            )
        final_name = f"{secrets.token_hex(6)}_{safe_name}"
        final_path = os.path.join(_user_drive_root(current_user.id), final_name)
        os.replace(tmp_dest, final_path)
        uf = UserFile(
            user_id=current_user.id,
            folder_id=folder_id,
            filename=final_name,
            original_filename=file.filename or safe_name,
            file_path=final_path,
            file_size_mb=size_mb,
            file_type=file.content_type,
        )
        db.add(uf)
        db.commit()
        db.refresh(uf)
        used = _storage_used_mb(db, current_user.id)
        return {
            "id": uf.id,
            "original_filename": uf.original_filename,
            "file_size_mb": uf.file_size_mb,
            "storage_used_mb": used,
            "storage_limit_mb": cloud_storage_limit_mb(current_user),
        }

    @router.post("/upload/init")
    async def drive_upload_init(
        body: UploadInitBody,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if body.size_bytes > DRIVE_MAX_BYTES:
            raise HTTPException(status_code=400, detail=f"Максимум {DRIVE_MAX_MB:.0f} МБ на файл")
        used = _storage_used_mb(db, current_user.id)
        limit = cloud_storage_limit_mb(current_user)
        if used + body.size_bytes / (1024 * 1024) > limit:
            raise HTTPException(status_code=400, detail="Недостаточно места в облаке")
        if body.folder_id is not None:
            _folder_or_404(db, current_user.id, body.folder_id)
        upload_id = secrets.token_urlsafe(18)
        os.makedirs(DRIVE_SESSIONS, exist_ok=True)
        meta = {
            "upload_id": upload_id,
            "user_id": current_user.id,
            "filename": body.filename,
            "size_bytes": body.size_bytes,
            "folder_id": body.folder_id,
            "content_type": body.content_type,
            "written": 0,
            "created_at": time.time(),
        }
        part_path = os.path.join(DRIVE_SESSIONS, f"{upload_id}.part")
        open(part_path, "wb").close()
        with open(os.path.join(DRIVE_SESSIONS, f"{upload_id}.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f)
        return {"upload_id": upload_id, "chunk_size": DRIVE_CHUNK_BYTES}

    @router.post("/upload/chunk")
    async def drive_upload_chunk(
        upload_id: str = Form(...),
        offset: int = Form(...),
        chunk: UploadFile = File(...),
        current_user: User = Depends(get_current_user),
    ):
        meta_path = os.path.join(DRIVE_SESSIONS, f"{upload_id}.json")
        if not os.path.isfile(meta_path):
            raise HTTPException(status_code=404, detail="Сессия загрузки не найдена")
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        if meta.get("user_id") != current_user.id:
            raise HTTPException(status_code=403, detail="Доступ запрещён")
        part_path = os.path.join(DRIVE_SESSIONS, f"{upload_id}.part")
        written = 0
        with open(part_path, "r+b") as out:
            out.seek(offset)
            while True:
                block = await chunk.read(DRIVE_CHUNK_BYTES)
                if not block:
                    break
                out.write(block)
                written += len(block)
        meta["written"] = max(int(meta.get("written") or 0), offset + written)
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f)
        return {"written": meta["written"], "size_bytes": meta["size_bytes"]}

    @router.post("/upload/complete")
    async def drive_upload_complete(
        upload_id: str = Form(...),
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        from main import ALLOWED_FILE_EXTENSIONS, secure_filename

        meta_path = os.path.join(DRIVE_SESSIONS, f"{upload_id}.json")
        part_path = os.path.join(DRIVE_SESSIONS, f"{upload_id}.part")
        if not os.path.isfile(meta_path):
            raise HTTPException(status_code=404, detail="Сессия загрузки не найдена")
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        if meta.get("user_id") != current_user.id:
            raise HTTPException(status_code=403, detail="Доступ запрещён")
        size_bytes = int(meta.get("size_bytes") or 0)
        on_disk = os.path.getsize(part_path) if os.path.isfile(part_path) else 0
        if on_disk < size_bytes:
            raise HTTPException(status_code=400, detail="Файл загружен не полностью")

        raw_name = meta.get("filename") or "file.bin"
        if "/" in raw_name or "\\" in raw_name:
            raise HTTPException(status_code=400, detail="Недопустимое имя файла")
        safe_name = secure_filename(raw_name)
        if "." not in safe_name:
            raise HTTPException(status_code=400, detail="Файл должен иметь расширение")
        ext = safe_name.rsplit(".", 1)[-1].lower()
        if ext not in ALLOWED_FILE_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Недопустимый тип: .{ext}")
        if on_disk > size_bytes:
            with open(part_path, "rb+") as trim:
                trim.truncate(size_bytes)

        size_mb = size_bytes / (1024 * 1024)
        final_name = f"{secrets.token_hex(6)}_{safe_name}"
        final_path = os.path.join(_user_drive_root(current_user.id), final_name)
        os.replace(part_path, final_path)
        uf = UserFile(
            user_id=current_user.id,
            folder_id=meta.get("folder_id"),
            filename=final_name,
            original_filename=meta.get("filename") or safe_name,
            file_path=final_path,
            file_size_mb=size_mb,
            file_type=meta.get("content_type"),
        )
        db.add(uf)
        db.commit()
        db.refresh(uf)
        for p in (meta_path,):
            try:
                os.remove(p)
            except OSError:
                pass
        used = _storage_used_mb(db, current_user.id)
        return {
            "id": uf.id,
            "original_filename": uf.original_filename,
            "file_size_mb": uf.file_size_mb,
            "storage_used_mb": used,
            "storage_limit_mb": cloud_storage_limit_mb(current_user),
        }

    @router.get("/files/{file_id}/download")
    async def drive_download(
        file_id: int,
        request: Request,
        token: Optional[str] = Query(None),
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(_security),
        db: Session = Depends(get_db),
    ):
        user: Optional[User] = None
        auth = token or _auth_token(request, credentials)
        if auth:
            user = _user_from_token(auth, db)
        if not user:
            raise HTTPException(status_code=401, detail="Требуется вход")
        uf = (
            db.query(UserFile)
            .filter(UserFile.id == file_id, UserFile.user_id == user.id)
            .first()
        )
        if not uf or not os.path.isfile(uf.file_path):
            raise HTTPException(status_code=404, detail="Файл не найден")
        return FileResponse(
            uf.file_path,
            filename=uf.original_filename,
            media_type=uf.file_type or "application/octet-stream",
            headers={"Accept-Ranges": "bytes"},
        )

    @router.patch("/files/{file_id}")
    async def drive_update_file(
        file_id: int,
        body: FileMoveBody,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        uf = (
            db.query(UserFile)
            .filter(UserFile.id == file_id, UserFile.user_id == current_user.id)
            .first()
        )
        if not uf:
            raise HTTPException(status_code=404, detail="Файл не найден")
        if body.folder_id is not None:
            _folder_or_404(db, current_user.id, body.folder_id)
            uf.folder_id = body.folder_id
        if body.original_filename:
            uf.original_filename = body.original_filename.strip()[:255]
        if body.is_favorite is not None:
            db.execute(
                text("UPDATE user_files SET is_favorite = :f WHERE id = :id AND user_id = :u"),
                {"f": body.is_favorite, "id": file_id, "u": current_user.id},
            )
        db.commit()
        return {"ok": True}

    @router.get("/files/{file_id}/preview")
    async def drive_preview_file(
        file_id: int,
        request: Request,
        token: Optional[str] = Query(None),
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(_security),
        db: Session = Depends(get_db),
    ):
        user: Optional[User] = None
        auth = token or _auth_token(request, credentials)
        if auth:
            user = _user_from_token(auth, db)
        if not user:
            raise HTTPException(status_code=401, detail="Требуется вход")
        uf = (
            db.query(UserFile)
            .filter(
                UserFile.id == file_id,
                UserFile.user_id == user.id,
                text("user_files.deleted_at IS NULL"),
            )
            .first()
        )
        if not uf or not os.path.isfile(uf.file_path):
            raise HTTPException(status_code=404, detail="Файл не найден")
        _record_recent(db, user.id, file_id=file_id, action="preview")
        db.commit()
        media = _preview_media_type(uf.original_filename, uf.file_type)
        return FileResponse(
            uf.file_path,
            media_type=media,
            filename=uf.original_filename,
            headers={"Cache-Control": "private, max-age=3600"},
        )

    @router.delete("/files/{file_id}")
    async def drive_delete_file(
        file_id: int,
        permanent: bool = Query(False),
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if permanent:
            uf = (
                db.query(UserFile)
                .filter(
                    UserFile.id == file_id,
                    UserFile.user_id == current_user.id,
                    text("user_files.deleted_at IS NOT NULL"),
                )
                .first()
            )
            if not uf:
                raise HTTPException(status_code=404, detail="Файл не найден в корзине")
            if os.path.isfile(uf.file_path):
                try:
                    os.remove(uf.file_path)
                except OSError:
                    pass
            db.delete(uf)
            db.commit()
            used = _storage_used_mb(db, current_user.id)
            return {
                "message": "Файл удалён навсегда",
                "storage_used_mb": used,
                "storage_limit_mb": cloud_storage_limit_mb(current_user),
            }

        uf = (
            db.query(UserFile)
            .filter(
                UserFile.id == file_id,
                UserFile.user_id == current_user.id,
                text("user_files.deleted_at IS NULL"),
            )
            .first()
        )
        if not uf:
            raise HTTPException(status_code=404, detail="Файл не найден")
        db.execute(
            text("UPDATE user_files SET deleted_at = :n WHERE id = :id"),
            {"n": datetime.utcnow(), "id": file_id},
        )
        db.commit()
        used = _storage_used_mb(db, current_user.id)
        return {
            "message": "Файл перемещён в корзину",
            "storage_used_mb": used,
            "storage_limit_mb": cloud_storage_limit_mb(current_user),
        }

    @router.post("/trash/{resource_type}/{resource_id}/restore")
    async def drive_restore_trash(
        resource_type: str,
        resource_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if resource_type == "file":
            uf = (
                db.query(UserFile)
                .filter(
                    UserFile.id == resource_id,
                    UserFile.user_id == current_user.id,
                    text("user_files.deleted_at IS NOT NULL"),
                )
                .first()
            )
            if not uf:
                raise HTTPException(status_code=404, detail="Файл не найден")
            size_mb = float(uf.file_size_mb or 0)
            if _storage_used_mb(db, current_user.id) + size_mb > cloud_storage_limit_mb(current_user):
                raise HTTPException(status_code=400, detail="Недостаточно места для восстановления")
            db.execute(
                text("UPDATE user_files SET deleted_at = NULL WHERE id = :id"),
                {"id": resource_id},
            )
        elif resource_type == "folder":
            fo = (
                db.query(UserDriveFolder)
                .filter(
                    UserDriveFolder.id == resource_id,
                    UserDriveFolder.user_id == current_user.id,
                    text("user_drive_folders.deleted_at IS NOT NULL"),
                )
                .first()
            )
            if not fo:
                raise HTTPException(status_code=404, detail="Папка не найдена")
            db.execute(
                text("UPDATE user_drive_folders SET deleted_at = NULL WHERE id = :id"),
                {"id": resource_id},
            )
        else:
            raise HTTPException(status_code=400, detail="Неверный тип")
        db.commit()
        return {"ok": True, "message": "Восстановлено"}

    @router.delete("/trash/empty")
    async def drive_empty_trash(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        files = (
            db.query(UserFile)
            .filter(
                UserFile.user_id == current_user.id,
                text("user_files.deleted_at IS NOT NULL"),
            )
            .all()
        )
        for uf in files:
            if os.path.isfile(uf.file_path):
                try:
                    os.remove(uf.file_path)
                except OSError:
                    pass
            db.delete(uf)
        db.execute(
            text("DELETE FROM user_drive_folders WHERE user_id = :u AND deleted_at IS NOT NULL"),
            {"u": current_user.id},
        )
        db.commit()
        return {"ok": True, "message": "Корзина очищена"}

    app.include_router(router)
    logger.info("LBL Drive routes mounted at /api/drive")
