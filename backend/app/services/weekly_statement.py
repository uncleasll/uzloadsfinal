"""
weekly_statement.py
───────────────────
Builds one truck's Saturday–Friday statement exactly like a block in the
STATEMENTS Excel workbook:

    GROSS          = sum of load rates in the week
    FEE            = GROSS × truck.fee_pct
    TEMPLATE       = truck's fixed weekly deductions (cargo, ELD, safety, trailer, truck payment ...)
    FUEL           = expenses for this truck in the week, category Fuel
    EXPENSES       = other expenses for this truck in the week (scale, wash, toll, invoice ...)
    DRIVER PAY     = pay_pct × GROSS | per_mile_rate × (odometer_end − odometer_start) | 0
    CARRY IN       = last week's negative NET, if carrying is enabled
    MANUAL         = lines typed on the statement itself
    NET            = GROSS − FEE − TEMPLATE − FUEL − EXPENSES − DRIVER PAY − CARRY IN − MANUAL
    DRIVER PAYOUT  = DRIVER PAY − driver's fixed weekly deductions

Only manual lines, odometer readings and the carry switch survive a regeneration.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session, joinedload

from app.models.models import (
    Company, Driver, Expense, Load, LoadStop, StatementLine, StatementStatus, Truck, TruckStatement,
)
from app.services.driver_pay_service import money

FUEL_CATEGORIES = {"fuel", "diesel"}
SKIPPED_LOAD_STATUSES = {"Canceled", "TONU"}
GENERATED_KINDS = ("load", "fee", "template", "fuel", "expense", "driver_pay", "driver_deduction", "carry_in")


class StatementError(ValueError):
    pass


# ── Week helpers ──────────────────────────────────────────────────────────────

DEFAULT_WEEK_START_DAY = 5   # Saturday (Monday = 0)


def company_week_start_day(db: Session | None) -> int:
    """The weekday a company's statement week starts on; Saturday unless the company set otherwise."""
    from app.core.tenant import get_company_id
    cid = get_company_id()
    if db is None or cid is None:
        return DEFAULT_WEEK_START_DAY
    c = db.get(Company, cid)
    return c.week_start_day if c and c.week_start_day is not None else DEFAULT_WEEK_START_DAY


def week_start(d: date, start_day: int | None = None, db: Session | None = None) -> date:
    """First day of the statement week containing d (Saturday by default)."""
    if start_day is None:
        start_day = company_week_start_day(db)
    return d - timedelta(days=(d.weekday() - start_day) % 7)


def week_end(start: date) -> date:
    return start + timedelta(days=6)


def period_label(start: date) -> str:
    end = week_end(start)
    return f"{start.month:02d}/{start.day:02d}-{end.month:02d}/{end.day:02d}"


def load_week_date(load: Load) -> date:
    """The week a load is filed in: an explicit statement week wins, else the pickup date, else the load date."""
    if load.statement_week:
        return load.statement_week
    pickups = [s.stop_date for s in (load.stops or []) if s.stop_type.value == "pickup" and s.stop_date]
    return min(pickups) if pickups else load.load_date


def _active_on(entry, on: date) -> bool:
    if not entry.is_active:
        return False
    if entry.effective_from and entry.effective_from > on:
        return False
    if entry.effective_to and entry.effective_to < on:
        return False
    return True


# ── Generation ────────────────────────────────────────────────────────────────

def get_statement(db: Session, truck_id: int, start: date) -> TruckStatement | None:
    return (db.query(TruckStatement)
              .options(joinedload(TruckStatement.lines), joinedload(TruckStatement.truck), joinedload(TruckStatement.driver))
              .filter(TruckStatement.truck_id == truck_id, TruckStatement.period_start == start).first())


def loads_for_week(db: Session, truck_id: int, start: date) -> list[Load]:
    end = week_end(start)
    from sqlalchemy import or_
    candidates = (db.query(Load).options(joinedload(Load.stops), joinedload(Load.broker), joinedload(Load.driver))
                    .filter(Load.truck_id == truck_id, Load.is_active == True,
                            or_(Load.statement_week == start,
                                (Load.statement_week.is_(None)) & (Load.load_date >= start - timedelta(days=14)) & (Load.load_date <= end + timedelta(days=14)))).all())
    rows = [l for l in candidates
            if getattr(l.status, "value", l.status) not in SKIPPED_LOAD_STATUSES and start <= load_week_date(l) <= end]
    return sorted(rows, key=lambda l: (load_week_date(l), l.load_number))


