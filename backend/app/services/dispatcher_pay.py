"""
Dispatcher commission per week (Excel "Office" sheet).

For each dispatcher: gross = sum of rates on the week's loads they dispatched (same week rule as
truck statements, by pickup date), commission = pct × gross or a flat amount.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session, joinedload

from app.models.models import Dispatcher, DispatcherPayout, Load
from app.services.driver_pay_service import money
from app.services.weekly_statement import SKIPPED_LOAD_STATUSES, load_week_date, week_end, week_start


def commission_for(d: Dispatcher, gross: float) -> float:
    if (d.commission_type or "pct") == "flat":
        return money(d.commission_value or 0)
    return money(Decimal(str(gross)) * Decimal(str(d.commission_value or 0)) / 100)


def week_rows(db: Session, start: date) -> list[dict]:
    start = week_start(start, db=db)
    end = week_end(start)
    loads = (db.query(Load).options(joinedload(Load.stops), joinedload(Load.truck))
               .filter(Load.is_active == True, Load.dispatcher_id.isnot(None),
                       Load.load_date >= start - timedelta(days=14), Load.load_date <= end + timedelta(days=14)).all())
    by_dispatcher: dict[int, dict] = {}
    for l in loads:
        if getattr(l.status, "value", l.status) in SKIPPED_LOAD_STATUSES or not (start <= load_week_date(l) <= end):
            continue
        row = by_dispatcher.setdefault(l.dispatcher_id, {"gross": Decimal("0"), "loads": 0, "trucks": set()})
        row["gross"] += Decimal(str(l.rate or 0))
        row["loads"] += 1
        if l.truck:
            row["trucks"].add(l.truck.unit_number)
    payouts = {p.dispatcher_id: p for p in db.query(DispatcherPayout).filter(DispatcherPayout.period_start == start).all()}
    out = []
    for d in db.query(Dispatcher).filter(Dispatcher.is_active == True).order_by(Dispatcher.name).all():
        agg = by_dispatcher.get(d.id, {"gross": Decimal("0"), "loads": 0, "trucks": set()})
        gross = money(agg["gross"])
        paid = payouts.get(d.id)
        out.append({
            "dispatcher_id": d.id, "name": d.name, "commission_type": d.commission_type or "pct", "commission_value": d.commission_value or 0,
            "loads": agg["loads"], "trucks": sorted(agg["trucks"]), "gross": gross, "commission": commission_for(d, gross),
            "paid": bool(paid and paid.paid_at), "paid_amount": paid.amount if paid and paid.paid_at else None,
            "paid_at": paid.paid_at.isoformat() if paid and paid.paid_at else None,
        })
    return out


def set_paid(db: Session, dispatcher_id: int, start: date, paid: bool, amount: float | None = None) -> dict:
    start = week_start(start, db=db)
    d = db.query(Dispatcher).filter(Dispatcher.id == dispatcher_id).first()
    if not d:
        raise ValueError("Dispatcher not found")
    row = next(r for r in week_rows(db, start) if r["dispatcher_id"] == dispatcher_id)
    p = db.query(DispatcherPayout).filter_by(dispatcher_id=dispatcher_id, period_start=start).first()
    if paid:
        if not p:
            p = DispatcherPayout(dispatcher_id=dispatcher_id, period_start=start)
            db.add(p)
        p.gross, p.amount, p.paid_at = row["gross"], money(amount if amount is not None else row["commission"]), datetime.utcnow()
    elif p:
        db.delete(p)
    db.commit()
    return next(r for r in week_rows(db, start) if r["dispatcher_id"] == dispatcher_id)
