from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional
from datetime import date as _date, date

from app.db.session import get_db
from app.schemas.payroll_schemas import (
    SettlementCreate, SettlementUpdate, SettlementOut,
    SettlementPaymentCreate, SettlementAdjustmentCreate,
)
from app.crud import payroll as crud
from app.services.pdf_service import generate_settlement_pdf
from app.models.models import (
    Settlement, SettlementItem, SettlementAdjustment, SettlementPayment,
    SettlementHistory, Driver, Load, DriverScheduledTransaction, AdvancedPayment,
)

router = APIRouter(prefix="/payroll", tags=["payroll"])


# ── Serializers ───────────────────────────────────────────────────────────────

def _ser_item(i):
    load_data = None
    if i.load:
        load_data = {
            "load_number": i.load.load_number,
            "status": i.load.status.value if hasattr(i.load.status, "value") else str(i.load.status),
            "billing_status": i.load.billing_status.value if hasattr(i.load.billing_status, "value") else str(i.load.billing_status),
            "actual_delivery_date": str(i.load.actual_delivery_date) if i.load.actual_delivery_date else None,
            "load_date": str(i.load.load_date) if i.load.load_date else None,
        }
    return {
        "id": i.id, "load_id": i.load_id, "item_type": i.item_type,
        "description": i.description, "amount": i.amount,
        "load_date": str(i.load_date) if i.load_date else None,
        "load_status": i.load_status, "load_billing_status": i.load_billing_status,
        "load_pickup_city": i.load_pickup_city, "load_delivery_city": i.load_delivery_city,
        "amount_snapshot": i.amount_snapshot,
        "created_at": i.created_at.isoformat() if i.created_at else None,
        "load": load_data,
    }


