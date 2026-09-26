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


def _guess_type(key: str) -> str:
    import mimetypes
    return mimetypes.guess_type(key)[0] or "application/octet-stream"


def storage():
    if settings.STORAGE_BACKEND == "supabase":
        return SupabaseStorage(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY, settings.SUPABASE_BUCKET)
    return LocalStorage(os.path.join(settings.UPLOAD_DIR, "files"))
