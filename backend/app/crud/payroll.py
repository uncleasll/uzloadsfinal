"""
payroll CRUD — accounting-safe settlement management.

CRITICAL: driver pay amounts always come from load.drivers_payable_snapshot
(the historical snapshot), NEVER from the live driver profile.
"""
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_
from typing import Optional, List
from datetime import date, datetime
from app.services.driver_pay_service import stored_driver_pay, money
from app.services.load_dates import payroll_date_column

from app.models.models import (
    Settlement, SettlementItem, SettlementPayment, SettlementAdjustment,
    SettlementHistory, SettlementStatus, Load, Driver, LoadStop, AdvancedPayment, PayrollCarryover, Payment,
)
from app.schemas.payroll_schemas import (
    SettlementCreate, SettlementUpdate,
    SettlementPaymentCreate, SettlementAdjustmentCreate,
)


class PayrollError(ValueError):
    """A rejected financial operation that should be shown to the user."""


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
    """Earnings and deductions determine total; advances and cash determine due."""
    db.flush()
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).with_for_update().first()
    if not s:
        return
    db.expire(s, ["items", "adjustments", "payments", "legacy_advances", "outgoing_carryovers", "incoming_carryovers"])
    s.settlement_total, s.balance_due = settlement_totals(s)
    if s.balance_due == 0 and s.status == SettlementStatus.READY:
        s.status = SettlementStatus.PAID
    db.flush()


def settlement_totals(s):
    """Pure calculation, also used by the read-only reconciliation command."""
    from decimal import Decimal
    def total(values):
        return sum((Decimal(str(value or 0)) for value in values), Decimal(0))
    earnings = total(item.amount for item in s.items)
    earnings += total(adj.amount if adj.adj_type == 'addition' else -adj.amount
                      for adj in s.adjustments if adj.adj_type != 'advanced_payment')
    earnings += total(entry.amount for entry in s.outgoing_carryovers)
    earnings -= total(entry.amount for entry in s.incoming_carryovers)
    paid = total(adj.amount for adj in s.adjustments if adj.adj_type == 'advanced_payment')
    paid += total(p.amount for p in s.legacy_advances if p.is_active and p.payment_type == 'advanced_payment')
    paid += total(p.amount for p in s.payments)
    return money(earnings), money(earnings - paid)


def active_settled_load_ids(db):
    return db.query(SettlementItem.load_id).join(Settlement).filter(
        SettlementItem.load_id.isnot(None), Settlement.is_active == True,
        Settlement.status != SettlementStatus.VOID,
    )


def restore_advance(db, adj):
    ap = None
    if adj.advanced_payment_id:
        ap = db.query(AdvancedPayment).filter_by(id=adj.advanced_payment_id).with_for_update().first()
    else:
        # Compatibility for pre-010 applications. New rows always have a foreign key.
        import re
        match = re.search(r"AP #(\d+)", adj.description or "")
        if match:
            ap = db.query(AdvancedPayment).filter_by(payment_number=int(match.group(1))).with_for_update().first()
    if not ap:
        raise PayrollError("The source advance is missing; reconcile this application before removing it.")
    ap.applied_amount = money(max(0, ap.applied_amount - adj.amount))
    ap.applied_to_settlement_id = None


def _add_history(db: Session, settlement_id: int, description: str, author: str = "System"):
    h = SettlementHistory(settlement_id=settlement_id, description=description, author=author)
    db.add(h)
    db.flush()


# ─── Lock enforcement helpers ────────────────────────────────────────────────

def _is_editable(s: Settlement) -> bool:
    """Editing loads/adjustments/payments is only allowed in Preparing state."""
    return s.status == SettlementStatus.PREPARING and not s.outgoing_carryovers


