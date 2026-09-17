"""Office work: dispatcher commissions per week and the monthly bills calendar."""
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models.models import BillPayment, Company, Dispatcher, RecurringBill
from app.core.tenant import get_company_id
from app.services import dispatcher_pay
from app.services.weekly_statement import period_label, week_end, week_start
from app.services.driver_pay_service import money

router = APIRouter(tags=["office"])


# ── Dispatchers ───────────────────────────────────────────────────────────────

@router.get("/weeks/{start}/dispatchers")
def dispatcher_week(start: date, db: Session = Depends(get_db)):
    start = week_start(start, db=db)
    rows = dispatcher_pay.week_rows(db, start)
    return {"period_start": start.isoformat(), "period_end": week_end(start).isoformat(), "period": period_label(start), "rows": rows,
            "totals": {"gross": round(sum(r["gross"] for r in rows), 2), "commission": round(sum(r["commission"] for r in rows), 2),
                       "paid": round(sum(r["paid_amount"] or 0 for r in rows), 2), "loads": sum(r["loads"] for r in rows)}}


class PaidIn(BaseModel):
    paid: bool
    amount: Optional[float] = Field(default=None, ge=0)


@router.post("/weeks/{start}/dispatchers/{dispatcher_id}/paid")
def dispatcher_paid(start: date, dispatcher_id: int, data: PaidIn, db: Session = Depends(get_db)):
    try:
        return dispatcher_pay.set_paid(db, dispatcher_id, start, data.paid, data.amount)
    except ValueError as e:
        raise HTTPException(404, str(e))


class DispatcherRulesIn(BaseModel):
    commission_type: str = Field(pattern="^(pct|flat)$")
    commission_value: float = Field(ge=0)


@router.get("/dispatchers/{dispatcher_id}/rules")
def get_dispatcher_rules(dispatcher_id: int, db: Session = Depends(get_db)):
    d = db.query(Dispatcher).filter(Dispatcher.id == dispatcher_id).first()
    if not d:
        raise HTTPException(404, "Dispatcher not found")
    return {"dispatcher_id": d.id, "name": d.name, "commission_type": d.commission_type or "pct", "commission_value": d.commission_value or 0}


@router.put("/dispatchers/{dispatcher_id}/rules")
def set_dispatcher_rules(dispatcher_id: int, data: DispatcherRulesIn, db: Session = Depends(get_db)):
    d = db.query(Dispatcher).filter(Dispatcher.id == dispatcher_id).first()
    if not d:
        raise HTTPException(404, "Dispatcher not found")
    d.commission_type, d.commission_value = data.commission_type, data.commission_value
    db.commit()
    return {"dispatcher_id": d.id, "name": d.name, "commission_type": d.commission_type, "commission_value": d.commission_value}


# ── Bills ─────────────────────────────────────────────────────────────────────

class BillIn(BaseModel):
    label: str
    vendor: Optional[str] = None
    amount: float = Field(ge=0)
    due_day: int = Field(ge=1, le=31)
    account: Optional[str] = None
    truck_id: Optional[int] = None
    notes: Optional[str] = None
    is_active: bool = True


def _bill(b: RecurringBill, month: Optional[str] = None) -> dict:
    p = next((x for x in b.payments if x.month == month), None) if month else None
    return {"id": b.id, "label": b.label, "vendor": b.vendor, "amount": b.amount, "due_day": b.due_day, "account": b.account,
            "truck_id": b.truck_id, "truck_unit": b.truck.unit_number if b.truck else None, "notes": b.notes, "is_active": b.is_active,
            "paid": bool(p), "paid_amount": p.amount if p else None, "paid_at": p.paid_at.isoformat() if p and p.paid_at else None}


def _month_ok(month: str):
    if len(month) != 7 or month[4] != "-" or not month[:4].isdigit() or not month[5:].isdigit() or not 1 <= int(month[5:]) <= 12:
        raise HTTPException(400, "Month must look like 2026-01")


@router.get("/bills")
def list_bills(include_inactive: bool = False, db: Session = Depends(get_db)):
    q = db.query(RecurringBill).options(joinedload(RecurringBill.truck), joinedload(RecurringBill.payments))
    if not include_inactive:
        q = q.filter(RecurringBill.is_active == True)
    return [_bill(b) for b in q.order_by(RecurringBill.due_day, RecurringBill.label).all()]


