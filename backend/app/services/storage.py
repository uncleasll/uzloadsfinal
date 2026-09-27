"""Where uploaded files live. Local disk for development; Supabase Storage in production, where Render's disk is wiped on deploy."""
from __future__ import annotations
import os
from dataclasses import dataclass

import httpx

from app.core.config import settings


@dataclass
class StoredFile:
    data: bytes
    content_type: str


class LocalStorage:
    def __init__(self, root: str):
        self.root = root

    def put(self, key: str, data: bytes, content_type: str) -> None:
        path = os.path.join(self.root, key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)

    def get(self, key: str) -> StoredFile | None:
        path = os.path.join(self.root, key)
        if not os.path.exists(path):
            return None
        with open(path, "rb") as f:
            return StoredFile(f.read(), _guess_type(key))

    def delete(self, key: str) -> None:
        path = os.path.join(self.root, key)
        if os.path.exists(path):
            os.remove(path)


class SupabaseStorage:
    """Supabase Storage over its REST API with the service key. Bucket must exist and stay private."""

    def __init__(self, url: str, key: str, bucket: str):
        self.base = f"{url.rstrip('/')}/storage/v1/object/{bucket}"
        self.headers = {"Authorization": f"Bearer {key}", "apikey": key}

    def put(self, key: str, data: bytes, content_type: str) -> None:
        r = httpx.post(f"{self.base}/{key}", content=data, headers={**self.headers, "Content-Type": content_type, "x-upsert": "true"}, timeout=60)
        r.raise_for_status()

    def get(self, key: str) -> StoredFile | None:
        r = httpx.get(f"{self.base}/{key}", headers=self.headers, timeout=60)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return StoredFile(r.content, r.headers.get("content-type") or _guess_type(key))

    def delete(self, key: str) -> None:
        httpx.request("DELETE", f"{self.base}/{key}", headers=self.headers, timeout=30)


class DatabaseStorage:
    """Files as rows in the app's own database. No account, no keys, survives every deploy.
    Fine for a fleet's photos; move to Supabase or S3 when the database grows past a few GB."""

    def _session(self):
        from app.db.session import SessionLocal
        return SessionLocal()

    def put(self, key: str, data: bytes, content_type: str) -> None:
        from app.models.models import FileBlob
        db = self._session()
        try:
            row = db.query(FileBlob).filter(FileBlob.key == key).first()
            if row:
                row.data, row.content_type, row.size = data, content_type, len(data)
            else:
                db.add(FileBlob(key=key, content_type=content_type, size=len(data), data=data))
            db.commit()
        finally:
            db.close()

    def get(self, key: str) -> StoredFile | None:
        from app.models.models import FileBlob
        db = self._session()
        try:
            row = db.query(FileBlob).filter(FileBlob.key == key).first()
            return StoredFile(bytes(row.data), row.content_type or _guess_type(key)) if row else None
        finally:
            db.close()

    def delete(self, key: str) -> None:
        from app.models.models import FileBlob
        db = self._session()
        try:
            db.query(FileBlob).filter(FileBlob.key == key).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()


def _guess_type(key: str) -> str:
    import mimetypes
    return mimetypes.guess_type(key)[0] or "application/octet-stream"


def storage():
    backend = settings.STORAGE_BACKEND
    if backend == "supabase" and settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
        return SupabaseStorage(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY, settings.SUPABASE_BUCKET)
    if backend == "db" or (backend != "local" and not settings.DATABASE_URL.startswith("sqlite")):
        return DatabaseStorage()          # production default: nothing to configure, nothing lost on deploy
    return LocalStorage(os.path.join(settings.UPLOAD_DIR, "files"))