class SettlementLocked(PayrollError):
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
    from app.services.scheduled_payroll import run_schedules
    run_schedules(db, date.today(), driver_id)
    db.commit()
    settled_load_ids = active_settled_load_ids(db)

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
        date_col = payroll_date_column(date_type)
        if date_from:
            q = q.filter(date_col >= date_from)
        if date_to:
            q = q.filter(date_col <= date_to)

    loads = q.all()

    # Preserve each load's original payee when the driver profile changes.
    by_driver: dict[tuple, dict] = {}
    for load in loads:
        did = load.driver_id
        drv = load.driver
        from app.models.models import DriverProfile
        profile = db.query(DriverProfile).filter_by(driver_id=did).first()
        payable_to = load.payable_to_snapshot or (profile.payable_to if profile and profile.payable_to else drv.name if drv else '')
        group_key = (did, payable_to)
        if group_key not in by_driver:
            by_driver[group_key] = {
                'driver_id': did,
                'driver_name': drv.name if drv else '',
                'driver_type': drv.driver_type if drv else '',
                'payable_to': payable_to,
                'balance': 0.0,
                'updated': None,
                'load_ids': [],
            }
        by_driver[group_key]['balance'] += stored_driver_pay(load)
        by_driver[group_key]['balance'] = round(by_driver[group_key]['balance'], 2)
        ldate = load.actual_delivery_date or load.load_date
        if ldate and (by_driver[group_key]['updated'] is None or ldate > by_driver[group_key]['updated']):
            by_driver[group_key]['updated'] = ldate
        by_driver[group_key]['load_ids'].append(load.id)

    from app.models.models import ScheduledPayrollOccurrence as Occ, DriverTimeReport, LoadAdditionalPayee
    from sqlalchemy import exists
    occurrence_used = exists().where(SettlementAdjustment.scheduled_transaction_id == Occ.scheduled_transaction_id, SettlementAdjustment.date == Occ.date)
    time_used = db.query(SettlementAdjustment.time_report_id).filter(SettlementAdjustment.time_report_id.isnot(None))
    payee_used = db.query(SettlementAdjustment.load_payee_id).filter(SettlementAdjustment.load_payee_id.isnot(None))
    queries = [(db.query(LoadAdditionalPayee).join(Load).filter(Load.is_active == True, LoadAdditionalPayee.id.notin_(payee_used)), LoadAdditionalPayee),
               (db.query(Occ).filter(~occurrence_used), Occ),
               (db.query(DriverTimeReport).filter(DriverTimeReport.is_active == True, DriverTimeReport.id.notin_(time_used)), DriverTimeReport)]
    for query, model in queries:
        if driver_id:
            query = query.filter(model.driver_id == driver_id)
        if date_from:
            query = query.filter(model.date >= date_from)
        if date_to:
            query = query.filter(model.date <= date_to)
        for entry in query.all():
            key = (entry.driver_id, entry.payable_to)
            if key not in by_driver:
                drv = db.query(Driver).filter(Driver.id == entry.driver_id).one()
                by_driver[key] = {'driver_id': drv.id, 'driver_name': drv.name, 'driver_type': drv.driver_type,
                    'payable_to': entry.payable_to, 'balance': 0.0, 'updated': None, 'load_ids': []}
            group = by_driver[key]
            sign = -1 if model is Occ and entry.adj_type == 'deduction' else 1
            group['balance'] = money(group['balance'] + sign * entry.amount)
            if group['updated'] is None or group['updated'] < entry.date:
                group['updated'] = entry.date

    return list(by_driver.values())


# ─── create / update / delete ─────────────────────────────────────────────────

def create_settlement(db: Session, data: SettlementCreate, author: str = "System") -> Settlement:
    num = get_next_settlement_number(db)
    driver = db.query(Driver).filter(Driver.id == data.driver_id, Driver.is_active == True).first()
    if not driver:
        raise PayrollError("Active driver not found")
    if data.status not in (None, SettlementStatus.PREPARING):
        raise PayrollError("New settlements must start in Preparing.")

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

    pending = db.query(PayrollCarryover).join(Settlement, PayrollCarryover.source_settlement_id == Settlement.id).filter(
        PayrollCarryover.target_settlement_id.is_(None), PayrollCarryover.date <= s.date,
        Settlement.driver_id == s.driver_id, Settlement.payable_to == s.payable_to,
        Settlement.is_active == True,
    ).with_for_update(of=PayrollCarryover).all()
    for entry in pending:
        entry.target_settlement_id = s.id
        _add_history(db, s.id, f"Carryover debt received: ${entry.amount:.2f}", author)
    _add_history(db, s.id, f"Settlement #{num} created for {payable_to}", author)

    # Settlement starts EMPTY — user manually adds loads from the candidates list.
    # (Auto-attaching all open loads is incorrect per workflow spec.)

    db.flush()
    _recalculate(db, s.id)
    db.commit()
    return _load_settlement(db, s.id)


