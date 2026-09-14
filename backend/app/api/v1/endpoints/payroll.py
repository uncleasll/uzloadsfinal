from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from typing import Optional
from datetime import date as _date, date

from app.db.session import get_db
from app.services.scheduled_payroll import available_dates, refresh_counters, amount_for_date, run_schedules, generate_occurrences, unassigned_occurrences
from pydantic import BaseModel, Field
from app.schemas.payroll_schemas import (
    SettlementCreate, SettlementUpdate, SettlementOut,
    SettlementPaymentCreate, SettlementAdjustmentCreate,
)
from app.crud import payroll as crud
from app.services.pdf_service import generate_settlement_pdf
from app.models.models import (
    Settlement, SettlementItem, SettlementAdjustment, SettlementPayment,
    SettlementHistory, Driver, Load, DriverScheduledTransaction, AdvancedPayment, PayrollCarryover, DriverTimeReport, DriverProfile,
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
    carryovers = [
        {"id": -entry.id, "adj_type": kind, "category": "Carryover",
         "description": f"Carryover {direction} settlement",
         "amount": entry.amount, "date": str(entry.date), "is_carryover": True}
        for entries, kind, direction in ((s.outgoing_carryovers, "addition", "to next"),
                                          (s.incoming_carryovers, "deduction", "from previous"))
        for entry in entries
    ]
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
        "adjustments": [_ser_adj(a) for a in (s.adjustments or [])] + carryovers + [
            {"id": -p.id, "adj_type": "advanced_payment", "category": "Legacy advance",
             "amount": p.amount, "date": str(p.payment_date), "description": f"Payment #{p.payment_number}", "legacy_payment_id": p.id}
            for p in s.legacy_advances if p.is_active and p.payment_type == "advanced_payment"
        ],
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
    if s.outgoing_carryovers and action not in ("edit",):
        raise HTTPException(400, "Reverse the outgoing carryover before changing this settlement.")
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
    date_type: str = Query("pickup", pattern="^(pickup|delivery)$"),
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
    # Status changes must go through the controlled /status endpoint
    # (it enforces transitions, item and balance checks). Reject bypasses here.
    if data.status is not None and _s_val(data.status) != _s_val(s.status):
        raise HTTPException(
            400,
            "Status cannot be changed via update. Use the workflow (status endpoint) instead.",
        )
    # Driver / payable / date edits only while Preparing — Paid/Ready are locked
    changing_fields = data.model_dump(exclude_unset=True, exclude={"status", "notes"})
    if changing_fields and _s_val(s.status) != "Preparing":
        raise HTTPException(
            400,
            f"Cannot edit settlement while it is '{_s_val(s.status)}'. Move it back to Preparing first.",
        )
    updated = crud.update_settlement(db, settlement_id, data)
    if not updated:
        raise HTTPException(404, "Settlement not found")
    return _serialize(updated)


@router.delete("/{settlement_id}")
def delete_settlement(settlement_id: int, db: Session = Depends(get_db)):
    s = crud.get_settlement(db, settlement_id)
    if not s:
        raise HTTPException(404, "Settlement not found")
    if _s_val(s.status) == "Paid":
        raise HTTPException(400, "Cannot delete a Paid settlement. Move it back to Preparing first.")
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


@router.put("/{settlement_id}/adjustments/{adj_id}")
def update_adjustment(settlement_id: int, adj_id: int, data: dict, db: Session = Depends(get_db)):
    s = crud.get_settlement(db, settlement_id)
    if not s:
        raise HTTPException(404, "Settlement not found")
    _require_preparing(s, "edit adjustment")
    adj = db.query(SettlementAdjustment).filter(
        SettlementAdjustment.id == adj_id,
        SettlementAdjustment.settlement_id == settlement_id,
    ).first()
    if not adj:
        raise HTTPException(404, "Adjustment not found")
    if adj.load_payee_id is not None:
        raise HTTPException(400, "Remove the additional-payee entry before changing its load")
    if adj.time_report_id is not None:
        raise HTTPException(400, "Remove the time report before editing its work record.")
    if adj.scheduled_transaction_id is not None:
        raise HTTPException(400, "Remove the scheduled occurrence before changing its source schedule.")
    if adj.adj_type == "advanced_payment":
        raise HTTPException(400, "Remove and reapply the advance to change its amount.")
    if data.get("amount") is not None:
        import math
        amount = float(data["amount"])
        if not math.isfinite(amount) or amount <= 0:
            raise HTTPException(400, "amount must be > 0")
        adj.amount = amount
    for field in ("date", "category", "description"):
        if field in data:
            value = data[field] or None
            if field == "date" and isinstance(value, str):
                value = date.fromisoformat(value)
            setattr(adj, field, value)
    db.flush()
    crud._recalculate(db, settlement_id)
    _add_history(db, settlement_id, f"Adjustment edited: {adj.category or adj.adj_type} (${adj.amount:.2f})")
    db.refresh(adj)
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
    s = crud.get_settlement(db, settlement_id)
    if not s:
        raise HTTPException(404, "Settlement not found")
    if _s_val(s.status) not in ("Ready", "Sent"):
        raise HTTPException(400, "Move settlement to Ready before recording a payment.")
    p = crud.add_payment(db, settlement_id, data)
    return _ser_payment(p)


@router.delete("/{settlement_id}/payments/{payment_id}")
def delete_payment(settlement_id: int, payment_id: int, db: Session = Depends(get_db)):
    s = crud.get_settlement(db, settlement_id)
    if not s:
        raise HTTPException(404, "Settlement not found")
    _require_preparing(s, "delete payment")
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
    ).filter(Settlement.id == settlement_id, Settlement.is_active == True).first()
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
    Paid → Preparing         (unlock payment removal/corrections)
    Any → Void
    """
    s = db.query(Settlement).options(
        joinedload(Settlement.items),
        joinedload(Settlement.payments),
    ).filter(Settlement.id == settlement_id, Settlement.is_active == True).first()
    if not s:
        raise HTTPException(404, "Settlement not found")

    new_status = (data.get("status") or "").strip()
    if not new_status:
        raise HTTPException(400, "status required")

    current = _s_val(s.status)
    allowed = VALID_TRANSITIONS.get(current, [])

    if new_status not in allowed:
        raise HTTPException(400, f"Cannot transition from '{current}' to '{new_status}'. Allowed: {allowed}")

    # Ready → Paid: balance must be zero
    if new_status == "Paid":
        if crud.money(s.balance_due) != 0:
            raise HTTPException(400, f"Balance due is ${s.balance_due:.2f}. Record a payment first.")

    if new_status == "Void" and (s.payments or s.adjustments or s.outgoing_carryovers or s.incoming_carryovers or s.legacy_advances):
        raise HTTPException(400, "Remove financial applications before voiding this settlement.")

    # Preparing → Ready: must have items
    if current == "Preparing" and new_status == "Ready":
        has_items = bool(s.items or [adj for adj in (s.adjustments or []) if adj.adj_type not in ("advanced_payment",)])
        # Allow even with only advanced payment adjustments
        if not has_items and not s.adjustments and not s.incoming_carryovers:
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
    date_type: str = Query("pickup", pattern="^(pickup|delivery)$"),
    db: Session = Depends(get_db),
):
    """
    Returns items eligible to be added to this settlement:
    1. Unpaid loads for the driver (not in any settlement)
    2. Active scheduled recurring transactions
    3. Unapplied advanced payments (from advanced_payments table)
    """
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).first()
    if not s:
        raise HTTPException(404, "Settlement not found")

    driver_id = s.driver_id

    # 1. Loads already in ANY settlement (excluding current so re-adding is prevented)
    settled_load_ids_q = crud.active_settled_load_ids(db)

    load_q = db.query(Load).options(joinedload(Load.stops)).filter(
        Load.driver_id == driver_id,
        or_(Load.payable_to_snapshot.is_(None), Load.payable_to_snapshot == s.payable_to),
        Load.is_active == True,
        Load.id.notin_(settled_load_ids_q),
    )
    from app.services.load_dates import payroll_date_column
    date_col = payroll_date_column(date_type)
    if date_from:
        load_q = load_q.filter(date_col >= date_from)
    if date_to:
        load_q = load_q.filter(date_col <= date_to)

    loads = load_q.order_by(Load.load_date.desc()).all()
    available_loads = []
    for l in loads:
        pickup = next((s for s in (l.stops or []) if _s_val(s.stop_type) == "pickup"), None)
        delivery = next((s for s in (l.stops or []) if _s_val(s.stop_type) == "delivery"), None)
        available_loads.append({
            "id": l.id,
            "load_number": l.load_number,
            "load_date": l.load_date.isoformat() if l.load_date else None,
            "actual_delivery_date": l.actual_delivery_date.isoformat() if l.actual_delivery_date else None,
            "delivery_date": l.actual_delivery_date.isoformat() if l.actual_delivery_date else None,
            "pickup_city": pickup.city if pickup else "",
            "pickup_state": pickup.state if pickup else "",
            "delivery_city": delivery.city if delivery else "",
            "delivery_state": delivery.state if delivery else "",
            "status": _s_val(l.status) if l.status else None,
            "billing_status": _s_val(l.billing_status) if l.billing_status else None,
            "rate": l.rate,
            "amount": crud.stored_driver_pay(l),
        })

    # Generated entries remain payable when their source schedule is paused.
    run_schedules(db, _date.today(), driver_id)
    db.commit()
    scheduled_transactions = [{
        'id': row.scheduled_transaction_id, 'occurrence_id': row.id,
        'trans_type': row.adj_type, 'category': row.category, 'description': row.description,
        'amount': row.amount, 'next_due': row.date.isoformat(), 'due_date': row.date.isoformat(),
    } for row in unassigned_occurrences(db, s)
       if (not date_from or row.date >= date_from) and (not date_to or row.date <= date_to)]

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
    Records an advance application that reduces balance due, not earnings.
    """
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).first()
    if not s:
        raise HTTPException(404, "Settlement not found")
    if _s_val(s.status) == "Paid":
        raise HTTPException(400, "Cannot modify Paid settlement. Move back to Preparing first.")
    _require_preparing(s, "apply advanced payment")

    ap = db.query(AdvancedPayment).filter(
        AdvancedPayment.id == ap_id,
        AdvancedPayment.is_active == True,
    ).with_for_update().first()
    if not ap:
        raise HTTPException(404, "Advanced payment not found")
    if ap.driver_id != s.driver_id:
        raise HTTPException(400, "Advanced payment belongs to a different driver")

    remaining = round((ap.amount or 0.0) - (ap.applied_amount or 0.0), 2)
    if remaining <= 0:
        raise HTTPException(400, "Advanced payment already fully applied")

    apply_amount = float((data or {}).get("amount", remaining))
    import math
    if not math.isfinite(apply_amount) or round(apply_amount, 2) <= 0 or round(apply_amount, 2) > remaining:
        raise HTTPException(400, f"Amount must be between 0 and ${remaining:.2f}")

    # Kept in the legacy application table; classified as payment in the totals.
    adj = SettlementAdjustment(
        settlement_id=settlement_id,
        adj_type="advanced_payment",
        date=_date.today(),
        category="Advanced Payment",
        description=f"Applied AP #{ap.payment_number}: {(ap.description or ap.category or '').strip()}",
        amount=round(apply_amount, 2),
        advanced_payment_id=ap.id,
    )
    db.add(adj)
    db.flush()

    ap.applied_amount = round((ap.applied_amount or 0.0) + apply_amount, 2)
    if ap.applied_amount >= (ap.amount or 0.0) - 0.01:
        ap.applied_to_settlement_id = settlement_id

    db.flush()
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
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).first()
    if not s:
        raise HTTPException(404, "Settlement not found")
    if _s_val(s.status) == "Paid":
        raise HTTPException(400, "Cannot modify Paid settlement. Move back to Preparing first.")
    _require_preparing(s, "remove advanced payment")

    adj = db.query(SettlementAdjustment).filter(
        SettlementAdjustment.id == adj_id,
        SettlementAdjustment.settlement_id == settlement_id,
        SettlementAdjustment.adj_type == "advanced_payment",
    ).first()
    if not adj:
        raise HTTPException(404, "Applied advanced payment not found")

    crud.restore_advance(db, adj)

    removed_amount = adj.amount
    db.delete(adj)
    db.flush()
    crud._recalculate(db, settlement_id)
    _add_history(db, settlement_id, f"Removed advanced payment (${removed_amount:.2f})")
    return {"message": "Removed"}