@router.get("/bills/month/{month}")
def bills_for_month(month: str, db: Session = Depends(get_db)):
    _month_ok(month)
    bills = (db.query(RecurringBill).options(joinedload(RecurringBill.truck), joinedload(RecurringBill.payments))
               .filter(RecurringBill.is_active == True).order_by(RecurringBill.due_day, RecurringBill.label).all())
    rows = [_bill(b, month) for b in bills]
    total = money(sum(r["amount"] for r in rows))
    paid = money(sum(r["paid_amount"] or 0 for r in rows))
    return {"month": month, "rows": rows, "totals": {"due": total, "paid": paid, "remaining": money(total - paid), "count": len(rows), "paid_count": sum(1 for r in rows if r["paid"])}}


@router.post("/bills", status_code=201)
def create_bill(data: BillIn, db: Session = Depends(get_db)):
    b = RecurringBill(**data.model_dump())
    db.add(b)
    db.commit()
    db.refresh(b)
    return _bill(b)


@router.put("/bills/{bill_id}")
def update_bill(bill_id: int, data: BillIn, db: Session = Depends(get_db)):
    b = db.query(RecurringBill).filter(RecurringBill.id == bill_id).first()
    if not b:
        raise HTTPException(404, "Bill not found")
    for k, v in data.model_dump().items():
        setattr(b, k, v)
    db.commit()
    db.refresh(b)
    return _bill(b)


@router.delete("/bills/{bill_id}")
def delete_bill(bill_id: int, db: Session = Depends(get_db)):
    b = db.query(RecurringBill).filter(RecurringBill.id == bill_id).first()
    if not b:
        raise HTTPException(404, "Bill not found")
    b.is_active = False
    db.commit()
    return {"message": "Bill archived"}


class BillPayIn(BaseModel):
    month: str
    amount: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = None


@router.post("/bills/{bill_id}/pay")
def pay_bill(bill_id: int, data: BillPayIn, db: Session = Depends(get_db)):
    _month_ok(data.month)
    b = db.query(RecurringBill).options(joinedload(RecurringBill.payments)).filter(RecurringBill.id == bill_id).first()
    if not b:
        raise HTTPException(404, "Bill not found")
    p = next((x for x in b.payments if x.month == data.month), None)
    if not p:
        p = BillPayment(bill_id=b.id, month=data.month)
        db.add(p)
    p.amount = money(data.amount if data.amount is not None else b.amount)
    p.notes = data.notes
    db.commit()
    db.refresh(b)
    return _bill(b, data.month)


@router.delete("/bills/{bill_id}/pay/{month}")
def unpay_bill(bill_id: int, month: str, db: Session = Depends(get_db)):
    _month_ok(month)
    p = db.query(BillPayment).filter_by(bill_id=bill_id, month=month).first()
    if p:
        db.delete(p)
        db.commit()
    b = db.query(RecurringBill).options(joinedload(RecurringBill.payments)).filter(RecurringBill.id == bill_id).first()
    if not b:
        raise HTTPException(404, "Bill not found")
    return _bill(b, month)


# ── Company (tenant) settings ─────────────────────────────────────────────────

class CompanyIn(BaseModel):
    name: str
    week_start_day: int = Field(ge=0, le=6)   # 0 = Monday … 5 = Saturday, 6 = Sunday


def _company(c: Company) -> dict:
    return {"id": c.id, "name": c.name, "week_start_day": c.week_start_day if c.week_start_day is not None else 5}


@router.get("/company/me")
def get_my_company(db: Session = Depends(get_db)):
    cid = get_company_id()
    c = db.get(Company, cid) if cid else None
    if not c:
        raise HTTPException(404, "Sign in to a company first")
    return _company(c)


@router.put("/company/me")
def update_my_company(data: CompanyIn, db: Session = Depends(get_db)):
    cid = get_company_id()
    c = db.get(Company, cid) if cid else None
    if not c:
        raise HTTPException(404, "Sign in to a company first")
    if not data.name.strip():
        raise HTTPException(400, "Company name is required")
    c.name, c.week_start_day = data.name.strip(), data.week_start_day
    db.commit()
    return _company(c)