def update_settlement(db: Session, settlement_id: int, data: SettlementUpdate, author: str = "System") -> Optional[Settlement]:
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).with_for_update().first()
    if not s:
        return None
    if any(field in data.model_fields_set and getattr(data, field) != getattr(s, field)
           for field in ("driver_id", "payable_to")) and (s.items or s.adjustments or s.payments or s.outgoing_carryovers or s.incoming_carryovers or s.legacy_advances):
        raise PayrollError("Remove settlement entries and payments before changing Driver or Payable to.")
    old_status = s.status
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    if data.status and data.status != old_status:
        _add_history(db, settlement_id, f"Status changed: {old_status.value} → {data.status.value}", author)
    db.flush()
    _recalculate(db, settlement_id)
    db.commit()
    return _load_settlement(db, settlement_id)


def delete_settlement(db: Session, settlement_id: int) -> bool:
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).with_for_update().first()
    if not s:
        return False
    if s.status != SettlementStatus.PREPARING:
        raise PayrollError("Move settlement back to Preparing before deleting it.")
    if s.payments or db.query(PayrollCarryover).filter(
        (PayrollCarryover.source_settlement_id == s.id) | (PayrollCarryover.target_settlement_id == s.id)
    ).first():
        raise PayrollError("Remove payments and carryover links before deleting this settlement.")
    for advance in s.legacy_advances:
        advance.applied_settlement_id = None
    for adj in s.adjustments:
        adj.time_report_id = None
        adj.load_payee_id = None
        from app.services.scheduled_payroll import release_application
        release_application(db, adj)
        if adj.adj_type == 'advanced_payment':
            restore_advance(db, adj)
    s.is_active = False
    db.commit()
    return True


# ─── items ────────────────────────────────────────────────────────────────────

def add_load_item(db: Session, settlement_id: int, load_id: int, author: str = "System") -> Optional[SettlementItem]:
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).with_for_update().first()
    if not s:
        return None
    if not _is_editable(s):
        raise SettlementLocked(f"Settlement is {s.status.value}. Move back to Preparing to edit.")

    """Add a specific load's payable to this settlement using its snapshot value."""
    load = db.query(Load).options(joinedload(Load.stops)).filter(Load.id == load_id, Load.is_active == True).with_for_update(of=Load).first()
    if not load:
        return None

    if load.driver_id != s.driver_id:
        raise PayrollError("Load belongs to a different driver.")
    other = db.query(SettlementItem).join(Settlement).filter(
        SettlementItem.load_id == load_id, Settlement.is_active == True,
        Settlement.status != SettlementStatus.VOID, Settlement.id != settlement_id,
    ).first()
    if other:
        raise PayrollError("Load is already included in another active settlement.")

    if load.payable_to_snapshot and load.payable_to_snapshot != s.payable_to:
        raise PayrollError("Load belongs to a different Payable to. Settle the old payee or explicitly refresh the load pay rules.")

    # Check not already in this settlement
    existing = db.query(SettlementItem).filter(
        SettlementItem.settlement_id == settlement_id,
        SettlementItem.load_id == load_id,
    ).first()
    if existing:
        return existing

    pickup_city = _stop_label(load.stops, 'pickup')
    delivery_city = _stop_label(load.stops, 'delivery')
    amount = stored_driver_pay(load)
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
    db.flush()
    _recalculate(db, settlement_id)
    db.commit()
    db.refresh(item)
    return item


def remove_item(db: Session, settlement_id: int, item_id: int, author: str = "System") -> bool:
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).with_for_update().first()
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
    db.flush()
    _recalculate(db, settlement_id)
    db.commit()
    return True


# ─── adjustments ──────────────────────────────────────────────────────────────