# ── Apply Scheduled Transaction ───────────────────────────────────────────────

class ScheduledApplicationIn(BaseModel):
    due_date: date


@router.post("/{settlement_id}/scheduled/{tx_id}/apply", status_code=201)
def apply_scheduled(settlement_id: int, tx_id: int, data: ScheduledApplicationIn, db: Session = Depends(get_db)):
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).with_for_update().first()
    if not s:
        raise HTTPException(404, "Settlement not found")
    _require_preparing(s, "apply scheduled transaction")
    tx = db.query(DriverScheduledTransaction).filter(DriverScheduledTransaction.id == tx_id).with_for_update().first()
    if not tx:
        raise HTTPException(404, "Scheduled transaction not found")
    if tx.driver_id != s.driver_id or (tx.payable_to and tx.payable_to != s.payable_to):
        raise HTTPException(400, "Scheduled transaction belongs to a different driver or payee")
    existing = db.query(SettlementAdjustment).filter(
        SettlementAdjustment.scheduled_transaction_id == tx.id,
        SettlementAdjustment.date == data.due_date,
    ).first()
    if existing:
        if existing.settlement_id == s.id:
            return _ser_adj(existing)
        raise HTTPException(400, "This scheduled occurrence is already in another settlement")
    if data.due_date > min(s.date, _date.today()):
        raise HTTPException(400, "Occurrence is not due yet")
    from app.models.models import ScheduledPayrollOccurrence
    generate_occurrences(db, tx, min(s.date, _date.today()))
    occurrence = db.query(ScheduledPayrollOccurrence).filter(
        ScheduledPayrollOccurrence.scheduled_transaction_id == tx.id, ScheduledPayrollOccurrence.date == data.due_date,
        ScheduledPayrollOccurrence.payable_to == s.payable_to).first()
    if not occurrence or data.due_date > min(s.date, _date.today()):
        raise HTTPException(400, "Occurrence is not due, is paused, or needs legacy reconciliation")
    from app.services.driver_pay_service import money
    import math
    if not tx.amount or not math.isfinite(tx.amount) or money(tx.amount) <= 0:
        raise HTTPException(400, "Scheduled amount must be positive")
    adj = SettlementAdjustment(
        settlement_id=s.id, scheduled_transaction_id=tx.id,
        adj_type=occurrence.adj_type, date=data.due_date,
        category=occurrence.category,
        description=f"[Recurring] {occurrence.description}".strip(),
        amount=occurrence.amount,
    )
    db.add(adj)
    refresh_counters(db, tx)
    crud._recalculate(db, s.id)
    _add_history(db, s.id, f"Applied recurring '{tx.category or tx.trans_type}' for {data.due_date} (${adj.amount:.2f})")
    return _ser_adj(adj)


