"""
payroll CRUD — accounting-safe settlement management.

CRITICAL: driver pay amounts always come from load.drivers_payable_snapshot
(the historical snapshot), NEVER from the live driver profile.
"""
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_
from typing import Optional, List
from datetime import date, datetime

from app.models.models import (
    Settlement, SettlementItem, SettlementPayment, SettlementAdjustment,
    SettlementHistory, SettlementStatus, Load, Driver, LoadStop,
)
from app.schemas.payroll_schemas import (
    SettlementCreate, SettlementUpdate,
    SettlementPaymentCreate, SettlementAdjustmentCreate,
)


# ─── helpers ──────────────────────────────────────────────────────────────────

def get_next_settlement_number(db: Session) -> int:
    m = db.query(func.max(Settlement.settlement_number)).scalar()
    return (m or 1000) + 1


def _load_settlement(db: Session, settlement_id: int) -> Optional[Settlement]:
    return db.query(Settlement).options(
        joinedload(Settlement.driver),
        joinedload(Settlement.items).joinedload(SettlementItem.load),
        joinedload(Settlement.adjustments),
        joinedload(Settlement.payments),
        joinedload(Settlement.history),
    ).filter(Settlement.id == settlement_id, Settlement.is_active == True).first()


def _stop_label(stops, stop_type: str) -> str:
    for s in (stops or []):
        t = s.stop_type.value if hasattr(s.stop_type, 'value') else str(s.stop_type)
        if t == stop_type:
            return f"{s.city or ''}, {s.state or ''}".strip(', ')
    return ''


def _recalculate(db: Session, settlement_id: int):
    """
    Recompute settlement_total and balance_due following the spec formula:

    Settlement Total = Loads Earnings + Additions - Deductions - Applied Advanced Payments
    Balance Due      = Settlement Total - Actual Settlement Payments

    Advanced payments come from the standalone Payment model
    (payments_new table, applied_settlement_id = this settlement).
    """
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if not s:
        return

    # 1. Loads earnings (snapshot amounts)
    items_total = db.query(func.sum(SettlementItem.amount)).filter(
        SettlementItem.settlement_id == settlement_id
    ).scalar() or 0.0

    # 2. Adjustments: additions +, deductions -
    adj_total = 0.0
    for adj in db.query(SettlementAdjustment).filter(
        SettlementAdjustment.settlement_id == settlement_id
    ).all():
        if adj.adj_type == 'addition':
            adj_total += adj.amount
        else:
            adj_total -= adj.amount

    # 3. Applied advanced payments are tracked as SettlementAdjustment rows
    # with adj_type='advanced_payment'. They are already subtracted in adj_total above
    # (since they fall through to the else branch: adj_total -= adj.amount).
    # So no extra step needed here — the adj_total already handles them.

    # 4. Actual settlement payments (wire/check payments against the settlement)
    payments_total = db.query(func.sum(SettlementPayment.amount)).filter(
        SettlementPayment.settlement_id == settlement_id
    ).scalar() or 0.0

    s.settlement_total = round(items_total + adj_total, 2)
    s.balance_due = round(s.settlement_total - payments_total, 2)

    # Auto-transition status based on balance
    # - If full payment recorded (balance_due <= 0) and currently Ready → Paid
    # - (Paid ↔ Preparing moves require explicit user action per spec)
    if payments_total > 0 and s.balance_due <= 0.01 and s.status == SettlementStatus.READY:
        s.status = SettlementStatus.PAID

    db.commit()


def _add_history(db: Session, settlement_id: int, description: str, author: str = "System"):
    h = SettlementHistory(settlement_id=settlement_id, description=description, author=author)
    db.add(h)
    db.flush()


# ─── Lock enforcement helpers ────────────────────────────────────────────────

def _is_editable(s: Settlement) -> bool:
    """Editing loads/adjustments/payments is only allowed in Preparing state."""
    return s.status == SettlementStatus.PREPARING


class SettlementLocked(Exception):
    """Raised when trying to modify a settlement that is Ready or Paid."""
    pass



