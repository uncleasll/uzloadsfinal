from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, Literal
from datetime import date

from app.db.session import get_db
from app.models.models import Driver, DriverProfile, DriverDocument, Truck, Trailer
from pydantic import BaseModel

router = APIRouter(prefix="/drivers", tags=["drivers-extended"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class DriverProfileIn(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[date] = None
    hire_date: Optional[date] = None
    termination_date: Optional[date] = None
    address: Optional[str] = None
    address2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    payable_to: Optional[str] = None
    co_driver_id: Optional[int] = None
    truck_id: Optional[int] = None
    trailer_id: Optional[int] = None
    fuel_card: Optional[str] = None
    ifta_handled: Optional[bool] = True
    driver_status: Optional[str] = "Applicant"
    pay_type: Optional[str] = "per_mile"
    per_extra_stop: Optional[float] = 0.0
    freight_percentage: Optional[float] = 0.0
    flatpay: Optional[float] = 0.0
    flatpay_period: Optional[Literal["daily", "weekly", "biweekly", "monthly"]] = None
    flatpay_start_date: Optional[date] = None
    hourly_rate: Optional[float] = 0.0
    notes: Optional[str] = None
    # core driver fields
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    driver_type: Optional[str] = None
    pay_rate_loaded: Optional[float] = None
    pay_rate_empty: Optional[float] = None
    is_active: Optional[bool] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _serialize_driver(d: Driver, db: Session) -> dict:
    profile = db.query(DriverProfile).filter(DriverProfile.driver_id == d.id).first()
    docs = db.query(DriverDocument).filter(DriverDocument.driver_id == d.id).all()
    truck = db.query(Truck).filter(Truck.id == profile.truck_id).first() if profile and profile.truck_id else None
    trailer = db.query(Trailer).filter(Trailer.id == profile.trailer_id).first() if profile and profile.trailer_id else None
    co_driver = db.query(Driver).filter(Driver.id == profile.co_driver_id).first() if profile and profile.co_driver_id else None

    return {
        "id": d.id,
        "name": d.name,
        "phone": d.phone,
        "email": d.email,
        "driver_type": d.driver_type,
        "pay_rate_loaded": d.pay_rate_loaded,
        "pay_rate_empty": d.pay_rate_empty,
        "is_active": d.is_active,
        "created_at": str(d.created_at) if d.created_at else None,
        "profile": {
            "first_name": profile.first_name if profile else "",
            "last_name": profile.last_name if profile else "",
            "date_of_birth": str(profile.date_of_birth) if profile and profile.date_of_birth else None,
            "hire_date": str(profile.hire_date) if profile and profile.hire_date else None,
            "termination_date": str(profile.termination_date) if profile and profile.termination_date else None,
            "address": profile.address if profile else "",
            "address2": profile.address2 if profile else "",
            "city": profile.city if profile else "",
            "state": profile.state if profile else "",
            "zip_code": profile.zip_code if profile else "",
            "payable_to": profile.payable_to if profile else d.name,
            "co_driver_id": profile.co_driver_id if profile else None,
            "co_driver_name": co_driver.name if co_driver else None,
            "truck_id": profile.truck_id if profile else None,
            "truck_unit": truck.unit_number if truck else None,
            "trailer_id": profile.trailer_id if profile else None,
            "trailer_unit": trailer.unit_number if trailer else None,
            "fuel_card": profile.fuel_card if profile else "",
            "ifta_handled": profile.ifta_handled if profile else True,
            "driver_status": profile.driver_status if profile else "Applicant",
            "pay_type": profile.pay_type if profile else "per_mile",
            "per_extra_stop": profile.per_extra_stop if profile else 0,
            "freight_percentage": profile.freight_percentage if profile else 0,
            "flatpay": profile.flatpay if profile else 0,
            "flatpay_period": profile.flatpay_period if profile else None,
            "flatpay_start_date": str(profile.flatpay_start_date) if profile and profile.flatpay_start_date else None,
            "hourly_rate": profile.hourly_rate if profile else 0,
            "notes": profile.notes if profile else "",
        } if profile else None,
        "documents": [
            {
                "id": doc.id,
                "doc_type": doc.doc_type.value if hasattr(doc.doc_type, "value") else doc.doc_type,
                "status": doc.status,
                "doc_number": doc.number,
                "number": doc.number,
                "state": doc.state,
                "issue_date": str(doc.issue_date) if doc.issue_date else None,
                "exp_date": str(doc.exp_date) if doc.exp_date else None,
                "hire_date": str(doc.hire_date) if doc.hire_date else None,
                "termination_date": str(doc.termination_date) if doc.termination_date else None,
                "notes": doc.notes,
                "filename": doc.filename,
                "original_filename": doc.original_filename,
                "file_path": doc.file_path,
                "created_at": str(doc.created_at) if doc.created_at else None,
            }
            for doc in docs
        ],
    }


# ─── List (extended) ──────────────────────────────────────────────────────────

@router.get("/extended")
def list_drivers_extended(
    is_active: Optional[bool] = None,
    driver_type: Optional[str] = None,
    driver_status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(Driver)
    if is_active is not None:
        q = q.filter(Driver.is_active == is_active)
    if driver_type:
        q = q.filter(Driver.driver_type == driver_type)
    if search:
        q = q.filter(Driver.name.ilike(f"%{search}%"))
    if driver_status:
        q = q.join(DriverProfile, DriverProfile.driver_id == Driver.id, isouter=True)\
              .filter(DriverProfile.driver_status == driver_status)

    total = q.count()
    drivers = q.order_by(Driver.name).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [_serialize_driver(d, db) for d in drivers],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/extended/{driver_id}")
def get_driver_extended(driver_id: int, db: Session = Depends(get_db)):
    d = db.query(Driver).filter(Driver.id == driver_id).with_for_update().first()
    if not d:
        raise HTTPException(404, "Driver not found")
    return _serialize_driver(d, db)


@router.put("/extended/{driver_id}")
def update_driver_extended(driver_id: int, data: DriverProfileIn, db: Session = Depends(get_db)):
    d = db.query(Driver).filter(Driver.id == driver_id).with_for_update().first()
    if not d:
        raise HTTPException(404, "Driver not found")

    if data.name is not None: d.name = data.name
    if data.phone is not None: d.phone = data.phone
    if data.email is not None: d.email = data.email
    if data.driver_type is not None: d.driver_type = data.driver_type
    if data.pay_rate_loaded is not None: d.pay_rate_loaded = data.pay_rate_loaded
    if data.pay_rate_empty is not None: d.pay_rate_empty = data.pay_rate_empty
    if data.is_active is not None: d.is_active = data.is_active

    profile = db.query(DriverProfile).filter(DriverProfile.driver_id == driver_id).first()
    if not profile:
        profile = DriverProfile(driver_id=driver_id)
        db.add(profile)

    profile_fields = [
        'first_name', 'last_name', 'date_of_birth', 'hire_date', 'termination_date',
        'address', 'address2', 'city', 'state', 'zip_code', 'payable_to', 'co_driver_id',
        'truck_id', 'trailer_id', 'fuel_card', 'ifta_handled', 'driver_status',
        'pay_type', 'per_extra_stop', 'freight_percentage', 'flatpay', 'flatpay_period', 'flatpay_start_date', 'hourly_rate', 'notes',
    ]
    for field in profile_fields:
        if field in data.model_fields_set:
            setattr(profile, field, getattr(data, field))

    from app.services.flatpay import sync_flatpay
    sync_flatpay(db, d, profile)
    db.commit()
    return _serialize_driver(d, db)


@router.post("/extended", status_code=201)
def create_driver_extended(data: DriverProfileIn, db: Session = Depends(get_db)):
    name = data.name or f"{data.first_name or ''} {data.last_name or ''}".strip()
    d = Driver(
        name=name,
        phone=data.phone,
        email=data.email,
        driver_type=data.driver_type or "Drv",
        pay_rate_loaded=data.pay_rate_loaded if data.pay_rate_loaded is not None else 0.65,
        pay_rate_empty=data.pay_rate_empty if data.pay_rate_empty is not None else 0.30,
        is_active=True,
    )
    db.add(d)
    db.flush()

    name_parts = name.split()
    profile = DriverProfile(
        driver_id=d.id,
        first_name=data.first_name or (name_parts[0] if name_parts else ""),
        last_name=data.last_name or (" ".join(name_parts[1:]) if len(name_parts) > 1 else ""),
        date_of_birth=data.date_of_birth,
        hire_date=data.hire_date,
        termination_date=data.termination_date,
        address=data.address or "",
        address2=data.address2 or "",
        city=data.city or "",
        state=data.state or "",
        zip_code=data.zip_code or "",
        payable_to=data.payable_to or name,
        co_driver_id=data.co_driver_id,
        truck_id=data.truck_id,
        trailer_id=data.trailer_id,
        fuel_card=data.fuel_card or "",
        ifta_handled=data.ifta_handled if data.ifta_handled is not None else True,
        driver_status=data.driver_status or "Applicant",
        pay_type=data.pay_type or "per_mile",
        per_extra_stop=data.per_extra_stop or 0,
        freight_percentage=data.freight_percentage or 0,
        flatpay=data.flatpay or 0,
        flatpay_period=data.flatpay_period,
        flatpay_start_date=data.flatpay_start_date,
        hourly_rate=data.hourly_rate or 0,
        notes=data.notes or "",
    )
    db.add(profile)
    from app.services.flatpay import sync_flatpay
    sync_flatpay(db, d, profile)
    db.commit()
    return _serialize_driver(d, db)


# ─── Open Balance ──────────────────────────────────────────────────────────────

@router.get("/open-balance")
def open_balance(db: Session = Depends(get_db)):
    """Use the same unselected payroll entries as the settlement picker."""
    from app.crud.payroll import get_open_balances
    return [{**row, 'last_load_date': str(row['updated']) if row['updated'] else None}
            for row in get_open_balances(db)]


from pydantic import Field
from app.models.models import DriverAdditionalPayee, Vendor


class AdditionalPayeeIn(BaseModel):
    vendor_id: int
    rate_pct: Optional[float] = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    is_active: bool = True


@router.get('/{driver_id}/additional-payees')
def list_additional_payees(driver_id: int, db: Session = Depends(get_db)):
    rows = db.query(DriverAdditionalPayee).filter(DriverAdditionalPayee.driver_id == driver_id).all()
    return [{'id': r.id, 'vendor_id': r.vendor_id, 'name': r.vendor.company_name, 'rate_pct': r.rate_pct, 'is_active': r.is_active} for r in rows]


@router.put('/{driver_id}/additional-payees')
def save_additional_payee(driver_id: int, data: AdditionalPayeeIn, db: Session = Depends(get_db)):
    driver = db.query(Driver).filter(Driver.id == driver_id, Driver.is_active == True).with_for_update().first()
    vendor = db.query(Vendor).filter(Vendor.id == data.vendor_id, Vendor.is_active == True, Vendor.is_additional_payee == True).first()
    if not driver or not vendor:
        raise HTTPException(400, 'Select an active driver and additional-payee vendor')
    rate = data.rate_pct if data.rate_pct is not None else vendor.additional_payee_rate_pct
    if rate is None or not 0 <= rate <= 100:
        raise HTTPException(400, 'Payee percentage must be between 0 and 100')
    row = db.query(DriverAdditionalPayee).filter_by(driver_id=driver_id, vendor_id=vendor.id).first()
    if not row:
        row = DriverAdditionalPayee(driver_id=driver_id, vendor_id=vendor.id)
        db.add(row)
    row.rate_pct = rate; row.is_active = data.is_active
    db.commit()
    return list_additional_payees(driver_id, db)
