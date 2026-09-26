"""What the driver's phone talks to: my truck, my loads, my week, photos, odometer, receipts."""
from __future__ import annotations
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.api.v1.endpoints.auth import require_user
from app.db.session import get_db
from app.models.models import Attachment, Driver, Expense, Load, LoadStatus, Message, Truck
from app.services import chat, maintenance as mt, weekly_statement as ws
from app.services.driver_pay_service import money

router = APIRouter(prefix="/driver", tags=["driver"])

# The only order a driver moves a load through. Delivery needs a POD photo first.
FLOW = ["Dispatched", "En Route", "Picked-up", "Delivered"]
OPEN = {"New", "Dispatched", "En Route", "Picked-up"}


def _driver(db: Session, user) -> Driver:
    if not user.driver_id:
        raise HTTPException(403, "This account is not linked to a driver. Ask the office.")
    d = db.get(Driver, user.driver_id)
    if not d:
        raise HTTPException(404, "Driver record not found")
    return d


def _truck(db: Session, d: Driver) -> Truck | None:
    return db.query(Truck).filter(Truck.driver_id == d.id, Truck.is_active == True).first()  # noqa: E712


def _stop(load: Load, kind: str) -> dict | None:
    stops = sorted([s for s in load.stops if getattr(s.stop_type, "value", s.stop_type) == kind], key=lambda s: s.stop_order)
    s = (stops[0] if kind == "pickup" else stops[-1]) if stops else None
    if not s:
        return None
    return {"title": s.title, "address": s.address, "city": s.city, "state": s.state, "zip": s.zip_code,
            "date": s.stop_date.isoformat() if s.stop_date else None, "notes": s.notes}


def _load(db: Session, load: Load) -> dict:
    status = getattr(load.status, "value", load.status)
    nxt = FLOW[FLOW.index(status) + 1] if status in FLOW[:-1] else ("Dispatched" if status == "New" else None)
    docs = db.query(Attachment).filter(Attachment.load_id == load.id).order_by(Attachment.id).all()
    return {
        "id": load.id, "number": load.po_number or str(load.load_number), "status": status, "next_status": nxt,
        "rate": load.rate, "miles": load.total_miles or 0, "date": load.load_date.isoformat() if load.load_date else None,
        "broker": {"name": load.broker.name, "phone": load.broker.phone} if load.broker else None,
        "dispatcher": load.dispatcher.name if load.dispatcher else None,
        "pickup": _stop(load, "pickup"), "delivery": _stop(load, "delivery"), "notes": load.notes,
        "pod": ws.has_pod(load), "photos": [chat._att(a) for a in docs],
    }


@router.get("/me")
def me(db: Session = Depends(get_db), user=Depends(require_user)):
    """Today's screen: who I am, my truck, the load I am on, and this week so far."""
    d = _driver(db, user)
    truck = _truck(db, d)
    loads = (db.query(Load).options(joinedload(Load.stops), joinedload(Load.broker), joinedload(Load.dispatcher))
               .filter(Load.driver_id == d.id, Load.is_active == True).order_by(Load.load_date.desc(), Load.id.desc()).limit(30).all())  # noqa: E712
    open_loads = [l for l in loads if getattr(l.status, "value", l.status) in OPEN]
    open_loads.sort(key=lambda l: (l.load_date or date.max, l.id))
    week = None
    if truck:
        start = ws.week_start(date.today(), db=db)
        s = ws.generate(db, truck.id, start)
        week = {"period": ws.period_label(start), "loads": len([x for x in s.lines if x.kind == "load"]), "gross": s.gross,
                "driver_pay": s.driver_pay, "driver_payout": s.driver_payout, "status": s.status,
                "odometer": (mt.current_odometer(db, truck.id).reading if mt.current_odometer(db, truck.id) else None)}
        db.commit()
    return {
        "driver": {"id": d.id, "name": d.name, "phone": d.phone},
        "truck": {"id": truck.id, "unit_number": truck.unit_number, "make": truck.make, "model": truck.model, "plate": truck.plate} if truck else None,
        "current_load": _load(db, open_loads[0]) if open_loads else None,
        "upcoming": [_load(db, l) for l in open_loads[1:6]],
        "week": week,
    }


@router.get("/loads")
def my_loads(db: Session = Depends(get_db), user=Depends(require_user)):
    d = _driver(db, user)
    loads = (db.query(Load).options(joinedload(Load.stops), joinedload(Load.broker), joinedload(Load.dispatcher))
               .filter(Load.driver_id == d.id, Load.is_active == True).order_by(Load.load_date.desc(), Load.id.desc()).limit(60).all())  # noqa: E712
    return [_load(db, l) for l in loads]