@router.post("/{settlement_id}/carryover", status_code=201)
def create_carryover(settlement_id: int, db: Session = Depends(get_db)):
    entry = crud.create_carryover(db, settlement_id)
    return {"id": entry.id, "amount": entry.amount, "source_settlement_id": entry.source_settlement_id}


@router.delete("/{settlement_id}/carryover/{carryover_id}")
def remove_carryover(settlement_id: int, carryover_id: int, db: Session = Depends(get_db)):
    crud.remove_carryover(db, settlement_id, carryover_id)
    return {"message": "Carryover reversed"}


class TimeReportIn(BaseModel):
    date: date
    hours: float = Field(gt=0, le=24, allow_inf_nan=False)
    description: str = Field(default='', max_length=2000)
    request_key: str = Field(min_length=16, max_length=100)


def _time_report(row):
    return {key: getattr(row, key) for key in ('id', 'driver_id', 'payable_to', 'date', 'hours', 'hourly_rate', 'amount', 'description')}


@router.get('/{settlement_id}/time-reports')
def available_time_reports(settlement_id: int, db: Session = Depends(get_db)):
    s = crud.get_settlement(db, settlement_id)
    if not s:
        raise HTTPException(404, 'Settlement not found')
    used = db.query(SettlementAdjustment.time_report_id).filter(SettlementAdjustment.time_report_id.isnot(None))
    rows = db.query(DriverTimeReport).filter(DriverTimeReport.driver_id == s.driver_id,
        DriverTimeReport.payable_to == s.payable_to, DriverTimeReport.is_active == True,
        DriverTimeReport.date <= s.date, DriverTimeReport.id.notin_(used)).order_by(DriverTimeReport.date, DriverTimeReport.id).all()
    profile = db.query(DriverProfile).filter(DriverProfile.driver_id == s.driver_id).first()
    return {'hourly_enabled': bool(profile and profile.pay_type == 'hourly'),
            'hourly_rate': profile.hourly_rate if profile else 0, 'rows': [_time_report(r) for r in rows]}


