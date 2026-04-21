"""
Payments endpoint — standalone Payments (Advanced Payments, etc.)
Spec rule: Advanced Payments are created HERE first, then applied into a settlement.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional
from datetime import date
from app.db.session import get_db
from app.models.models import Payment, Driver, Vendor, Settlement

router = APIRouter(prefix="/payments", tags=["payments"])


def _serialize(p: Payment) -> dict:
    applied_settlement_number = None
    if p.applied_settlement_id:
        s = None
        try:
            s = p.applied_settlement
        except Exception:
            s = None
        if not s:
            from app.db.session import SessionLocal
            # fallback minimal fetch
            pass
        applied_settlement_number = getattr(s, "settlement_number", None) if s else None
    return {
        "id": p.id,
        "payment_number": p.payment_number,
        "payment_type": p.payment_type,
        "driver_id": p.driver_id,
        "driver_name": p.driver.name if p.driver else None,
        "vendor_id": p.vendor_id,
        "vendor_name": p.vendor.company_name if p.vendor else None,
        "settlement_id": p.settlement_id,
        "applied_settlement_id": p.applied_settlement_id,
        "applied_settlement_number": applied_settlement_number,
        "settlement_number": applied_settlement_number,
        "payment_date": p.payment_date.isoformat() if p.payment_date else None,
        "amount": p.amount,
        "description": p.description,
        "payable_to": p.payable_to,
        "notes": p.notes,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _next_payment_number(db: Session) -> int:
    m = db.query(func.max(Payment.payment_number)).scalar()
    return (m or 5000) + 1


@router.get("")
def list_payments(
    page: int = 1,
    page_size: int = 50,
    payment_type: Optional[str] = Query(None, description="advanced_payment | settlement_payment | other"),
    driver_id: Optional[int] = None,
    unapplied_only: bool = False,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Payment).options(
        joinedload(Payment.driver),
        joinedload(Payment.vendor),
    ).filter(Payment.is_active == True)

    if payment_type:  q = q.filter(Payment.payment_type == payment_type)
    if driver_id:     q = q.filter(Payment.driver_id == driver_id)
    if unapplied_only:
        q = q.filter(Payment.applied_settlement_id.is_(None))
    if date_from:     q = q.filter(Payment.payment_date >= date_from)
    if date_to:       q = q.filter(Payment.payment_date <= date_to)

    total = q.count()
    items = (q.order_by(Payment.payment_number.desc())
              .offset((page-1)*page_size).limit(page_size).all())
    return {
        "items": [_serialize(p) for p in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/advanced/unapplied/{driver_id}")
def list_unapplied_advanced_for_driver(driver_id: int, db: Session = Depends(get_db)):
    """Advanced payments for a driver that have NOT yet been applied to any settlement."""
    q = db.query(Payment).options(joinedload(Payment.driver)).filter(
        Payment.driver_id == driver_id,
        Payment.payment_type == 'advanced_payment',
        Payment.applied_settlement_id.is_(None),
        Payment.is_active == True,
    ).order_by(Payment.payment_date.desc())
    return [_serialize(p) for p in q.all()]


@router.get("/{payment_id}")
def get_payment(payment_id: int, db: Session = Depends(get_db)):
    p = db.query(Payment).options(joinedload(Payment.driver), joinedload(Payment.vendor)).filter(
        Payment.id == payment_id, Payment.is_active == True
    ).first()
    if not p:
        raise HTTPException(404, "Payment not found")
    return _serialize(p)


@router.post("", status_code=201)
def create_payment(data: dict, db: Session = Depends(get_db)):
    payment_type = data.get("payment_type", "advanced_payment")
    if payment_type not in ("advanced_payment", "settlement_payment", "other"):
        raise HTTPException(400, "Invalid payment_type")
    if not data.get("amount") or float(data["amount"]) <= 0:
        raise HTTPException(400, "amount must be > 0")
    if not data.get("payment_date"):
        raise HTTPException(400, "payment_date required")

    p = Payment(
        payment_number=_next_payment_number(db),
        payment_type=payment_type,
        driver_id=data.get("driver_id"),
        vendor_id=data.get("vendor_id"),
        settlement_id=data.get("settlement_id"),  # for settlement_payment type
        payment_date=data["payment_date"],
        amount=float(data["amount"]),
        description=data.get("description"),
        payable_to=data.get("payable_to"),
        notes=data.get("notes"),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _serialize(p)


@router.put("/{payment_id}")
def update_payment(payment_id: int, data: dict, db: Session = Depends(get_db)):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(404, "Payment not found")
    # Cannot edit a payment that is already applied to a settlement
    if p.applied_settlement_id:
        raise HTTPException(400, "Payment is already applied to a settlement. Unapply first.")
    allowed = ["payment_date","amount","description","payable_to","notes","driver_id","vendor_id"]
    for k, v in data.items():
        if k in allowed:
            setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return _serialize(p)


@router.delete("/{payment_id}")
def delete_payment(payment_id: int, db: Session = Depends(get_db)):
    p = db.query(Payment).filter(Payment.id == payment_id).first()
    if not p:
        raise HTTPException(404, "Payment not found")
    if p.applied_settlement_id:
        raise HTTPException(400, "Payment is applied to a settlement. Unapply first.")
    p.is_active = False
    db.commit()
    return {"message": "Deleted"}


@router.post("/{payment_id}/apply/{settlement_id}")
def apply_to_settlement(payment_id: int, settlement_id: int, db: Session = Depends(get_db)):
    """Apply an advanced payment to a specific settlement (reduces settlement total)."""
    p = db.query(Payment).filter(Payment.id == payment_id, Payment.is_active == True).first()
    if not p:
        raise HTTPException(404, "Payment not found")
    if p.payment_type != 'advanced_payment':
        raise HTTPException(400, "Only advanced payments can be applied")
    if p.applied_settlement_id:
        raise HTTPException(400, f"Already applied to settlement {p.applied_settlement_id}")
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if not s:
        raise HTTPException(404, "Settlement not found")
    from app.crud.payroll import _is_editable, SettlementLocked, _recalculate, _add_history
    if not _is_editable(s):
        raise HTTPException(400, f"Settlement is {s.status.value}. Move back to Preparing to apply advanced payments.")

    p.applied_settlement_id = settlement_id
    db.commit()
    _add_history(db, settlement_id, f"Advanced payment #{p.payment_number} (${p.amount}) applied")
    _recalculate(db, settlement_id)
    return _serialize(p)


@router.post("/{payment_id}/unapply")
def unapply_from_settlement(payment_id: int, db: Session = Depends(get_db)):
    p = db.query(Payment).filter(Payment.id == payment_id, Payment.is_active == True).first()
    if not p:
        raise HTTPException(404, "Payment not found")
    if not p.applied_settlement_id:
        raise HTTPException(400, "Not applied")
    from app.crud.payroll import _is_editable, _recalculate, _add_history
    s = db.query(Settlement).filter(Settlement.id == p.applied_settlement_id).first()
    if s and not _is_editable(s):
        raise HTTPException(400, f"Settlement is {s.status.value}. Move back to Preparing to unapply.")
    prev_sid = p.applied_settlement_id
    p.applied_settlement_id = None
    db.commit()
    _add_history(db, prev_sid, f"Advanced payment #{p.payment_number} unapplied")
    _recalculate(db, prev_sid)
    return _serialize(p)