class StatusIn(BaseModel):
    status: str
    client_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    at: Optional[datetime] = None


@router.post("/loads/{load_id}/status")
def set_status(load_id: int, data: StatusIn, db: Session = Depends(get_db), user=Depends(require_user)):
    """Move my load one step. Delivered needs a POD photo already on the load."""
    d = _driver(db, user)
    load = db.query(Load).options(joinedload(Load.stops)).filter(Load.id == load_id, Load.driver_id == d.id).first()
    if not load:
        raise HTTPException(404, "Load not found")
    if data.status not in FLOW:
        raise HTTPException(400, "Unknown status")
    current = getattr(load.status, "value", load.status)
    if current == data.status:
        return _load(db, load)                                  # offline resend
    allowed = FLOW[FLOW.index(current) + 1] if current in FLOW[:-1] else ("Dispatched" if current == "New" else None)
    if data.status != allowed:
        raise HTTPException(400, f"From {current} the next step is {allowed or 'nothing'}")
    if data.status == "Delivered" and not ws.has_pod(load):
        raise HTTPException(400, "Take the POD photo first, then mark delivered")
    load.status = data.status
    if data.status == "Delivered":
        load.actual_delivery_date = (data.at or datetime.utcnow()).date()
    truck = _truck(db, d)
    if truck:
        conv = chat.ensure_truck_conversation(db, truck)
        where = f" · {data.lat:.4f}, {data.lng:.4f}" if data.lat is not None and data.lng is not None else ""
        db.add(Message(conversation_id=conv.id, sender_id=user.id, kind="system",
                       body=f"{d.name}: load #{load.po_number or load.load_number} {data.status.lower()}{where}",
                       client_id=data.client_id, client_created_at=data.at))
    db.commit()
    return _load(db, load)


@router.post("/loads/{load_id}/photos", status_code=201)
async def load_photo(load_id: int, file: UploadFile = File(...), category: str = Form("pod"), client_id: Optional[str] = Form(None),
                     taken_at: Optional[datetime] = Form(None), lat: Optional[float] = Form(None), lng: Optional[float] = Form(None),
                     db: Session = Depends(get_db), user=Depends(require_user)):
    """POD, BOL, lumper or scale ticket: stamped, filed on the load, and posted in the truck's chat."""
    d = _driver(db, user)
    load = db.query(Load).filter(Load.id == load_id, Load.driver_id == d.id).first()
    if not load:
        raise HTTPException(404, "Load not found")
    if category not in ("pod", "bol", "lumper", "scale", "other"):
        raise HTTPException(400, "Unknown document type")
    if client_id:
        dup = db.query(Message).filter(Message.sender_id == user.id, Message.client_id == client_id).first()
        if dup:
            return chat._msg(dup)
    data = await file.read()
    truck = _truck(db, d)
    conv = chat.ensure_truck_conversation(db, truck) if truck else None
    label = {"pod": "POD", "bol": "BOL", "lumper": "Lumper receipt", "scale": "Scale ticket", "other": "Document"}[category]
    m = chat.post_message(db, conv, user, f"{label} · load #{load.po_number or load.load_number}", kind="photo", client_id=client_id, client_created_at=taken_at) if conv else None
    a = chat.store_attachment(db, user=user, data=data, filename=file.filename or "photo.jpg", content_type=file.content_type or "image/jpeg",
                              category=category, truck_id=truck.id if truck else load.truck_id, load_id=load.id, taken_at=taken_at, lat=lat, lng=lng, message=m)
    chat.attach_to_load(db, a, load, "BOL" if category == "bol" else "Other", "[karvan-document:POD]" if category == "pod" else None)
    if m:
        db.refresh(m)
        return chat._msg(m)
    return {"attachment": chat._att(a)}