@router.post('/{settlement_id}/time-reports', status_code=201)
def create_time_report(settlement_id: int, data: TimeReportIn, db: Session = Depends(get_db)):
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).with_for_update().first()
    if not s:
        raise HTTPException(404, 'Settlement not found')
    _require_preparing(s, 'record work hours')
    driver = db.query(Driver).filter(Driver.id == s.driver_id).with_for_update().one()
    existing = db.query(DriverTimeReport).filter(DriverTimeReport.request_key == data.request_key).first()
    if existing:
        if existing.driver_id != s.driver_id or existing.payable_to != s.payable_to or existing.date != data.date or existing.hours != data.hours or existing.description != data.description or not existing.is_active:
            raise HTTPException(409, 'Request key already belongs to a different time report')
        return _time_report(existing)
    profile = db.query(DriverProfile).filter(DriverProfile.driver_id == s.driver_id).first()
    if not profile or profile.pay_type != 'hourly':
        raise HTTPException(400, 'Driver must have an hourly pay profile')
    if (profile.payable_to or driver.name) != s.payable_to:
        raise HTTPException(400, 'Create a settlement for the current hourly payee')
    if data.date > min(s.date, _date.today()):
        raise HTTPException(400, 'Work date cannot be in the future or after the settlement date')
    from decimal import Decimal
    from app.services.driver_pay_service import money
    import math
    recorded_hours = db.query(func.coalesce(func.sum(DriverTimeReport.hours), 0)).filter(
        DriverTimeReport.driver_id == s.driver_id, DriverTimeReport.date == data.date, DriverTimeReport.is_active == True).scalar()
    if Decimal(str(recorded_hours)) + Decimal(str(data.hours)) > 24:
        raise HTTPException(400, "Total work hours cannot exceed 24 in one day")
    rate = profile.hourly_rate or 0
    if not math.isfinite(rate) or rate < 0:
        raise HTTPException(400, 'Hourly rate must be nonnegative')
    row = DriverTimeReport(driver_id=s.driver_id, payable_to=s.payable_to, date=data.date,
        hours=data.hours, hourly_rate=rate, amount=money(Decimal(str(data.hours)) * Decimal(str(rate))),
        description=data.description, request_key=data.request_key)
    db.add(row); db.commit(); db.refresh(row)
    return _time_report(row)