def generate(db: Session, truck_id: int, start: date, author: str = "System") -> TruckStatement:
    """Create or refresh the draft statement for truck + week. Paid statements are never touched."""
    start = week_start(start, db=db)
    end = week_end(start)
    truck = db.query(Truck).options(joinedload(Truck.deductions), joinedload(Truck.driver)).filter(Truck.id == truck_id).first()
    if not truck:
        raise StatementError("Truck not found")

    stmt = get_statement(db, truck_id, start)
    if stmt and stmt.status == StatementStatus.PAID.value:
        return stmt
    if not stmt:
        stmt = TruckStatement(truck_id=truck_id, period_start=start, period_end=end,
                              carry_enabled=bool(truck.carry_negative if truck.carry_negative is not None else True))
        db.add(stmt)
        db.flush()

    # Read lines from the database, not the possibly stale relationship
    manual = (db.query(StatementLine).filter(StatementLine.statement_id == stmt.id, StatementLine.kind == "manual")
                .order_by(StatementLine.sort_order).all())
    db.query(StatementLine).filter(StatementLine.statement_id == stmt.id, StatementLine.kind.in_(GENERATED_KINDS)).delete(synchronize_session=False)
    db.flush()
    db.expire(stmt, ["lines"])

    loads = loads_for_week(db, truck_id, start)
    order = 0
    lines: list[StatementLine] = []

    def add(kind, label, amount, **kw):
        nonlocal order
        order += 10
        line = StatementLine(statement_id=stmt.id, kind=kind, label=label, amount=money(amount), sort_order=order, **kw)
        lines.append(line)
        return line

    # 1. Loads → gross
    gross = Decimal("0")
    for l in loads:
        gross += Decimal(str(l.rate or 0))
        add("load", f"#{l.load_number} {l.broker.name if l.broker else ''}".strip(), l.rate or 0, load_id=l.id)
    gross = money(gross)

    # Driver: the driver on the week's loads, else the truck's assigned driver
    driver = next((l.driver for l in loads if l.driver), None) or truck.driver
    stmt.driver_id = driver.id if driver else None

    # 2. Fee
    stmt.fee_pct = truck.fee_pct or 0.0
    fee = money(Decimal(str(gross)) * Decimal(str(stmt.fee_pct)) / 100)
    if stmt.fee_pct:
        add("fee", f"{stmt.fee_pct:g}% fee", fee)

    # 3. Template deductions
    template_total = Decimal("0")
    for d in truck.deductions:
        if _active_on(d, end):
            template_total += Decimal(str(d.amount))
            add("template", d.label, d.amount)

    # 4. Expenses in the week
    fuel_total = Decimal("0")
    expense_total = Decimal("0")
    expenses = (db.query(Expense).filter(Expense.truck_id == truck_id, Expense.is_active == True,
                                         Expense.expense_date >= start, Expense.expense_date <= end)
                  .order_by(Expense.expense_date).all())
    for e in expenses:
        if (e.category or "").strip().lower() in FUEL_CATEGORIES:
            fuel_total += Decimal(str(e.amount))
            add("fuel", f"Diesel {e.expense_date.strftime('%m/%d')}" + (f" {e.description}" if e.description else ""), e.amount, expense_id=e.id)
        else:
            expense_total += Decimal(str(e.amount))
            add("expense", f"{e.category} {e.expense_date.strftime('%m/%d')}" + (f" {e.description}" if e.description else ""), e.amount, expense_id=e.id)

    # 5. Driver pay
    driver_pay = Decimal("0")
    if driver:
        pay_type = driver.pay_type or "percent"
        if pay_type == "percent":
            pct = Decimal(str(driver.pay_pct or 0))
            driver_pay = Decimal(str(gross)) * pct / 100
            add("driver_pay", f"Driver {pct:g}%", driver_pay)
        elif pay_type == "per_mile":
            miles = max(0, (stmt.odometer_end or 0) - (stmt.odometer_start or 0)) if stmt.odometer_start is not None and stmt.odometer_end is not None else 0
            rate = Decimal(str(driver.per_mile_rate or 0))
            driver_pay = Decimal(miles) * rate
            add("driver_pay", f"Driver per mile {rate:g} × {miles:,} mi", driver_pay)
    driver_pay = money(driver_pay)

    # 6. Driver-side deductions (come out of the payout, not the truck net)
    driver_ded = Decimal("0")
    if driver:
        for d in driver.weekly_deductions:
            if _active_on(d, end):
                driver_ded += Decimal(str(d.amount))
                add("driver_deduction", d.label, d.amount)
    driver_ded = money(driver_ded)

    # 7. Carry-in from the previous week
    carry_in = 0.0
    prev = get_statement(db, truck_id, start - timedelta(days=7))
    if stmt.carry_enabled and prev and prev.net < 0:
        carry_in = money(-prev.net)
        add("carry_in", f"Balance from {period_label(prev.period_start)}", carry_in)

    # 8. Manual lines keep their place after the generated ones
    manual_total = Decimal("0")
    for m in manual:
        order += 10
        m.sort_order = order
        manual_total += Decimal(str(m.amount))

    for line in lines:
        db.add(line)

    stmt.gross = gross
    stmt.fee = fee
    stmt.deductions = money(template_total + fuel_total + expense_total + manual_total)
    stmt.driver_pay = driver_pay
    stmt.driver_deductions = driver_ded
    stmt.driver_payout = money(Decimal(str(driver_pay)) - Decimal(str(driver_ded)))
    stmt.carry_in = carry_in
    stmt.net = money(Decimal(str(gross)) - Decimal(str(fee)) - Decimal(str(stmt.deductions))
                     - Decimal(str(driver_pay)) - Decimal(str(carry_in)))
    db.flush()
    db.expire(stmt, ["lines"])
    return get_statement(db, truck_id, start)


