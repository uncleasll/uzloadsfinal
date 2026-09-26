"""Chat that replaces Telegram: truck groups, load threads, the company channel. Membership keeps history."""
from __future__ import annotations
import hashlib
import uuid
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.models import (OFFICE_ROLES, Attachment, Conversation, ConversationMember, Load, LoadDocument, Message, Truck, User)
from app.services.storage import storage
from app.services.photo_stamp import stamp_photo

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


def _role(u: User) -> str:
    return u.role.value if hasattr(u.role, "value") else u.role


# ── Conversations and membership ─────────────────────────────────────────────

def _active_member(db: Session, conv_id: int, user_id: int) -> ConversationMember | None:
    return (db.query(ConversationMember)
              .filter(ConversationMember.conversation_id == conv_id, ConversationMember.user_id == user_id, ConversationMember.left_at.is_(None))
              .first())


def add_member(db: Session, conv: Conversation, user: User, announce: bool = True) -> ConversationMember:
    m = _active_member(db, conv.id, user.id)
    if m:
        return m
    m = ConversationMember(conversation_id=conv.id, user_id=user.id, joined_at=datetime.utcnow())
    db.add(m)
    if announce:
        db.add(Message(conversation_id=conv.id, sender_id=None, kind="system", body=f"{user.name} joined"))
    return m


def remove_member(db: Session, conv: Conversation, user: User) -> None:
    m = _active_member(db, conv.id, user.id)
    if not m:
        return
    m.left_at = datetime.utcnow()
    db.add(Message(conversation_id=conv.id, sender_id=None, kind="system", body=f"{user.name} left"))


def office_users(db: Session) -> list[User]:
    return db.query(User).filter(User.is_active == True, User.role.in_(list(OFFICE_ROLES))).all()  # noqa: E712


def ensure_company_channel(db: Session) -> Conversation:
    conv = db.query(Conversation).filter(Conversation.kind == "company").first()
    if not conv:
        conv = Conversation(kind="company", title="Everyone")
        db.add(conv); db.flush()
    return conv


def ensure_truck_conversation(db: Session, truck: Truck) -> Conversation:
    conv = db.query(Conversation).filter(Conversation.kind == "truck", Conversation.truck_id == truck.id).first()
    if not conv:
        conv = Conversation(kind="truck", truck_id=truck.id, title=f"Truck {truck.unit_number}")
        db.add(conv); db.flush()
    return conv


def ensure_load_conversation(db: Session, load: Load) -> Conversation:
    conv = db.query(Conversation).filter(Conversation.kind == "load", Conversation.load_id == load.id).first()
    if not conv:
        conv = Conversation(kind="load", load_id=load.id, truck_id=load.truck_id, title=f"Load #{load.po_number or load.load_number}")
        db.add(conv); db.flush()
    return conv


def sync_memberships(db: Session) -> None:
    """Office people are in every group. A truck's group has its current driver's account; a driver who moved on is
    marked as left (their messages stay). Called on every conversation listing, so it needs no other hook."""
    office = office_users(db)
    drivers = {u.driver_id: u for u in db.query(User).filter(User.is_active == True, User.role == "driver", User.driver_id.isnot(None)).all()}  # noqa: E712

    channel = ensure_company_channel(db)
    wanted = {u.id: u for u in office} | {u.id: u for u in drivers.values()}
    _reconcile(db, channel, wanted)

    for truck in db.query(Truck).filter(Truck.is_active == True).all():  # noqa: E712
        conv = ensure_truck_conversation(db, truck)
        wanted = {u.id: u for u in office}
        from app.services.fleet import effective_driver
        eff = effective_driver(db, truck)
        drv = drivers.get(eff.id) if eff else None
        if drv:
            wanted[drv.id] = drv
        _reconcile(db, conv, wanted)

    for conv in db.query(Conversation).filter(Conversation.kind == "load").all():
        load = conv.load
        wanted = {u.id: u for u in office}
        drv = drivers.get(load.driver_id) if load and load.driver_id else None
        if drv:
            wanted[drv.id] = drv
        _reconcile(db, conv, wanted)
    db.commit()