@router.post('/{settlement_id}/time-reports/{report_id}/apply')
def apply_time_report(settlement_id: int, report_id: int, db: Session = Depends(get_db)):
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).with_for_update().first()
    if not s:
        raise HTTPException(404, 'Settlement not found')
    _require_preparing(s, 'apply time report')
    row = db.query(DriverTimeReport).filter(DriverTimeReport.id == report_id, DriverTimeReport.is_active == True).with_for_update().first()
    if not row:
        raise HTTPException(404, 'Time report not found')
    if row.driver_id != s.driver_id or row.payable_to != s.payable_to or row.date > s.date:
        raise HTTPException(400, 'Time report does not belong to this driver, payee or period')
    existing = db.query(SettlementAdjustment).filter(SettlementAdjustment.time_report_id == report_id).first()
    if existing:
        if existing.settlement_id == s.id:
            return _ser_adj(existing)
        raise HTTPException(400, 'Time report already belongs to another settlement')
    adj = SettlementAdjustment(settlement_id=s.id, time_report_id=row.id, adj_type='addition',
        date=row.date, amount=row.amount, category='Driver payments',
        description=f'{row.hours:g} hours × ${row.hourly_rate:.2f}/hour. {row.description or ""}'.strip())
    db.add(adj); db.flush(); crud._recalculate(db, s.id)
    _add_history(db, s.id, f'Applied time report #{row.id}')
    return _ser_adj(adj)