def generate_week(db: Session, start: date, truck_ids: list[int] | None = None) -> list[TruckStatement]:
    start = week_start(start, db=db)
    q = db.query(Truck).filter(Truck.is_active == True)
    if truck_ids:
        q = q.filter(Truck.id.in_(truck_ids))
    out = [generate(db, t.id, start) for t in q.order_by(Truck.unit_number).all()]
    db.commit()
    return out


# ── Edits allowed on a statement ──────────────────────────────────────────────

def _editable(stmt: TruckStatement):
    if stmt.status == StatementStatus.PAID.value:
        raise StatementError("Paid statements are locked. Reopen it first.")


def set_odometer(db: Session, stmt: TruckStatement, start_odo: int | None, end_odo: int | None) -> TruckStatement:
    _editable(stmt)
    if start_odo is not None and end_odo is not None and end_odo < start_odo:
        raise StatementError("Odometer end must be greater than start.")
    stmt.odometer_start, stmt.odometer_end = start_odo, end_odo
    if end_odo:
        from app.services.maintenance import record_odometer
        record_odometer(db, stmt.truck_id, stmt.period_end, end_odo, source="statement")
    db.flush()
    return generate(db, stmt.truck_id, stmt.period_start)


def set_carry(db: Session, stmt: TruckStatement, enabled: bool) -> TruckStatement:
    _editable(stmt)
    stmt.carry_enabled = enabled
    db.flush()
    return generate(db, stmt.truck_id, stmt.period_start)


def add_manual_line(db: Session, stmt: TruckStatement, label: str, amount: float) -> TruckStatement:
    _editable(stmt)
    if not label.strip():
        raise StatementError("Line needs a label.")
    order = max((l.sort_order for l in stmt.lines), default=0) + 10
    db.add(StatementLine(statement_id=stmt.id, kind="manual", label=label.strip(), amount=money(amount), sort_order=order))
    db.flush()
    return generate(db, stmt.truck_id, stmt.period_start)


def remove_manual_line(db: Session, stmt: TruckStatement, line_id: int) -> TruckStatement:
    _editable(stmt)
    line = next((l for l in stmt.lines if l.id == line_id), None)
    if not line or line.kind != "manual":
        raise StatementError("Only manual lines can be removed; generated lines come from loads, expenses and templates.")
    db.delete(line)
    db.flush()
    return generate(db, stmt.truck_id, stmt.period_start)


