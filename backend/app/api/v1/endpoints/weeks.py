"""Weekly truck statements: the board, one statement, and the truck / driver pay rules behind it."""
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models.models import Driver, DriverDeduction, Truck, TruckDeduction, TruckStatement
from app.services import weekly_statement as ws

router = APIRouter(tags=["weekly statements"])


def _stmt(db: Session, statement_id: int) -> TruckStatement:
    s = (db.query(TruckStatement).options(joinedload(TruckStatement.lines), joinedload(TruckStatement.truck), joinedload(TruckStatement.driver))
           .filter(TruckStatement.id == statement_id).first())
    if not s:
        raise HTTPException(404, "Statement not found")
    return s


def _run(db: Session, fn, *args):
    try:
        result = fn(*args)
        db.commit()
        return result
    except ws.StatementError as e:
        db.rollback()
        raise HTTPException(400, str(e))


# ── Board ─────────────────────────────────────────────────────────────────────

@router.get("/weeks/{start}")
def week_board(start: date, db: Session = Depends(get_db)):
    start = ws.week_start(start, db=db)
    rows = ws.board(db, start)
    totals = {k: round(sum(r[k] for r in rows), 2) for k in ("gross", "fee", "deductions", "driver_pay", "driver_payout", "carry_in", "net")}
    totals["loads"] = sum(r["loads"] for r in rows)
    totals["miles"] = sum(r["miles"] for r in rows)
    totals["rpm"] = round(totals["gross"] / totals["miles"], 2) if totals["miles"] else None
    return {"period_start": start.isoformat(), "period_end": ws.week_end(start).isoformat(), "period": ws.period_label(start),
            "rows": rows, "totals": totals}


class GenerateIn(BaseModel):
    truck_ids: Optional[List[int]] = None


@router.post("/weeks/{start}/generate")
def generate_week(start: date, data: GenerateIn = GenerateIn(), db: Session = Depends(get_db)):
    try:
        return [ws.summary(s) for s in ws.generate_week(db, start, data.truck_ids)]
    except ws.StatementError as e:
        raise HTTPException(400, str(e))


# ── One statement ─────────────────────────────────────────────────────────────

@router.get("/weeks/{start}/trucks/{truck_id}")
def truck_week(start: date, truck_id: int, db: Session = Depends(get_db)):
    s = _run(db, ws.generate, db, truck_id, ws.week_start(start, db=db))
    return ws.detail(s)


@router.get("/statements/{statement_id}")
def get_statement(statement_id: int, db: Session = Depends(get_db)):
    return ws.detail(_stmt(db, statement_id))


class OdometerIn(BaseModel):
    odometer_start: Optional[int] = Field(default=None, ge=0)
    odometer_end: Optional[int] = Field(default=None, ge=0)


@router.put("/statements/{statement_id}/odometer")
def set_odometer(statement_id: int, data: OdometerIn, db: Session = Depends(get_db)):
    s = _stmt(db, statement_id)
    return ws.detail(_run(db, ws.set_odometer, db, s, data.odometer_start, data.odometer_end))


class CarryIn(BaseModel):
    enabled: bool


@router.put("/statements/{statement_id}/carry")
def set_carry(statement_id: int, data: CarryIn, db: Session = Depends(get_db)):
    s = _stmt(db, statement_id)
    return ws.detail(_run(db, ws.set_carry, db, s, data.enabled))


class LineIn(BaseModel):
    label: str
    amount: float


@router.post("/statements/{statement_id}/lines", status_code=201)
def add_line(statement_id: int, data: LineIn, db: Session = Depends(get_db)):
    s = _stmt(db, statement_id)
    return ws.detail(_run(db, ws.add_manual_line, db, s, data.label, data.amount))


@router.delete("/statements/{statement_id}/lines/{line_id}")
def remove_line(statement_id: int, line_id: int, db: Session = Depends(get_db)):
    s = _stmt(db, statement_id)
    return ws.detail(_run(db, ws.remove_manual_line, db, s, line_id))


class StatusIn(BaseModel):
    status: str
    ach_reference: Optional[str] = None


@router.post("/statements/{statement_id}/status")
def set_status(statement_id: int, data: StatusIn, db: Session = Depends(get_db)):
    s = _stmt(db, statement_id)
    return ws.detail(_run(db, ws.set_status, db, s, data.status, data.ach_reference))


class NotesIn(BaseModel):
    notes: Optional[str] = None


@router.put("/statements/{statement_id}/notes")
def set_notes(statement_id: int, data: NotesIn, db: Session = Depends(get_db)):
    s = _stmt(db, statement_id)
    s.notes = data.notes
    db.commit()
    return ws.detail(_stmt(db, statement_id))


