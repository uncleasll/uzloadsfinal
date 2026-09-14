from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, Literal
from datetime import date

from app.db.session import get_db
from app.models.models import Vendor, DriverScheduledTransaction, Driver, ScheduledPayrollOccurrence
from pydantic import BaseModel, Field, model_validator

router = APIRouter(tags=["vendors"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class VendorIn(BaseModel):
    company_name: str
    vendor_type: Optional[str] = None
    address: Optional[str] = None
    address2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    fid_ein: Optional[str] = None
    mc_number: Optional[str] = None
    notes: Optional[str] = None
    is_equipment_owner: bool = False
    is_additional_payee: bool = False
    additional_payee_rate_pct: Optional[float] = None
    settlement_template_type: Optional[str] = None
    is_active: bool = True


class ScheduledTxIn(BaseModel):
    driver_id: int
    trans_type: Literal["addition", "deduction", "loan", "escrow"]
    category: Optional[str] = None
    description: Optional[str] = None
    amount: float = Field(gt=0, allow_inf_nan=False)
    deduct_by: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)
    schedule: Literal["daily", "weekly", "biweekly", "monthly", "annual", "annually"]
    start_date: date
    end_date: Optional[date] = None
    repeat_type: Literal["always", "times", "until"] = "always"
    repeat_times: Optional[int] = None
    is_active: bool = True
    payable_to: Optional[str] = None
    settlement_description: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def validate_repeat(self):
        if self.trans_type in ('loan', 'escrow') and not self.deduct_by:
            raise ValueError('Deduct by is required for loan and escrow')
        if self.repeat_type == 'times' and (not self.repeat_times or self.repeat_times < 1):
            raise ValueError('Repeat count must be positive')
        if self.repeat_type == 'until' and not self.end_date:
            raise ValueError('End date is required')
        if self.end_date and self.end_date < self.start_date:
            raise ValueError('End date cannot precede start date')
        return self


# ─── Serializers ──────────────────────────────────────────────────────────────

def _ser_vendor(v: Vendor) -> dict:
    return {
        "id": v.id,
        "company_name": v.company_name,
        "vendor_type": v.vendor_type,
        "address": v.address,
        "address2": v.address2,
        "city": v.city,
        "state": v.state,
        "zip_code": v.zip_code,
        "phone": v.phone,
        "email": v.email,
        "fid_ein": v.fid_ein,
        "mc_number": v.mc_number,
        "notes": v.notes,
        "is_equipment_owner": v.is_equipment_owner,
        "is_additional_payee": v.is_additional_payee,
        "additional_payee_rate_pct": v.additional_payee_rate_pct,
        "settlement_template_type": v.settlement_template_type,
        "is_active": v.is_active,
        "created_at": str(v.created_at) if v.created_at else None,
    }


def _ser_tx(t: DriverScheduledTransaction) -> dict:
    return {
        "id": t.id,
        "driver_id": t.driver_id,
        "trans_type": t.trans_type,
        "category": t.category,
        "description": t.description,
        "amount": t.amount,
        "deduct_by": t.deduct_by,
        "schedule": t.schedule,
        "start_date": str(t.start_date) if t.start_date else None,
        "end_date": str(t.end_date) if t.end_date else None,
        "repeat_type": t.repeat_type,
        "repeat_times": t.repeat_times,
        "times_applied": t.times_applied,
        "last_applied": str(t.last_applied) if t.last_applied else None,
        "next_due": str(t.next_due) if t.next_due else None,
        "is_active": t.is_active,
        "payable_to": t.payable_to,
        "settlement_description": t.settlement_description,
        "notes": t.notes,
        "created_at": str(t.created_at) if t.created_at else None,
    }


# ─── Vendor endpoints ─────────────────────────────────────────────────────────

@router.get("/vendors")
def list_vendors(
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Vendor)
    if is_active is not None:
        q = q.filter(Vendor.is_active == is_active)
    if search:
        q = q.filter(Vendor.company_name.ilike(f"%{search}%"))
    return [_ser_vendor(v) for v in q.order_by(Vendor.company_name).all()]


@router.post("/vendors", status_code=201)
def create_vendor(data: VendorIn, db: Session = Depends(get_db)):
    v = Vendor(**data.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return _ser_vendor(v)


@router.get("/vendors/{vendor_id}")
def get_vendor(vendor_id: int, db: Session = Depends(get_db)):
    v = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not v:
        raise HTTPException(404, "Vendor not found")
    return _ser_vendor(v)


@router.put("/vendors/{vendor_id}")
def update_vendor(vendor_id: int, data: VendorIn, db: Session = Depends(get_db)):
    v = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not v:
        raise HTTPException(404, "Vendor not found")
    for k, val in data.model_dump().items():
        setattr(v, k, val)
    db.commit()
    return _ser_vendor(v)


@router.delete("/vendors/{vendor_id}")
def delete_vendor(vendor_id: int, db: Session = Depends(get_db)):
    v = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not v:
        raise HTTPException(404, "Vendor not found")
    v.is_active = False
    db.commit()
    return {"message": "Deactivated"}


# ─── Scheduled transactions ────────────────────────────────────────────────────

@router.get("/drivers/{driver_id}/scheduled-transactions")
def list_scheduled(
    driver_id: int,
    show_inactive: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(DriverScheduledTransaction).filter(
        DriverScheduledTransaction.driver_id == driver_id
    )
    if not show_inactive:
        q = q.filter(DriverScheduledTransaction.is_active == True)
    return [_ser_tx(t) for t in q.order_by(DriverScheduledTransaction.created_at.desc()).all()]


@router.post("/drivers/{driver_id}/scheduled-transactions", status_code=201)
def create_scheduled(driver_id: int, data: ScheduledTxIn, db: Session = Depends(get_db)):
    if not db.query(Driver).filter(Driver.id == driver_id).first():
        raise HTTPException(404, "Driver not found")
    t = DriverScheduledTransaction(
        driver_id=driver_id,
        trans_type=data.trans_type,
        category=data.category,
        description=data.description,
        amount=data.amount,
        deduct_by=data.deduct_by,
        schedule=data.schedule,
        start_date=data.start_date,
        end_date=data.end_date,
        repeat_type=data.repeat_type or "always",
        repeat_times=data.repeat_times,
        is_active=data.is_active,
        payable_to=data.payable_to,
        settlement_description=data.settlement_description,
        notes=data.notes,
        next_due=data.start_date,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _ser_tx(t)


@router.put("/drivers/{driver_id}/scheduled-transactions/{tx_id}")
def update_scheduled(
    driver_id: int, tx_id: int, data: ScheduledTxIn,
    db: Session = Depends(get_db),
):
    t = db.query(DriverScheduledTransaction).filter(
        DriverScheduledTransaction.id == tx_id,
        DriverScheduledTransaction.driver_id == driver_id,
    ).with_for_update().first()
    if not t:
        raise HTTPException(404, "Transaction not found")
    update_fields = data.model_dump(exclude={'driver_id'})
    protected = ('schedule', 'start_date', 'end_date', 'repeat_type', 'repeat_times', 'payable_to', 'amount', 'deduct_by', 'trans_type')
    if (t.times_applied or db.query(ScheduledPayrollOccurrence).filter_by(scheduled_transaction_id=t.id).first()) and any(getattr(t, field) != update_fields[field] for field in protected):
        raise HTTPException(400, "Create a new schedule for future changes; generated payroll amounts are preserved")
    for k, v in update_fields.items():
        setattr(t, k, v)
    t.next_due = t.next_due if t.times_applied else t.start_date
    db.commit()
    return _ser_tx(t)


@router.delete("/drivers/{driver_id}/scheduled-transactions/{tx_id}")
def delete_scheduled(driver_id: int, tx_id: int, db: Session = Depends(get_db)):
    t = db.query(DriverScheduledTransaction).filter(
        DriverScheduledTransaction.id == tx_id,
        DriverScheduledTransaction.driver_id == driver_id,
    ).first()
    if not t:
        raise HTTPException(404, "Transaction not found")
    t.is_active = False
    db.commit()
    return {"message": "Deactivated"}


@router.post('/scheduled-transactions/preview')
def preview_scheduled(data: ScheduledTxIn):
    from app.services.scheduled_payroll import schedule_dates, amount_for_date
    from datetime import timedelta
    tx = DriverScheduledTransaction(**data.model_dump())
    dates = schedule_dates(tx, data.start_date + timedelta(days=3660))[:10]
    return {'rows': [{'date': d.isoformat(), 'amount': amount_for_date(tx, d), 'description': tx.schedule} for d in dates]}