@router.delete('/{settlement_id}/time-reports/{report_id}')
def delete_time_report(settlement_id: int, report_id: int, db: Session = Depends(get_db)):
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).with_for_update().first()
    if not s:
        raise HTTPException(404, 'Settlement not found')
    _require_preparing(s, 'delete time report')
    row = db.query(DriverTimeReport).filter(DriverTimeReport.id == report_id, DriverTimeReport.is_active == True).with_for_update().first()
    if not row or row.driver_id != s.driver_id or row.payable_to != s.payable_to:
        raise HTTPException(404, 'Time report not found')
    if db.query(SettlementAdjustment).filter(SettlementAdjustment.time_report_id == report_id).first():
        raise HTTPException(400, 'Remove the time report from payroll before deleting it')
    row.is_active = False; db.commit()
    return {'message': 'Deleted'}


@router.post('/{settlement_id}/scheduled/run')
def run_driver_schedule(settlement_id: int, db: Session = Depends(get_db)):
    s = crud.get_settlement(db, settlement_id)
    if not s:
        raise HTTPException(404, 'Settlement not found')
    _require_preparing(s, 'generate scheduled transactions')
    count = run_schedules(db, _date.today(), s.driver_id)
    db.commit()
    return {'created': count}


@router.get('/{settlement_id}/additional-payees')
def available_additional_payees(settlement_id: int, db: Session = Depends(get_db)):
    from app.models.models import LoadAdditionalPayee
    s = crud.get_settlement(db, settlement_id)
    if not s:
        raise HTTPException(404, 'Settlement not found')
    used = db.query(SettlementAdjustment.load_payee_id).filter(SettlementAdjustment.load_payee_id.isnot(None))
    rows = db.query(LoadAdditionalPayee).join(Load).filter(Load.is_active == True,
        LoadAdditionalPayee.driver_id == s.driver_id, LoadAdditionalPayee.payable_to == s.payable_to,
        LoadAdditionalPayee.id.notin_(used), LoadAdditionalPayee.date <= s.date).all()
    return [{'id': r.id, 'load_id': r.load_id, 'load_number': r.load.load_number, 'date': r.date,
             'rate_pct': r.rate_pct, 'amount': r.amount, 'base_amount': r.base_amount, 'payable_to': r.payable_to} for r in rows]


@router.post('/{settlement_id}/additional-payees/{entry_id}/apply')
def apply_additional_payee(settlement_id: int, entry_id: int, db: Session = Depends(get_db)):
    from app.models.models import LoadAdditionalPayee
    s = db.query(Settlement).filter(Settlement.id == settlement_id, Settlement.is_active == True).with_for_update().first()
    if not s:
        raise HTTPException(404, 'Settlement not found')
    _require_preparing(s, 'add additional payee')
    entry = db.query(LoadAdditionalPayee).filter(LoadAdditionalPayee.id == entry_id).first()
    if not entry:
        raise HTTPException(404, 'Payee entry not found')
    load = db.query(Load).filter(Load.id == entry.load_id, Load.is_active == True).with_for_update().first()
    if not load or entry.driver_id != s.driver_id or entry.payable_to != s.payable_to or entry.date > s.date:
        raise HTTPException(400, 'Additional-payee entry does not belong to this driver, payee or period')
    existing = db.query(SettlementAdjustment).filter(SettlementAdjustment.load_payee_id == entry_id).first()
    if existing:
        if existing.settlement_id == s.id:
            return _ser_adj(existing)
        raise HTTPException(400, 'Additional-payee entry is already in another settlement')
    adj = SettlementAdjustment(settlement_id=s.id, load_payee_id=entry.id, adj_type='addition', date=entry.date,
        category='Additional payee', amount=entry.amount,
        description=f'Load #{load.load_number}: {entry.rate_pct:g}% of freight ${entry.base_amount:.2f}')
    db.add(adj); db.flush(); crud._recalculate(db, s.id)
    _add_history(db, s.id, f'Applied additional payee for load #{load.load_number}')
    return _ser_adj(adj)