def add_adjustment(db: Session, settlement_id: int, data: SettlementAdjustmentCreate, author: str = "System") -> SettlementAdjustment:
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).with_for_update().first()
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
    db.flush()
    _recalculate(db, settlement_id)
    db.commit()
    db.refresh(adj)
    return adj


def delete_adjustment(db: Session, settlement_id: int, adj_id: int, author: str = "System") -> bool:
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).with_for_update().first()
    if s and not _is_editable(s):
        raise SettlementLocked(f"Settlement is {s.status.value}. Move back to Preparing to edit.")

    adj = db.query(SettlementAdjustment).filter(
        SettlementAdjustment.id == adj_id,
        SettlementAdjustment.settlement_id == settlement_id,
    ).first()
    if not adj:
        return False
    if adj.adj_type == 'advanced_payment':
        restore_advance(db, adj)
    from app.services.scheduled_payroll import release_application
    release_application(db, adj)
    desc = adj.category or adj.description or f"Adjustment #{adj_id}"
    db.delete(adj)
    _add_history(db, settlement_id, f"Adjustment removed: {desc}", author)
    db.flush()
    _recalculate(db, settlement_id)
    db.commit()
    return True


# ─── payments ─────────────────────────────────────────────────────────────────

def add_payment(db: Session, settlement_id: int, data: SettlementPaymentCreate, author: str = "System") -> SettlementPayment:
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).with_for_update().first()
    if not s or not s.is_active:
        raise PayrollError("Settlement not found")
    if data.is_carryover:
        raise PayrollError("Use Create Carryover to transfer debt; a carryover is not a payment.")
    if s.status not in (SettlementStatus.READY, SettlementStatus.SENT):
        raise PayrollError("Move settlement to Ready before recording payment.")
    _recalculate(db, settlement_id)
    if data.amount <= 0 or money(data.amount) > s.balance_due:
        raise PayrollError("Payment must be positive and cannot exceed balance due.")
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
    db.flush()
    _recalculate(db, settlement_id)
    db.commit()
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
    db.flush()
    _recalculate(db, settlement_id)
    db.commit()
    return True


# ─── QB export ────────────────────────────────────────────────────────────────

def mark_qb_exported(db: Session, settlement_id: int, author: str = "System"):
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).with_for_update().first()
    if s:
        s.qb_exported = True
        s.qb_exported_at = datetime.utcnow()
        _add_history(db, settlement_id, "Exported to QuickBooks", author)
        db.commit()

def create_carryover(db, settlement_id, transfer_date=None):
    s = db.query(Settlement).filter_by(id=settlement_id, is_active=True).with_for_update().first()
    if not s:
        raise PayrollError("Settlement not found")
    existing = db.query(PayrollCarryover).filter_by(source_settlement_id=s.id).first()
    if existing:
        return existing
    if s.status not in (SettlementStatus.READY, SettlementStatus.SENT):
        raise PayrollError("Move settlement to Ready before creating carryover.")
    _recalculate(db, s.id)
    if s.balance_due >= 0:
        raise PayrollError("Carryover is only available for a negative balance.")
    entry = PayrollCarryover(source_settlement_id=s.id, amount=-s.balance_due, date=transfer_date or date.today())
    db.add(entry)
    _add_history(db, s.id, f"Debt ${entry.amount:.2f} transferred to the next settlement; no cash payment created")
    _recalculate(db, s.id)
    db.commit()
    db.refresh(entry)
    return entry


def remove_carryover(db, settlement_id, carryover_id):
    entry = db.query(PayrollCarryover).filter_by(id=carryover_id).with_for_update().first()
    if not entry or settlement_id not in (entry.source_settlement_id, entry.target_settlement_id):
        raise PayrollError("Carryover not found")
    linked_ids = [sid for sid in (entry.source_settlement_id, entry.target_settlement_id) if sid]
    for sid in linked_ids:
        s = db.get(Settlement, sid)
        if s.status != SettlementStatus.PREPARING:
            raise PayrollError("Move both linked settlements to Preparing before removing carryover.")
    db.delete(entry)
    for sid in linked_ids:
        _add_history(db, sid, "Carryover reversed; debt returned to the source settlement")
        _recalculate(db, sid)
    db.commit()