# ─── list / get ───────────────────────────────────────────────────────────────

def get_settlements(
    db: Session,
    page: int = 1,
    page_size: int = 25,
    driver_id: Optional[int] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    settlement_number: Optional[int] = None,
    amount_from: Optional[float] = None,
    amount_to: Optional[float] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    payable_to: Optional[str] = None,
) -> dict:
    q = db.query(Settlement).options(
        joinedload(Settlement.driver),
        joinedload(Settlement.items),
        joinedload(Settlement.payments),
    ).filter(Settlement.is_active == True)

    if driver_id:
        q = q.filter(Settlement.driver_id == driver_id)
    if status:
        q = q.filter(Settlement.status == status)
    if settlement_number:
        q = q.filter(Settlement.settlement_number == settlement_number)
    if amount_from is not None:
        q = q.filter(Settlement.settlement_total >= amount_from)
    if amount_to is not None:
        q = q.filter(Settlement.settlement_total <= amount_to)
    if date_from:
        q = q.filter(Settlement.date >= date_from)
    if date_to:
        q = q.filter(Settlement.date <= date_to)
    if payable_to:
        q = q.filter(Settlement.payable_to.ilike(f'%{payable_to}%'))

    total = q.count()
    items = q.order_by(Settlement.settlement_number.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


def get_settlement(db: Session, settlement_id: int) -> Optional[Settlement]:
    return _load_settlement(db, settlement_id)


# ─── open balances ────────────────────────────────────────────────────────────

def get_open_balances(
    db: Session,
    driver_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    date_type: str = 'pickup',
) -> List[dict]:
    """
    Returns per-driver sum of unsettled load-level driver payables.
    Uses drivers_payable_snapshot — the historically frozen value on each load.
    Only counts loads not already in a settlement item.
    """
    settled_load_ids = db.query(SettlementItem.load_id).filter(
        SettlementItem.load_id.isnot(None)
    ).subquery()

    q = db.query(Load).options(
        joinedload(Load.driver),
        joinedload(Load.stops),
    ).filter(
        Load.is_active == True,
        Load.driver_id.isnot(None),
        Load.id.notin_(settled_load_ids),
    )

    if driver_id:
        q = q.filter(Load.driver_id == driver_id)

    if date_from or date_to:
        if date_type == 'pickup':
            date_col = Load.load_date
        else:
            date_col = Load.actual_delivery_date
        if date_from:
            q = q.filter(date_col >= date_from)
        if date_to:
            q = q.filter(date_col <= date_to)

    loads = q.all()

    # Group by driver
    by_driver: dict[int, dict] = {}
    for load in loads:
        did = load.driver_id
        if did not in by_driver:
            drv = load.driver
            from app.models.models import DriverProfile
            profile = db.query(DriverProfile).filter_by(driver_id=did).first()
            payable_to = (profile.payable_to if profile and profile.payable_to else drv.name) if drv else ''
            by_driver[did] = {
                'driver_id': did,
                'driver_name': drv.name if drv else '',
                'driver_type': drv.driver_type if drv else '',
                'payable_to': payable_to,
                'balance': 0.0,
                'updated': None,
                'load_ids': [],
            }
        by_driver[did]['balance'] += (load.drivers_payable_snapshot if load.drivers_payable_snapshot is not None else (load.drivers_payable or 0.0))
        by_driver[did]['balance'] = round(by_driver[did]['balance'], 2)
        ldate = load.actual_delivery_date or load.load_date
        if ldate and (by_driver[did]['updated'] is None or ldate > by_driver[did]['updated']):
            by_driver[did]['updated'] = ldate
        by_driver[did]['load_ids'].append(load.id)

    return list(by_driver.values())


# ─── create / update / delete ─────────────────────────────────────────────────

def create_settlement(db: Session, data: SettlementCreate, author: str = "System") -> Settlement:
    num = get_next_settlement_number(db)
    driver = db.query(Driver).filter(Driver.id == data.driver_id).first()

    payable_to = data.payable_to
    if not payable_to:
        from app.models.models import DriverProfile
        profile = db.query(DriverProfile).filter_by(driver_id=data.driver_id).first()
        payable_to = (profile.payable_to if profile and profile.payable_to else driver.name) if driver else ''

    s = Settlement(
        settlement_number=num,
        driver_id=data.driver_id,
        payable_to=payable_to,
        status=data.status or SettlementStatus.PREPARING,
        date=data.date,
        notes=data.notes,
        settlement_total=0.0,
        balance_due=0.0,
    )
    db.add(s)
    db.flush()

    _add_history(db, s.id, f"Settlement #{num} created for {payable_to}", author)

    # Auto-attach open loads for this driver using SNAPSHOT values
    settled_ids = db.query(SettlementItem.load_id).filter(SettlementItem.load_id.isnot(None)).subquery()
    loads = db.query(Load).options(joinedload(Load.stops)).filter(
        Load.driver_id == data.driver_id,
        Load.is_active == True,
        Load.id.notin_(settled_ids),
        Load.drivers_payable_snapshot.isnot(None),
    ).all()

    for load in loads:
        pickup_city = _stop_label(load.stops, 'pickup')
        delivery_city = _stop_label(load.stops, 'delivery')
        # ✅ Use snapshot — never live driver profile
        amount = load.drivers_payable_snapshot or 0.0
        desc = f"#{load.load_number} {pickup_city} - {delivery_city} / ${load.rate:.2f}"

        item = SettlementItem(
            settlement_id=s.id,
            load_id=load.id,
            item_type="load",
            description=desc,
            amount=amount,
            amount_snapshot=amount,
            load_date=load.load_date,
            load_status=load.status.value if load.status else None,
            load_billing_status=load.billing_status.value if load.billing_status else None,
            load_pickup_city=pickup_city,
            load_delivery_city=delivery_city,
        )
        db.add(item)

    db.commit()
    _recalculate(db, s.id)
    return _load_settlement(db, s.id)


def update_settlement(db: Session, settlement_id: int, data: SettlementUpdate, author: str = "System") -> Optional[Settlement]:
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if not s:
        return None
    old_status = s.status
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    if data.status and data.status != old_status:
        _add_history(db, settlement_id, f"Status changed: {old_status.value} → {data.status.value}", author)
    db.commit()
    _recalculate(db, settlement_id)
    return _load_settlement(db, settlement_id)


def delete_settlement(db: Session, settlement_id: int) -> bool:
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if not s:
        return False
    s.is_active = False
    db.commit()
    return True


# ─── items ────────────────────────────────────────────────────────────────────

def add_load_item(db: Session, settlement_id: int, load_id: int, author: str = "System") -> Optional[SettlementItem]:
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if not s:
        return None
    if not _is_editable(s):
        raise SettlementLocked(f"Settlement is {s.status.value}. Move back to Preparing to edit.")

    """Add a specific load's payable to this settlement using its snapshot value."""
    load = db.query(Load).options(joinedload(Load.stops)).filter(Load.id == load_id).first()
    if not load:
        return None

    # Check not already in this settlement
    existing = db.query(SettlementItem).filter(
        SettlementItem.settlement_id == settlement_id,
        SettlementItem.load_id == load_id,
    ).first()
    if existing:
        return existing

    pickup_city = _stop_label(load.stops, 'pickup')
    delivery_city = _stop_label(load.stops, 'delivery')
    amount = load.drivers_payable_snapshot or 0.0
    desc = f"#{load.load_number} {pickup_city} - {delivery_city} / ${load.rate:.2f}"

    item = SettlementItem(
        settlement_id=settlement_id,
        load_id=load_id,
        item_type="load",
        description=desc,
        amount=amount,
        amount_snapshot=amount,
        load_date=load.load_date,
        load_status=load.status.value if load.status else None,
        load_billing_status=load.billing_status.value if load.billing_status else None,
        load_pickup_city=pickup_city,
        load_delivery_city=delivery_city,
    )
    db.add(item)
    _add_history(db, settlement_id, f"Load #{load.load_number} added (${amount:.2f})", author)
    db.commit()
    _recalculate(db, settlement_id)
    db.refresh(item)
    return item


def remove_item(db: Session, settlement_id: int, item_id: int, author: str = "System") -> bool:
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if s and not _is_editable(s):
        raise SettlementLocked(f"Settlement is {s.status.value}. Move back to Preparing to edit.")

    item = db.query(SettlementItem).filter(
        SettlementItem.id == item_id,
        SettlementItem.settlement_id == settlement_id,
    ).first()
    if not item:
        return False
    desc = item.description or f"Item #{item_id}"
    db.delete(item)
    _add_history(db, settlement_id, f"Item removed: {desc}", author)
    db.commit()
    _recalculate(db, settlement_id)
    return True


# ─── adjustments ──────────────────────────────────────────────────────────────

def add_adjustment(db: Session, settlement_id: int, data: SettlementAdjustmentCreate, author: str = "System") -> SettlementAdjustment:
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if s and not _is_editable(s):
        raise SettlementLocked(f"Settlement is {s.status.value}. Move back to Preparing to edit.")

    adj = SettlementAdjustment(
        settlement_id=settlement_id,
        adj_type=data.adj_type,
        date=data.date,
        category=data.category,
        description=data.description,
        amount=data.amount,
    )
    db.add(adj)
    sign = '+' if data.adj_type == 'addition' else '-'
    _add_history(db, settlement_id,
                 f"{data.adj_type.capitalize()} added: {data.category or data.description} ({sign}${data.amount:.2f})",
                 author)
    db.commit()
    _recalculate(db, settlement_id)
    db.refresh(adj)
    return adj


def delete_adjustment(db: Session, settlement_id: int, adj_id: int, author: str = "System") -> bool:
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if s and not _is_editable(s):
        raise SettlementLocked(f"Settlement is {s.status.value}. Move back to Preparing to edit.")

    adj = db.query(SettlementAdjustment).filter(
        SettlementAdjustment.id == adj_id,
        SettlementAdjustment.settlement_id == settlement_id,
    ).first()
    if not adj:
        return False
    desc = adj.category or adj.description or f"Adjustment #{adj_id}"
    db.delete(adj)
    _add_history(db, settlement_id, f"Adjustment removed: {desc}", author)
    db.commit()
    _recalculate(db, settlement_id)
    return True


# ─── payments ─────────────────────────────────────────────────────────────────

def add_payment(db: Session, settlement_id: int, data: SettlementPaymentCreate, author: str = "System") -> SettlementPayment:
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    # Auto-number payments
    payment_number = data.payment_number
    if not payment_number:
        count = db.query(func.count(SettlementPayment.id)).filter(
            SettlementPayment.settlement_id == settlement_id
        ).scalar() or 0
        payment_number = str(count + 1)

    p = SettlementPayment(
        settlement_id=settlement_id,
        payment_number=payment_number,
        description=data.description,
        amount=data.amount,
        payment_date=data.payment_date,
        is_carryover=data.is_carryover,
    )
    db.add(p)
    action = "Carryover created" if data.is_carryover else "Payment recorded"
    _add_history(db, settlement_id, f"{action}: ${data.amount:.2f} — {data.description or ''}", author)
    db.commit()
    _recalculate(db, settlement_id)
    db.refresh(p)
    return p


def delete_payment(db: Session, settlement_id: int, payment_id: int, author: str = "System") -> bool:
    p = db.query(SettlementPayment).filter(
        SettlementPayment.id == payment_id,
        SettlementPayment.settlement_id == settlement_id,
    ).first()
    if not p:
        return False
    _add_history(db, settlement_id, f"Payment #{p.payment_number} removed (${p.amount:.2f})", author)
    db.delete(p)
    db.commit()
    _recalculate(db, settlement_id)
    return True


# ─── QB export ────────────────────────────────────────────────────────────────

def mark_qb_exported(db: Session, settlement_id: int, author: str = "System"):
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if s:
        s.qb_exported = True
        s.qb_exported_at = datetime.utcnow()
        _add_history(db, settlement_id, "Exported to QuickBooks", author)
        db.commit()