def _reconcile(db: Session, conv: Conversation, wanted: dict[int, User]) -> None:
    current = {m.user_id: m for m in db.query(ConversationMember).filter(ConversationMember.conversation_id == conv.id, ConversationMember.left_at.is_(None)).all()}
    # A brand-new group fills silently; "joined" lines only make sense once there is history to join.
    has_history = db.query(Message.id).filter(Message.conversation_id == conv.id).first() is not None
    for uid, u in wanted.items():
        if uid not in current:
            add_member(db, conv, u, announce=has_history)
    for uid, m in current.items():
        if uid not in wanted:
            m.left_at = datetime.utcnow()
            db.add(Message(conversation_id=conv.id, sender_id=None, kind="system", body=f"{m.user.name if m.user else 'Someone'} left"))


def is_member(db: Session, conv_id: int, user: User) -> bool:
    return _active_member(db, conv_id, user.id) is not None


# ── Listing ──────────────────────────────────────────────────────────────────

def conversations_for(db: Session, user: User) -> list[dict]:
    sync_memberships(db)
    rows = (db.query(ConversationMember).options(joinedload(ConversationMember.conversation))
              .filter(ConversationMember.user_id == user.id, ConversationMember.left_at.is_(None)).all())
    out = []
    for m in rows:
        conv = m.conversation
        last = db.query(Message).filter(Message.conversation_id == conv.id).order_by(Message.id.desc()).first()
        unread = (db.query(func.count(Message.id))
                    .filter(Message.conversation_id == conv.id, Message.id > (m.last_read_message_id or 0),
                            Message.kind != "system", Message.sender_id != user.id).scalar() or 0)
        out.append({
            "id": conv.id, "kind": conv.kind, "title": conv.title, "truck_id": conv.truck_id, "load_id": conv.load_id,
            "unread": int(unread),
            "last_message": _msg(last) if last else None,
            "members": [{"user_id": x.user_id, "name": x.user.name if x.user else "?", "role": _role(x.user) if x.user else None}
                        for x in conv.members if x.left_at is None],
        })
    order = {"company": 0, "truck": 1, "load": 2}
    out.sort(key=lambda c: (-(c["last_message"]["id"] if c["last_message"] else 0), order.get(c["kind"], 9)))
    return out


def members_history(db: Session, conv: Conversation) -> list[dict]:
    rows = db.query(ConversationMember).options(joinedload(ConversationMember.user)).filter(ConversationMember.conversation_id == conv.id).order_by(ConversationMember.joined_at).all()
    return [{"user_id": m.user_id, "name": m.user.name if m.user else "?", "role": _role(m.user) if m.user else None,
             "joined_at": m.joined_at.isoformat() if m.joined_at else None, "left_at": m.left_at.isoformat() if m.left_at else None} for m in rows]


# ── Messages ─────────────────────────────────────────────────────────────────

def _att(a: Attachment) -> dict:
    return {"id": a.id, "category": a.category, "url": f"/api/v1/files/{a.id}", "original_filename": a.original_filename,
            "content_type": a.content_type, "size": a.size, "width": a.width, "height": a.height,
            "taken_at": a.taken_at.isoformat() if a.taken_at else None, "received_at": a.received_at.isoformat() if a.received_at else None,
            "lat": a.lat, "lng": a.lng, "stamp": a.stamp, "truck_id": a.truck_id, "load_id": a.load_id}


def _msg(m: Message) -> dict:
    return {"id": m.id, "conversation_id": m.conversation_id, "kind": m.kind, "body": m.body,
            "sender_id": m.sender_id, "sender_name": m.sender.name if m.sender else None, "sender_role": _role(m.sender) if m.sender else None,
            "client_id": m.client_id, "client_created_at": m.client_created_at.isoformat() if m.client_created_at else None,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "attachments": [_att(a) for a in m.attachments]}


