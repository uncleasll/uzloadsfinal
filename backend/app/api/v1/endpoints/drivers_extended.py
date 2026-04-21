from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
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
    d = db.query(Driver).filter(Driver.id == driver_id).first()
    if not d:
        raise HTTPException(404, "Driver not found")
    return _serialize_driver(d, db)


@router.put("/extended/{driver_id}")
def update_driver_extended(driver_id: int, data: DriverProfileIn, db: Session = Depends(get_db)):
    d = db.query(Driver).filter(Driver.id == driver_id).first()
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
        'pay_type', 'per_extra_stop', 'freight_percentage', 'flatpay', 'hourly_rate', 'notes',
    ]
    for field in profile_fields:
        val = getattr(data, field, None)
        if val is not None:
            setattr(profile, field, val)

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
        pay_rate_loaded=data.pay_rate_loaded or 0.65,
        pay_rate_empty=data.pay_rate_empty or 0.30,
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
        driver_status=data.driver_status or "Hired",
        pay_type=data.pay_type or "per_mile",
        per_extra_stop=data.per_extra_stop or 0,
        freight_percentage=data.freight_percentage or 0,
        flatpay=data.flatpay or 0,
        hourly_rate=data.hourly_rate or 0,
        notes=data.notes or "",
    )
    db.add(profile)
    db.commit()
    return _serialize_driver(d, db)


# ─── Open Balance ──────────────────────────────────────────────────────────────

@router.get("/open-balance")
def open_balance(db: Session = Depends(get_db)):
    """Returns each active driver's unsettled drivers_payable balance using snapshots."""
    from app.models.models import Load, SettlementItem

    drivers = db.query(Driver).filter(Driver.is_active == True).all()
    result = []
    for drv in drivers:
        settled_load_ids = db.query(SettlementItem.load_id).filter(
            SettlementItem.load_id.isnot(None)
        ).subquery()

        loads = db.query(Load).filter(
            Load.driver_id == drv.id,
            Load.is_active == True,
            Load.id.notin_(settled_load_ids),
        ).all()

        # CRITICAL: use historical snapshot, never live driver rates
        balance = sum(
            (l.drivers_payable_snapshot if l.drivers_payable_snapshot is not None
             else (l.loaded_miles or 0) * drv.pay_rate_loaded + (l.empty_miles or 0) * drv.pay_rate_empty)
            for l in loads
        )
        balance = round(balance, 2)

        profile = db.query(DriverProfile).filter(DriverProfile.driver_id == drv.id).first()
        payable_to = (profile.payable_to if profile and profile.payable_to else drv.name)
        last_load = max((l.load_date for l in loads if l.load_date), default=None)

        result.append({
            "driver_id": drv.id,
            "driver_name": drv.name,
            "driver_type": drv.driver_type,
            "payable_to": payable_to,
            "balance": balance,
            "last_load_date": str(last_load) if last_load else None,
        })

    return result
