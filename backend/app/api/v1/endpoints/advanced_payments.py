"""
Advanced Payments endpoint.

Business rule (per Easy Loads spec):
  1. Dispatcher creates an advanced payment (com-check, fuel advance, pre-pay) here.
  2. It sits as "unapplied" until someone opens a settlement and clicks the + button.
  3. When applied, the settlement_total is reduced by that amount (it counts against what
     the driver is owed this cycle).
  4. Applied amount is tracked on the AdvancedPayment row so partial applications are
     possible and "remaining" can be shown.

Table used: advanced_payments  (AdvancedPayment model)
This is intentionally separate from payments_new (Payment model) which tracks
settlement-level actual wire/check payments.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional
from datetime import date

from app.db.session import get_db
from app.models.models import AdvancedPayment, Driver, Vendor, Settlement

router = APIRouter(prefix="/advanced-payments", tags=["advanced-payments"])


# ── Categories (kept here so the frontend can fetch a dynamic list) ────────────
CATEGORIES = [
    "Com check", "Fuel advance", "Pre-payment", "Loan", "Other",
    "Repair advance", "Detention advance", "Escrow release",
]


def _ser(ap: AdvancedPayment, db: Session) -> dict:
    driver = ap.driver
    vendor = ap.vendor if ap.vendor_id else None
    remaining = round(max(0.0, (ap.amount or 0.0) - (ap.applied_amount or 0.0)), 2)
    return {
        "id": ap.id,
        "payment_number": ap.payment_number,
        "driver_id": ap.driver_id,
        "driver_name": driver.name if driver else None,
        "vendor_id": ap.vendor_id,
        "vendor_name": vendor.company_name if vendor else None,
        "payment_date": ap.payment_date.isoformat() if ap.payment_date else None,
        "amount": ap.amount,
        "applied_amount": ap.applied_amount or 0.0,
        "remaining": remaining,
        "description": ap.description,
        "category": ap.category,
        "is_applied": (ap.applied_amount or 0.0) >= (ap.amount or 0.0) - 0.01,
        "applied_to_settlement_id": ap.applied_to_settlement_id,
        "is_active": ap.is_active,
        "created_at": ap.created_at.isoformat() if ap.created_at else None,
    }


def _next_payment_number(db: Session) -> int:
    m = db.query(func.max(AdvancedPayment.payment_number)).scalar()
    return (m or 3000) + 1


# ── List ───────────────────────────────────────────────────────────────────────

@router.get("")
def list_advanced_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    driver_id: Optional[int] = None,
    unapplied_only: bool = False,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    q = db.query(AdvancedPayment).options(
        joinedload(AdvancedPayment.driver),
        joinedload(AdvancedPayment.vendor),
    ).filter(AdvancedPayment.is_active == True)

    if driver_id:
        q = q.filter(AdvancedPayment.driver_id == driver_id)
    if unapplied_only:
        # remaining > 0  ⟺  applied_amount < amount
        q = q.filter(AdvancedPayment.applied_amount < AdvancedPayment.amount)
    if date_from:
        q = q.filter(AdvancedPayment.payment_date >= date_from)
    if date_to:
        q = q.filter(AdvancedPayment.payment_date <= date_to)

    total = q.count()
    items = (
        q.order_by(AdvancedPayment.payment_number.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": [_ser(ap, db) for ap in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/categories")
def get_categories():
    return CATEGORIES


@router.get("/unapplied/{driver_id}")
def list_unapplied_for_driver(driver_id: int, db: Session = Depends(get_db)):
    """All unapplied (remaining > 0) advanced payments for a specific driver."""
    aps = db.query(AdvancedPayment).options(
        joinedload(AdvancedPayment.driver),
    ).filter(
        AdvancedPayment.driver_id == driver_id,
        AdvancedPayment.is_active == True,
        AdvancedPayment.applied_amount < AdvancedPayment.amount,
    ).order_by(AdvancedPayment.payment_date.desc()).all()
    return [_ser(ap, db) for ap in aps]


# ── Single ─────────────────────────────────────────────────────────────────────

@router.get("/{ap_id}")
def get_advanced_payment(ap_id: int, db: Session = Depends(get_db)):
    ap = db.query(AdvancedPayment).options(
        joinedload(AdvancedPayment.driver),
        joinedload(AdvancedPayment.vendor),
    ).filter(AdvancedPayment.id == ap_id, AdvancedPayment.is_active == True).first()
    if not ap:
        raise HTTPException(404, "Advanced payment not found")
    return _ser(ap, db)


# ── Create ─────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
def create_advanced_payment(data: dict, db: Session = Depends(get_db)):
    driver_id = data.get("driver_id")
    if not driver_id:
        raise HTTPException(400, "driver_id required")
    if not db.query(Driver).filter(Driver.id == driver_id).first():
        raise HTTPException(404, "Driver not found")
    amount = data.get("amount")
    if not amount or float(amount) <= 0:
        raise HTTPException(400, "amount must be > 0")
    payment_date = data.get("payment_date")
    if not payment_date:
        raise HTTPException(400, "payment_date required")

    ap = AdvancedPayment(
        payment_number=_next_payment_number(db),
        driver_id=int(driver_id),
        vendor_id=data.get("vendor_id"),
        payment_date=payment_date,
        amount=float(amount),
        applied_amount=0.0,
        description=data.get("description"),
        category=data.get("category"),
        is_active=True,
    )
    db.add(ap)
    db.commit()
    db.refresh(ap)
    return _ser(ap, db)


# ── Update ─────────────────────────────────────────────────────────────────────

@router.put("/{ap_id}")
def update_advanced_payment(ap_id: int, data: dict, db: Session = Depends(get_db)):
    ap = db.query(AdvancedPayment).filter(
        AdvancedPayment.id == ap_id, AdvancedPayment.is_active == True
    ).first()
    if not ap:
        raise HTTPException(404, "Advanced payment not found")
    if (ap.applied_amount or 0.0) > 0:
        raise HTTPException(
            400,
            "Cannot edit: payment already (partially) applied to a settlement. "
            "Unapply it first from the settlement."
        )
    allowed = ["payment_date", "amount", "description", "category", "vendor_id"]
    for k, v in data.items():
        if k in allowed:
            setattr(ap, k, v)
    db.commit()
    db.refresh(ap)
    return _ser(ap, db)


# ── Delete (soft) ──────────────────────────────────────────────────────────────

@router.delete("/{ap_id}")
def delete_advanced_payment(ap_id: int, db: Session = Depends(get_db)):
    ap = db.query(AdvancedPayment).filter(
        AdvancedPayment.id == ap_id, AdvancedPayment.is_active == True
    ).first()
    if not ap:
        raise HTTPException(404, "Advanced payment not found")
    if (ap.applied_amount or 0.0) > 0:
        raise HTTPException(
            400,
            "Cannot delete: already applied to a settlement. "
            "Remove it from the settlement first."
        )
    ap.is_active = False
    db.commit()
    return {"message": "Deleted"}