# ── Truck rules ───────────────────────────────────────────────────────────────

class DeductionIn(BaseModel):
    id: Optional[int] = None
    label: str
    amount: float = Field(ge=0)
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_active: bool = True


class TruckRulesIn(BaseModel):
    fee_pct: float = Field(ge=0, le=100)
    carry_negative: bool = True
    deductions: List[DeductionIn]


def _truck_rules(t: Truck) -> dict:
    return {"truck_id": t.id, "unit_number": t.unit_number, "fee_pct": t.fee_pct or 0.0,
            "carry_negative": t.carry_negative if t.carry_negative is not None else True,
            "deductions": [{"id": d.id, "label": d.label, "amount": d.amount, "effective_from": d.effective_from,
                            "effective_to": d.effective_to, "is_active": d.is_active} for d in t.deductions]}


@router.get("/trucks/{truck_id}/rules")
def get_truck_rules(truck_id: int, db: Session = Depends(get_db)):
    t = db.query(Truck).options(joinedload(Truck.deductions)).filter(Truck.id == truck_id).first()
    if not t:
        raise HTTPException(404, "Truck not found")
    return _truck_rules(t)


@router.put("/trucks/{truck_id}/rules")
def set_truck_rules(truck_id: int, data: TruckRulesIn, db: Session = Depends(get_db)):
    t = db.query(Truck).options(joinedload(Truck.deductions)).filter(Truck.id == truck_id).first()
    if not t:
        raise HTTPException(404, "Truck not found")
    t.fee_pct = data.fee_pct
    t.carry_negative = data.carry_negative
    keep = {d.id for d in data.deductions if d.id}
    for existing in list(t.deductions):
        if existing.id not in keep:
            db.delete(existing)
    by_id = {d.id: d for d in t.deductions}
    for i, d in enumerate(data.deductions):
        row = by_id.get(d.id) if d.id else None
        if not row:
            row = TruckDeduction(truck_id=t.id)
            db.add(row)
        row.label, row.amount, row.effective_from, row.effective_to, row.is_active, row.sort_order = \
            d.label.strip(), d.amount, d.effective_from, d.effective_to, d.is_active, i
    db.commit()
    db.refresh(t)
    return _truck_rules(t)


# ── Driver pay rules ──────────────────────────────────────────────────────────

class DriverRulesIn(BaseModel):
    pay_type: str = Field(pattern="^(percent|per_mile|none)$")
    pay_pct: float = Field(default=30.0, ge=0, le=100)
    per_mile_rate: float = Field(default=0.55, ge=0)
    deductions: List[DeductionIn] = []


def _driver_rules(d: Driver) -> dict:
    return {"driver_id": d.id, "name": d.name, "pay_type": d.pay_type or "percent", "pay_pct": d.pay_pct if d.pay_pct is not None else 30.0,
            "per_mile_rate": d.per_mile_rate if d.per_mile_rate is not None else 0.55,
            "deductions": [{"id": x.id, "label": x.label, "amount": x.amount, "effective_from": x.effective_from,
                            "effective_to": x.effective_to, "is_active": x.is_active} for x in d.weekly_deductions]}


@router.get("/drivers/{driver_id}/rules")
def get_driver_rules(driver_id: int, db: Session = Depends(get_db)):
    d = db.query(Driver).options(joinedload(Driver.weekly_deductions)).filter(Driver.id == driver_id).first()
    if not d:
        raise HTTPException(404, "Driver not found")
    return _driver_rules(d)


@router.put("/drivers/{driver_id}/rules")
def set_driver_rules(driver_id: int, data: DriverRulesIn, db: Session = Depends(get_db)):
    d = db.query(Driver).options(joinedload(Driver.weekly_deductions)).filter(Driver.id == driver_id).first()
    if not d:
        raise HTTPException(404, "Driver not found")
    d.pay_type, d.pay_pct, d.per_mile_rate = data.pay_type, data.pay_pct, data.per_mile_rate
    keep = {x.id for x in data.deductions if x.id}
    for existing in list(d.weekly_deductions):
        if existing.id not in keep:
            db.delete(existing)
    by_id = {x.id: x for x in d.weekly_deductions}
    for x in data.deductions:
        row = by_id.get(x.id) if x.id else None
        if not row:
            row = DriverDeduction(driver_id=d.id)
            db.add(row)
        row.label, row.amount, row.effective_from, row.effective_to, row.is_active = x.label.strip(), x.amount, x.effective_from, x.effective_to, x.is_active
    db.commit()
    db.refresh(d)
    return _driver_rules(d)
