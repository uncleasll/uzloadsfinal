"""The dispatcher's board: which trucks are free, which are on a load and where, what still needs a truck."""
from __future__ import annotations
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.api.v1.endpoints.auth import require_user
from app.db.session import get_db
from app.models.models import Attachment, Conversation, Load, Message, Truck
from app.services import dispatcher_pay, weekly_statement as ws

router = APIRouter(prefix="/dispatch", tags=["dispatch"])

OPEN = ("New", "Dispatched", "En Route", "Picked-up")
DONE = ("Delivered", "Closed", "Canceled", "TONU")


def _role(u) -> str:
    return u.role.value if hasattr(u.role, "value") else u.role


def _stop(load: Load, kind: str) -> dict | None:
    stops = sorted([s for s in load.stops if getattr(s.stop_type, "value", s.stop_type) == kind], key=lambda s: s.stop_order)
    s = (stops[0] if kind == "pickup" else stops[-1]) if stops else None
    return {"title": s.title, "city": s.city, "state": s.state, "date": s.stop_date.isoformat() if s.stop_date else None} if s else None


def _load(l: Load) -> dict:
    status = getattr(l.status, "value", l.status)
    return {"id": l.id, "number": l.po_number or str(l.load_number), "status": status, "rate": l.rate, "miles": l.total_miles or 0,
            "date": l.load_date.isoformat() if l.load_date else None, "broker": l.broker.name if l.broker else None,
            "dispatcher": l.dispatcher.name if l.dispatcher else None, "dispatcher_id": l.dispatcher_id,
            "driver": l.driver.name if l.driver else None, "truck_id": l.truck_id,
            "pickup": _stop(l, "pickup"), "delivery": _stop(l, "delivery"),
            "next_stop": _stop(l, "delivery") if status in ("Picked-up",) else _stop(l, "pickup"),
            "pod": ws.has_pod(l)}


@router.get("/board")
def board(db: Session = Depends(get_db), user=Depends(require_user)):
    trucks = db.query(Truck).options(joinedload(Truck.driver)).filter(Truck.is_active == True).order_by(Truck.unit_number).all()  # noqa: E712
    loads = (db.query(Load).options(joinedload(Load.stops), joinedload(Load.broker), joinedload(Load.driver), joinedload(Load.dispatcher))
               .filter(Load.is_active == True, Load.status.in_(OPEN)).order_by(Load.load_date, Load.id).all())  # noqa: E712
    by_truck: dict[int, list[Load]] = {}
    for l in loads:
        if l.truck_id:
            by_truck.setdefault(l.truck_id, []).append(l)
    convs = {c.truck_id: c.id for c in db.query(Conversation).filter(Conversation.kind == "truck").all()}
    rows = []
    for t in trucks:
        mine = by_truck.get(t.id, [])
        current = mine[0] if mine else None
        conv_id = convs.get(t.id)
        last_msg = db.query(Message).filter(Message.conversation_id == conv_id).order_by(Message.id.desc()).first() if conv_id else None
        last_pos = (db.query(Attachment).filter(Attachment.truck_id == t.id, Attachment.lat.isnot(None)).order_by(Attachment.id.desc()).first())
        rows.append({
            "truck_id": t.id, "unit_number": t.unit_number, "driver": t.driver.name if t.driver else None, "driver_id": t.driver_id,
            "state": ("no_driver" if not t.driver_id else "free" if not current else getattr(current.status, "value", current.status)),
            "current_load": _load(current) if current else None, "queued": [_load(l) for l in mine[1:]],
            "conversation_id": conv_id,
            "last_activity": last_msg.created_at.isoformat() if last_msg and last_msg.created_at else None,
            "last_activity_text": (last_msg.body or "photo")[:80] if last_msg else None,
            "last_position": {"lat": last_pos.lat, "lng": last_pos.lng, "at": (last_pos.taken_at or last_pos.received_at).isoformat()} if last_pos else None,
        })
    unassigned = [_load(l) for l in loads if not l.truck_id]
    return {
        "today": date.today().isoformat(), "trucks": rows, "unassigned": unassigned,
        "counts": {"free": sum(1 for r in rows if r["state"] == "free"), "on_load": sum(1 for r in rows if r["current_load"]),
                   "no_driver": sum(1 for r in rows if r["state"] == "no_driver"), "unassigned": len(unassigned)},
    }


@router.get("/my-week")
def my_week(start: Optional[date] = None, db: Session = Depends(get_db), user=Depends(require_user)):
    """A dispatcher's own row for the week; the office sees everyone on the Dispatchers page."""
    s = ws.week_start(start or date.today(), db=db)
    rows = dispatcher_pay.week_rows(db, s)
    if _role(user) == "dispatcher":
        rows = [r for r in rows if r["dispatcher_id"] == user.dispatcher_id]
    return {"period": ws.period_label(s), "period_start": s.isoformat(), "rows": rows}