@router.post("/inspections", status_code=201)
async def inspection(files: list[UploadFile] = File(...), kind: str = Form("pre_trip"), client_id: Optional[str] = Form(None),
                     taken_at: Optional[datetime] = Form(None), lat: Optional[float] = Form(None), lng: Optional[float] = Form(None),
                     notes: Optional[str] = Form(None), db: Session = Depends(get_db), user=Depends(require_user)):
    """Truck walk-around: several photos in one go, filed on the truck and posted in its chat."""
    d = _driver(db, user)
    truck = _truck(db, d)
    if not truck:
        raise HTTPException(400, "No truck is assigned to you")
    if client_id:
        dup = db.query(Message).filter(Message.sender_id == user.id, Message.client_id == client_id).first()
        if dup:
            return chat._msg(dup)
    conv = chat.ensure_truck_conversation(db, truck)
    label = {"pre_trip": "Pre-trip inspection", "post_trip": "Post-trip inspection", "damage": "Damage report", "breakdown": "Breakdown"}.get(kind, "Inspection")
    m = chat.post_message(db, conv, user, f"{label} · {len(files)} photos" + (f"\n{notes}" if notes else ""), kind="photo", client_id=client_id, client_created_at=taken_at)
    for f in files:
        data = await f.read()
        chat.store_attachment(db, user=user, data=data, filename=f.filename or "photo.jpg", content_type=f.content_type or "image/jpeg",
                              category="inspection", truck_id=truck.id, taken_at=taken_at, lat=lat, lng=lng, message=m)
    if kind == "breakdown":
        truck.notes = ((truck.notes or "") + f"\n[{datetime.utcnow():%Y-%m-%d %H:%M}] Breakdown reported by {d.name}: {notes or ''}").strip()
    db.commit(); db.refresh(m)
    return chat._msg(m)


@router.post("/expenses", status_code=201)
async def expense(file: Optional[UploadFile] = File(None), amount: float = Form(...), category: str = Form("Fuel"),
                  note: Optional[str] = Form(None), client_id: Optional[str] = Form(None), on: Optional[date] = Form(None),
                  lat: Optional[float] = Form(None), lng: Optional[float] = Form(None),
                  db: Session = Depends(get_db), user=Depends(require_user)):
    """A receipt from the road: lands in the expense ledger on my truck, so the week's statement picks it up."""
    d = _driver(db, user)
    truck = _truck(db, d)
    if amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    marker = f"[driver-app:{client_id}]" if client_id else None
    if marker:
        dup = db.query(Expense).filter(Expense.description.contains(marker)).first()
        if dup:
            return {"id": dup.id, "amount": dup.amount, "category": dup.category, "duplicate": True}
    e = Expense(expense_date=on or date.today(), category=category, amount=money(amount),
                description=" ".join(x for x in [note, marker] if x) or None, truck_id=truck.id if truck else None, driver_id=d.id, is_active=True)
    db.add(e); db.flush()
    if file is not None:
        data = await file.read()
        conv = chat.ensure_truck_conversation(db, truck) if truck else None
        m = chat.post_message(db, conv, user, f"Receipt · {category} · ${money(amount):,.2f}" + (f"\n{note}" if note else ""), kind="photo", client_id=client_id) if conv else None
        a = chat.store_attachment(db, user=user, data=data, filename=file.filename or "receipt.jpg", content_type=file.content_type or "image/jpeg",
                                  category="receipt", truck_id=truck.id if truck else None, lat=lat, lng=lng, message=m)
        e.receipt_path = a.storage_key; e.receipt_filename = a.original_filename
    db.commit()
    return {"id": e.id, "amount": e.amount, "category": e.category, "date": e.expense_date.isoformat()}


class OdometerIn(BaseModel):
    reading: int
    on: Optional[date] = None


@router.post("/odometer")
def odometer(data: OdometerIn, db: Session = Depends(get_db), user=Depends(require_user)):
    d = _driver(db, user)
    truck = _truck(db, d)
    if not truck:
        raise HTTPException(400, "No truck is assigned to you")
    try:
        row = mt.record_odometer(db, truck.id, data.on or date.today(), data.reading, source="driver")
    except ValueError as e:
        raise HTTPException(400, str(e))
    db.commit()
    return {"truck": truck.unit_number, "reading": row.reading, "date": row.date.isoformat()}


@router.get("/statement")
def statement(db: Session = Depends(get_db), user=Depends(require_user)):
    """My truck's current week, the way the office sees it, minus nothing: drivers should see their own math."""
    d = _driver(db, user)
    truck = _truck(db, d)
    if not truck:
        return {"weeks": []}
    out = []
    start = ws.week_start(date.today(), db=db)
    for i in range(4):
        w = start - __import__("datetime").timedelta(days=7 * i)
        s = ws.generate(db, truck.id, w)
        loads = [x for x in s.lines if x.kind == "load"]
        out.append({"period": ws.period_label(w), "period_start": w.isoformat(), "status": s.status, "loads": len(loads),
                    "gross": s.gross, "driver_pay": s.driver_pay, "driver_deductions": s.driver_deductions, "driver_payout": s.driver_payout,
                    "paid_at": s.paid_at.isoformat() if s.paid_at else None,
                    "lines": [{"kind": l.kind, "label": l.label, "amount": l.amount} for l in s.lines if l.kind in ("load", "driver_pay", "driver_deduction")]})
    db.commit()
    return {"truck": truck.unit_number, "weeks": out}