def set_status(db: Session, stmt: TruckStatement, status: str, ach_reference: str | None = None) -> TruckStatement:
    status = status.lower()
    if status not in {s.value for s in StatementStatus}:
        raise StatementError("Status must be draft, ready or paid.")
    if status == StatementStatus.PAID.value:
        stmt = generate(db, stmt.truck_id, stmt.period_start)
        stmt.ach_reference = ach_reference or stmt.ach_reference
        stmt.paid_at = datetime.utcnow()
    elif status == StatementStatus.DRAFT.value:
        stmt.paid_at = None
    stmt.status = status
    db.flush()
    return stmt


# ── Board ─────────────────────────────────────────────────────────────────────

def board(db: Session, start: date) -> list[dict]:
    """One row per active truck for the week; generates missing drafts so nothing is hidden."""
    start = week_start(start, db=db)
    trucks = db.query(Truck).options(joinedload(Truck.driver)).filter(Truck.is_active == True).order_by(Truck.unit_number).all()
    existing = {s.truck_id: s for s in db.query(TruckStatement).options(joinedload(TruckStatement.lines), joinedload(TruckStatement.driver))
                .filter(TruckStatement.period_start == start).all()}
    rows = []
    for t in trucks:
        s = existing.get(t.id)
        if not s or s.status == StatementStatus.DRAFT.value:
            s = generate(db, t.id, start)
        rows.append(summary(s))
    db.commit()
    return rows


def summary(s: TruckStatement) -> dict:
    loads = [l for l in s.lines if l.kind == "load"]
    miles = sum(int(l.load.total_miles or 0) for l in loads if l.load)
    deadhead = sum(int(l.load.empty_miles or 0) for l in loads if l.load)
    return {
        "miles": miles, "deadhead_miles": deadhead, "rpm": round(s.gross / miles, 2) if miles else None,
        "id": s.id, "truck_id": s.truck_id, "unit_number": s.truck.unit_number if s.truck else None,
        "driver_id": s.driver_id, "driver_name": s.driver.name if s.driver else None,
        "driver_pay_type": (s.driver.pay_type or "percent") if s.driver else None,
        "period_start": s.period_start.isoformat(), "period_end": s.period_end.isoformat(), "period": period_label(s.period_start),
        "status": s.status, "loads": len(loads), "gross": s.gross, "fee": s.fee, "deductions": s.deductions,
        "driver_pay": s.driver_pay, "driver_payout": s.driver_payout, "carry_in": s.carry_in, "net": s.net,
        "odometer_start": s.odometer_start, "odometer_end": s.odometer_end, "carry_enabled": s.carry_enabled,
        "ach_reference": s.ach_reference, "paid_at": s.paid_at.isoformat() if s.paid_at else None,
    }


def detail(s: TruckStatement) -> dict:
    out = summary(s)
    out["fee_pct"] = s.fee_pct
    out["notes"] = s.notes
    out["lines"] = [{
        "id": l.id, "kind": l.kind, "label": l.label, "amount": l.amount, "load_id": l.load_id, "expense_id": l.expense_id,
        "load": {
            "load_number": l.load.load_number, "po_number": l.load.po_number, "driver": l.load.driver.name if l.load.driver else None,
            "dispatcher": l.load.dispatcher.name if l.load.dispatcher else None, "broker": l.load.broker.name if l.load.broker else None,
            "pickup": _stop(l.load, "pickup"), "delivery": _stop(l.load, "delivery"), "rate": l.load.rate,
            "loaded_miles": l.load.loaded_miles or 0, "empty_miles": l.load.empty_miles or 0, "total_miles": l.load.total_miles or 0,
            "rpm": round((l.load.rate or 0) / l.load.total_miles, 2) if l.load.total_miles else None,
            "pod": has_pod(l.load),
        } if l.load else None,
    } for l in s.lines]
    return out


def has_pod(load: Load) -> bool:
    """POD is stored as document_type POD, or as Other with the frontend's [karvan-document:POD] note."""
    for d in load.documents or []:
        kind = getattr(d.document_type, "value", d.document_type)
        if kind == "POD" or (kind == "Other" and (d.notes or "").startswith("[karvan-document:POD]")):
            return True
    return False


def _stop(load: Load, kind: str) -> dict | None:
    s = next((x for x in (load.stops or []) if x.stop_type.value == kind), None)
    if not s:
        return None
    return {"city": s.city, "state": s.state, "date": s.stop_date.isoformat() if s.stop_date else None}