def _ser_adj(a):
    return {
        "id": a.id, "adj_type": a.adj_type,
        "date": str(a.date) if a.date else None,
        "category": a.category, "description": a.description, "amount": a.amount,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _ser_payment(p):
    return {
        "id": p.id, "payment_number": p.payment_number,
        "description": p.description, "amount": p.amount,
        "payment_date": str(p.payment_date) if p.payment_date else None,
        "is_carryover": p.is_carryover,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _ser_history(h):
    return {
        "id": h.id, "description": h.description, "author": h.author,
        "created_at": h.created_at.isoformat() if h.created_at else None,
    }


def _s_val(s) -> str:
    """Get string value of a status enum or string."""
    return s.value if hasattr(s, "value") else str(s)


def _serialize(s) -> dict:
    return {
        "id": s.id,
        "settlement_number": s.settlement_number,
        "driver_id": s.driver_id,
        "payable_to": s.payable_to,
        "status": _s_val(s.status),
        "date": str(s.date),
        "settlement_total": round(s.settlement_total or 0.0, 2),
        "balance_due": round(s.balance_due or 0.0, 2),
        "notes": s.notes,
        "qb_exported": s.qb_exported,
        "qb_exported_at": s.qb_exported_at.isoformat() if s.qb_exported_at else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "driver": {"id": s.driver.id, "name": s.driver.name, "driver_type": s.driver.driver_type} if s.driver else None,
        "items": [_ser_item(i) for i in (s.items or [])],
        "adjustments": [_ser_adj(a) for a in (s.adjustments or [])],
        "payments": [_ser_payment(p) for p in (s.payments or [])],
        "history": [_ser_history(h) for h in (s.history or [])],
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

VALID_TRANSITIONS = {
    "Preparing": ["Ready", "Void"],
    "Ready":     ["Preparing", "Paid", "Void"],
    "Paid":      ["Preparing"],
    "Sent":      ["Preparing", "Paid", "Void"],
    "Void":      ["Preparing"],
}


def _require_preparing(s, action="edit"):
    sv = _s_val(s.status)
    if sv != "Preparing":
        raise HTTPException(
            400,
            f"Cannot {action}: settlement is '{sv}'. Move it back to Preparing first.",
        )


def _add_history(db: Session, settlement_id: int, desc: str, author: str = "User"):
    h = SettlementHistory(settlement_id=settlement_id, description=desc, author=author)
    db.add(h)
    db.commit()


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("")
def list_settlements(
    page: int = Query(1, ge=1),
    page_size: int = Query(25),
    driver_id: Optional[int] = None,
    status: Optional[str] = None,
    settlement_number: Optional[int] = None,
    amount_from: Optional[float] = None,
    amount_to: Optional[float] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    payable_to: Optional[str] = None,
    db: Session = Depends(get_db),
):
    result = crud.get_settlements(
        db, page=page, page_size=page_size,
        driver_id=driver_id, status=status,
        settlement_number=settlement_number,
        amount_from=amount_from, amount_to=amount_to,
        date_from=date_from, date_to=date_to, payable_to=payable_to,
    )
    return {
        **result,
        "items": [{
            "id": s.id,
            "settlement_number": s.settlement_number,
            "driver_id": s.driver_id,
            "payable_to": s.payable_to,
            "status": _s_val(s.status),
            "date": str(s.date),
            "settlement_total": round(s.settlement_total or 0.0, 2),
            "balance_due": round(s.balance_due or 0.0, 2),
            "notes": s.notes,
            "qb_exported": s.qb_exported,
            "driver": {"id": s.driver.id, "name": s.driver.name, "driver_type": s.driver.driver_type} if s.driver else None,
        } for s in result["items"]],
    }


# ── Open Balances ─────────────────────────────────────────────────────────────

@router.get("/open-balances")
def get_open_balances(
    driver_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    date_type: str = Query("pickup"),
    db: Session = Depends(get_db),
):
    balances = crud.get_open_balances(db, driver_id=driver_id, date_from=date_from,
                                      date_to=date_to, date_type=date_type)
    return [
        {
            "driver_id": b["driver_id"],
            "driver_name": b["driver_name"],
            "driver_type": b["driver_type"],
            "payable_to": b["payable_to"],
            "balance": round(b["balance"], 2),
            "updated": str(b["updated"]) if b.get("updated") else None,
        }
        for b in balances
    ]


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
def create_settlement(data: SettlementCreate, db: Session = Depends(get_db)):
    s = crud.create_settlement(db, data)
    return _serialize(s)


@router.get("/{settlement_id}")
def get_settlement(settlement_id: int, db: Session = Depends(get_db)):
    s = crud.get_settlement(db, settlement_id)
    if not s:
        raise HTTPException(404, "Settlement not found")
    return _serialize(s)


@router.put("/{settlement_id}")
def update_settlement(settlement_id: int, data: SettlementUpdate, db: Session = Depends(get_db)):
    s = crud.get_settlement(db, settlement_id)
    if not s:
        raise HTTPException(404, "Settlement not found")
    updated = crud.update_settlement(db, settlement_id, data)
    if not updated:
        raise HTTPException(404, "Settlement not found")
    return _serialize(updated)


@router.delete("/{settlement_id}")
def delete_settlement(settlement_id: int, db: Session = Depends(get_db)):
    if not crud.delete_settlement(db, settlement_id):
        raise HTTPException(404, "Settlement not found")
    return {"message": "Deleted"}


# ── Items ─────────────────────────────────────────────────────────────────────

@router.post("/{settlement_id}/items/load/{load_id}", status_code=201)
def add_load_item(settlement_id: int, load_id: int, db: Session = Depends(get_db)):
    s = crud.get_settlement(db, settlement_id)
    if not s:
        raise HTTPException(404, "Settlement not found")
    _require_preparing(s, "add load")
    item = crud.add_load_item(db, settlement_id, load_id)
    if not item:
        raise HTTPException(404, "Load not found or already in settlement")
    return _ser_item(item)


@router.delete("/{settlement_id}/items/{item_id}")
def remove_item(settlement_id: int, item_id: int, db: Session = Depends(get_db)):
    s = crud.get_settlement(db, settlement_id)
    if not s:
        raise HTTPException(404, "Settlement not found")
    _require_preparing(s, "remove load")
    if not crud.remove_item(db, settlement_id, item_id):
        raise HTTPException(404, "Item not found")
    return {"message": "Removed"}


# ── Adjustments ───────────────────────────────────────────────────────────────

@router.post("/{settlement_id}/adjustments", status_code=201)
def add_adjustment(settlement_id: int, data: SettlementAdjustmentCreate, db: Session = Depends(get_db)):
    s = crud.get_settlement(db, settlement_id)
    if not s:
        raise HTTPException(404, "Settlement not found")
    _require_preparing(s, "add adjustment")
    adj = crud.add_adjustment(db, settlement_id, data)
    return _ser_adj(adj)


@router.delete("/{settlement_id}/adjustments/{adj_id}")
def delete_adjustment(settlement_id: int, adj_id: int, db: Session = Depends(get_db)):
    s = crud.get_settlement(db, settlement_id)
    if not s:
        raise HTTPException(404, "Settlement not found")
    _require_preparing(s, "remove adjustment")
    if not crud.delete_adjustment(db, settlement_id, adj_id):
        raise HTTPException(404, "Adjustment not found")
    return {"message": "Deleted"}


# ── Settlement Payments ───────────────────────────────────────────────────────

@router.post("/{settlement_id}/payments", status_code=201)
def add_payment(settlement_id: int, data: SettlementPaymentCreate, db: Session = Depends(get_db)):
    p = crud.add_payment(db, settlement_id, data)
    return _ser_payment(p)


@router.delete("/{settlement_id}/payments/{payment_id}")
def delete_payment(settlement_id: int, payment_id: int, db: Session = Depends(get_db)):
    if not crud.delete_payment(db, settlement_id, payment_id):
        raise HTTPException(404, "Payment not found")
    return {"message": "Deleted"}


# ── QB Export ─────────────────────────────────────────────────────────────────

@router.post("/{settlement_id}/export-qb")
def export_qb(settlement_id: int, db: Session = Depends(get_db)):
    s = crud.get_settlement(db, settlement_id)
    if not s:
        raise HTTPException(404, "Settlement not found")
    crud.mark_qb_exported(db, settlement_id)
    return {"message": "Exported to QuickBooks", "settlement_number": s.settlement_number}


# ── PDF ───────────────────────────────────────────────────────────────────────

@router.get("/{settlement_id}/pdf")
def download_settlement_pdf(settlement_id: int, db: Session = Depends(get_db)):
    s = db.query(Settlement).options(
        joinedload(Settlement.driver),
        joinedload(Settlement.items).joinedload(SettlementItem.load),
        joinedload(Settlement.adjustments),
        joinedload(Settlement.payments),
    ).filter(Settlement.id == settlement_id).first()
    if not s:
        raise HTTPException(404, "Settlement not found")
    pdf = generate_settlement_pdf(s, db=db)
    driver_name = (s.driver.name if s.driver else "driver").replace(" ", "_")
    filename = f"settlement_{s.settlement_number}_{driver_name}.pdf"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={filename}"})


# ── Status Transitions ────────────────────────────────────────────────────────

@router.post("/{settlement_id}/status")
def change_status(settlement_id: int, data: dict, db: Session = Depends(get_db)):
    """
    Controlled status transitions per spec:
    Preparing → Ready        (requires at least one item)
    Ready → Preparing        (unlock for editing)
    Ready → Paid             (requires balance_due == 0)
    Paid → Preparing         (requires all payments removed first)
    Any → Void
    """
    s = db.query(Settlement).options(
        joinedload(Settlement.items),
        joinedload(Settlement.payments),
    ).filter(Settlement.id == settlement_id).first()
    if not s:
        raise HTTPException(404, "Settlement not found")

    new_status = (data.get("status") or "").strip()
    if not new_status:
        raise HTTPException(400, "status required")

    current = _s_val(s.status)
    allowed = VALID_TRANSITIONS.get(current, [])

    if new_status not in allowed:
        raise HTTPException(400, f"Cannot transition from '{current}' to '{new_status}'. Allowed: {allowed}")

    # Paid → Preparing: remove payments first
    if current == "Paid" and new_status == "Preparing":
        if s.payments:
            raise HTTPException(400, "Remove all settlement payments before moving Paid → Preparing")

    # Ready → Paid: balance must be zero
    if current == "Ready" and new_status == "Paid":
        if abs(s.balance_due or 0.0) > 0.01:
            raise HTTPException(400, f"Balance due is ${s.balance_due:.2f}. Record a payment first.")

    # Preparing → Ready: must have items
    if current == "Preparing" and new_status == "Ready":
        has_items = bool(s.items or [adj for adj in (s.adjustments or []) if adj.adj_type not in ("advanced_payment",)])
        # Allow even with only advanced payment adjustments
        if not has_items and not s.adjustments:
            raise HTTPException(400, "Cannot move to Ready: no items in settlement")

    from app.models.models import SettlementStatus
    status_map = {v.value: v for v in SettlementStatus}
    new_enum = status_map.get(new_status)
    if not new_enum:
        raise HTTPException(400, f"Unknown status: {new_status}")

    s.status = new_enum
    db.commit()
    _add_history(db, settlement_id, f"Status changed: {current} → {new_status}")
    db.refresh(s)
    return {"id": s.id, "status": _s_val(s.status), "settlement_number": s.settlement_number}


# ── Candidates (loads + scheduled + advanced payments) ────────────────────────

@router.get("/{settlement_id}/candidates")
def get_candidates(
    settlement_id: int,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    """
    Returns items eligible to be added to this settlement:
    1. Unpaid loads for the driver (not in any settlement)
    2. Active scheduled recurring transactions
    3. Unapplied advanced payments (from advanced_payments table)
    """
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if not s:
        raise HTTPException(404, "Settlement not found")

    driver_id = s.driver_id

    # 1. Loads already in ANY settlement (excluding current so re-adding is prevented)
    settled_load_ids_q = db.query(SettlementItem.load_id).filter(
        SettlementItem.load_id.isnot(None)
    ).subquery()

    load_q = db.query(Load).options(joinedload(Load.stops)).filter(
        Load.driver_id == driver_id,
        Load.is_active == True,
        Load.id.notin_(settled_load_ids_q),
    )
    if date_from:
        load_q = load_q.filter(Load.load_date >= date_from)
    if date_to:
        load_q = load_q.filter(Load.load_date <= date_to)

    loads = load_q.order_by(Load.load_date.desc()).all()
    available_loads = [{
        "id": l.id,
        "load_number": l.load_number,
        "load_date": l.load_date.isoformat() if l.load_date else None,
        "delivery_date": l.actual_delivery_date.isoformat() if l.actual_delivery_date else None,
        "status": _s_val(l.status) if l.status else None,
        "billing_status": _s_val(l.billing_status) if l.billing_status else None,
        "rate": l.rate,
        "amount": l.drivers_payable_snapshot if l.drivers_payable_snapshot is not None else 0.0,
    } for l in loads]

    # 2. Scheduled recurring transactions
    scheduled = db.query(DriverScheduledTransaction).filter(
        DriverScheduledTransaction.driver_id == driver_id,
        DriverScheduledTransaction.is_active == True,
    ).order_by(DriverScheduledTransaction.created_at.desc()).all()
    scheduled_transactions = [{
        "id": t.id,
        "trans_type": t.trans_type,
        "category": t.category,
        "description": t.description or t.settlement_description,
        "amount": t.amount,
        "schedule": t.schedule,
        "next_due": t.next_due.isoformat() if t.next_due else None,
        "start_date": t.start_date.isoformat() if t.start_date else None,
    } for t in scheduled]

    # 3. Unapplied advanced payments from the AdvancedPayment table
    adv_payments = db.query(AdvancedPayment).filter(
        AdvancedPayment.driver_id == driver_id,
        AdvancedPayment.is_active == True,
        AdvancedPayment.applied_amount < AdvancedPayment.amount,
    ).order_by(AdvancedPayment.payment_date.desc()).all()
    advanced_payments = [{
        "id": ap.id,
        "payment_number": ap.payment_number,
        "payment_date": ap.payment_date.isoformat() if ap.payment_date else None,
        "amount": ap.amount,
        "applied_amount": ap.applied_amount or 0.0,
        "remaining": round((ap.amount or 0.0) - (ap.applied_amount or 0.0), 2),
        "description": ap.description,
        "category": ap.category,
    } for ap in adv_payments]

    return {
        "available_loads": available_loads,
        "scheduled_transactions": scheduled_transactions,
        "advanced_payments": advanced_payments,
    }


# ── Apply Advanced Payment to Settlement ──────────────────────────────────────

@router.post("/{settlement_id}/advanced-payments/{ap_id}/apply", status_code=201)
def apply_advanced_payment(
    settlement_id: int,
    ap_id: int,
    data: Optional[dict] = None,
    db: Session = Depends(get_db),
):
    """
    Apply an advanced payment to a settlement.
    Creates a SettlementAdjustment with adj_type='advanced_payment' that reduces total.
    """
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if not s:
        raise HTTPException(404, "Settlement not found")
    if _s_val(s.status) == "Paid":
        raise HTTPException(400, "Cannot modify Paid settlement. Move back to Preparing first.")

    ap = db.query(AdvancedPayment).filter(
        AdvancedPayment.id == ap_id,
        AdvancedPayment.is_active == True,
    ).first()
    if not ap:
        raise HTTPException(404, "Advanced payment not found")
    if ap.driver_id != s.driver_id:
        raise HTTPException(400, "Advanced payment belongs to a different driver")

    remaining = round((ap.amount or 0.0) - (ap.applied_amount or 0.0), 2)
    if remaining <= 0.01:
        raise HTTPException(400, "Advanced payment already fully applied")

    apply_amount = float((data or {}).get("amount", remaining))
    if apply_amount <= 0 or apply_amount > remaining + 0.01:
        raise HTTPException(400, f"Amount must be between 0 and ${remaining:.2f}")

    # Create adjustment — deduction-like, reduces total
    adj = SettlementAdjustment(
        settlement_id=settlement_id,
        adj_type="advanced_payment",
        date=_date.today(),
        category="Advanced Payment",
        description=f"Applied AP #{ap.payment_number}: {(ap.description or ap.category or '').strip()}",
        amount=round(apply_amount, 2),
    )
    db.add(adj)
    db.flush()

    ap.applied_amount = round((ap.applied_amount or 0.0) + apply_amount, 2)
    if ap.applied_amount >= (ap.amount or 0.0) - 0.01:
        ap.applied_to_settlement_id = settlement_id

    db.commit()
    crud._recalculate(db, settlement_id)
    _add_history(db, settlement_id, f"Applied advanced payment AP #{ap.payment_number} (${apply_amount:.2f})")
    return _ser_adj(adj)


# ── Remove Applied Advanced Payment ──────────────────────────────────────────

@router.delete("/{settlement_id}/advanced-payments/{adj_id}")
def remove_advanced_payment(settlement_id: int, adj_id: int, db: Session = Depends(get_db)):
    """
    Remove an applied advanced payment from a settlement.
    Restores the AP's applied_amount so it can be used again.
    """
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if not s:
        raise HTTPException(404, "Settlement not found")
    if _s_val(s.status) == "Paid":
        raise HTTPException(400, "Cannot modify Paid settlement. Move back to Preparing first.")

    adj = db.query(SettlementAdjustment).filter(
        SettlementAdjustment.id == adj_id,
        SettlementAdjustment.settlement_id == settlement_id,
        SettlementAdjustment.adj_type == "advanced_payment",
    ).first()
    if not adj:
        raise HTTPException(404, "Applied advanced payment not found")

    # Restore AP applied_amount by matching payment_number in description
    import re
    m = re.search(r"AP #(\d+)", adj.description or "")
    if m:
        ap_num = int(m.group(1))
        ap = db.query(AdvancedPayment).filter(AdvancedPayment.payment_number == ap_num).first()
        if ap:
            ap.applied_amount = max(0.0, round((ap.applied_amount or 0.0) - adj.amount, 2))
            if ap.applied_amount < (ap.amount or 0.0) - 0.01:
                ap.applied_to_settlement_id = None

    removed_amount = adj.amount
    db.delete(adj)
    db.commit()
    crud._recalculate(db, settlement_id)
    _add_history(db, settlement_id, f"Removed advanced payment (${removed_amount:.2f})")
    return {"message": "Removed"}


# ── Apply Scheduled Transaction ───────────────────────────────────────────────

@router.post("/{settlement_id}/scheduled/{tx_id}/apply", status_code=201)
def apply_scheduled(settlement_id: int, tx_id: int, db: Session = Depends(get_db)):
    """Apply a scheduled recurring deduction/addition to a settlement."""
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if not s:
        raise HTTPException(404, "Settlement not found")
    if _s_val(s.status) == "Paid":
        raise HTTPException(400, "Cannot modify Paid settlement")

    tx = db.query(DriverScheduledTransaction).filter(
        DriverScheduledTransaction.id == tx_id,
        DriverScheduledTransaction.is_active == True,
    ).first()
    if not tx:
        raise HTTPException(404, "Scheduled transaction not found")
    if tx.driver_id != s.driver_id:
        raise HTTPException(400, "Scheduled transaction belongs to a different driver")

    adj_type = "addition" if tx.trans_type == "addition" else "deduction"
    adj = SettlementAdjustment(
        settlement_id=settlement_id,
        adj_type=adj_type,
        date=_date.today(),
        category=tx.category or tx.trans_type,
        description=f"[Recurring] {tx.settlement_description or tx.description or tx.category or ''}".strip(),
        amount=tx.amount,
    )
    db.add(adj)
    tx.times_applied = (tx.times_applied or 0) + 1
    tx.last_applied = _date.today()
    if tx.repeat_type == "times" and tx.repeat_times and tx.times_applied >= tx.repeat_times:
        tx.is_active = False
    db.commit()
    crud._recalculate(db, settlement_id)
    _add_history(db, settlement_id, f"Applied recurring '{tx.category or tx.trans_type}' (${tx.amount:.2f})")
    return _ser_adj(adj)