def messages(db: Session, conv: Conversation, before_id: int | None = None, limit: int = 50) -> list[dict]:
    q = db.query(Message).options(joinedload(Message.attachments), joinedload(Message.sender)).filter(Message.conversation_id == conv.id)
    if before_id:
        q = q.filter(Message.id < before_id)
    rows = q.order_by(Message.id.desc()).limit(limit).all()
    return [_msg(m) for m in reversed(rows)]


def post_message(db: Session, conv: Conversation, sender: User, body: str | None, kind: str = "text",
                 client_id: str | None = None, client_created_at: datetime | None = None) -> Message:
    if client_id:
        existing = db.query(Message).filter(Message.sender_id == sender.id, Message.client_id == client_id).first()
        if existing:
            return existing                       # the phone resent after coming back online
    m = Message(conversation_id=conv.id, sender_id=sender.id, kind=kind, body=body, client_id=client_id, client_created_at=client_created_at)
    db.add(m); db.commit(); db.refresh(m)
    return m


def mark_read(db: Session, conv: Conversation, user: User, up_to: int | None = None) -> None:
    m = _active_member(db, conv.id, user.id)
    if not m:
        return
    if up_to is None:
        up_to = db.query(func.max(Message.id)).filter(Message.conversation_id == conv.id).scalar() or 0
    m.last_read_message_id = max(m.last_read_message_id or 0, up_to)
    db.commit()


# ── Attachments ──────────────────────────────────────────────────────────────

def store_attachment(db: Session, *, user: User, data: bytes, filename: str, content_type: str, category: str = "photo",
                     truck_id: int | None = None, load_id: int | None = None, taken_at: datetime | None = None,
                     lat: float | None = None, lng: float | None = None, message: Message | None = None) -> Attachment:
    """Saves the file. Photos get the stamp burned in; everything keeps the stamp in the row."""
    received = datetime.utcnow()
    truck = db.get(Truck, truck_id) if truck_id else None
    load = db.get(Load, load_id) if load_id else None
    when = (taken_at or received).strftime("%Y-%m-%d %H:%M")
    where = f"{lat:.5f}, {lng:.5f}" if lat is not None and lng is not None else "no GPS"
    lines = [f"Karvan · {when} · {user.name}",
             " · ".join(x for x in [f"Truck {truck.unit_number}" if truck else None,
                                    f"Load #{load.po_number or load.load_number}" if load else None,
                                    category.upper() if category not in ("photo", "file") else None, where] if x)]
    width = height = None
    if content_type in IMAGE_TYPES:
        try:
            data, width, height = stamp_photo(data, lines)
            content_type, filename = "image/jpeg", (filename.rsplit(".", 1)[0] if "." in filename else filename) + ".jpg"
        except Exception:
            pass                                    # keep the original if Pillow cannot read it
    key = f"{user.company_id or 0}/{received:%Y/%m}/{uuid.uuid4().hex}-{filename[-80:]}"
    storage().put(key, data, content_type)
    a = Attachment(message_id=message.id if message else None, uploaded_by=user.id, truck_id=truck_id, load_id=load_id,
                   category=category, storage_key=key, original_filename=filename, content_type=content_type, size=len(data),
                   width=width, height=height, taken_at=taken_at, received_at=received, lat=lat, lng=lng,
                   sha256=hashlib.sha256(data).hexdigest(), stamp="\n".join(lines))
    db.add(a); db.commit(); db.refresh(a)
    return a


def attach_to_load(db: Session, a: Attachment, load: Load, document_type: str, marker: str | None = None) -> LoadDocument:
    """Copies a chat photo onto the load's documents, so it shows in the statement and the merged PDF."""
    f = storage().get(a.storage_key)
    if not f:
        raise ValueError("File is missing")
    import os
    from app.core.config import settings
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    name = f"{uuid.uuid4()}-{(a.original_filename or 'file')[-60:]}"
    path = os.path.join(settings.UPLOAD_DIR, name)
    with open(path, "wb") as fh:
        fh.write(f.data)
    doc = LoadDocument(load_id=load.id, document_type=document_type, filename=name, original_filename=a.original_filename,
                       file_path=path, file_size=len(f.data), notes=marker)
    db.add(doc)
    a.load_id = load.id
    db.commit(); db.refresh(doc)
    return doc
