"""Chat and files: what a driver's phone and the office both talk to."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import require_user
from app.db.session import get_db
from app.models.models import Attachment, Conversation, Load, Truck
from app.services import chat
from app.services.storage import storage

router = APIRouter(tags=["chat"])


def _conv(db: Session, conversation_id: int, user) -> Conversation:
    conv = db.get(Conversation, conversation_id)
    if not conv or not chat.is_member(db, conv.id, user):
        raise HTTPException(404, "Conversation not found")
    return conv


@router.get("/chat/conversations")
def list_conversations(db: Session = Depends(get_db), user=Depends(require_user)):
    return chat.conversations_for(db, user)


@router.post("/chat/conversations/load/{load_id}", status_code=201)
def open_load_thread(load_id: int, db: Session = Depends(get_db), user=Depends(require_user)):
    load = db.get(Load, load_id)
    if not load:
        raise HTTPException(404, "Load not found")
    conv = chat.ensure_load_conversation(db, load)
    db.commit()
    chat.sync_memberships(db)
    return {"id": conv.id, "kind": conv.kind, "title": conv.title}


@router.get("/chat/conversations/{conversation_id}/messages")
def list_messages(conversation_id: int, before: Optional[int] = Query(None), limit: int = Query(50, ge=1, le=200),
                  db: Session = Depends(get_db), user=Depends(require_user)):
    conv = _conv(db, conversation_id, user)
    return chat.messages(db, conv, before_id=before, limit=limit)


@router.get("/chat/conversations/{conversation_id}/members")
def list_members(conversation_id: int, db: Session = Depends(get_db), user=Depends(require_user)):
    return chat.members_history(db, _conv(db, conversation_id, user))


class MessageIn(BaseModel):
    body: str
    client_id: Optional[str] = None
    client_created_at: Optional[datetime] = None


@router.post("/chat/conversations/{conversation_id}/messages", status_code=201)
def send_message(conversation_id: int, data: MessageIn, db: Session = Depends(get_db), user=Depends(require_user)):
    conv = _conv(db, conversation_id, user)
    if not data.body.strip():
        raise HTTPException(400, "Empty message")
    m = chat.post_message(db, conv, user, data.body.strip(), client_id=data.client_id, client_created_at=data.client_created_at)
    chat.mark_read(db, conv, user, m.id)
    return chat._msg(m)


@router.post("/chat/conversations/{conversation_id}/attachments", status_code=201)
async def send_attachment(conversation_id: int, file: UploadFile = File(...), category: str = Form("photo"),
                          caption: Optional[str] = Form(None), client_id: Optional[str] = Form(None),
                          taken_at: Optional[datetime] = Form(None), lat: Optional[float] = Form(None), lng: Optional[float] = Form(None),
                          load_id: Optional[int] = Form(None),
                          db: Session = Depends(get_db), user=Depends(require_user)):
    """A photo or file into the conversation, stamped. Resending with the same client_id is safe."""
    conv = _conv(db, conversation_id, user)
    if client_id:
        existing = db.query(chat.Message).filter(chat.Message.sender_id == user.id, chat.Message.client_id == client_id).first()
        if existing:
            return chat._msg(existing)
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "File is larger than 25 MB")
    kind = "photo" if (file.content_type or "") in chat.IMAGE_TYPES else "file"
    m = chat.post_message(db, conv, user, caption, kind=kind, client_id=client_id, client_created_at=taken_at)
    chat.store_attachment(db, user=user, data=data, filename=file.filename or "file", content_type=file.content_type or "application/octet-stream",
                          category=category, truck_id=conv.truck_id, load_id=load_id or conv.load_id, taken_at=taken_at, lat=lat, lng=lng, message=m)
    chat.mark_read(db, conv, user, m.id)
    db.refresh(m)
    return chat._msg(m)


@router.post("/chat/conversations/{conversation_id}/read")
def read(conversation_id: int, db: Session = Depends(get_db), user=Depends(require_user)):
    chat.mark_read(db, _conv(db, conversation_id, user), user)
    return {"ok": True}


class ToLoadIn(BaseModel):
    load_id: int
    document_type: str = "Other"       # Confirmation | BOL | Other; POD is Other with the karvan marker
    as_pod: bool = False


@router.post("/chat/attachments/{attachment_id}/to-load")
def attachment_to_load(attachment_id: int, data: ToLoadIn, db: Session = Depends(get_db), user=Depends(require_user)):
    a = db.get(Attachment, attachment_id)
    if not a:
        raise HTTPException(404, "Attachment not found")
    load = db.get(Load, data.load_id)
    if not load:
        raise HTTPException(404, "Load not found")
    doc_type, marker = data.document_type, None
    if data.as_pod:
        doc_type, marker = "Other", "[karvan-document:POD]"
    try:
        doc = chat.attach_to_load(db, a, load, doc_type, marker)
    except ValueError as e:
        raise HTTPException(404, str(e))
    return {"document_id": doc.id, "load_id": load.id, "document_type": doc_type, "pod": data.as_pod}


@router.get("/files/{attachment_id}")
def get_file(attachment_id: int, db: Session = Depends(get_db), user=Depends(require_user)):
    a = db.get(Attachment, attachment_id)
    if not a:
        raise HTTPException(404, "Not found")
    f = storage().get(a.storage_key)
    if not f:
        raise HTTPException(404, "File is missing")
    return Response(content=f.data, media_type=a.content_type or f.content_type,
                    headers={"Content-Disposition": f'inline; filename="{a.original_filename or "file"}"', "Cache-Control": "private, max-age=86400"})


@router.get("/chat/trucks")
def trucks_for_chat(db: Session = Depends(get_db), user=Depends(require_user)):
    """Small helper for pickers: active trucks with their group ids."""
    chat.sync_memberships(db)
    out = []
    for t in db.query(Truck).filter(Truck.is_active == True).order_by(Truck.unit_number).all():  # noqa: E712
        conv = chat.ensure_truck_conversation(db, t)
        out.append({"truck_id": t.id, "unit_number": t.unit_number, "conversation_id": conv.id})
    db.commit()
    return out
